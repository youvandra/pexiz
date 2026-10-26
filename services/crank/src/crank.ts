// One crank cycle: for each registered venue, read the multisig, find
// pre-signing accounts, simulate `update`, and send it when it changes
// anything. If the simulated flag is red and a vault for the venue has not
// exited, `update` and `exit` go in one transaction.
import {
  ComputeBudgetProgram, Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  VAULT_PROGRAM_ID, decodeMultisig, decodeVault, decodeVenue, exitIx, fetchVenues, findPresigningAccounts,
  reasonNames, updateIx, vaultAddresses, withBackoff, type Venue,
} from "@pexiz/sdk";

/** Canary redemption fee (10 bps) plus 50 bps of slippage headroom. */
const EXIT_MIN_OUT_BPS = 10_000n - 10n - 50n;

export interface CycleResult {
  venue: PublicKey;
  program: PublicKey;
  from: string;
  to: string;
  reasons: number;
  proofs: number;
  action: "none" | "update" | "update+exit";
  signature?: string;
  error?: string;
}

export interface CrankOptions {
  log?: (line: string) => void;
  /** Delay between per-member getProgramAccounts calls, for public RPC. */
  memberDelayMs?: number;
}

export class Crank {
  constructor(readonly conn: Connection, readonly payer: Keypair, readonly opts: CrankOptions = {}) {}

  private log(line: string) {
    (this.opts.log ?? console.log)(line);
  }

  async cycle(): Promise<CycleResult[]> {
    const venues = await withBackoff(() => fetchVenues(this.conn), { log: (m) => this.log(m) });
    const out: CycleResult[] = [];
    for (const v of venues) {
      let r: CycleResult;
      try {
        r = await this.crankVenue(v);
      } catch (e: any) {
        r = { venue: v.address!, program: v.program, from: v.flag, to: v.flag, reasons: v.reasons, proofs: 0, action: "none", error: String(e?.message ?? e).split("\n")[0] };
      }
      out.push(r);
      this.log(formatLine(r));
    }
    return out;
  }

  async crankVenue(v: Venue): Promise<CycleResult> {
    const ms = await withBackoff(() => this.conn.getAccountInfo(v.multisig));
    if (!ms) throw new Error("multisig account missing");
    const members = decodeMultisig(ms.data).members.map((m) => m.key);
    const presigning = await withBackoff(() => findPresigningAccounts(this.conn, members, { delayMs: this.opts.memberDelayMs }));
    const proofs = presigning.map((p) => p.address);
    const update = await updateIx(v.program, v.multisig, proofs);

    const sim = await this.simulate([update], v.address!);
    const result: CycleResult = { venue: v.address!, program: v.program, from: v.flag, to: sim.flag, reasons: sim.reasons, proofs: proofs.length, action: "none" };

    const ixs: TransactionInstruction[] = [update];
    if (sim.flag === "red") {
      const exit = await this.exitFor(v.address!);
      if (exit) {
        ixs.push(exit);
        result.action = "update+exit";
      }
    }
    if (result.action === "none" && !changed(v, sim)) return result;
    if (result.action === "none") result.action = "update";
    ixs.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
    result.signature = await withBackoff(() => sendAndConfirmTransaction(this.conn, new Transaction().add(...ixs), [this.payer], { commitment: "confirmed" }));
    return result;
  }

  /** Simulates instructions and returns the venue account as it would be after them. */
  private async simulate(ixs: TransactionInstruction[], venue: PublicKey): Promise<Venue> {
    const tx = new Transaction().add(...ixs);
    tx.feePayer = this.payer.publicKey;
    const r = await withBackoff(() => this.conn.simulateTransaction(tx, undefined, [venue]));
    if (r.value.err) throw new Error(`simulate failed: ${JSON.stringify(r.value.err)} ${(r.value.logs ?? []).slice(-3).join(" | ")}`);
    const acc = r.value.accounts?.[0];
    if (!acc) throw new Error("simulation returned no venue account");
    return decodeVenue(Buffer.from(acc.data[0], "base64"), venue);
  }

  /** `exit` for the venue's vault, or null when there is none or it already exited. */
  private async exitFor(venue: PublicKey): Promise<TransactionInstruction | null> {
    const vaultKey = PublicKey.findProgramAddressSync([Buffer.from("vault"), venue.toBuffer()], VAULT_PROGRAM_ID)[0];
    const info = await withBackoff(() => this.conn.getAccountInfo(vaultKey));
    if (!info) return null;
    const vault = decodeVault(info.data);
    if (vault.exited) return null;
    const addrs = vaultAddresses(venue, vault.usdcMint);
    const lp = await withBackoff(() => this.conn.getTokenAccountBalance(addrs.vaultLp));
    const minOut = (BigInt(lp.value.amount) * EXIT_MIN_OUT_BPS) / 10_000n;
    return exitIx(addrs, minOut);
  }
}

function changed(a: Venue, b: Venue): boolean {
  return a.flag !== b.flag || a.reasons !== b.reasons || a.activeReasons !== b.activeReasons
    || a.amberSince !== b.amberSince || (b.flag !== "green" && a.clearSince !== b.clearSince) || a.threshold !== b.threshold
    || a.timeLockSecs !== b.timeLockSecs || a.members.length !== b.members.length
    || a.members.some((m, i) => !m.equals(b.members[i]));
}

export function formatLine(r: CycleResult): string {
  const reasons = reasonNames(r.reasons).join(",") || "-";
  const parts = [
    `venue=${r.program.toBase58()}`,
    `flag=${r.from === r.to ? r.to : `${r.from}->${r.to}`}`,
    `reasons=${reasons}`,
    `proofs=${r.proofs}`,
    `action=${r.action}`,
  ];
  if (r.signature) parts.push(`sig=${r.signature}`);
  if (r.error) parts.push(`error="${r.error}"`);
  return `${new Date().toISOString()} ${parts.join(" ")}`;
}
