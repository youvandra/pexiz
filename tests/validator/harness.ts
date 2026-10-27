// Starts a solana-test-validator with the three programs, the Squads test
// double at the Squads v4 address, and preloaded accounts.
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CANARY_PROGRAM_ID, ORACLE_PROGRAM_ID, SQUADS_V4_ID, VAULT_PROGRAM_ID, encodeMultisig, type Multisig } from "@pexiz/sdk";

const ROOT = join(import.meta.dir, "../..");
export const STUB_SO = join(ROOT, "tests/squads-stub/target/deploy/squads_stub.so");

export interface PreloadedAccount {
  address: PublicKey;
  owner: PublicKey;
  data: Buffer;
  lamports?: number;
}

export interface Validator {
  conn: Connection;
  url: string;
  payer: Keypair;
  stop(): void;
}

export interface ValidatorOptions {
  canaryAuthority: PublicKey;
  accounts: PreloadedAccount[];
  /** Extra non-upgradeable programs, as [program id, path to .so]. */
  programs?: [PublicKey, string][];
  /** Accounts already dumped to disk in `solana account --output-file` form. */
  accountFiles?: { address: PublicKey; file: string }[];
}

export async function startValidator(opts: ValidatorOptions): Promise<Validator> {
  if (!existsSync(STUB_SO)) throw new Error("build the Squads test double first: bun run build:stub");
  const dir = mkdtempSync(join(process.env.PEXIZ_TMP ?? tmpdir(), "pexiz-validator-"));
  const port = 18_000 + Math.floor(Math.random() * 1000) * 2;
  const args = [
    "--reset", "--quiet", "--ledger", join(dir, "ledger"),
    "--rpc-port", String(port), "--faucet-port", String(port + 1 + 2000),
    "--dynamic-port-range", `${port + 3000}-${port + 3030}`,
    "--bpf-program", ORACLE_PROGRAM_ID.toBase58(), join(ROOT, "target/deploy/pexiz_oracle.so"),
    "--bpf-program", VAULT_PROGRAM_ID.toBase58(), join(ROOT, "target/deploy/pexiz_vault.so"),
    "--bpf-program", SQUADS_V4_ID.toBase58(), STUB_SO,
    "--upgradeable-program", CANARY_PROGRAM_ID.toBase58(), join(ROOT, "target/deploy/canary_venue.so"), opts.canaryAuthority.toBase58(),
  ];
  for (const [id, so] of opts.programs ?? []) args.push("--bpf-program", id.toBase58(), so);
  for (const a of opts.accountFiles ?? []) args.push("--account", a.address.toBase58(), a.file);
  for (const a of opts.accounts) {
    const file = join(dir, `${a.address.toBase58()}.json`);
    writeFileSync(file, JSON.stringify({
      pubkey: a.address.toBase58(),
      account: { lamports: a.lamports ?? 1_000_000_000, data: [a.data.toString("base64"), "base64"], owner: a.owner.toBase58(), executable: false, rentEpoch: 0, space: a.data.length },
    }));
    args.push("--account", a.address.toBase58(), file);
  }
  const proc = Bun.spawn(["solana-test-validator", ...args], { stdout: "ignore", stderr: "pipe" });
  const url = `http://127.0.0.1:${port}`;
  const conn = new Connection(url, "confirmed");
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      if ((await conn.getSlot()) > 1) break;
    } catch {}
    if (Date.now() > deadline || proc.exitCode !== null) {
      proc.kill();
      throw new Error(`validator did not start: ${await new Response(proc.stderr).text()}`);
    }
    await Bun.sleep(250);
  }
  const payer = Keypair.generate();
  await conn.confirmTransaction(await conn.requestAirdrop(payer.publicKey, 100 * LAMPORTS_PER_SOL), "confirmed");
  return { conn, url, payer, stop: () => proc.kill() };
}

export async function send(v: Validator, ixs: TransactionInstruction[], signers: Keypair[] = []): Promise<string> {
  return sendAndConfirmTransaction(v.conn, new Transaction().add(...ixs), [v.payer, ...signers], { commitment: "confirmed" });
}

/** Rewrites a multisig through the Squads test double. */
export function setMultisigIx(v: Validator, multisig: PublicKey, m: Multisig): TransactionInstruction {
  return new TransactionInstruction({
    programId: SQUADS_V4_ID,
    keys: [{ pubkey: multisig, isSigner: false, isWritable: true }, { pubkey: v.payer.publicKey, isSigner: true, isWritable: false }],
    data: encodeMultisig(m),
  });
}
