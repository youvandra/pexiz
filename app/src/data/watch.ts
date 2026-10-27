// The watcher's view, served at /api/venues: the last mainnet read of every
// protocol, its change history, and the Telegram bot that sends alerts.
// The board reads from here first and falls back to reading chain itself.
import { useEffect, useState } from "react"

export interface WatchEvent {
  key: string
  venue: string
  at: number
  kind: string
  title: string
  detail?: string
  tone: "bad" | "good" | "info"
}

export interface WatchedState {
  venue: string
  readAt: number
  ok: boolean
  assessment: "green" | "amber" | "exposed" | "red" | "unrated"
  why: string
  exitWindowSecs?: number
  authority?: string | null
  threshold?: number
  members?: string[]
  timeLockSecs?: number
  txIndex?: number
  pendingUpgrades?: { index: number; approvedAt?: number; readyAt?: number }[]
  nonces?: { address: string; member: string }[]
  subscribers: number
}

export interface Watch {
  lastPass: number | null
  pollSecs: number
  bot: string | null
  venues: WatchedState[]
}

const TTL_MS = 60_000
let cached: { at: number; data: Watch | null } | null = null
let inflight: Promise<Watch | null> | null = null

/** Null when no watcher answers: the caller reads chain itself. */
export function loadWatch(): Promise<Watch | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return Promise.resolve(cached.data)
  inflight ??= fetch("/api/venues")
    .then((r) => (r.ok ? (r.json() as Promise<Watch>) : null))
    .catch(() => null)
    // A watcher that has not finished its first pass has nothing to show yet.
    .then((d) => (d && d.venues.length ? d : null))
    .then((data) => {
      cached = { at: Date.now(), data }
      return data
    })
    .finally(() => { inflight = null })
  return inflight
}

export function useWatch() {
  const [data, setData] = useState(cached?.data ?? null)
  useEffect(() => {
    let on = true
    loadWatch().then((d) => on && setData(d))
    return () => { on = false }
  }, [])
  return data
}

export function useEvents(venue: string) {
  const [events, setEvents] = useState<WatchEvent[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let on = true
    setEvents(null)
    fetch(`/api/venues/${venue}/events?limit=100`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { events: WatchEvent[] }) => on && setEvents(d.events))
      .catch(() => on && setFailed(true))
    return () => { on = false }
  }, [venue])
  return { events, failed }
}

/** The deep link that opens the bot with this protocol already chosen. */
export const telegramLink = (bot: string, venue?: string) => `https://t.me/${bot}${venue ? `?start=${venue}` : ""}`

export interface FeedToken {
  id: string
  name: string
  symbol: string
  kind: string
  mint: string
  status: "green" | "amber" | "exposed" | "red" | "unrated"
  statusLabel: string
  reason: string
  fastestWaitSecs: number | null
  powers: { role: string; does: string; severe: boolean; key: string; holder: string; waitSecs: number | null }[]
  paused: boolean
  readAt: number
  stale: boolean
}

/** The watched collateral tokens, from the feed. Null while loading or when no watcher answers. */
export function useTokens() {
  const [tokens, setTokens] = useState<FeedToken[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let on = true
    fetch("/api/v1/tokens")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { tokens: FeedToken[] }) => on && setTokens(d.tokens))
      .catch(() => on && setFailed(true))
    return () => { on = false }
  }, [])
  return { tokens, failed }
}
