import { describe, expect, test } from "bun:test";
import { Keypair } from "@solana/web3.js";
import {
  AUM_CAP_USDC, CANARY_PROGRAM_ID, depositIx, exitIx, initVaultIx, parseFlagChanged, parseVaultExited, reenterIx,
  registerVenueIx, unvoteIx, vaultAddresses, vaultPda, venuePda, voteReenterIx, withdrawIx,
} from "@pexiz/sdk";
import { DAY, Env, members, multisigOf } from "./helpers";
import { USDC, World, type User } from "./world";

const withdraw = async (w: World, u: User, shares: bigint) =>
  w.env.send([await withdrawIx(w.v, u.kp.publicKey, { userShares: u.shares, userUsdc: u.usdc, userLp: u.lp }, shares)], [u.kp]);

describe("vault lifecycle against the canary venue", () => {
  test("deposit → red → same-tx update+exit → withdraw USDC → cool-off → vote → reenter", async () => {
    const w = await World.create();
    const { env } = w;
    const alice = w.user(USDC(1000));
    const bob = w.user(USDC(1000));
    await w.deposit(alice, USDC(600));
    await w.deposit(bob, USDC(400));
    expect(w.holdings()).toEqual({ usdc: 0n, lp: USDC(1000), supply: USDC(1000) });

    w.setTimeLock(0);
    const r = env.send([await w.updateIx(), await exitIx(w.v, USDC(999))]);
    expect(parseFlagChanged(r.logs())[0].to).toBe("red");
    const [ex] = parseVaultExited(r.logs());
    expect(ex.usdcOut).toBe(USDC(999));
    expect(w.vault().exited).toBe(true);
    expect(w.holdings()).toEqual({ usdc: USDC(999), lp: 0n, supply: USDC(1000) });

    expect(env.expectFail([await depositIx(w.v, bob.kp.publicKey, bob.usdc, bob.shares, USDC(1))], [bob.kp])).toContain("AlreadyExited");

    await withdraw(w, bob, USDC(100));
    expect(env.balance(bob.usdc)).toBe(USDC(600) + 99_900_000n);

    w.setTimeLock(86_400);
    await w.update();
    env.warp(7 * DAY);
    await w.update();
    expect(w.flag()).toBe("green");

    expect(env.expectFail([await reenterIx(w.v)])).toContain("ReentryNotAllowed");
    env.send([await voteReenterIx(w.v, alice.kp.publicKey, alice.shares, USDC(450))], [alice.kp]);
    expect(w.vault().reentryVotes).toBe(USDC(450));
    env.send([await reenterIx(w.v)]);
    const h = w.holdings();
    expect(w.vault().exited).toBe(false);
    expect(h.usdc).toBe(0n);
    expect(h.lp).toBe(USDC(999) - 99_900_000n);

    env.send([await unvoteIx(w.v, alice.kp.publicKey, alice.shares)], [alice.kp]);
    expect(env.balance(alice.shares)).toBe(USDC(600));
    await withdraw(w, alice, USDC(600));
    expect(env.balance(alice.lp)).toBe((USDC(999) - 99_900_000n) * 600n / 900n);
  });
});

describe("exit", () => {
  test("fails while green", async () => {
    const w = await World.create();
    await w.deposit(w.user(USDC(10)), USDC(10));
    expect(w.env.expectFail([await exitIx(w.v)])).toContain("VenueNotRed");
  });

  test("fails while amber", async () => {
    const w = await World.create();
    await w.deposit(w.user(USDC(10)), USDC(10));
    await w.update([w.env.addNonce(w.signers[0].publicKey)]);
    expect(w.flag()).toBe("amber");
    expect(w.env.expectFail([await exitIx(w.v)])).toContain("VenueNotRed");
  });

  test("update + exit in one transaction succeed together, in one slot", async () => {
    const w = await World.create();
    await w.deposit(w.user(USDC(50)), USDC(50));
    const nonce = w.env.addNonce(w.signers[1].publicKey);
    await w.update([nonce]);
    w.env.warp(48 * 3600);
    const r = w.env.send([await w.updateIx([nonce]), await exitIx(w.v)]);
    const [fc] = parseFlagChanged(r.logs());
    const [ex] = parseVaultExited(r.logs());
    expect([fc.from, fc.to]).toEqual(["amber", "red"]);
    expect(ex.slot).toBe(fc.slot);
    expect(w.vault().exitedAtSlot).toBe(fc.slot);
  });

  test("if the update does not turn red, the whole transaction reverts", async () => {
    const w = await World.create();
    await w.deposit(w.user(USDC(50)), USDC(50));
    expect(w.env.expectFail([await w.updateIx(), await exitIx(w.v)])).toContain("VenueNotRed");
    expect(w.env.venue(CANARY_PROGRAM_ID).lastUpdateSlot).toBe(1n);
  });

  test("min_usdc_out is enforced", async () => {
    const w = await World.create();
    await w.deposit(w.user(USDC(50)), USDC(50));
    w.setTimeLock(0);
    expect(w.env.expectFail([await w.updateIx(), await exitIx(w.v, USDC(50))])).toContain("Slippage");
  });

  test("cannot exit twice", async () => {
    const w = await World.create();
    await w.deposit(w.user(USDC(50)), USDC(50));
    w.setTimeLock(0);
    w.env.send([await w.updateIx(), await exitIx(w.v)]);
    expect(w.env.expectFail([await exitIx(w.v)])).toContain("AlreadyExited");
  });

  test("an empty vault can exit", async () => {
    const w = await World.create();
    w.setTimeLock(0);
    w.env.send([await w.updateIx(), await exitIx(w.v)]);
    expect(w.vault().exited).toBe(true);
  });
});

