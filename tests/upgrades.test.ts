import { describe, expect, test } from "bun:test";
import { Keypair, PublicKey, SYSVAR_CLOCK_PUBKEY, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import {
  BPF_LOADER_UPGRADEABLE_ID, CANARY_PROGRAM_ID, ProposalStatus, Reason, SQUADS_V4_ID, decodeVaultTx, depositIx,
  encodeProposal, encodeVaultTx, programDataAddress, proposalPda, touchesProgram, transactionPda, vaultPda,
} from "@pexiz/sdk";
import { USDC, World } from "@pexiz/localnet";
import { DAY } from "./helpers";

/** Upgrade instruction of the BPF upgradeable loader against `program`, as a Squads vault transaction. */
function upgradeTx(w: World, index: bigint, program = CANARY_PROGRAM_ID, opts: { viaLookupTable?: boolean } = {}) {
  const keys = [
    vaultPda(w.multisig)[0], programDataAddress(program), program, Keypair.generate().publicKey,
    Keypair.generate().publicKey, SYSVAR_RENT_PUBKEY, SYSVAR_CLOCK_PUBKEY, BPF_LOADER_UPGRADEABLE_ID,
  ];
  const data = Buffer.alloc(4);
  data.writeUInt32LE(3);
  // Index 9 is past the static keys: an account loaded from a lookup table.
  const accounts = opts.viaLookupTable ? [9, 2, 3, 4, 5, 6, 0] : [1, 2, 3, 4, 5, 6, 0];
  return encodeVaultTx({ multisig: w.multisig, index, vaultIndex: 0, accountKeys: keys, instructions: [{ programIdIndex: 7, accountIndexes: accounts, data }] });
}

function propose(w: World, index: bigint, status: number, tx = upgradeTx(w, index)) {
  w.env.setRaw(transactionPda(w.multisig, index), SQUADS_V4_ID, tx);
  w.env.setRaw(proposalPda(w.multisig, index), SQUADS_V4_ID, encodeProposal(w.multisig, index, status, 1n));
  return [proposalPda(w.multisig, index), transactionPda(w.multisig, index)];
}

const venue = (w: World) => w.env.venue(CANARY_PROGRAM_ID);

describe("pending upgrade proposals", () => {
  test("an approved upgrade turns the flag amber and pauses deposits, without ever going red", async () => {
    const w = await World.create();
    await w.update(propose(w, 7n, ProposalStatus.Approved));
    expect(w.flag()).toBe("amber");
    expect(venue(w).activeReasons).toBe(Reason.UPGRADE_PENDING);
    expect(venue(w).pendingUpgrades).toEqual([7n]);
    const u = w.user(USDC(10));
    expect(w.env.expectFail([await depositIx(w.v, u.kp.publicKey, u.usdc, u.shares, USDC(10))], [u.kp])).toContain("VenueNotGreen");
    // Proof-less updates keep it, and it never escalates on its own.
    w.env.warp(5 * DAY);
    await w.update();
    expect(w.flag()).toBe("amber");
  });

  test("once the proposal executes, the flag is green at once", async () => {
    const w = await World.create();
    await w.update(propose(w, 3n, ProposalStatus.Approved));
    w.env.warp(DAY);
    await w.update(propose(w, 3n, ProposalStatus.Executed));
    expect(w.flag()).toBe("green");
    expect(venue(w).pendingUpgrades).toEqual([]);
  });

  test("a closed proposal clears it", async () => {
    const w = await World.create();
    const [p, t] = propose(w, 4n, ProposalStatus.Approved);
    await w.update([p, t]);
    w.env.closeAccount(p);
    w.env.closeAccount(t);
    await w.update([p]);
    expect(w.flag()).toBe("green");
  });

  test("a proposal still collecting votes changes nothing", async () => {
    const w = await World.create();
    await w.update(propose(w, 2n, ProposalStatus.Active));
    expect(w.flag()).toBe("green");
  });

  test("an approved transaction that upgrades a different program changes nothing", async () => {
    const w = await World.create();
    const other = Keypair.generate().publicKey;
    await w.update(propose(w, 5n, ProposalStatus.Approved, upgradeTx(w, 5n, other)));
    expect(w.flag()).toBe("green");
  });

  test("a target hidden behind a lookup table counts", async () => {
    const w = await World.create();
    await w.update(propose(w, 6n, ProposalStatus.Approved, upgradeTx(w, 6n, CANARY_PROGRAM_ID, { viaLookupTable: true })));
    expect(w.flag()).toBe("amber");
  });

  test("a proposal of another multisig is refused as a proof", async () => {
    const w = await World.create();
    const other = Keypair.generate().publicKey;
    const p = proposalPda(other, 1n);
    w.env.setRaw(p, SQUADS_V4_ID, encodeProposal(other, 1n, ProposalStatus.Approved, 1n));
    expect(w.env.expectFail([await w.updateIx([p])])).toContain("BadUpgradeProof");
  });

  test("a red flag stays red while an upgrade is pending", async () => {
    const w = await World.create();
    w.setTimeLock(0);
    await w.update(propose(w, 8n, ProposalStatus.Approved));
    expect(w.flag()).toBe("red");
    expect(venue(w).reasons & Reason.UPGRADE_PENDING).toBe(Reason.UPGRADE_PENDING);
  });
});

describe("vault transaction codec", () => {
  test("round-trips and finds the loader instruction", async () => {
    const w = await World.create();
    const t = decodeVaultTx(upgradeTx(w, 9n))!;
    expect(t.index).toBe(9n);
    expect(t.multisig.equals(w.multisig)).toBe(true);
    expect(touchesProgram(t, programDataAddress(CANARY_PROGRAM_ID))).toBe(true);
    expect(touchesProgram(t, programDataAddress(new PublicKey(SQUADS_V4_ID)))).toBe(false);
  });
});
