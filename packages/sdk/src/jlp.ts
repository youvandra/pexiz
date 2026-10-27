// Jupiter Perps JLP liquidity instructions, for the M8 JLP path. Account order
// and argument layout follow the Jupiter Perps IDL as published in
// @exponent-labs/jupiter-perps-idl 0.9.30 (third party, not vendored here).
// Exercised against the real program on a mainnet fork by tests/fork/jlp.test.ts.
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

export const JUPITER_PERPS_ID = new PublicKey("PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu");
export const JLP_MINT = new PublicKey("27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4");

/**
 * Anchor discriminators, `sha256("global:<name>")[..8]`, written out so this
 * module runs in a browser as well as in Node. `jlp.test.ts` recomputes them.
 */
export const DISCRIMINATORS = {
  remove_liquidity2: Buffer.from([230, 215, 82, 127, 241, 101, 227, 146]),
  add_liquidity2: Buffer.from([228, 162, 78, 28, 70, 219, 116, 115]),
};
const disc = (name: keyof typeof DISCRIMINATORS) => DISCRIMINATORS[name];
const pda = (seed: string) => PublicKey.findProgramAddressSync([Buffer.from(seed)], JUPITER_PERPS_ID)[0];

export const jupiterPerpsPdas = () => ({
  perpetuals: pda("perpetuals"),
  transferAuthority: pda("transfer_authority"),
  eventAuthority: pda("__event_authority"),
});

export interface JlpAccounts {
  owner: PublicKey;
  /** Token account that pays (add) or receives (remove) the custody token. */
  tokenAccount: PublicKey;
  lpTokenAccount: PublicKey;
  pool: PublicKey;
  custody: PublicKey;
  custodyDovesPriceAccount: PublicKey;
  custodyPythnetPriceAccount: PublicKey;
  custodyTokenAccount: PublicKey;
  /**
   * Remaining accounts the pool needs to value its AUM: every custody, then
   * every custody's Doves price account, in that order.
   */
  remaining?: PublicKey[];
}

function keys(a: JlpAccounts) {
  const p = jupiterPerpsPdas();
  const k = (pubkey: PublicKey, isWritable = false, isSigner = false) => ({ pubkey, isWritable, isSigner });
  return [
    k(a.owner, false, true), k(a.tokenAccount, true), k(a.lpTokenAccount, true), k(p.transferAuthority), k(p.perpetuals),
    k(a.pool, true), k(a.custody, true), k(a.custodyDovesPriceAccount), k(a.custodyPythnetPriceAccount),
    k(a.custodyTokenAccount, true), k(JLP_MINT, true), k(TOKEN_PROGRAM_ID), k(p.eventAuthority), k(JUPITER_PERPS_ID),
    ...(a.remaining ?? []).map((x) => k(x)),
  ];
}

const u64 = (x: bigint) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(x); return b; };

/** `removeLiquidity2 { lp_amount_in, min_amount_out }` */
export function removeLiquidity2Ix(a: JlpAccounts, lpAmountIn: bigint, minAmountOut: bigint): TransactionInstruction {
  return new TransactionInstruction({
    programId: JUPITER_PERPS_ID,
    keys: keys(a),
    data: Buffer.concat([disc("remove_liquidity2"), u64(lpAmountIn), u64(minAmountOut)]),
  });
}

/** `addLiquidity2 { token_amount_in, min_lp_amount_out, token_amount_pre_swap: None }` */
export function addLiquidity2Ix(a: JlpAccounts, tokenAmountIn: bigint, minLpAmountOut: bigint): TransactionInstruction {
  return new TransactionInstruction({
    programId: JUPITER_PERPS_ID,
    keys: keys(a),
    data: Buffer.concat([disc("add_liquidity2"), u64(tokenAmountIn), u64(minLpAmountOut), Buffer.from([0])]),
  });
}
