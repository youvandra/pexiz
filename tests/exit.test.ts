import { describe, expect, test } from "bun:test";
import { Keypair, PublicKey } from "@solana/web3.js";
import { createApproveInstruction, createRevokeInstruction } from "@solana/spl-token";
import {
  FAST_CANARY_PROGRAM_ID, addLiquidityIx, decodeGuard, exitAuthority, autoExitCanaryIx, guardPda, openRouteIx, parseGuardExited,
  protectCanaryIxs, unprotectIxs, venuePda,
} from "@pexiz/sdk";
import { USDC, World, type User } from "@pexiz/localnet";

/** A holder with canary LP in their own wallet, guarded by the fast canary venue. */
async function setup(opts: { approve?: bigint } = {}) {
  const w = await World.create({ program: FAST_CANARY_PROGRAM_ID, timeLock: 60, minTimeLockSecs: 30 });
  const { env } = w;
  env.send([await openRouteIx(env.payer.publicKey, w.usdcMint)]);
  const h = w.user(USDC(100));
  env.send([await addLiquidityIx(w.v.pool, { user: h.kp.publicKey, userUsdc: h.usdc, userLp: h.lp }, USDC(100))], [h.kp]);
  const venue = venuePda(FAST_CANARY_PROGRAM_ID);
  env.send(await protectCanaryIxs(h.kp.publicKey, venue, w.v.pool, h.lp, h.usdc, opts.approve ?? USDC(100)), [h.kp]);
  const keeper = w.user(0n);
  const exit = () => autoExitCanaryIx({ holder: h.kp.publicKey, venue, usdcDest: h.usdc }, w.v.pool, h.lp, keeper.usdc);
  return { w, env, h, keeper, venue, exit };
}

describe("auto-exit without a deposit", () => {
  test("red: one keeper transaction updates the flag and pays the holder in USDC", async () => {
    const { w, env, h, keeper, exit } = await setup();
    expect(env.balance(h.lp)).toBe(USDC(100));
    expect(env.balance(h.usdc)).toBe(0n);

    w.setTimeLock(0);
    const r = env.send([await w.updateIx(), await exit()]);
    const [e] = parseGuardExited(r.logs());
    // The canary redeems at 99.9%; the keeper keeps 0.1% of that.
    expect(e.usdcOut).toBe(99_900_000n);
    expect(e.keeperFee).toBe(99_900n);
    expect(env.balance(h.lp)).toBe(0n);
    expect(env.balance(h.usdc)).toBe(99_900_000n - 99_900n);
    expect(env.balance(keeper.usdc)).toBe(99_900n);
    expect(decodeGuard(env.data(guardPda(h.kp.publicKey, w.v.pool.lpMint))).exits).toBe(1);
  });

  test("a holder still gets out after the vault's exit left fees in the pool", async () => {
    const { w, env, h, exit } = await setup();
    const big = w.user(USDC(5_000));
    await w.deposit(big, USDC(5_000));
    w.setTimeLock(0);
    // The vault leaves first and its 0.1% fee stays in the reserve, so the
    // reserve now exceeds the LP left: the floor must not count that fee.
    env.send([await w.updateIx(), await w.exitIx()]);
    expect(env.balance(w.v.pool.usdcReserve)).toBeGreaterThan(env.supply(w.v.pool.lpMint));
    env.send([await exit()]);
    expect(env.balance(h.lp)).toBe(0n);
  });

  test("green and amber do nothing", async () => {
    const { w, env, exit } = await setup();
    expect(env.expectFail([await exit()])).toContain("VenueNotRed");
    await w.update([env.addNonce(w.signers[0].publicKey)]);
    expect(w.flag()).toBe("amber");
    expect(env.expectFail([await exit()])).toContain("VenueNotRed");
  });

  test("an exit takes only what was approved", async () => {
    const { w, env, h, exit } = await setup({ approve: USDC(40) });
    w.setTimeLock(0);
    env.send([await w.updateIx(), await exit()]);
    expect(env.balance(h.lp)).toBe(USDC(60));
    // The token program clears a delegate whose allowance is used up.
    expect(env.expectFail([await exit()])).toContain("NotDelegated");
  });

  test("a revoked delegation cannot be used", async () => {
    const { w, env, h, exit } = await setup();
    env.send([createRevokeInstruction(h.lp, h.kp.publicKey)], [h.kp]);
    w.setTimeLock(0);
    await w.update();
    expect(env.expectFail([await exit()])).toContain("NotDelegated");
  });

  test("the payout goes only to the account the holder named", async () => {
    const { w, env, h, keeper, venue } = await setup();
    w.setTimeLock(0);
    await w.update();
    const ix = await autoExitCanaryIx({ holder: h.kp.publicKey, venue, usdcDest: keeper.usdc }, w.v.pool, h.lp, keeper.usdc);
    expect(env.expectFail([ix])).toMatch(/ConstraintHasOne|has one/i);
  });

  test("a guard cannot name a payout account the holder does not own", async () => {
    const w = await World.create({ program: FAST_CANARY_PROGRAM_ID, timeLock: 60, minTimeLockSecs: 30 });
    const h = w.user(USDC(10));
    const other = w.user(0n);
    const ixs = await protectCanaryIxs(h.kp.publicKey, venuePda(FAST_CANARY_PROGRAM_ID), w.v.pool, h.lp, other.usdc, USDC(10));
    expect(w.env.expectFail(ixs, [h.kp])).toMatch(/ConstraintTokenOwner|token owner/i);
  });

  test("a delegation to the exit program does nothing without a guard", async () => {
    const { w, env, h, exit } = await setup();
    env.send([(await unprotectIxs(h.kp.publicKey, w.v.pool.lpMint, h.lp))[0]], [h.kp]);
    env.send([createApproveInstruction(h.lp, exitAuthority(), h.kp.publicKey, USDC(100))], [h.kp]);
    w.setTimeLock(0);
    await w.update();
    expect(env.expectFail([await exit()])).toMatch(/AccountNotInitialized/);
    expect(env.balance(h.lp)).toBe(USDC(100));
  });

  test("a guard only binds to a venue watching the canary programs", async () => {
    const w = await World.create();
    const h = w.user(USDC(10));
    const ixs = await protectCanaryIxs(h.kp.publicKey, Keypair.generate().publicKey, w.v.pool, h.lp, h.usdc, USDC(10));
    expect(w.env.expectFail(ixs, [h.kp])).toMatch(/AccountNotInitialized|VenueMismatch/);
  });

  test("unprotect closes the guard and revokes the delegation", async () => {
    const { w, env, h } = await setup();
    env.send(await unprotectIxs(h.kp.publicKey, w.v.pool.lpMint, h.lp), [h.kp]);
    expect(env.svm.getAccount(guardPda(h.kp.publicKey, w.v.pool.lpMint))).toBeNull();
  });
});
