// Any Solana address, read on request. A program: who can change its code,
// how many must agree, how long a change waits, what is queued and what they
// changed before. A token: every key that can act on holders (mint, freeze,
// move, pause, run code on transfers) and who stands behind each one, which
// covers liquid staking tokens, bridged assets, stablecoins and tokenized
// stocks with one read.
import { Connection, PublicKey } from "@solana/web3.js"
import { findPendingUpgrades } from "@pexiz/sdk/src/upgrades"
import { vaultPda } from "@pexiz/sdk/src/squads"
import { assess, type Assessment, type Verdict } from "../../src/data/assess"
import { VENUES, type WatchedVenue } from "../../src/data/facts"
import { duration } from "../../src/lib/format"
import { CheckError, keyControl, programControl, waitOf, type Control, type KeyControl, type ProgramControl } from "./control"
import { readHistory } from "./history"
import { TOKEN_2022, TOKEN_PROGRAM, decodeMetaplex, decodeMint, metaplexPda, type Role } from "./token"
import type { WatchEvent } from "./types"

export { CheckError }
export type { Control }

/** History scans stop this many transactions back, so a busy multisig answers in seconds. */
const HISTORY_DEPTH = 300n
/** Time a holder needs to notice and leave; the board's own assumption. */
const EXIT_SECS = 30 * 60

type Public<T> = Omit<T, "m">
const strip = <T extends { m?: unknown; program?: unknown }>(x: T) => {
  const { m: _m, ...rest } = x
  return rest
}

export interface ProgramCheck extends Public<ProgramControl> {
  kind: "program"
  /** The board's own page, when Pexiz already watches this program. */
  watched?: string
  pendingUpgrades?: { index: number; approvedAt?: number; readyAt?: number }[]
  verdict: Verdict
  events: WatchEvent[]
  /** True when history stopped at HISTORY_DEPTH. */
  historyCut?: boolean
}

export interface TokenPower {
  role: Role
  /** What this key can do to a holder, in plain words. */
  does: string
  /** True for the powers that can take value from holders. */
  severe: boolean
  holder: Omit<KeyControl, "m" | "program"> & { program?: Public<ProgramControl> }
  /** Seconds between approval and effect; 0 for one key, null when unknown. */
  waitSecs: number | null
}

export interface TokenCheck {
  kind: "token"
  mint: string
  tokenProgram: "spl-token" | "token-2022"
  name?: string
  symbol?: string
  decimals: number
  supply: string
  powers: TokenPower[]
  hookProgram?: string
  defaultFrozen?: boolean
  paused?: boolean
  verdict: Verdict
}

export type CheckResult = ProgramCheck | TokenCheck

export function parseAddress(input: string): PublicKey {
  try {
    const key = new PublicKey(input.trim())
    if (key.toBase58() !== input.trim()) throw new Error()
    return key
  } catch {
    throw new CheckError("That is not a Solana address.")
  }
}

/** A program or a token mint, told apart by the account's owner. */
export async function checkAddress(conn: Connection, input: string): Promise<CheckResult> {
  const address = parseAddress(input)
  const info = await conn.getAccountInfo(address)
  if (!info) throw new CheckError("No account at that address on mainnet.", 404)
  const owner = info.owner.toBase58()
  if (owner === TOKEN_PROGRAM || owner === TOKEN_2022) return checkToken(conn, address, owner, Buffer.from(info.data))
  if (info.executable) return checkProgram(conn, address)
  throw new CheckError("That address is neither a program nor a token mint.")
}

export async function checkProgram(conn: Connection, program: PublicKey): Promise<ProgramCheck> {
  const id = program.toBase58()
  const watched = VENUES.find((v) => v.program === id)?.id
  const pc = await programControl(conn, program)
  const base = { kind: "program" as const, watched, ...strip(pc) }
  if (pc.control !== "squads-v4" || !pc.m || !pc.multisig || !pc.authority || !pc.programData) {
    return { ...base, verdict: controlVerdict(pc.control), events: [] }
  }

  const multisig = new PublicKey(pc.multisig)
  const authority = new PublicKey(pc.authority)
  const m = pc.m
  const vaultIndex = Array.from({ length: 16 }, (_, i) => i).find((i) => vaultPda(multisig, i)[0].equals(authority)) ?? 0
  const found = await findPendingUpgrades(conn, multisig, m.transactionIndex, vaultIndex, new PublicKey(pc.programData), 12)
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
    multisig: pc.multisig,
    authority: pc.authority,
    snapshot: { threshold: m.threshold, members: m.members.length, timeLockSecs: m.timeLock },
    logo: "",
  }
  const verdict = assess(venue, m.timeLock, pendingUpgrades.map((p) => ({ ...p, index: BigInt(p.index) })), { threshold: m.threshold, authorityMatches: true })

  const to = m.transactionIndex
  const from = to > HISTORY_DEPTH ? to - HISTORY_DEPTH + 1n : 1n
  const events = to > 0n ? await readHistory(conn, { id: venue.id, multisig: pc.multisig, program: id }, from, to) : []
  events.sort((a, b) => b.at - a.at)
  return { ...base, pendingUpgrades, verdict, events, historyCut: from > 1n }
}

const VERDICTS: Record<Exclude<Control, "squads-v4">, Verdict> = {
  immutable: { assessment: "green", why: "Nobody can change its code: the program is immutable." },
  "squads-v3": { assessment: "exposed", why: "An older Squads v3 multisig, which has no delay on changes. Approved changes land at once." },
  governance: { assessment: "unrated", why: "Changes go through a DAO vote; the wait depends on each proposal." },
  "single-key": { assessment: "exposed", why: "One key can replace the code at any moment, with no approvals and no delay." },
  program: { assessment: "unrated", why: "Controlled by another program Pexiz cannot read yet." },
  unknown: { assessment: "unrated", why: "Controlled by a key Pexiz could not trace." },
}
const controlVerdict = (c: Control): Verdict => (c === "squads-v4" ? { assessment: "unrated", why: "" } : VERDICTS[c])

