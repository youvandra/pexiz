// Squads v4 proposals and vault transactions, for pending-upgrade proofs.
// Mirrors programs/pexiz-oracle/src/upgrades.rs; layouts from the
// squads_multisig_program IDL in @sqds/multisig 2.1.4.
import { Connection, PublicKey } from "@solana/web3.js";
import { BPF_LOADER_UPGRADEABLE_ID, SQUADS_V4_ID } from "./squads";

export const PROPOSAL_DISCRIMINATOR = Buffer.from([26, 94, 189, 187, 116, 136, 53, 33]);
export const VAULT_TX_DISCRIMINATOR = Buffer.from([168, 250, 162, 100, 81, 14, 162, 207]);
/** Upgrade, SetAuthority, Close, SetAuthorityChecked. */
export const LOADER_TAGS = [3, 4, 5, 7];

export const ProposalStatus = { Draft: 0, Active: 1, Rejected: 2, Approved: 3, Executing: 4, Executed: 5, Cancelled: 6 } as const;

const u64le = (n: bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
};

export function transactionPda(multisig: PublicKey, index: bigint): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("multisig"), multisig.toBuffer(), Buffer.from("transaction"), u64le(index)], SQUADS_V4_ID)[0];
}

export function proposalPda(multisig: PublicKey, index: bigint): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("multisig"), multisig.toBuffer(), Buffer.from("transaction"), u64le(index), Buffer.from("proposal")],
    SQUADS_V4_ID,
  )[0];
}

export interface Proposal {
  multisig: PublicKey;
  index: bigint;
  status: number;
  /** Unix seconds of the latest status change. */
  timestamp?: number;
}

export function decodeProposal(data: Buffer): Proposal | null {
  if (data.length < 49 || !data.subarray(0, 8).equals(PROPOSAL_DISCRIMINATOR)) return null;
  const status = data[48];
  const timestamp = status !== ProposalStatus.Executing && data.length >= 57 ? Number(data.readBigInt64LE(49)) : undefined;
  return { multisig: new PublicKey(data.subarray(8, 40)), index: data.readBigUInt64LE(40), status, timestamp };
}

/** A Proposal account. Status variants other than Executing carry a timestamp. */
export function encodeProposal(multisig: PublicKey, index: bigint, status: number, timestamp = 0n): Buffer {
  const parts = [PROPOSAL_DISCRIMINATOR, multisig.toBuffer(), u64le(index), Buffer.from([status])];
  if (status !== ProposalStatus.Executing) parts.push(u64le(timestamp));
  parts.push(Buffer.from([255]), Buffer.alloc(12)); // bump, three empty vote vecs
  return Buffer.concat(parts);
}

export interface CompiledIx {
  programIdIndex: number;
  accountIndexes: number[];
  data: Buffer;
}

export interface VaultTx {
  multisig: PublicKey;
  index: bigint;
  vaultIndex: number;
  accountKeys: PublicKey[];
  instructions: CompiledIx[];
}

export function decodeVaultTx(data: Buffer): VaultTx | null {
  if (data.length < 8 || !data.subarray(0, 8).equals(VAULT_TX_DISCRIMINATOR)) return null;
  try {
    let o = 8;
    const multisig = new PublicKey(data.subarray(o, o + 32));
    o += 64; // multisig, creator
    const index = data.readBigUInt64LE(o);
    o += 8 + 1; // index, bump
    const vaultIndex = data[o];
    o += 2; // vault index, vault bump
    o += 4 + data.readUInt32LE(o); // ephemeral signer bumps
    o += 3; // signer counts
    const nKeys = data.readUInt32LE(o);
    o += 4;
    const accountKeys = Array.from({ length: nKeys }, (_, i) => new PublicKey(data.subarray(o + i * 32, o + i * 32 + 32)));
    o += nKeys * 32;
    const nIx = data.readUInt32LE(o);
    o += 4;
    const instructions: CompiledIx[] = [];
    for (let i = 0; i < nIx; i++) {
      const programIdIndex = data[o++];
      const na = data.readUInt32LE(o);
      const accountIndexes = [...data.subarray(o + 4, o + 4 + na)];
      o += 4 + na;
      const nd = data.readUInt32LE(o);
      instructions.push({ programIdIndex, accountIndexes, data: Buffer.from(data.subarray(o + 4, o + 4 + nd)) });
      o += 4 + nd;
    }
    return { multisig, index, vaultIndex, accountKeys, instructions };
  } catch {
    return null;
  }
}

