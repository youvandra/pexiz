// Who stands behind a key. A key that can upgrade a program, mint a token or
// freeze an account is one of: a single wallet, a Squads multisig vault, a
// DAO, or a PDA of some program, in which case whoever can upgrade that
// program is the real control. Read on demand, one level deep.
import { Connection, PublicKey, type AccountInfo } from "@solana/web3.js"
import { MULTISIG_DISCRIMINATOR, SQUADS_V4_ID, decodeMultisig, decodeUpgradeAuthority, vaultPda, type Multisig } from "@pexiz/sdk/src/squads"

export const LOADER_UPGRADEABLE = "BPFLoaderUpgradeab1e11111111111111111111111"
const IMMUTABLE_LOADERS = new Set(["BPFLoader1111111111111111111111111111111111", "BPFLoader2111111111111111111111111111111111"])
export const SQUADS_V3 = "SMPLecH534NA9acpos4G6x7uf3LWbCAwZQE9e8ZekMu"
/** SPL Governance and the forks most DAOs on Solana run. */
const GOVERNANCE = new Set([
  "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw",
  "GovHgfDPyQ1GwazJTDY2avSVY8GGcpmCapmmCsymRaGe",
  "GqTPL6qRf5aUuqscLh8Rg2HTxPUXfhhAXDptTLhp1t2J",
])
/** Programs every transaction touches; never the one in charge of a PDA. */
const INFRA = new Set([
  "11111111111111111111111111111111",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  "ComputeBudget111111111111111111111111111111",
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
  "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo",
  "Sysvar1nstructions1111111111111111111111111",
  "AddressLookupTab1e1111111111111111111111111",
  SQUADS_V4_ID.toBase58(),
])

export type Control = "immutable" | "squads-v4" | "squads-v3" | "governance" | "single-key" | "program" | "unknown"

/** A program and who can change its code. */
export interface ProgramControl {
  program: string
  control: Control
  authority: string | null
  programData?: string
  /** Unix seconds of the last deploy, when the RPC still has that block. */
  deployedAt?: number
  multisig?: string
  threshold?: number
  members?: string[]
  timeLockSecs?: number
  txIndex?: number
  /** The decoded multisig, for callers that read further. */
  m?: Multisig
}

/** A key and who stands behind it. */
export interface KeyControl {
  key: string
  control: Control
  multisig?: string
  threshold?: number
  members?: string[]
  timeLockSecs?: number
  txIndex?: number
  m?: Multisig
  /** When the key is a PDA: the program it belongs to and that program's control. */
  program?: ProgramControl
}

export class CheckError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

/**
 * The Squads multisig whose vault is `authority`, found in the vault's recent
 * transactions, where it always appears beside it. Null when none names one.
 */
export async function findMultisig(conn: Connection, authority: PublicKey, maxTx = 12): Promise<{ multisig: PublicKey; version: 3 | 4 } | null> {
  const sigs = await conn.getSignaturesForAddress(authority, { limit: 40 })
  const seen = new Set<string>([authority.toBase58()])
  for (const s of sigs.filter((x) => !x.err).slice(0, maxTx)) {
    const tx = await readTx(conn, s.signature)
    if (!tx) continue
    const keys = accountKeys(tx).filter((k) => !seen.has(k.toBase58()))
    if (!keys.length) continue
    keys.forEach((k) => seen.add(k.toBase58()))
    const infos = await conn.getMultipleAccountsInfo(keys, { dataSlice: { offset: 0, length: 8 } })
    for (let i = 0; i < keys.length; i++) {
      const info = infos[i]
      if (!info) continue
      if (info.owner.equals(SQUADS_V4_ID) && Buffer.from(info.data).equals(MULTISIG_DISCRIMINATOR)) {
        for (let v = 0; v < 16; v++) if (vaultPda(keys[i], v)[0].equals(authority)) return { multisig: keys[i], version: 4 }
      }
      if (info.owner.toBase58() === SQUADS_V3) return { multisig: keys[i], version: 3 }
    }
  }
  return null
}

type Tx = NonNullable<Awaited<ReturnType<Connection["getTransaction"]>>>

/**
 * One transaction, or null when it cannot be read: mainnet now carries
 * transaction versions newer than the client decodes, and one such
 * transaction must not stop the trace.
 */
async function readTx(conn: Connection, signature: string): Promise<Tx | null> {
  try {
    return await conn.getTransaction(signature, { maxSupportedTransactionVersion: 0 })
  } catch {
    return null
  }
}

function accountKeys(tx: Tx): PublicKey[] {
  return [
    ...tx.transaction.message.staticAccountKeys,
    ...(tx.meta?.loadedAddresses?.writable ?? []),
    ...(tx.meta?.loadedAddresses?.readonly ?? []),
  ]
}

/**
 * The program a PDA belongs to, read from its recent transactions: the
 * program whose instruction, directly or through its inner calls, passes the
 * PDA. Only programs that are not infrastructure count.
 */
