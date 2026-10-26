// System durable-nonce accounts: 80 bytes, owner System.
// version u32 | state u32 (1 = initialized) | authority | durable nonce | fee calculator
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";

export const NONCE_ACCOUNT_SIZE = 80;

export interface NonceAccount {
  version: number;
  state: number;
  authority: PublicKey;
  nonce: PublicKey;
  lamportsPerSignature: bigint;
}

export function decodeNonce(data: Buffer): NonceAccount {
  if (data.length !== NONCE_ACCOUNT_SIZE) throw new Error("not a nonce account");
  return {
    version: data.readUInt32LE(0),
    state: data.readUInt32LE(4),
    authority: new PublicKey(data.subarray(8, 40)),
    nonce: new PublicKey(data.subarray(40, 72)),
    lamportsPerSignature: data.readBigUInt64LE(72),
  };
}

export function encodeNonce(authority: PublicKey, state = 1, nonce = PublicKey.default): Buffer {
  const b = Buffer.alloc(NONCE_ACCOUNT_SIZE);
  b.writeUInt32LE(1, 0);
  b.writeUInt32LE(state, 4);
  authority.toBuffer().copy(b, 8);
  nonce.toBuffer().copy(b, 40);
  b.writeBigUInt64LE(5000n, 72);
  return b;
}

export interface PresigningAccount {
  address: PublicKey;
  member: PublicKey;
}

/**
 * Finds initialized System nonce accounts whose authority is one of `members`.
 * One getProgramAccounts call per member; public RPC rate-limits these, so
 * callers should pass a paid RPC through PEXIZ_RPC_URL.
 */
export async function findPresigningAccounts(
  conn: Connection,
  members: PublicKey[],
  opts: { delayMs?: number } = {},
): Promise<PresigningAccount[]> {
  const out: PresigningAccount[] = [];
  for (const member of members) {
    const accs = await conn.getProgramAccounts(SystemProgram.programId, {
      filters: [{ dataSize: NONCE_ACCOUNT_SIZE }, { memcmp: { offset: 8, bytes: member.toBase58() } }],
    });
    for (const a of accs) {
      if (decodeNonce(a.account.data as Buffer).state === 1) out.push({ address: a.pubkey, member });
    }
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
  }
  return out;
}
