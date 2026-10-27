// Any Solana program, read on request: who can change its code, and when
// that is a Squads multisig, how many must approve, how long a change waits,
// what is queued and what it has done before.
//
// The upgrade authority alone does not name the multisig behind it: a Squads
// vault is a PDA with no data. The multisig is found in the vault's own
// transactions, where it always appears beside it, and is then proven by
// deriving the vault from it.
import { Connection, PublicKey, type AccountInfo } from "@solana/web3.js"
import { MULTISIG_DISCRIMINATOR, SQUADS_V4_ID, decodeMultisig, decodeUpgradeAuthority, vaultPda } from "@pexiz/sdk/src/squads"
import { findPendingUpgrades } from "@pexiz/sdk/src/upgrades"
import { assess, type Verdict } from "../../src/data/assess"
import { VENUES, type WatchedVenue } from "../../src/data/facts"
import { readHistory } from "./history"
import type { WatchEvent } from "./types"

const LOADER_UPGRADEABLE = "BPFLoaderUpgradeab1e11111111111111111111111"
const IMMUTABLE_LOADERS = new Set(["BPFLoader1111111111111111111111111111111111", "BPFLoader2111111111111111111111111111111111"])
const SQUADS_V3 = "SMPLecH534NA9acpos4G6x7uf3LWbCAwZQE9e8ZekMu"
/** SPL Governance and the forks most DAOs on Solana run. */
const GOVERNANCE = new Set([
  "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw",
  "GovHgfDPyQ1GwazJTDY2avSVY8GGcpmCapmmCsymRaGe",
  "GqTPL6qRf5aUuqscLh8Rg2HTxPUXfhhAXDptTLhp1t2J",
])
/** History scans stop this many transactions back, so a busy multisig answers in seconds. */
const HISTORY_DEPTH = 300n

export type Control =
  | "immutable"
  | "squads-v4"
  | "squads-v3"
  | "governance"
  | "single-key"
  | "program"

export interface CheckResult {
  program: string
  /** The board's own page, when Pexiz already watches this program. */
  watched?: string
  control: Control
  authority: string | null
  /** Unix seconds of the last deploy, when the RPC still has that block. */
  deployedAt?: number
  multisig?: string
  threshold?: number
  members?: string[]
  timeLockSecs?: number
  txIndex?: number
  pendingUpgrades?: { index: number; approvedAt?: number; readyAt?: number }[]
  verdict: Verdict
  events: WatchEvent[]
  /** True when history stopped at HISTORY_DEPTH. */
  historyCut?: boolean
}

export class CheckError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

export function parseProgram(input: string): PublicKey {
  try {
    const key = new PublicKey(input.trim())
    if (key.toBase58() !== input.trim()) throw new Error()
    return key
  } catch {
    throw new CheckError("That is not a Solana address.")
  }
}

/**
 * The Squads multisig whose vault is `authority`, found in the vault's recent
 * transactions. Null when none of them names one.
 */
export async function findMultisig(conn: Connection, authority: PublicKey, maxTx = 12): Promise<{ multisig: PublicKey; version: 3 | 4 } | null> {
  const sigs = await conn.getSignaturesForAddress(authority, { limit: 40 })
  const seen = new Set<string>([authority.toBase58()])
  for (const s of sigs.filter((x) => !x.err).slice(0, maxTx)) {
    const tx = await conn.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 })
    if (!tx) continue
    const msg = tx.transaction.message
    const keys = [
      ...msg.staticAccountKeys,
      ...(tx.meta?.loadedAddresses?.writable ?? []),
      ...(tx.meta?.loadedAddresses?.readonly ?? []),
    ].filter((k) => !seen.has(k.toBase58()))
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

async function classify(conn: Connection, authority: PublicKey, info: AccountInfo<Buffer> | null): Promise<{ control: Control; multisig?: PublicKey }> {
  if (info && GOVERNANCE.has(info.owner.toBase58())) return { control: "governance" }
  if (PublicKey.isOnCurve(authority.toBytes())) return { control: "single-key" }
  const found = await findMultisig(conn, authority)
  if (found?.version === 4) return { control: "squads-v4", multisig: found.multisig }
  if (found?.version === 3) return { control: "squads-v3", multisig: found.multisig }
  return { control: "program" }
}