export async function findOwnerProgram(conn: Connection, pda: PublicKey, maxTx = 6): Promise<PublicKey | null> {
  const sigs = await conn.getSignaturesForAddress(pda, { limit: 20 })
  const votes = new Map<string, number>()
  for (const s of sigs.filter((x) => !x.err).slice(0, maxTx)) {
    const tx = await readTx(conn, s.signature)
    if (!tx) continue
    const keys = accountKeys(tx)
    const at = keys.findIndex((k) => k.equals(pda))
    if (at < 0) continue
    const top = tx.transaction.message.compiledInstructions
    const inner = new Map((tx.meta?.innerInstructions ?? []).map((g) => [g.index, g.instructions]))
    top.forEach((ix, i) => {
      const uses = ix.accountKeyIndexes.includes(at) || (inner.get(i) ?? []).some((x) => x.accounts.includes(at))
      const program = keys[ix.programIdIndex]?.toBase58()
      if (uses && program && !INFRA.has(program)) votes.set(program, (votes.get(program) ?? 0) + 1)
    })
  }
  const best = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0]
  return best ? new PublicKey(best) : null
}

async function squadsDetails(conn: Connection, multisig: PublicKey) {
  const info = await conn.getAccountInfo(multisig)
  if (!info) throw new CheckError("The multisig could not be read.", 502)
  const m = decodeMultisig(Buffer.from(info.data))
  return { multisig: multisig.toBase58(), threshold: m.threshold, members: m.members.map((x) => x.key.toBase58()), timeLockSecs: m.timeLock, txIndex: Number(m.transactionIndex), m }
}

/** Who can change a program's code. */
export async function programControl(conn: Connection, program: PublicKey): Promise<ProgramControl> {
  const id = program.toBase58()
  const acc = await conn.getAccountInfo(program, { dataSlice: { offset: 0, length: 36 } })
  if (!acc) throw new CheckError("No account at that address on mainnet.", 404)
  if (!acc.executable) throw new CheckError("That address is an account, not a program.")
  const owner = acc.owner.toBase58()
  if (IMMUTABLE_LOADERS.has(owner)) return { program: id, control: "immutable", authority: null }
  if (owner !== LOADER_UPGRADEABLE) throw new CheckError("Pexiz reads programs deployed with the upgradeable loader only.")

  const programData = new PublicKey(Buffer.from(acc.data).subarray(4, 36))
  const pd = await conn.getAccountInfo(programData, { dataSlice: { offset: 0, length: 45 } })
  if (!pd) throw new CheckError("The program's data account is missing.", 404)
  const header = Buffer.from(pd.data)
  const deployedAt = (await conn.getBlockTime(Number(header.readBigUInt64LE(4))).catch(() => null)) ?? undefined
  const authority = decodeUpgradeAuthority(header)
  const base = { program: id, programData: programData.toBase58(), deployedAt }
  if (!authority) return { ...base, control: "immutable", authority: null }

  const k = await keyControl(conn, authority, { followPrograms: false })
  return { ...base, authority: authority.toBase58(), control: k.control, multisig: k.multisig, threshold: k.threshold, members: k.members, timeLockSecs: k.timeLockSecs, txIndex: k.txIndex, m: k.m }
}

/**
 * Who stands behind a key. With `followPrograms`, a PDA is traced to its
 * program and that program's own upgrade control; without, it stops there.
 */
export async function keyControl(conn: Connection, key: PublicKey, opts: { followPrograms?: boolean } = {}): Promise<KeyControl> {
  const id = key.toBase58()
  const info: AccountInfo<Buffer> | null = await conn.getAccountInfo(key, { dataSlice: { offset: 0, length: 8 } })
  const owner = info?.owner.toBase58()
  if (owner && GOVERNANCE.has(owner)) return { key: id, control: "governance" }
  if (PublicKey.isOnCurve(key.toBytes())) return { key: id, control: "single-key" }

  const found = await findMultisig(conn, key)
  if (found?.version === 4) {
    const d = await squadsDetails(conn, found.multisig)
    return { key: id, control: "squads-v4", ...d }
  }
  if (found?.version === 3) return { key: id, control: "squads-v3", multisig: found.multisig.toBase58() }

  // A PDA that holds data is owned by its program; one that holds none shows
  // its program in the transactions that use it.
  const prog = owner && owner !== "11111111111111111111111111111111" ? new PublicKey(owner) : await findOwnerProgram(conn, key)
  if (!prog) return { key: id, control: "unknown" }
  if (!opts.followPrograms) return { key: id, control: "program", program: { program: prog.toBase58(), control: "unknown", authority: null } }
  const program = await programControl(conn, prog).catch(() => null)
  return { key: id, control: "program", program: program ?? { program: prog.toBase58(), control: "unknown", authority: null } }
}

/**
 * Seconds between a change being approved and it landing, through this key.
 * Zero for one key, undefined when it cannot be told (a DAO, an unknown
 * program), Infinity when nobody can change it.
 */
export function waitOf(k: { control: Control; timeLockSecs?: number; program?: ProgramControl | string }): number | undefined {
  switch (k.control) {
    case "immutable":
      return Infinity
    case "single-key":
    case "squads-v3":
      return 0
    case "squads-v4":
      return k.timeLockSecs
    case "program":
      // Only a key traced to its program says how fast that program can change.
      return typeof k.program === "object" ? waitOf(k.program) : undefined
    default:
      return undefined
  }
}
