// Who stands behind a key. A key that can upgrade a program, mint a token or
// freeze an account is one of: a single wallet, a Squads multisig vault, a
// DAO, or a PDA of some program, in which case whoever can upgrade that
// program is the real control. Read on demand, one level deep.
import { Connection, PublicKey, type AccountInfo } from "@solana/web3.js"
import { VENUES } from "../../src/data/facts"
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

type Tx = NonNullable<Awaited<ReturnType<Connection["getTransaction"]>>>

/**
 * One transaction, or null when it cannot be read: mainnet now carries
 * transaction versions newer than the client decodes, and one such
 * transaction must not stop the trace.
 */
async function readTx(conn: Connection, signature: string): Promise<Tx | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await conn.getTransaction(signature, { maxSupportedTransactionVersion: 0 })
    } catch (e) {
      if (/version/i.test((e as Error).message)) return null
      await new Promise((r) => setTimeout(r, 1_000))
    }
  }
  return null
}

function accountKeys(tx: Tx): PublicKey[] {
  return [
    ...tx.transaction.message.staticAccountKeys,
    ...(tx.meta?.loadedAddresses?.writable ?? []),
    ...(tx.meta?.loadedAddresses?.readonly ?? []),
  ]
}

export interface Trace {
  /** The Squads multisig whose vault the key is. */
  multisig: { address: PublicKey; version: 3 | 4 } | null
  /** The program that uses the key, when it is that program's PDA. */
  program: PublicKey | null
}

/**
 * Who a PDA belongs to, from one pass over its recent transactions, a few at
 * a time. A Squads vault always appears beside its multisig, and is proven
 * by deriving it back. Otherwise the program most often sent the key in an
 * instruction, top-level or inner, is taken as its owner; only programs that
 * are not infrastructure count.
 */
export async function traceKey(conn: Connection, key: PublicKey, maxTx = 20): Promise<Trace> {
  const sigs = (await conn.getSignaturesForAddress(key, { limit: 40 })).filter((x) => !x.err).slice(0, maxTx)
  const votes = new Map<string, number>()
  const deeper = new Set<string>()
  const seen = new Set<string>([key.toBase58()])
  let multisig: Trace["multisig"] = null

  // Three transactions at a time, stopping as soon as the multisig is proven:
  // the public RPC refuses bursts, and most vaults show it in the first few.
  for (let i = 0; i < sigs.length && !multisig; i += 3) {
    const txs = (await Promise.all(sigs.slice(i, i + 3).map((s) => readTx(conn, s.signature)))).filter((t): t is Tx => !!t)
    const fresh: PublicKey[] = []
    for (const tx of txs) {
      const keys = accountKeys(tx)
      for (const k of keys) if (!seen.has(k.toBase58())) { seen.add(k.toBase58()); fresh.push(k) }
      const at = keys.findIndex((k) => k.equals(key))
      if (at < 0) continue
      // The program an instruction is sent to, for every instruction that
      // passes the key itself, top-level or inner: a router that calls the
      // owner through CPI passes the key on, but never as its own.
      // The owner is in every such transaction, a router only in some, so
      // each program counts once per transaction; a tie goes to the program
      // called deeper, through CPI.
      const direct = [
        ...tx.transaction.message.compiledInstructions.map((ix) => ({ program: ix.programIdIndex, accounts: ix.accountKeyIndexes, inner: false })),
        ...(tx.meta?.innerInstructions ?? []).flatMap((g) => g.instructions.map((ix) => ({ program: ix.programIdIndex, accounts: ix.accounts, inner: true }))),
      ]
      const here = new Set<string>()
      for (const ix of direct) {
        const program = keys[ix.program]?.toBase58()
        if (!ix.accounts.includes(at) || !program || INFRA.has(program)) continue
        here.add(program)
        if (ix.inner) deeper.add(program)
      }
      for (const program of here) votes.set(program, (votes.get(program) ?? 0) + 1)
    }
    for (let c = 0; c < fresh.length && !multisig; c += 100) {
      const chunk = fresh.slice(c, c + 100)
      const infos = await conn.getMultipleAccountsInfo(chunk, { dataSlice: { offset: 0, length: 8 } })
      chunk.forEach((k, j) => {
        const info = infos[j]
        if (!info || multisig) return
        if (info.owner.equals(SQUADS_V4_ID) && Buffer.from(info.data).equals(MULTISIG_DISCRIMINATOR)) {
          for (let v = 0; v < 16; v++) if (vaultPda(k, v)[0].equals(key)) multisig = { address: k, version: 4 }
        } else if (info.owner.toBase58() === SQUADS_V3 && votes.has(SQUADS_V3)) multisig = { address: k, version: 3 }
      })
    }
  }
  const best = [...votes]
    .filter(([p]) => p !== SQUADS_V3)
    .sort((a, b) => b[1] - a[1] || Number(deeper.has(b[0])) - Number(deeper.has(a[0])))[0]?.[0]
  return { multisig, program: best ? new PublicKey(best) : null }
}