const VERDICTS: Record<Exclude<Control, "squads-v4">, Verdict> = {
  immutable: { assessment: "green", why: "Nobody can change its code: the program is immutable." },
  "squads-v3": { assessment: "exposed", why: "An older Squads v3 multisig, which has no delay on changes. Approved changes land at once." },
  governance: { assessment: "unrated", why: "Changes go through a DAO vote; the wait depends on each proposal." },
  "single-key": { assessment: "exposed", why: "One key can replace the code at any moment, with no approvals and no delay." },
  program: { assessment: "unrated", why: "Controlled by another program Pexiz cannot read yet." },
}

export async function checkProgram(conn: Connection, input: string): Promise<CheckResult> {
  const program = parseProgram(input)
  const id = program.toBase58()
  const watched = VENUES.find((v) => v.program === id)?.id
  const acc = await conn.getAccountInfo(program, { dataSlice: { offset: 0, length: 36 } })
  if (!acc) throw new CheckError("No account at that address on mainnet.", 404)
  if (!acc.executable) throw new CheckError("That address is an account, not a program.")
  const owner = acc.owner.toBase58()
  if (IMMUTABLE_LOADERS.has(owner)) return { program: id, watched, control: "immutable", authority: null, verdict: VERDICTS.immutable, events: [] }
  if (owner !== LOADER_UPGRADEABLE) throw new CheckError("Pexiz reads programs deployed with the upgradeable loader only.")

  const programData = new PublicKey(Buffer.from(acc.data).subarray(4, 36))
  const pd = await conn.getAccountInfo(programData, { dataSlice: { offset: 0, length: 45 } })
  if (!pd) throw new CheckError("The program's data account is missing.", 404)
  const header = Buffer.from(pd.data)
  const slot = Number(header.readBigUInt64LE(4))
  const deployedAt = (await conn.getBlockTime(slot).catch(() => null)) ?? undefined
  const authority = decodeUpgradeAuthority(header)
  if (!authority) return { program: id, watched, control: "immutable", authority: null, deployedAt, verdict: VERDICTS.immutable, events: [] }

  const authInfo = await conn.getAccountInfo(authority, { dataSlice: { offset: 0, length: 0 } })
  const { control, multisig } = await classify(conn, authority, authInfo)
  const base = { program: id, watched, control, authority: authority.toBase58(), deployedAt, multisig: multisig?.toBase58() }
  if (control !== "squads-v4" || !multisig) return { ...base, verdict: VERDICTS[control as Exclude<Control, "squads-v4">], events: [] }

  const msInfo = await conn.getAccountInfo(multisig)
  if (!msInfo) throw new CheckError("The multisig could not be read.", 502)
  const m = decodeMultisig(Buffer.from(msInfo.data))
  const vaultIndex = Array.from({ length: 16 }, (_, i) => i).find((i) => vaultPda(multisig, i)[0].equals(authority)) ?? 0
  const found = await findPendingUpgrades(conn, multisig, m.transactionIndex, vaultIndex, programData, 12)
  const pendingUpgrades = found.map((p) => ({ index: Number(p.index), approvedAt: p.approvedAt, readyAt: p.approvedAt !== undefined ? p.approvedAt + m.timeLock : undefined }))

  // The board's own rules, with today's read as the baseline: no "it got
  // worse" without a before, only how it is set up and what is queued.
  const venue: WatchedVenue = {
    id: watched ?? id,
    name: id,
    kind: "",
    category: "perps",
    program: id,
    admin: "squads-v4",
    multisig: multisig.toBase58(),
    authority: authority.toBase58(),
    snapshot: { threshold: m.threshold, members: m.members.length, timeLockSecs: m.timeLock },
    logo: "",
  }
  const verdict = assess(venue, m.timeLock, pendingUpgrades.map((p) => ({ ...p, index: BigInt(p.index) })), { threshold: m.threshold, authorityMatches: true })

  const to = m.transactionIndex
  const from = to > HISTORY_DEPTH ? to - HISTORY_DEPTH + 1n : 1n
  const events = to > 0n ? await readHistory(conn, { id: venue.id, multisig: venue.multisig!, program: id }, from, to) : []
  events.sort((a, b) => b.at - a.at)

  return {
    ...base,
    threshold: m.threshold,
    members: m.members.map((x) => x.key.toBase58()),
    timeLockSecs: m.timeLock,
    txIndex: Number(m.transactionIndex),
    pendingUpgrades,
    verdict,
    events,
    historyCut: from > 1n,
  }
}
