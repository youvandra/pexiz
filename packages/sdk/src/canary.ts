import { BN, Program, type Idl } from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram, type TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import canaryIdl from "../idl/canary_venue.json";

export const CANARY_PROGRAM_ID = new PublicKey(canaryIdl.address);
const offline = { connection: new Connection("http://127.0.0.1:8899") } as any;
export const canaryProgram = new Program(canaryIdl as Idl, offline);

export interface CanaryPool {
  pool: PublicKey;
  usdcMint: PublicKey;
  lpMint: PublicKey;
  usdcReserve: PublicKey;
}

export function canaryPool(usdcMint: PublicKey): CanaryPool {
  const pool = PublicKey.findProgramAddressSync([Buffer.from("pool"), usdcMint.toBuffer()], CANARY_PROGRAM_ID)[0];
  return {
    pool,
    usdcMint,
    lpMint: PublicKey.findProgramAddressSync([Buffer.from("lp_mint"), pool.toBuffer()], CANARY_PROGRAM_ID)[0],
    usdcReserve: PublicKey.findProgramAddressSync([Buffer.from("reserve"), pool.toBuffer()], CANARY_PROGRAM_ID)[0],
  };
}

export function initPoolIx(payer: PublicKey, p: CanaryPool): Promise<TransactionInstruction> {
  return canaryProgram.methods
    .initPool()
    .accountsStrict({
      pool: p.pool, usdcMint: p.usdcMint, lpMint: p.lpMint, usdcReserve: p.usdcReserve, payer,
      tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    })
    .instruction();
}

interface LiquidityAccounts {
  user: PublicKey;
  userUsdc: PublicKey;
  userLp: PublicKey;
}

function liquidityAccounts(p: CanaryPool, a: LiquidityAccounts) {
  return {
    pool: p.pool, lpMint: p.lpMint, usdcReserve: p.usdcReserve, userUsdc: a.userUsdc, userLp: a.userLp,
    user: a.user, tokenProgram: TOKEN_PROGRAM_ID,
  };
}

export function addLiquidityIx(p: CanaryPool, a: LiquidityAccounts, usdc: bigint): Promise<TransactionInstruction> {
  return canaryProgram.methods.addLiquidity(bn(usdc)).accountsStrict(liquidityAccounts(p, a)).instruction();
}

export function removeLiquidityIx(p: CanaryPool, a: LiquidityAccounts, lp: bigint): Promise<TransactionInstruction> {
  return canaryProgram.methods.removeLiquidity(bn(lp)).accountsStrict(liquidityAccounts(p, a)).instruction();
}

export const bn = (x: bigint | number) => new BN(x.toString());