const ROLES: Record<Role, { does: string; severe: boolean }> = {
  "permanent-delegate": { does: "Move or burn any holder's tokens", severe: true },
  mint: { does: "Mint more tokens", severe: true },
  freeze: { does: "Freeze any holder's account", severe: true },
  pause: { does: "Pause every transfer", severe: true },
  "transfer-hook": { does: "Change the code that runs on every transfer", severe: true },
  multiplier: { does: "Change the balance multiplier or rate", severe: false },
  "default-frozen": { does: "Keep new accounts frozen until thawed", severe: false },
  close: { does: "Close the mint", severe: false },
  metadata: { does: "Edit the name, symbol and logo", severe: false },
}
const ORDER = Object.keys(ROLES) as Role[]

export async function checkToken(conn: Connection, mint: PublicKey, owner: string, data: Buffer): Promise<TokenCheck> {
  const info = decodeMint(mint.toBase58(), owner, data)
  if (!info.name) {
    const md = await conn.getAccountInfo(metaplexPda(mint)).catch(() => null)
    const meta = md ? decodeMetaplex(Buffer.from(md.data)) : null
    if (meta) {
      info.name = meta.name
      info.symbol = meta.symbol
      info.authorities.push({ role: "metadata", key: meta.updateAuthority })
    }
  }

  // One trace per key: an issuer often holds several powers with the same one.
  const traced = new Map<string, Promise<KeyControl>>()
  const trace = (k: string) => {
    if (!traced.has(k)) traced.set(k, keyControl(conn, new PublicKey(k), { followPrograms: true }))
    return traced.get(k)!
  }
  const powers: TokenPower[] = []
  for (const a of [...info.authorities].sort((x, y) => ORDER.indexOf(x.role) - ORDER.indexOf(y.role))) {
    const k = await trace(a.key)
    const wait = waitOf(k)
    const { m: _m, program, ...holder } = k
    powers.push({
      role: a.role,
      ...ROLES[a.role],
      holder: { ...holder, program: program ? strip(program) : undefined },
      waitSecs: wait === undefined ? null : wait === Infinity ? null : wait,
    })
  }
  if (info.defaultFrozen) powers.push({ role: "default-frozen", ...ROLES["default-frozen"], holder: { key: info.mint, control: "unknown" }, waitSecs: null })

  return {
    kind: "token",
    mint: info.mint,
    tokenProgram: info.tokenProgram,
    name: info.name,
    symbol: info.symbol,
    decimals: info.decimals,
    supply: info.supply.toString(),
    powers,
    hookProgram: info.hookProgram,
    defaultFrozen: info.defaultFrozen,
    paused: info.paused,
    verdict: tokenVerdict(powers, info.paused),
  }
}

/**
 * The token's reading, from the powers that can take value from holders: the
 * fastest one decides, in the same bands as the board.
 */
export function tokenVerdict(powers: TokenPower[], paused?: boolean): Verdict {
  if (paused) return { assessment: "red", why: "Transfers are paused right now." }
  const severe = powers.filter((p) => p.severe)
  if (!severe.length) return { assessment: "green", why: "Nobody can mint more, freeze, move or pause this token." }
  // A power held by a program that can never change is as fixed as none.
  const live = severe.filter((p) => !(p.holder.control === "program" && p.holder.program?.control === "immutable"))
  if (!live.length) return { assessment: "green", why: "Its powers sit with a program nobody can change." }
  const now = live.filter((p) => p.waitSecs === 0)
  if (now.length) {
    const said = now.slice(0, 3).map((p) => `${p.does.toLowerCase()} (${holderLabel(p.holder)})`)
    const more = now.length > 3 ? `, and ${now.length - 3} more` : ""
    return { assessment: "exposed", why: `With no delay, these can happen at any time: ${said.join("; ")}${more}.`, exitWindowSecs: -EXIT_SECS }
  }
  if (live.some((p) => p.waitSecs === null)) {
    return { assessment: "unrated", why: "Some of its powers sit with a DAO or a program Pexiz cannot fully read." }
  }
  const fastest = Math.min(...live.map((p) => p.waitSecs!))
  const win = fastest - EXIT_SECS
  if (win < 12 * 3600) return { assessment: "amber" as Assessment, why: `The fastest power over holders waits ${duration(fastest)}, under 12 hours to react.`, exitWindowSecs: win }
  return { assessment: "green", why: `Every power over holders waits at least ${duration(fastest)}.`, exitWindowSecs: win }
}

/** Who holds a power, in a few words. */
export function holderLabel(h: TokenPower["holder"]): string {
  switch (h.control) {
    case "single-key":
      return "one key"
    case "squads-v4":
      return `multisig ${h.threshold} of ${h.members?.length}${h.timeLockSecs ? "" : ", no delay"}`
    case "squads-v3":
      return "old multisig, no delay"
    case "governance":
      return "DAO vote"
    case "program": {
      const p = h.program
      if (!p) return "a program"
      if (p.control === "squads-v4") return `its program, upgradable by multisig ${p.threshold} of ${p.members?.length}${p.timeLockSecs ? "" : " with no delay"}`
      if (p.control === "single-key") return "its program, upgradable by one key"
      if (p.control === "squads-v3") return "its program, upgradable by an old multisig"
      if (p.control === "immutable") return "a program nobody can change"
      return "its program"
    }
    default:
      return "an untraced key"
  }
}
