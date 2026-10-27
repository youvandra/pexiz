import type { Assessment } from "../../src/data/assess"

/** One thing that happened to a protocol's admin setup. */
export interface WatchEvent {
  /** Stable across scans, so the same change is never stored twice. */
  key: string
  venue: string
  /** Unix seconds. */
  at: number
  kind: string
  title: string
  detail?: string
  /** "bad" weakens the setup; it is what an alert is for. */
  tone: "bad" | "good" | "info"
}

/** What the watcher read for one protocol on one pass. */
export interface VenueState {
  venue: string
  /** Unix seconds. */
  readAt: number
  /** False when the read failed; the fields below are then the last good read. */
  ok: boolean
  assessment: Assessment
  why: string
  exitWindowSecs?: number
  authority?: string | null
  threshold?: number
  members?: string[]
  timeLockSecs?: number
  txIndex?: number
  pendingUpgrades?: { index: number; approvedAt?: number; readyAt?: number }[]
  /** Durable-nonce accounts held by signers; undefined when not checked. */
  nonces?: { address: string; member: string }[]
}

export const short = (k: string) => `${k.slice(0, 4)}…${k.slice(-4)}`
