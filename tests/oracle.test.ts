import { beforeEach, describe, expect, test } from "bun:test";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  ORACLE_PROGRAM_ID, Reason, SQUADS_V4_ID, encodeNonce, parseFlagChanged, programDataAddress, registerVenueIx,
  updateIx, vaultPda,
} from "@pexiz/sdk";
import { DAY, Env, loadVenueFixture, members, multisigOf, type Fixture } from "./helpers";

const MIN_TL = 3600;
const EXIT = 1800;

function setup(name: "jupiter" | "drift" = "jupiter") {
  const env = new Env();
  const f = loadVenueFixture(env, name);
  return { env, f };
}

async function register(env: Env, f: Fixture) {
  env.send([await registerVenueIx(env.payer.publicKey, { program: f.program, multisig: f.multisig, minTimeLockSecs: MIN_TL, exitTimeSecs: EXIT })]);
}

async function update(env: Env, f: Fixture, proofs: PublicKey[] = []) {
  return env.send([await updateIx(f.program, f.multisig, proofs)]);
}

describe("register_venue", () => {
  test("registers Jupiter Perps parameters, flag starts green", async () => {
    const { env, f } = setup("jupiter");
    await register(env, f);
    const v = env.venue(f.program);
    expect(v.flag).toBe("green");
    expect(v.threshold).toBe(4);
    expect(v.timeLockSecs).toBe(86_400);
    expect(v.members.length).toBe(8);
    expect(v.upgradeAuthority.equals(f.authority)).toBe(true);
    expect(v.exitWindowSecs).toBe(86_400 - EXIT);
  });

  test("registers Drift parameters", async () => {
    const { env, f } = setup("drift");
    await register(env, f);
    const v = env.venue(f.program);
    expect([v.threshold, v.timeLockSecs, v.members.length]).toEqual([4, 3600, 7]);
  });

  test("rejects a wrong program-data account", async () => {
    const { env, f } = setup();
    const ix = await registerVenueIx(env.payer.publicKey, { program: f.program, multisig: f.multisig, minTimeLockSecs: MIN_TL, exitTimeSecs: EXIT });
    const other = Keypair.generate().publicKey;
    env.setWatchedProgram(other, f.authority);
    ix.keys[1].pubkey = programDataAddress(other);
    expect(env.expectFail([ix])).toContain("WrongProgramData");
  });

  test("rejects a multisig not owned by Squads v4", async () => {
    const { env, f } = setup();
    env.setRaw(f.multisig, SystemProgram.programId, env.data(f.multisig));
    const ix = await registerVenueIx(env.payer.publicKey, { program: f.program, multisig: f.multisig, minTimeLockSecs: MIN_TL, exitTimeSecs: EXIT });
    expect(env.expectFail([ix])).toContain("NotSquadsMultisig");
  });

  test("rejects a multisig whose vault is not the upgrade authority", async () => {
    const { env, f } = setup();
    const other = Keypair.generate().publicKey;
    env.setMultisig(other, multisigOf(2, 3600, members(3).map((k) => k.publicKey)));
    const ix = await registerVenueIx(env.payer.publicKey, { program: f.program, multisig: other, minTimeLockSecs: MIN_TL, exitTimeSecs: EXIT });
    expect(env.expectFail([ix])).toContain("WrongUpgradeAuthority");
  });

  test("rejects a program whose authority is another key", async () => {
    const { env, f } = setup();
    env.setWatchedProgram(f.program, Keypair.generate().publicKey);
    const ix = await registerVenueIx(env.payer.publicKey, { program: f.program, multisig: f.multisig, minTimeLockSecs: MIN_TL, exitTimeSecs: EXIT });
    expect(env.expectFail([ix])).toContain("WrongUpgradeAuthority");
  });

  test("first registrant wins", async () => {
    const { env, f } = setup();
    await register(env, f);
    const ix = await registerVenueIx(env.payer.publicKey, { program: f.program, multisig: f.multisig, minTimeLockSecs: 0, exitTimeSecs: 0 });
    expect(env.expectFail([ix])).toContain("already in use");
    expect(env.venue(f.program).minTimeLockSecs).toBe(MIN_TL);
  });
});