describe("withdraw works in every state", () => {
  test("green, amber, red before exit, after exit", async () => {
    const w = await World.create();
    const u = w.user(USDC(100));
    await w.deposit(u, USDC(100));
    await withdraw(w, u, USDC(10));
    expect(w.env.balance(u.lp)).toBe(USDC(10));
    const nonce = w.env.addNonce(w.signers[2].publicKey);
    await w.update([nonce]);
    expect(w.flag()).toBe("amber");
    await withdraw(w, u, USDC(10));
    w.setTimeLock(0);
    await w.update([nonce]);
    expect(w.flag()).toBe("red");
    await withdraw(w, u, USDC(10));
    expect(w.env.balance(u.lp)).toBe(USDC(30));
    w.env.send([await exitIx(w.v)]);
    await withdraw(w, u, USDC(70));
    expect(w.env.balance(u.usdc)).toBe(USDC(70) - 70_000n);
    expect(w.holdings()).toEqual({ usdc: 0n, lp: 0n, supply: 0n });
  });

  test("cannot withdraw more shares than held", async () => {
    const w = await World.create();
    const u = w.user(USDC(10));
    await w.deposit(u, USDC(10));
    expect(w.env.expectFail([await withdrawIx(w.v, u.kp.publicKey, { userShares: u.shares, userUsdc: u.usdc, userLp: u.lp }, USDC(11))], [u.kp])).toContain("insufficient funds");
  });
});

describe("deposit", () => {
  test("refused while amber or red", async () => {
    const w = await World.create();
    const u = w.user(USDC(10));
    await w.update([w.env.addNonce(w.signers[0].publicKey)]);
    expect(w.env.expectFail([await depositIx(w.v, u.kp.publicKey, u.usdc, u.shares, USDC(1))], [u.kp])).toContain("VenueNotGreen");
    w.setTimeLock(0);
    await w.update();
    expect(w.env.expectFail([await depositIx(w.v, u.kp.publicKey, u.usdc, u.shares, USDC(1))], [u.kp])).toContain("VenueNotGreen");
  });

  test("AUM cap of $10M", async () => {
    const w = await World.create();
    const whale = w.user(AUM_CAP_USDC + USDC(1));
    await w.deposit(whale, AUM_CAP_USDC - USDC(1));
    expect(w.env.expectFail([await depositIx(w.v, whale.kp.publicKey, whale.usdc, whale.shares, USDC(2))], [whale.kp])).toContain("AumCap");
    await w.deposit(whale, USDC(1));
    expect(w.holdings().lp).toBe(AUM_CAP_USDC);
  });

  test("later depositors get shares at the current price", async () => {
    const w = await World.create();
    const a = w.user(USDC(100));
    const b = w.user(USDC(100));
    await w.deposit(a, USDC(100));
    // A donation of LP raises the share price.
    w.env.send([await (await import("@pexiz/sdk")).addLiquidityIx(w.v.pool, { user: b.kp.publicKey, userUsdc: b.usdc, userLp: w.v.vaultLp }, USDC(100))], [b.kp]);
    const c = w.user(USDC(50));
    await w.deposit(c, USDC(50));
    expect(w.env.balance(c.shares)).toBe(USDC(25));
  });
});

