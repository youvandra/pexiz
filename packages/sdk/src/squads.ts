// Squads v4 multisig decoding and encoding. Layout checked against
// squads-multisig-program 2.0.0 (state/multisig.rs, state/seeds.rs).
import { PublicKey } from "@solana/web3.js";

export const SQUADS_V4_ID = new PublicKey("SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf");
export const BPF_LOADER_UPGRADEABLE_ID = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
/** sha256("account:Multisig")[..8] */
export const MULTISIG_DISCRIMINATOR = Buffer.from([224, 116, 121, 186, 68, 161, 79, 236]);

export const Permission = { Initiate: 1, Vote: 2, Execute: 4, All: 7 } as const;

export interface Member {
  key: PublicKey;
  permissions: number;
}

export interface Multisig {
  createKey: PublicKey;
  configAuthority: PublicKey;
  threshold: number;
  timeLock: number;
  transactionIndex: bigint;
  staleTransactionIndex: bigint;
  rentCollector: PublicKey | null;
  bump: number;
  members: Member[];
}

export function decodeMultisig(data: Buffer): Multisig {
  if (!data.subarray(0, 8).equals(MULTISIG_DISCRIMINATOR)) throw new Error("not a Squads v4 multisig");
  let o = 8;
  const createKey = new PublicKey(data.subarray(o, o + 32)); o += 32;
  const configAuthority = new PublicKey(data.subarray(o, o + 32)); o += 32;
  const threshold = data.readUInt16LE(o); o += 2;
  const timeLock = data.readUInt32LE(o); o += 4;
  const transactionIndex = data.readBigUInt64LE(o); o += 8;
  const staleTransactionIndex = data.readBigUInt64LE(o); o += 8;
  let rentCollector: PublicKey | null = null;
  if (data[o] === 1) { rentCollector = new PublicKey(data.subarray(o + 1, o + 33)); o += 33; } else o += 1;
  const bump = data[o]; o += 1;
  const n = data.readUInt32LE(o); o += 4;
  const members: Member[] = [];
  for (let i = 0; i < n; i++, o += 33) {
    members.push({ key: new PublicKey(data.subarray(o, o + 32)), permissions: data[o + 32] });
  }
  return { createKey, configAuthority, threshold, timeLock, transactionIndex, staleTransactionIndex, rentCollector, bump, members };
}

/** Borsh-encodes a multisig the way Squads stores it, padded like `Multisig::size`. */
export function encodeMultisig(m: Multisig): Buffer {
  const size = 8 + 32 + 32 + 2 + 4 + 8 + 8 + 1 + 32 + 1 + 4 + m.members.length * 33;
  const b = Buffer.alloc(size);
  let o = 0;
  MULTISIG_DISCRIMINATOR.copy(b, o); o += 8;
  m.createKey.toBuffer().copy(b, o); o += 32;
  m.configAuthority.toBuffer().copy(b, o); o += 32;
  b.writeUInt16LE(m.threshold, o); o += 2;
  b.writeUInt32LE(m.timeLock, o); o += 4;
  b.writeBigUInt64LE(m.transactionIndex, o); o += 8;
  b.writeBigUInt64LE(m.staleTransactionIndex, o); o += 8;
  if (m.rentCollector) { b[o] = 1; m.rentCollector.toBuffer().copy(b, o + 1); o += 33; } else { b[o] = 0; o += 1; }
  b[o] = m.bump; o += 1;
  b.writeUInt32LE(m.members.length, o); o += 4;
  for (const mem of m.members) { mem.key.toBuffer().copy(b, o); b[o + 32] = mem.permissions; o += 33; }
  return b;
}

export function multisigPda(createKey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("multisig"), Buffer.from("multisig"), createKey.toBuffer()], SQUADS_V4_ID);
}

export function vaultPda(multisig: PublicKey, index = 0): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("multisig"), multisig.toBuffer(), Buffer.from("vault"), Buffer.from([index])], SQUADS_V4_ID);
}

export function programDataAddress(program: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([program.toBuffer()], BPF_LOADER_UPGRADEABLE_ID)[0];
}

/** Upgrade authority from a program-data account, or null when immutable. */
export function decodeUpgradeAuthority(data: Buffer): PublicKey | null {
  if (data.length < 45 || data.readUInt32LE(0) !== 3 || data[12] !== 1) return null;
  return new PublicKey(data.subarray(13, 45));
}

export function encodeProgramData(slot: bigint, authority: PublicKey | null): Buffer {
  const b = Buffer.alloc(45);
  b.writeUInt32LE(3, 0);
  b.writeBigUInt64LE(slot, 4);
  if (authority) { b[12] = 1; authority.toBuffer().copy(b, 13); }
  return b;
}