async function squadsDetails(conn: Connection, multisig: PublicKey) {
  const info = await conn.getAccountInfo(multisig)
  if (!info) throw new CheckError("The multisig could not be read.", 502)
  const m = decodeMultisig(Buffer.from(info.data))
  return { multisig: multisig.toBase58(), threshold: m.threshold, members: m.members.map((x) => x.key.toBase58()), timeLockSecs: m.timeLock, txIndex: Number(m.transactionIndex), m }
}

// Traces are slow on a public RPC and keys repeat across checks (one stake
// pool program behind many staked-SOL tokens), so each is kept for a while.
const TRACE_TTL_MS = 30 * 60_000
const cache = new Map<string, { at: number; value: Promise<unknown> }>()

function cached<T>(id: string, make: () => Promise<T>): Promise<T> {
  const hit = cache.get(id)
  if (hit && Date.now() - hit.at < TRACE_TTL_MS) return hit.value as Promise<T>
  const value = make()
  cache.set(id, { at: Date.now(), value })
  // A failed read is not kept: the next check tries again.
  value.catch(() => cache.delete(id))
  if (cache.size > 2_000) cache.delete(cache.keys().next().value!)
  return value
}

/** Who can change a program's code. */
export function programControl(conn: Connection, program: PublicKey): Promise<ProgramControl> {
  return cached(`program:${program.toBase58()}`, () => readProgramControl(conn, program))
}

async function readProgramControl(conn: Connection, program: PublicKey): Promise<ProgramControl> {
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
export function keyControl(conn: Connection, key: PublicKey, opts: { followPrograms?: boolean } = {}): Promise<KeyControl> {
  return cached(`key:${key.toBase58()}:${opts.followPrograms ? 1 : 0}`, () => readKeyControl(conn, key, opts))
}

const SYSTEM = "11111111111111111111111111111111"

async function readKeyControl(conn: Connection, key: PublicKey, opts: { followPrograms?: boolean }): Promise<KeyControl> {
  const id = key.toBase58()
  // A key on the board needs no trace: its multisig is already on record.
  const known = VENUES.find((v) => v.authority === id && v.multisig)
  if (known) return { key: id, control: "squads-v4", ...(await squadsDetails(conn, new PublicKey(known.multisig!))) }

  const info: AccountInfo<Buffer> | null = await conn.getAccountInfo(key, { dataSlice: { offset: 0, length: 8 } })
  const owner = info?.owner.toBase58()
  if (owner && GOVERNANCE.has(owner)) return { key: id, control: "governance" }
  if (PublicKey.isOnCurve(key.toBytes())) return { key: id, control: "single-key" }

  // A PDA that holds data belongs to the program that owns it; only an empty
  // one, like a Squads vault, has to be traced through its transactions.
  const holdsData = owner && owner !== SYSTEM && !SQUADS_V4_ID.equals(new PublicKey(owner)) && owner !== SQUADS_V3
  let prog: PublicKey | null = holdsData ? new PublicKey(owner) : null
  if (!prog) {
    const t = await traceKey(conn, key)
    if (t.multisig?.version === 4) {
      const d = await squadsDetails(conn, t.multisig.address)
      return { key: id, control: "squads-v4", ...d }
    }
    if (t.multisig?.version === 3) return { key: id, control: "squads-v3", multisig: t.multisig.address.toBase58() }
    prog = t.program
  }
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
