import { beforeEach, describe, expect, test } from "bun:test";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  CANARY_PROGRAM_ID, Reason, addLiquidityIx, canaryPool, initPoolIx, registerVenueIx, removeLiquidityIx, updateIx,
  vaultPda, type CanaryPool,
} from "@pexiz/sdk";
import { Env, members, multisigOf } from "./helpers";

const USDC = (n: number) => BigInt(n) * 1_000_000n;

describe("canary-venue pool", () => {
  let env: Env;
  let p: CanaryPool;
  let user: Keypair;
  let acc: { user: any; userUsdc: any; userLp: any };

  beforeEach(async () => {
    env = new Env();
    const usdc = env.createMint(6);
    p = canaryPool(usdc);
    env.send([await initPoolIx(env.payer.publicKey, p)]);
    user = Keypair.generate();
    env.svm.airdrop(user.publicKey, BigInt(LAMPORTS_PER_SOL));
    acc = { user: user.publicKey, userUsdc: env.mintTo(usdc, user.publicKey, USDC(1000)), userLp: env.ata(user.publicKey, p.lpMint) };
  });

  test("add_liquidity mints LP 1:1", async () => {
    env.send([await addLiquidityIx(p, acc, USDC(400))], [user]);
    expect(env.balance(acc.userLp)).toBe(USDC(400));
    expect(env.balance(p.usdcReserve)).toBe(USDC(400));
    expect(env.balance(acc.userUsdc)).toBe(USDC(600));
  });

  test("remove_liquidity returns USDC minus the 10 bps fee, which stays in the pool", async () => {
    env.send([await addLiquidityIx(p, acc, USDC(400))], [user]);
    env.send([await removeLiquidityIx(p, acc, USDC(100))], [user]);
    expect(env.balance(acc.userLp)).toBe(USDC(300));
    expect(env.balance(acc.userUsdc)).toBe(USDC(600) + 99_900_000n);
    expect(env.balance(p.usdcReserve)).toBe(USDC(300) + 100_000n);
    expect(env.supply(p.lpMint)).toBe(USDC(300));
  });

  test("zero amounts are rejected", async () => {
    expect(env.expectFail([await addLiquidityIx(p, acc, 0n)], [user])).toContain("ZeroAmount");
    expect(env.expectFail([await removeLiquidityIx(p, acc, 0n)], [user])).toContain("ZeroAmount");
  });

  test("cannot redeem more LP than held", async () => {
    env.send([await addLiquidityIx(p, acc, USDC(10))], [user]);
    expect(env.expectFail([await removeLiquidityIx(p, acc, USDC(11))], [user])).toContain("insufficient funds");
  });

  test("a USDC account of another mint is rejected", async () => {
    const other = env.createMint(6);
    const bad = { ...acc, userUsdc: env.mintTo(other, user.publicKey, USDC(10)) };
    expect(env.expectFail([await addLiquidityIx(p, bad, USDC(1))], [user])).toContain("ConstraintTokenMint");
  });

  test("only the LP owner can redeem", async () => {
    env.send([await addLiquidityIx(p, acc, USDC(10))], [user]);
    const thief = Keypair.generate();
    env.svm.airdrop(thief.publicKey, BigInt(LAMPORTS_PER_SOL));
    const ix = await removeLiquidityIx(p, { ...acc, user: thief.publicKey, userUsdc: env.ata(thief.publicKey, p.usdcMint) }, USDC(1));
    expect(env.expectFail([ix], [thief])).toContain("owner does not match");
  });
});

describe("canary-venue under the oracle", () => {
  test("Squads vault as upgrade authority; 3-of-5, 24h timelock; timelock cut turns red", async () => {
    const env = new Env();
    const multisig = Keypair.generate().publicKey;
    env.setMultisig(multisig, multisigOf(3, 86_400, members(5).map((k) => k.publicKey)));
    env.setWatchedProgram(CANARY_PROGRAM_ID, vaultPda(multisig)[0]);
    env.send([await registerVenueIx(env.payer.publicKey, { program: CANARY_PROGRAM_ID, multisig, minTimeLockSecs: 3600, exitTimeSecs: 600 })]);
    expect(env.venue(CANARY_PROGRAM_ID).flag).toBe("green");
    env.editMultisig(multisig, (m) => { m.timeLock = 0; });
    env.send([await updateIx(CANARY_PROGRAM_ID, multisig)]);
    const v = env.venue(CANARY_PROGRAM_ID);
    expect(v.flag).toBe("red");
    expect(v.reasons).toBe(Reason.TIME_LOCK_BELOW_MIN);
  });
});
