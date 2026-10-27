// Offline checks of the JLP instruction encoding. `tests/fork/jlp.test.ts`
// runs the same instructions against the real Jupiter Perps program.
import { expect, test } from "bun:test";
import { Keypair } from "@solana/web3.js";
import { DISCRIMINATORS, JLP_MINT, JUPITER_PERPS_ID, addLiquidity2Ix, removeLiquidity2Ix } from "@pexiz/sdk";

const acc = () => {
  const k = () => Keypair.generate().publicKey;
  return { owner: k(), tokenAccount: k(), lpTokenAccount: k(), pool: k(), custody: k(), custodyDovesPriceAccount: k(), custodyPythnetPriceAccount: k(), custodyTokenAccount: k() };
};

test("removeLiquidity2 layout: 8-byte discriminator, two u64, 14 accounts, owner signs", () => {
  const ix = removeLiquidity2Ix(acc(), 5n, 4n);
  expect(ix.programId.equals(JUPITER_PERPS_ID)).toBe(true);
  expect(ix.data.length).toBe(24);
  expect(ix.data.readBigUInt64LE(8)).toBe(5n);
  expect(ix.data.readBigUInt64LE(16)).toBe(4n);
  expect(ix.keys.length).toBe(14);
  expect(ix.keys[0].isSigner).toBe(true);
  expect(ix.keys[10].pubkey.equals(JLP_MINT)).toBe(true);
});

test("addLiquidity2 encodes token_amount_pre_swap as None", () => {
  const ix = addLiquidity2Ix(acc(), 7n, 1n);
  expect(ix.data.length).toBe(25);
  expect(ix.data[24]).toBe(0);
  expect(ix.data.subarray(0, 8).equals(removeLiquidity2Ix(acc(), 0n, 0n).data.subarray(0, 8))).toBe(false);
});

test("the discriminators written into jlp.ts are the ones Anchor computes", async () => {
  const sha = await import("node:crypto");
  for (const name of ["remove_liquidity2", "add_liquidity2"] as const) {
    const computed = sha.createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
    expect(DISCRIMINATORS[name]).toEqual(computed);
  }
});