describe("update: one test per reason bit", () => {
  let env: Env;
  let f: Fixture;
  beforeEach(async () => {
    ({ env, f } = setup());
    await register(env, f);
  });

  test("healthy config stays green, no event", async () => {
    const r = await update(env, f);
    expect(env.venue(f.program).flag).toBe("green");
    expect(parseFlagChanged(r.logs())).toEqual([]);
  });

  test("TIME_LOCK_BELOW_MIN", async () => {
    env.editMultisig(f.multisig, (m) => { m.timeLock = 0; });
    const r = await update(env, f);
    const v = env.venue(f.program);
    expect(v.flag).toBe("red");
    expect(v.reasons).toBe(Reason.TIME_LOCK_BELOW_MIN);
    const [e] = parseFlagChanged(r.logs());
    expect([e.from, e.to, e.reasons]).toEqual(["green", "red", Reason.TIME_LOCK_BELOW_MIN]);
  });

  test("THRESHOLD_DROPPED", async () => {
    env.editMultisig(f.multisig, (m) => { m.threshold = 2; });
    await update(env, f);
    expect(env.venue(f.program).reasons).toBe(Reason.THRESHOLD_DROPPED);
    expect(env.venue(f.program).flag).toBe("red");
  });

  test("MEMBERS_REPLACED: 3 of 8 replaced", async () => {
    env.editMultisig(f.multisig, (m) => { for (let i = 0; i < 3; i++) m.members[i].key = Keypair.generate().publicKey; });
    await update(env, f);
    expect(env.venue(f.program).reasons).toBe(Reason.MEMBERS_REPLACED);
  });

  test("MEMBERS_REPLACED: 2 of 8 is not enough", async () => {
    env.editMultisig(f.multisig, (m) => { for (let i = 0; i < 2; i++) m.members[i].key = Keypair.generate().publicKey; });
    await update(env, f);
    expect(env.venue(f.program).flag).toBe("green");
  });

  test("MEMBERS_REPLACED: replacements add up within 7 days", async () => {
    env.editMultisig(f.multisig, (m) => { for (let i = 0; i < 2; i++) m.members[i].key = Keypair.generate().publicKey; });
    await update(env, f);
    env.warp(3 * DAY);
    env.editMultisig(f.multisig, (m) => { m.members[5].key = Keypair.generate().publicKey; });
    await update(env, f);
    expect(env.venue(f.program).reasons).toBe(Reason.MEMBERS_REPLACED);
  });

  test("UPGRADE_AUTHORITY_MOVED to another key", async () => {
    env.setWatchedProgram(f.program, Keypair.generate().publicKey);
    await update(env, f);
    expect(env.venue(f.program).reasons).toBe(Reason.UPGRADE_AUTHORITY_MOVED);
  });

  test("UPGRADE_AUTHORITY_MOVED to None", async () => {
    env.setWatchedProgram(f.program, null);
    await update(env, f);
    expect(env.venue(f.program).reasons).toBe(Reason.UPGRADE_AUTHORITY_MOVED);
  });

  test("SIGNER_PRESIGNING is amber", async () => {
    const nonce = env.addNonce(f.memberKeys[2]);
    const r = await update(env, f, [nonce]);
    const v = env.venue(f.program);
    expect(v.flag).toBe("amber");
    expect(v.reasons).toBe(Reason.SIGNER_PRESIGNING);
    expect(parseFlagChanged(r.logs())[0].to).toBe("amber");
  });

  test("AMBER_ESCALATED after 48h, and the flag stays amber", async () => {
    const nonce = env.addNonce(f.memberKeys[2]);
    await update(env, f, [nonce]);
    env.warp(48 * 3600);
    await update(env, f, [nonce]);
    const v = env.venue(f.program);
    expect(v.flag).toBe("amber");
    expect(v.reasons).toBe(Reason.SIGNER_PRESIGNING | Reason.AMBER_ESCALATED);
  });

  test("a stranger's nonce naming a member never forces an exit", async () => {
    // InitializeNonceAccount takes the authority as data and needs no
    // signature from it, so anyone can make one of these for a few lamports.
    const nonces = [0, 1, 2].map((i) => env.addNonce(f.memberKeys[i]));
    await update(env, f, nonces);
    for (let d = 0; d < 30; d++) {
      env.warp(DAY);
      await update(env, f, nonces);
    }
    expect(env.venue(f.program).flag).toBe("amber");
  });
});