describe("re-entry vote", () => {
  test("needs green, an exit, and at least half of all shares", async () => {
    const w = await World.create();
    const a = w.user(USDC(51));
    const b = w.user(USDC(49));
    await w.deposit(a, USDC(51));
    await w.deposit(b, USDC(49));
    expect(w.env.expectFail([await voteReenterIx(w.v, b.kp.publicKey, b.shares, USDC(1))], [b.kp])).toContain("NotExited");
    w.setTimeLock(0);
    w.env.send([await w.updateIx(), await exitIx(w.v)]);
    w.env.send([await voteReenterIx(w.v, b.kp.publicKey, b.shares, USDC(49))], [b.kp]);
    expect(w.env.expectFail([await reenterIx(w.v)])).toContain("VenueNotGreen");
    w.setTimeLock(86_400);
    await w.update();
    w.env.warp(7 * DAY - 1);
    await w.update();
    expect(w.flag()).toBe("red");
    w.env.warp(1);
    await w.update();
    expect(w.flag()).toBe("green");
    expect(w.env.expectFail([await reenterIx(w.v)])).toContain("ReentryNotAllowed");
    w.env.send([await voteReenterIx(w.v, a.kp.publicKey, a.shares, USDC(1))], [a.kp]);
    w.env.send([await reenterIx(w.v)]);
    expect(w.vault().exited).toBe(false);
  });

  test("unvote removes the vote and returns escrowed shares", async () => {
    const w = await World.create();
    const a = w.user(USDC(10));
    await w.deposit(a, USDC(10));
    w.setTimeLock(0);
    w.env.send([await w.updateIx(), await exitIx(w.v)]);
    w.env.send([await voteReenterIx(w.v, a.kp.publicKey, a.shares, USDC(10))], [a.kp]);
    expect(w.env.balance(a.shares)).toBe(0n);
    w.env.send([await unvoteIx(w.v, a.kp.publicKey, a.shares)], [a.kp]);
    expect(w.vault().reentryVotes).toBe(0n);
    expect(w.env.balance(a.shares)).toBe(USDC(10));
  });

  test("moving shares cannot double-vote: votes are escrowed", async () => {
    const w = await World.create();
    const a = w.user(USDC(10));
    const b = w.user(USDC(30));
    await w.deposit(a, USDC(10));
    await w.deposit(b, USDC(30));
    w.setTimeLock(0);
    w.env.send([await w.updateIx(), await exitIx(w.v)]);
    w.env.send([await voteReenterIx(w.v, a.kp.publicKey, a.shares, USDC(10))], [a.kp]);
    expect(w.env.expectFail([await voteReenterIx(w.v, a.kp.publicKey, a.shares, USDC(10))], [a.kp])).toContain("insufficient funds");
  });
});

describe("binding checks", () => {
  test("a vault only binds to a venue that watches the canary program", async () => {
    const env = new Env();
    const usdc = env.createMint(6);
    const { canaryPool, initPoolIx } = await import("@pexiz/sdk");
    env.send([await initPoolIx(env.payer.publicKey, canaryPool(usdc))]);
    const ms = Keypair.generate().publicKey;
    const prog = Keypair.generate().publicKey;
    env.setMultisig(ms, multisigOf(2, 86_400, members(3).map((k) => k.publicKey)));
    env.setWatchedProgram(prog, vaultPda(ms)[0]);
    env.send([await registerVenueIx(env.payer.publicKey, { program: prog, multisig: ms, minTimeLockSecs: 3600, exitTimeSecs: 0 })]);
    expect(env.expectFail([await initVaultIx(env.payer.publicKey, vaultAddresses(venuePda(prog), usdc))])).toContain("VenueMismatch");
  });

  test("exit with another venue account is rejected", async () => {
    const w = await World.create();
    const ix = await exitIx(w.v);
    ix.keys[1].pubkey = Keypair.generate().publicKey;
    expect(w.env.expectFail([ix])).toMatch(/ConstraintHasOne|AccountNotInitialized/);
  });
});

describe("invariant: random sequences never pay out more than the vault holds", () => {
  test("price per share never falls on deposit or withdraw; total paid ≤ total deposited", async () => {
    let seed = 42;
    const rand = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    for (let run = 0; run < 3; run++) {
      const w = await World.create();
      const users = Array.from({ length: 4 }, () => w.user(USDC(1_000_000)));
      let deposited = 0n;
      const pps = () => { const h = w.holdings(); return h.supply === 0n ? null : [(h.usdc + h.lp), h.supply] as const; };
      for (let i = 0; i < 40; i++) {
        const u = users[rand(users.length)];
        const before = pps();
        const op = rand(10);
        if (op < 5 && !w.vault().exited && w.flag() === "green") {
          const amt = BigInt(1 + rand(5_000_000_000));
          await w.deposit(u, amt);
          deposited += amt;
        } else if (op < 9) {
          const held = w.env.balance(u.shares);
          if (held === 0n) continue;
          await withdraw(w, u, 1n + BigInt(rand(Number(held))));
        } else if (!w.vault().exited) {
          w.setTimeLock(0);
          w.env.send([await w.updateIx(), await exitIx(w.v)]);
          continue;
        }
        const after = pps();
        if (before && after) expect(after[0] * before[1]).toBeGreaterThanOrEqual(before[0] * after[1]);
      }
      for (const u of users) {
        const held = w.env.balance(u.shares);
        if (held > 0n) await withdraw(w, u, held);
      }
      // Each user's net is (returned - deposited); LP is counted at par.
      let net = 0n;
      for (const u of users) net += w.env.balance(u.usdc) + w.env.balance(u.lp) - USDC(1_000_000);
      expect(deposited).toBeGreaterThan(0n);
      expect(net).toBeLessThanOrEqual(0n);
      expect(w.holdings().supply).toBe(0n);
    }
  });
});
