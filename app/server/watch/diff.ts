// What changed between two reads of one protocol, as events. Pure.
//
// Changes a Squads transaction made (delay, approvals, signers, upgrades)
// also arrive through the history scan with their execution time; the diff
// names only what that scan cannot see: the status itself, the upgrade
// authority moving outside the multisig, upgrades being queued, and durable
// nonces appearing on signers.
import { STATUS_MEANING } from "../../src/data/assess"
import { flagLabel } from "./labels"
import { short, type VenueState, type WatchEvent } from "./types"

export function diff(prev: VenueState, next: VenueState): WatchEvent[] {
  const out: WatchEvent[] = []
  const at = next.readAt
  const ev = (kind: string, title: string, tone: WatchEvent["tone"], detail?: string, id = kind): WatchEvent => ({
    key: `live:${next.venue}:${at}:${id}`,
    venue: next.venue,
    at,
    kind,
    title,
    tone,
    detail,
  })

  if (prev.assessment !== next.assessment && next.assessment !== "unrated" && prev.assessment !== "unrated") {
    const worse = rank(next.assessment) > rank(prev.assessment)
    out.push(ev("status", `Status: ${flagLabel(prev.assessment)} → ${flagLabel(next.assessment)}`, worse ? "bad" : "good", `${next.why} ${STATUS_MEANING[next.assessment]}`))
  }

  if (prev.authority !== undefined && next.authority !== undefined && prev.authority !== next.authority) {
    out.push(ev("authority", next.authority ? `Upgrade authority moved to ${short(next.authority)}` : "Program made immutable", next.authority ? "bad" : "good", prev.authority ? `Was ${short(prev.authority)}` : undefined))
  }

  const had = new Set((prev.pendingUpgrades ?? []).map((p) => p.index))
  for (const p of next.pendingUpgrades ?? []) {
    if (!had.has(p.index)) out.push(ev("upgrade-queued", `Upgrade #${p.index} approved and queued`, "bad", "It can run once the change delay has passed.", `upgrade-${p.index}`))
  }

  // Nonces are only compared when both reads looked for them.
  if (prev.nonces && next.nonces) {
    const before = new Set(prev.nonces.map((n) => n.address))
    const after = new Set(next.nonces.map((n) => n.address))
    for (const n of next.nonces) {
      if (!before.has(n.address)) out.push(ev("nonce", `Signer ${short(n.member)} can now sign in advance`, "bad", `Durable nonce account ${short(n.address)}`, `nonce-${n.address}`))
    }
    for (const n of prev.nonces) {
      if (!after.has(n.address)) out.push(ev("nonce", `Signer ${short(n.member)}'s durable nonce is gone`, "good", `Account ${short(n.address)} closed or handed over`, `nonce-gone-${n.address}`))
    }
  }
  return out
}

const RANK = { green: 0, unrated: 0, amber: 1, exposed: 2, red: 3 } as const
const rank = (a: VenueState["assessment"]) => RANK[a]
