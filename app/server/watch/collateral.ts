// Collateral tokens on the watch list: read like a check, kept like a venue.
// A lender cares when a token it holds as collateral gains a key that can
// mint, freeze or move it, or when the wait behind such a key gets shorter.
import { Connection, PublicKey } from "@solana/web3.js"
import type { WatchedToken } from "../../src/data/facts"
import { flagLabel } from "./labels"
import { checkToken } from "./check"
import type { TokenState, WatchEvent } from "./types"
import { duration } from "../../src/lib/format"

export async function readToken(conn: Connection, t: WatchedToken): Promise<TokenState> {
  const mint = new PublicKey(t.mint)
  const info = await conn.getAccountInfo(mint)
  if (!info) throw new Error(`${t.id}: mint not found`)
  const r = await checkToken(conn, mint, info.owner.toBase58(), Buffer.from(info.data))
  return {
    id: t.id,
    readAt: Math.floor(Date.now() / 1000),
    ok: true,
    assessment: r.verdict.assessment,
    why: r.verdict.why,
    paused: r.paused,
    powers: r.powers.map((p) => ({ role: p.role, does: p.does, severe: p.severe, key: p.holder.key, holder: p.holder.label ?? p.holder.control, waitSecs: p.waitSecs })),
  }
}

const RANK = { green: 0, unrated: 0, amber: 1, exposed: 2, red: 3 } as const
const wait = (s: number | null) => (s === null ? "unknown" : s === 0 ? "no delay" : duration(s))

/** What changed between two reads of one token, as events under `token:<id>`. */
export function tokenDiff(prev: TokenState, next: TokenState): WatchEvent[] {
  const venue = `token:${next.id}`
  const at = next.readAt
  const out: WatchEvent[] = []
  const ev = (id: string, title: string, tone: WatchEvent["tone"], detail?: string): WatchEvent => ({ key: `live:${venue}:${at}:${id}`, venue, at, kind: id.split("-")[0], title, tone, detail })

  if (prev.assessment !== next.assessment && prev.assessment !== "unrated" && next.assessment !== "unrated") {
    out.push(ev("status", `Status: ${flagLabel(prev.assessment)} → ${flagLabel(next.assessment)}`, RANK[next.assessment] > RANK[prev.assessment] ? "bad" : "good", next.why))
  }
  if (!prev.paused && next.paused) out.push(ev("paused", "Transfers paused", "bad"))
  if (prev.paused && !next.paused) out.push(ev("paused", "Transfers resumed", "good"))

  const before = new Map(prev.powers.map((p) => [p.role, p]))
  const after = new Map(next.powers.map((p) => [p.role, p]))
  for (const [role, p] of after) {
    const was = before.get(role)
    if (!was) out.push(ev(`power-${role}`, `New power: ${p.does.toLowerCase()}`, p.severe ? "bad" : "info", `Held by ${p.holder}`))
    else if (was.key !== p.key) out.push(ev(`holder-${role}`, `${p.does}: now held by another key`, p.severe ? "bad" : "info", `Was ${was.holder}, now ${p.holder}`))
    else if (p.severe && was.waitSecs !== null && p.waitSecs !== null && p.waitSecs < was.waitSecs) {
      out.push(ev(`wait-${role}`, `${p.does}: wait cut from ${wait(was.waitSecs)} to ${wait(p.waitSecs)}`, "bad"))
    }
  }
  for (const [role, p] of before) {
    if (!after.has(role)) out.push(ev(`power-${role}`, `Power removed: ${p.does.toLowerCase()}`, "good"))
  }
  return out
}
