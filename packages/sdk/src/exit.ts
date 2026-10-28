// Client for pexiz-exit: auto-exit without a deposit. A holder approves the
// program's authority as delegate of their LP token account and opens a guard
// naming the venue to watch and the USDC account to be paid. Anyone runs the
// exit once the venue is red.
import { BorshCoder, EventParser, Program, type Idl } from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram, type TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createApproveInstruction, createRevokeInstruction } from "@solana/spl-token";
import exitIdl from "../idl/pexiz_exit.json";
import { CANARY_PROGRAM_ID, bn, type CanaryPool } from "./canary";
import { JLP_MINT, JUPITER_PERPS_ID } from "./jlp";
import type { JlpLiquidityAccounts } from "./vault";

export const EXIT_PROGRAM_ID = new PublicKey(exitIdl.address);
export const exitCoder = new BorshCoder(exitIdl as Idl);
const offline = { connection: new Connection("http://127.0.0.1:8899") } as any;
export const exitProgram = new Program(exitIdl as Idl, offline);

export const JLP_POOL = new PublicKey("5BUwFW4nRbftYTDMbgxykoFWqWHPzahFSNAaaaJtVKsq");
export const MAINNET_USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
/** Mirrored from KEEPER_FEE_BPS. */
export const KEEPER_FEE_BPS = 10n;

const pda = (seeds: (Buffer | Uint8Array)[]) => PublicKey.findProgramAddressSync(seeds, EXIT_PROGRAM_ID)[0];
export const exitAuthority = () => pda([Buffer.from("authority")]);
export const routePda = (mint: PublicKey) => pda([Buffer.from("route"), mint.toBuffer()]);
export const guardPda = (holder: PublicKey, lpMint: PublicKey) => pda([Buffer.from("guard"), holder.toBuffer(), lpMint.toBuffer()]);

export function openRouteIx(payer: PublicKey, mint: PublicKey): Promise<TransactionInstruction> {
  return exitProgram.methods.openRoute().accountsStrict({
    route: routePda(mint), mint, authority: exitAuthority(), payer, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
  }).instruction();
}

/** Approve + guard for canary LP: the two instructions a holder signs once. */
export async function protectCanaryIxs(holder: PublicKey, venue: PublicKey, pool: CanaryPool, holderLp: PublicKey, usdcDest: PublicKey, amount: bigint) {
  return [
    createApproveInstruction(holderLp, exitAuthority(), holder, amount),
    await exitProgram.methods.protectCanary().accountsStrict({
      guard: guardPda(holder, pool.lpMint), venue, pool: pool.pool, usdcDest, holder, systemProgram: SystemProgram.programId,
    }).instruction(),
  ];
}

export async function protectJlpIxs(holder: PublicKey, venue: PublicKey, holderLp: PublicKey, usdcDest: PublicKey, amount: bigint) {
  return [
    createApproveInstruction(holderLp, exitAuthority(), holder, amount),
    await exitProgram.methods.protectJlp().accountsStrict({
      guard: guardPda(holder, JLP_MINT), venue, usdcDest, holder, systemProgram: SystemProgram.programId,
    }).instruction(),
  ];
}

/** Closes the guard and revokes the delegation. */
export async function unprotectIxs(holder: PublicKey, lpMint: PublicKey, holderLp: PublicKey) {
  return [
    await exitProgram.methods.unprotect().accountsStrict({ guard: guardPda(holder, lpMint), holder }).instruction(),
    createRevokeInstruction(holderLp, holder),
  ];
}

/** Takes everything delegated unless `lp` names a smaller tranche. */
const ALL = 2n ** 64n - 1n;

export function autoExitCanaryIx(g: { holder: PublicKey; venue: PublicKey; usdcDest: PublicKey }, pool: CanaryPool, holderLp: PublicKey, keeperUsdc: PublicKey, lp = ALL) {
  return exitProgram.methods.exitCanary(bn(lp)).accountsStrict({
    guard: guardPda(g.holder, pool.lpMint), venue: g.venue, holderLp, authority: exitAuthority(), routeUsdc: routePda(pool.usdcMint),
    usdcDest: g.usdcDest, keeperUsdc, pool: pool.pool, lpMint: pool.lpMint, usdcReserve: pool.usdcReserve,
    canaryProgram: CANARY_PROGRAM_ID, tokenProgram: TOKEN_PROGRAM_ID,
  }).instruction();
}

export function autoExitJlpIx(g: { holder: PublicKey; venue: PublicKey; usdcDest: PublicKey }, j: JlpLiquidityAccounts, holderLp: PublicKey, keeperUsdc: PublicKey, lp = ALL) {
  return exitProgram.methods.exitJlp(bn(lp)).accountsStrict({
    guard: guardPda(g.holder, JLP_MINT), venue: g.venue, holderLp, authority: exitAuthority(),
    routeLp: routePda(JLP_MINT), routeUsdc: routePda(MAINNET_USDC), usdcDest: g.usdcDest, keeperUsdc,
    jlpPool: JLP_POOL, jlpMint: JLP_MINT, transferAuthority: j.transferAuthority, perpetuals: j.perpetuals,
    custody: j.custody, custodyDovesPriceAccount: j.custodyDovesPriceAccount, custodyPythnetPriceAccount: j.custodyPythnetPriceAccount,
    custodyTokenAccount: j.custodyTokenAccount, eventAuthority: j.eventAuthority, tokenProgram: TOKEN_PROGRAM_ID, jupiterProgram: JUPITER_PERPS_ID,
  }).remainingAccounts(j.aumAccounts.map((pubkey) => ({ pubkey, isSigner: false, isWritable: true }))).instruction();
}

export interface GuardState {
  holder: PublicKey;
  venue: PublicKey;
  pool: PublicKey;
  lpMint: PublicKey;
  usdcDest: PublicKey;
  kind: "canary" | "jupiter";
  exits: number;
  lastExitSlot: bigint;
}

export function decodeGuard(data: Buffer): GuardState {
  const g = exitCoder.accounts.decode("Guard", data);
  return {
    holder: g.holder, venue: g.venue, pool: g.pool, lpMint: g.lp_mint, usdcDest: g.usdc_dest,
    kind: Object.keys(g.kind)[0].toLowerCase() === "canary" ? "canary" : "jupiter", exits: g.exits, lastExitSlot: BigInt(g.last_exit_slot.toString()),
  };
}

export function parseGuardExited(logs: string[]) {
  return [...new EventParser(EXIT_PROGRAM_ID, exitCoder).parseLogs(logs)]
    .filter((e) => e.name === "GuardExited")
    .map((e) => {
      const d = e.data as any;
      return {
        guard: d.guard as PublicKey, holder: d.holder as PublicKey, lpIn: BigInt(d.lp_in.toString()),
        usdcOut: BigInt(d.usdc_out.toString()), keeperFee: BigInt(d.keeper_fee.toString()), slot: BigInt(d.slot.toString()),
      };
    });
}