describe("pre-signing proofs", () => {
  let env: Env;
  let f: Fixture;
  beforeEach(async () => {
    ({ env, f } = setup());
    await register(env, f);
  });

  test("rejects a nonce-shaped account with the wrong owner", async () => {
    const k = Keypair.generate().publicKey;
    env.setRaw(k, SQUADS_V4_ID, encodeNonce(f.memberKeys[0]));
    expect(env.expectFail([await updateIx(f.program, f.multisig, [k])])).toContain("BadPresigningProof");
  });

  test("rejects an uninitialized nonce account", async () => {
    const k = env.addNonce(f.memberKeys[0], 0);
    expect(env.expectFail([await updateIx(f.program, f.multisig, [k])])).toContain("BadPresigningProof");
  });

  test("rejects a nonce controlled by a non-member", async () => {
    const k = env.addNonce(Keypair.generate().publicKey);
    expect(env.expectFail([await updateIx(f.program, f.multisig, [k])])).toContain("BadPresigningProof");
  });

  test("rejects a System account of the wrong size", async () => {
    const k = Keypair.generate().publicKey;
    env.setRaw(k, SystemProgram.programId, Buffer.concat([encodeNonce(f.memberKeys[0]), Buffer.alloc(8)]));
    expect(env.expectFail([await updateIx(f.program, f.multisig, [k])])).toContain("BadPresigningProof");
  });

  test("a nonce of a removed member no longer counts", async () => {
    const k = env.addNonce(f.memberKeys[0]);
    env.editMultisig(f.multisig, (m) => { m.members = m.members.slice(1); });
    expect(env.expectFail([await updateIx(f.program, f.multisig, [k])])).toContain("BadPresigningProof");
  });

  test("rejects update with a wrong program-data account", async () => {
    const ix = await updateIx(f.program, f.multisig);
    const other = Keypair.generate().publicKey;
    env.setWatchedProgram(other, f.authority);
    ix.keys[1].pubkey = programDataAddress(other);
    expect(env.expectFail([ix])).toContain("WrongProgramData");
  });

  test("rejects update with a wrong multisig account", async () => {
    const other = Keypair.generate().publicKey;
    env.setMultisig(other, env.multisig(f.multisig));
    expect(env.expectFail([await updateIx(f.program, other)])).toContain("WrongMultisig");
  });
});

describe("escalation timeline and cool-off with clock warps", () => {
  test("amber → escalated amber → clears → green after 7 days", async () => {
    const { env, f } = setup("drift");
    await register(env, f);
    const nonce = env.addNonce(f.memberKeys[0]);
    const seen: string[] = [];
    const step = async (dt: number, proofs: PublicKey[]) => {
      env.warp(dt);
      await update(env, f, proofs);
      seen.push(env.venue(f.program).flag);
    };
    await step(0, [nonce]);           // day 0: amber
    await step(DAY, [nonce]);         // day 1: amber
    await step(DAY, [nonce]);         // day 2: escalated, still amber
    env.closeAccount(nonce);
    await step(DAY, [nonce]);         // day 3: nonce shown closed, cool-off starts
    await step(6 * DAY, []);          // day 9: still in cool-off
    await step(DAY - 1, []);          // 1 s short of 7 days
    await step(1, []);                // day 10: green
    expect(seen).toEqual(["amber", "amber", "amber", "amber", "amber", "amber", "green"]);
    expect(env.venue(f.program).reasons).toBe(0);
  });

  test("a new condition during cool-off restarts it", async () => {
    const { env, f } = setup();
    await register(env, f);
    env.editMultisig(f.multisig, (m) => { m.timeLock = 0; });
    await update(env, f);
    env.editMultisig(f.multisig, (m) => { m.timeLock = 86_400; });
    env.warp(DAY);
    await update(env, f);
    env.warp(5 * DAY);
    const nonce = env.addNonce(f.memberKeys[1]);
    await update(env, f, [nonce]);
    env.warp(5 * DAY);
    env.closeAccount(nonce);
    await update(env, f, [nonce]);
    expect(env.venue(f.program).flag).toBe("red");
    env.warp(7 * DAY);
    await update(env, f);
    expect(env.venue(f.program).flag).toBe("green");
  });

  test("proof-less updates cannot stop escalation or clear amber", async () => {
    const { env, f } = setup("drift");
    await register(env, f);
    const nonce = env.addNonce(f.memberKeys[0]);
    await update(env, f, [nonce]);
    expect(env.venue(f.program).flag).toBe("amber");
    // An attacker who controls the nonce spams updates without it.
    for (let h = 0; h < 48; h += 6) {
      env.warp(6 * 3600);
      await update(env, f);
    }
    const v = env.venue(f.program);
    expect(v.flag).toBe("amber");
    expect(v.reasons).toBe(Reason.SIGNER_PRESIGNING | Reason.AMBER_ESCALATED);
    expect(v.presigners.map((k) => k.toBase58())).toEqual([nonce.toBase58()]);
    // Weeks of proof-less updates never bring it back to green.
    for (let d = 0; d < 21; d++) {
      env.warp(DAY);
      await update(env, f);
    }
    expect(env.venue(f.program).flag).toBe("amber");
  });

  test("a remembered nonce clears only when shown dead", async () => {
    const { env, f } = setup();
    await register(env, f);
    const nonce = env.addNonce(f.memberKeys[3]);
    await update(env, f, [nonce]);
    expect(env.venue(f.program).presigners.length).toBe(1);
    // Still live: passing it again keeps it.
    env.warp(DAY);
    await update(env, f, [nonce]);
    expect(env.venue(f.program).presigners.length).toBe(1);
    // Authority moved to a non-member: passing it now drops it.
    env.setRaw(nonce, SystemProgram.programId, encodeNonce(Keypair.generate().publicKey));
    await update(env, f, [nonce]);
    const v = env.venue(f.program);
    expect(v.presigners.length).toBe(0);
    expect(v.activeReasons).toBe(0);
    expect(v.flag).toBe("amber");
    env.warp(7 * DAY);
    await update(env, f);
    expect(env.venue(f.program).flag).toBe("green");
  });

  test("a remembered nonce whose member was removed is dropped when passed", async () => {
    const { env, f } = setup();
    await register(env, f);
    const nonce = env.addNonce(f.memberKeys[0]);
    await update(env, f, [nonce]);
    env.editMultisig(f.multisig, (m) => { m.members = m.members.slice(1); });
    await update(env, f, [nonce]);
    expect(env.venue(f.program).presigners.length).toBe(0);
  });

  test("a lowered threshold is accepted after a week, green after another", async () => {
    const { env, f } = setup();
    await register(env, f);
    env.editMultisig(f.multisig, (m) => { m.threshold = 3; });
    await update(env, f);
    expect(env.venue(f.program).flag).toBe("red");
    env.warp(7 * DAY);
    await update(env, f);
    let v = env.venue(f.program);
    expect(v.baselineThreshold).toBe(3);
    expect(v.flag).toBe("red");
    env.warp(7 * DAY);
    await update(env, f);
    v = env.venue(f.program);
    expect(v.flag).toBe("green");
  });

  test("red clock fields use unix time, not slots", async () => {
    const { env, f } = setup();
    await register(env, f);
    env.editMultisig(f.multisig, (m) => { m.timeLock = 0; });
    await update(env, f);
    expect(env.venue(f.program).redSince).toBe(env.now());
  });
});

