import { BorshCoder, EventParser, Program, type Idl } from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram, type TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import vaultIdl from "../idl/pexiz_vault.json";
import { CANARY_PROGRAM_ID, bn, canaryPool, type CanaryPool } from "./canary";

export const VAULT_PROGRAM_ID = new PublicKey(vaultIdl.address);
export const vaultCoder = new BorshCoder(vaultIdl as Idl);
const offline = { connection: new Connection("http://127.0.0.1:8899") } as any;
export const vaultProgram = new Program(vaultIdl as Idl, offline);

/** $10M with 6 decimals, mirrored from AUM_CAP_USDC. */
export const AUM_CAP_USDC = 10_000_000n * 1_000_000n;

const pda = (seeds: (Buffer | Uint8Array)[]) => PublicKey.findProgramAddressSync(seeds, VAULT_PROGRAM_ID)[0];

export interface VaultAddresses {
  vault: PublicKey;
  venue: PublicKey;
  shareMint: PublicKey;
  vaultUsdc: PublicKey;
  vaultLp: PublicKey;
  shareEscrow: PublicKey;
  pool: CanaryPool;
}

export function vaultAddresses(venue: PublicKey, usdcMint: PublicKey): VaultAddresses {
  const vault = pda([Buffer.from("vault"), venue.toBuffer()]);
  return {
    vault,
    venue,
    shareMint: pda([Buffer.from("shares"), vault.toBuffer()]),
    vaultUsdc: pda([Buffer.from("usdc"), vault.toBuffer()]),
    vaultLp: pda([Buffer.from("lp"), vault.toBuffer()]),
    shareEscrow: pda([Buffer.from("escrow"), vault.toBuffer()]),
    pool: canaryPool(usdcMint),
  };
}

export function votePda(vault: PublicKey, voter: PublicKey): PublicKey {
  return pda([Buffer.from("vote"), vault.toBuffer(), voter.toBuffer()]);
}

export function initVaultIx(payer: PublicKey, v: VaultAddresses): Promise<TransactionInstruction> {
  return vaultProgram.methods.initVault().accountsStrict({
    vault: v.vault, venue: v.venue, pool: v.pool.pool, usdcMint: v.pool.usdcMint, lpMint: v.pool.lpMint,
    shareMint: v.shareMint, vaultUsdc: v.vaultUsdc, vaultLp: v.vaultLp, shareEscrow: v.shareEscrow, payer,
    tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
  }).instruction();
}

const poolAccounts = (v: VaultAddresses) => ({
  vault: v.vault, venue: v.venue, pool: v.pool.pool, poolLpMint: v.pool.lpMint, poolReserve: v.pool.usdcReserve,
  vaultUsdc: v.vaultUsdc, vaultLp: v.vaultLp, tokenProgram: TOKEN_PROGRAM_ID, canaryProgram: CANARY_PROGRAM_ID,
});

export function depositIx(v: VaultAddresses, user: PublicKey, userUsdc: PublicKey, userShares: PublicKey, usdc: bigint, minLpOut = 0n) {
  return vaultProgram.methods.deposit(bn(usdc), bn(minLpOut))
    .accountsStrict({ ...poolAccounts(v), shareMint: v.shareMint, userUsdc, userShares, user })
    .instruction();
}

export function withdrawIx(v: VaultAddresses, user: PublicKey, a: { userShares: PublicKey; userUsdc: PublicKey; userLp: PublicKey }, shares: bigint) {
  return vaultProgram.methods.withdraw(bn(shares)).accountsStrict({
    vault: v.vault, shareMint: v.shareMint, vaultUsdc: v.vaultUsdc, vaultLp: v.vaultLp, ...a, user, tokenProgram: TOKEN_PROGRAM_ID,
  }).instruction();
}

export function exitIx(v: VaultAddresses, minUsdcOut = 0n): Promise<TransactionInstruction> {
  return vaultProgram.methods.exit(bn(minUsdcOut)).accountsStrict(poolAccounts(v)).instruction();
}

export function voteReenterIx(v: VaultAddresses, user: PublicKey, userShares: PublicKey, shares: bigint) {
  return vaultProgram.methods.voteReenter(bn(shares)).accountsStrict({
    vault: v.vault, shareMint: v.shareMint, vote: votePda(v.vault, user), shareEscrow: v.shareEscrow, userShares, user,
    tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
  }).instruction();
}

export function unvoteIx(v: VaultAddresses, user: PublicKey, userShares: PublicKey) {
  return vaultProgram.methods.unvote().accountsStrict({
    vault: v.vault, shareMint: v.shareMint, vote: votePda(v.vault, user), shareEscrow: v.shareEscrow, userShares, user,
    tokenProgram: TOKEN_PROGRAM_ID,
  }).instruction();
}

export function reenterIx(v: VaultAddresses, minLpOut = 0n): Promise<TransactionInstruction> {
  return vaultProgram.methods.reenter(bn(minLpOut)).accountsStrict({ ...poolAccounts(v), shareMint: v.shareMint }).instruction();
}

export interface VaultState {
  venue: PublicKey;
  pool: PublicKey;
  usdcMint: PublicKey;
  exited: boolean;
  exitedAtSlot: bigint;
  exits: number;
  reentryVotes: bigint;
}

export function decodeVault(data: Buffer): VaultState {
  const v = vaultCoder.accounts.decode("Vault", data);
  return {
    venue: v.venue, pool: v.pool, usdcMint: v.usdc_mint, exited: v.exited, exitedAtSlot: BigInt(v.exited_at_slot.toString()),
    exits: v.exits, reentryVotes: BigInt(v.reentry_votes.toString()),
  };
}

export function parseVaultExited(logs: string[]) {
  return [...new EventParser(VAULT_PROGRAM_ID, vaultCoder).parseLogs(logs)]
    .filter((e) => e.name === "VaultExited")
    .map((e) => {
      const d = e.data as any;
      return { vault: d.vault as PublicKey, lpRedeemed: BigInt(d.lp_redeemed.toString()), usdcOut: BigInt(d.usdc_out.toString()), slot: BigInt(d.slot.toString()) };
    });
}
