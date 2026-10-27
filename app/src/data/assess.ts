// The board's verdict on one venue: pure, so the browser and the share-card
// server judge the same way. Relative imports only; the server runs it as is.
import { ASSUMED_EXIT_SECS, type WatchedVenue } from "./facts"
import { duration } from "../lib/format"

export type Assessment = "green" | "amber" | "red" | "unrated"

export interface PendingUpgrade {
  index: bigint
  approvedAt?: number
  /** When the timelock lets it execute. */
  readyAt?: number
}

export interface Verdict {
  assessment: Assessment
  why: string
  exitWindowSecs?: number
}

/**
 * The board's reading of a mainnet venue. The on-chain oracle is on devnet;
 * here the same inputs are read straight from mainnet and judged by one
 * rule: is there time to leave before an approved change can land?
 */
export function assess(v: WatchedVenue, timeLockSecs?: number, pending: PendingUpgrade[] = []): Verdict {
  const base = assessConfig(v, timeLockSecs)
  if (!pending.length || base.assessment === "red") return base
  const now = Date.now() / 1000
  const ready = pending.find((p) => p.readyAt !== undefined && p.readyAt <= now)
  const next = pending.map((p) => p.readyAt).filter((t): t is number => t !== undefined).sort()[0]
  const why = ready
    ? `An approved upgrade (#${ready.index}) can be executed at any time.`
    : next
      ? `An approved upgrade can land in ${duration(Math.round(next - now))}.`
      : "An approved upgrade is waiting to execute."
  return { ...base, assessment: "amber", why }
}

function assessConfig(v: WatchedVenue, timeLockSecs?: number): Verdict {
  if (v.admin === "squads-v3") return { assessment: "red", why: "No delay: an approved change lands at once.", exitWindowSecs: -ASSUMED_EXIT_SECS }
  if (v.admin === "governance") return { assessment: "unrated", why: "Changes go through a DAO vote; the wait depends on each proposal." }
  if (v.admin === "dormant") return { assessment: "unrated", why: "One key controls it, unused since 2024." }
  if (timeLockSecs === undefined) return { assessment: "unrated", why: "Its multisig could not be read just now." }
  const win = timeLockSecs - ASSUMED_EXIT_SECS
  if (win <= 0) return { assessment: "red", why: "A change can land before you could get out.", exitWindowSecs: win }
  if (win < 12 * 3600) return { assessment: "amber", why: "Under 12 hours to notice and get out.", exitWindowSecs: win }
  return { assessment: "green", why: "A full day's notice before any change lands.", exitWindowSecs: win }
}