test("oracle program id matches the IDL", () => {
  expect(ORACLE_PROGRAM_ID.toBase58()).toBe("68dVVoeeYPmcPrNRycHwJAsLK25tMn6yiQhHQDWp2d7n");
  expect(vaultPda(PublicKey.default)[0]).toBeInstanceOf(PublicKey);
});

describe("property: random config sequences on chain", () => {
  test("red always carries a reason; green only after a full cool-off", async () => {
    let seed = 0x5eed;
    const rand = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    for (let run = 0; run < 4; run++) {
      const { env, f } = setup(run % 2 ? "drift" : "jupiter");
      await register(env, f);
      const base = env.multisig(f.multisig);
      const hard = Reason.TIME_LOCK_BELOW_MIN | Reason.THRESHOLD_DROPPED | Reason.MEMBERS_REPLACED | Reason.UPGRADE_AUTHORITY_MOVED;
      let prev = "green";
      for (let i = 0; i < 25; i++) {
        env.editMultisig(f.multisig, (m) => {
          m.timeLock = [0, 1800, base.timeLock][rand(3)];
          m.threshold = Math.max(1, base.threshold - rand(2));
          if (rand(4) === 0) m.members[rand(m.members.length)].key = Keypair.generate().publicKey;
        });
        env.setWatchedProgram(f.program, rand(6) === 0 ? null : f.authority);
        const ms = env.multisig(f.multisig);
        const proofs = rand(3) === 0 ? [env.addNonce(ms.members[0].key)] : [];
        const before = env.venue(f.program);
        env.warp(rand(4 * DAY));
        await update(env, f, proofs);
        const v = env.venue(f.program);
        if (v.flag === "red") expect(v.reasons & hard).not.toBe(0);
        if (v.flag !== "green") expect(v.reasons).not.toBe(0);
        if (v.flag === "green" && prev !== "green") {
          expect(before.activeReasons).toBe(0);
          expect(env.now() - before.clearSince).toBeGreaterThanOrEqual(7 * DAY);
        }
        prev = v.flag;
      }
    }
  });
});