/** A VaultTransaction account with no ephemeral signers and no lookup tables. */
export function encodeVaultTx(t: Omit<VaultTx, "index"> & { index: bigint; creator?: PublicKey }): Buffer {
  const u32 = (n: number) => {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(n);
    return b;
  };
  return Buffer.concat([
    VAULT_TX_DISCRIMINATOR, t.multisig.toBuffer(), (t.creator ?? PublicKey.default).toBuffer(), u64le(t.index),
    Buffer.from([255, t.vaultIndex, 255]), u32(0), Buffer.from([1, 1, 0]),
    u32(t.accountKeys.length), ...t.accountKeys.map((k) => k.toBuffer()),
    u32(t.instructions.length),
    ...t.instructions.flatMap((ix) => [Buffer.from([ix.programIdIndex]), u32(ix.accountIndexes.length), Buffer.from(ix.accountIndexes), u32(ix.data.length), ix.data]),
    u32(0),
  ]);
}

/** True when the transaction would upgrade, re-authorise or close `programData`. */
export function touchesProgram(t: VaultTx, programData: PublicKey): boolean {
  return t.instructions.some((ix) => {
    const program = t.accountKeys[ix.programIdIndex];
    if (!program?.equals(BPF_LOADER_UPGRADEABLE_ID) || ix.data.length < 4) return false;
    if (!LOADER_TAGS.includes(ix.data.readUInt32LE(0))) return false;
    const first = ix.accountIndexes[0];
    const key = first === undefined ? undefined : t.accountKeys[first];
    return !key || key.equals(programData);
  });
}

export interface PendingUpgrade {
  index: bigint;
  /** Unix seconds the proposal reached approval; the timelock runs from here. */
  approvedAt?: number;
  proposal: PublicKey;
  transaction: PublicKey;
}

/**
 * Approved proposals among the multisig's latest `lookback` transactions
 * whose vault transaction would upgrade the program. Proofs for `update`:
 * pass `proposal` and `transaction` of each.
 */
export async function findPendingUpgrades(
  conn: Connection,
  multisig: PublicKey,
  latestIndex: bigint,
  vaultIndex: number,
  programData: PublicKey,
  lookback = 20,
): Promise<PendingUpgrade[]> {
  const from = latestIndex > BigInt(lookback) ? latestIndex - BigInt(lookback) + 1n : 1n;
  const idx: bigint[] = [];
  for (let i = from; i <= latestIndex; i++) idx.push(i);
  const keys = idx.flatMap((i) => [proposalPda(multisig, i), transactionPda(multisig, i)]);
  const infos: (Awaited<ReturnType<Connection["getAccountInfo"]>>)[] = [];
  for (let i = 0; i < keys.length; i += 100) infos.push(...(await conn.getMultipleAccountsInfo(keys.slice(i, i + 100))));
  const out: PendingUpgrade[] = [];
  idx.forEach((index, k) => {
    const p = infos[2 * k] ? decodeProposal(Buffer.from(infos[2 * k]!.data)) : null;
    const t = infos[2 * k + 1] ? decodeVaultTx(Buffer.from(infos[2 * k + 1]!.data)) : null;
    if (!p || !t || t.vaultIndex !== vaultIndex) return;
    if (p.status !== ProposalStatus.Approved && p.status !== ProposalStatus.Executing) return;
    if (touchesProgram(t, programData)) {
      out.push({ index, approvedAt: p.status === ProposalStatus.Approved ? p.timestamp : undefined, proposal: keys[2 * k], transaction: keys[2 * k + 1] });
    }
  });
  return out;
}
