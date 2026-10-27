// The board's verdict on one venue: pure, so the browser and the share-card
// server judge the same way. Relative imports only; the server runs it as is.
import { ASSUMED_EXIT_SECS, type WatchedVenue } from "./facts"
import { duration } from "../lib/format"

export type Assessment = "green" | "amber" | "exposed" | "red" | "unrated"

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

/** What the live read saw besides the delay, to tell a new change from a standing setup. */
export interface LiveRead {
  threshold?: number
  authorityMatches?: boolean
}

const daysAgo = (unix: number) => Math.max(0, Math.floor((Date.now() / 1000 - unix) / 86_400))

/**
 * The board's reading of a mainnet venue: is there time to leave before an
 * approved change can land? Two different answers are kept apart:
 *
 * - "exposed" (No delay): the venue is set up so changes land at once. A
 *   standing risk; nothing new has happened.
 * - "red" (Get out): something changed for the worse since the measured
 *   snapshot: the delay was cut, fewer approvals are needed, or someone else
 *   now controls upgrades. The April 2026 pattern.
 */
export function assess(v: WatchedVenue, timeLockSecs?: number, pending: PendingUpgrade[] = [], live: LiveRead = {}): Verdict {
  const base = assessConfig(v, timeLockSecs, live)
  if (!pending.length || base.assessment === "red" || base.assessment === "exposed") return base
  const now = Date.now() / 1000
  const ready = pending.find((p) => p.readyAt !== undefined && p.readyAt <= now)
  const next = pending.map((p) => p.readyAt).filter((t): t is number => t !== undefined).sort()[0]
  const age = ready?.approvedAt !== undefined ? `, approved ${daysAgo(ready.approvedAt)} days ago and never run,` : ""
  const why = ready
    ? `Upgrade #${ready.index}${age} can be executed at any time.`
    : next
      ? `An approved upgrade can land in ${duration(Math.round(next - now))}.`
      : "An approved upgrade is waiting to execute."
  return { ...base, assessment: "amber", why }
}

function assessConfig(v: WatchedVenue, timeLockSecs: number | undefined, live: LiveRead): Verdict {
  const standing = "This is how it is set up; nothing new has changed."
  if (v.admin === "squads-v3") return { assessment: "exposed", why: `Approved changes land at once. ${standing}`, exitWindowSecs: -ASSUMED_EXIT_SECS }
  if (v.admin === "governance") return { assessment: "unrated", why: "Changes go through a DAO vote; the wait depends on each proposal." }
  if (v.admin === "dormant") return { assessment: "unrated", why: "One key controls it, unused since 2024." }
  if (timeLockSecs === undefined) return { assessment: "unrated", why: "Its multisig could not be read just now." }
  const win = timeLockSecs - ASSUMED_EXIT_SECS
  const was = v.snapshot.timeLockSecs
  if (live.authorityMatches === false) return { assessment: "red", why: "Someone else now controls upgrades to the program.", exitWindowSecs: win }
  if (was !== undefined && timeLockSecs < was) {
    return { assessment: "red", why: `The change delay was cut from ${duration(was)} to ${timeLockSecs ? duration(timeLockSecs) : "nothing"}.`, exitWindowSecs: win }
  }
  if (v.snapshot.threshold !== undefined && live.threshold !== undefined && live.threshold < v.snapshot.threshold) {
    return { assessment: "red", why: `Fewer approvals are needed than before: ${v.snapshot.threshold} down to ${live.threshold}.`, exitWindowSecs: win }
  }
  if (win <= 0) return { assessment: "exposed", why: timeLockSecs ? `Changes wait ${duration(timeLockSecs)}, less than you need to get out. ${standing}` : `Approved changes land at once. ${standing}`, exitWindowSecs: win }
  if (win < 12 * 3600) return { assessment: "amber", why: "Under 12 hours to notice and get out.", exitWindowSecs: win }
  return { assessment: "green", why: "A full day's notice before any change lands.", exitWindowSecs: win }
}

/** One line per status: what it means for an LP, and what to do. */
export const STATUS_MEANING: Record<Assessment, string> = {
  green: "Changes wait long enough for you to leave. Nothing to do.",
  amber: "Less than 12 hours to react, or an upgrade is queued. Keep an eye on it.",
  exposed: "Set up with no wait on changes. Nothing new, but you would get no warning.",
  red: "Something just changed for the worse. Leave while you can.",
  unrated: "Controlled another way, so the same rule does not apply.",
}
