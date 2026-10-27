// The watcher: reads every protocol on the board from mainnet on a fixed
// beat, keeps what changed, tells subscribers on Telegram, and serves both to
// the app. One process, run next to the app server.
//
//   bun server/watch/index.ts
//
//   PEXIZ_MAINNET_RPC_URL   mainnet RPC (public by default; nonce scans want a paid one)
//   PEXIZ_WATCH_DB          SQLite file (default data/watch.db)
//   PEXIZ_WATCH_PORT        HTTP port for the app's /api/venues (default 5262)
//   PEXIZ_WATCH_POLL_SECS   seconds between passes (default 300)
//   PEXIZ_WATCH_NONCE_SECS  seconds between durable-nonce scans (default 3600)
//   TELEGRAM_BOT_TOKEN      the bot; without it alerts are only logged
//   PEXIZ_PUBLIC_URL        the app's public origin, for links in alerts
import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { Connection } from "@solana/web3.js"
import { VENUES, type WatchedVenue } from "../../src/data/facts"
import { diff } from "./diff"
import { readHistory } from "./history"
import { readVenue } from "./read"
import { openStore } from "./store"
import { logBot, telegramBot } from "./telegram"
import type { VenueState, WatchEvent } from "./types"

const env = process.env
const DB = env.PEXIZ_WATCH_DB ?? join(import.meta.dir, "../../data/watch.db")
const PORT = Number(env.PEXIZ_WATCH_PORT ?? 5262)
const POLL_SECS = Number(env.PEXIZ_WATCH_POLL_SECS ?? 300)
const NONCE_SECS = Number(env.PEXIZ_WATCH_NONCE_SECS ?? 3600)
const APP_URL = env.PEXIZ_PUBLIC_URL ?? "http://localhost:5260"
/** Recent transactions are scanned again: an approved one may since have run. */
const RESCAN = 20n

mkdirSync(dirname(DB), { recursive: true })
const store = openStore(DB)
const conn = new Connection(env.PEXIZ_MAINNET_RPC_URL ?? "https://api.mainnet-beta.solana.com", "confirmed")
const bot = env.TELEGRAM_BOT_TOKEN ? await telegramBot(env.TELEGRAM_BOT_TOKEN, store, APP_URL) : logBot(APP_URL)
const now = () => Math.floor(Date.now() / 1000)
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function pass(v: WatchedVenue): Promise<WatchEvent[]> {
  const prev = store.state(v.id)
  const nonceKey = `nonces_at:${v.id}`
  const wantNonces = v.admin === "squads-v4" && now() - Number(store.meta(nonceKey) ?? 0) >= NONCE_SECS
  let next: VenueState
  try {
    next = await readVenue(conn, v, { nonces: wantNonces })
    if (wantNonces) store.setMeta(nonceKey, String(now()))
  } catch (e) {
    // A nonce scan is the call most likely to be refused; read again without it.
    if (!wantNonces) throw e
    console.warn(`${v.id}: nonce scan failed (${(e as Error).message}); reading without it`)
    next = await readVenue(conn, v)
  }
  if (!next.nonces && prev?.nonces) next.nonces = prev.nonces

  const events: WatchEvent[] = []
  if (prev) events.push(...diff(prev, next))
  else events.push({ key: `watch:${v.id}:start`, venue: v.id, at: next.readAt, kind: "watch", title: "Pexiz started watching", tone: "info" })

  if (v.multisig && next.txIndex) {
    const histKey = `history_to:${v.id}`
    const done = BigInt(store.meta(histKey) ?? 0)
    const from = done > RESCAN ? done - RESCAN : 1n
    events.push(...(await readHistory(conn, { id: v.id, multisig: v.multisig, program: v.program }, from, BigInt(next.txIndex), { pauseMs: 250 })))
    store.setMeta(histKey, String(next.txIndex))
  }

  const fresh = store.addEvents(events)
  store.saveState(next)
  // The first pass fills the history from chain; none of that is news.
  return prev ? fresh : []
}

async function loop() {
  for (;;) {
    const started = Date.now()
    const news: WatchEvent[] = []
    for (const v of VENUES) {
      try {
        news.push(...(await pass(v)))
      } catch (e) {
        console.warn(`${v.id}: ${(e as Error).message}`)
        const prev = store.state(v.id)
        if (prev) store.saveState({ ...prev, ok: false })
      }
      await pause(500)
    }
    store.setMeta("last_pass", String(now()))
    if (news.length) {
      console.log(`${news.length} new: ${news.map((e) => `${e.venue} ${e.title}`).join("; ")}`)
      await bot.alert(news).catch((e) => console.warn(`alert: ${e.message}`))
    }
    await pause(Math.max(5_000, POLL_SECS * 1000 - (Date.now() - started)))
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-cache" } })

Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === "/api/venues") {
      const subs = store.subscriberCounts()
      return json({
        lastPass: Number(store.meta("last_pass") ?? 0) || null,
        pollSecs: POLL_SECS,
        bot: bot.username,
        venues: store.states().map((s) => ({ ...s, subscribers: subs[s.venue] ?? 0 })),
      })
    }
    const m = url.pathname.match(/^\/api\/venues\/([a-z0-9-]+)\/events$/)
    if (m) {
      if (!VENUES.some((v) => v.id === m[1])) return json({ error: "unknown protocol" }, 404)
      const limit = Math.min(200, Number(url.searchParams.get("limit") ?? 50) || 50)
      return json({ events: store.events(m[1], limit) })
    }
    return json({ error: "not found" }, 404)
  },
})

console.log(`pexiz watcher on :${PORT}, every ${POLL_SECS}s, ${bot.username ? `bot @${bot.username}` : "alerts to the log"}`)
void bot.listen()
await loop()
