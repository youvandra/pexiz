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
//   PEXIZ_FEED_KEY          Ed25519 key that signs /api/v1 (default data/feed-key.pem, made on first run)
//   PEXIZ_WEBHOOKS          comma-separated URLs that receive signed change events
import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { Connection } from "@solana/web3.js"
import { VENUES, type WatchedVenue } from "../../src/data/facts"
import { CheckError, checkAddress, type CheckResult } from "./check"
import { diff } from "./diff"
import { FEED_VERSION, feedVenue, loadSigner, postWebhooks } from "./feed"
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
const signer = loadSigner(env.PEXIZ_FEED_KEY ?? join(dirname(DB), "feed-key.pem"))
const WEBHOOKS = (env.PEXIZ_WEBHOOKS ?? "").split(",").map((u) => u.trim()).filter(Boolean)
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
      const touched = new Set(news.map((e) => e.venue))
      await postWebhooks(WEBHOOKS, signer, news, store.states().filter((s) => touched.has(s.venue)).map((s) => feedVenue(s, POLL_SECS)))
    }
    await pause(Math.max(5_000, POLL_SECS * 1000 - (Date.now() - started)))
  }
}

// Checks are read on demand: cached, capped per address, two running at a
// time, and answered as a job. A trace on the public RPC can take a minute,
// so a request that is not done in a few seconds is told "pending" and asks
// again, rather than holding a connection open.
const CHECK_TTL_MS = 5 * 60_000
const CHECKS_PER_MIN = 10
const WAIT_MS = 8_000
const checked = new Map<string, { at: number; body: unknown; status: number }>()
const inflight = new Map<string, Promise<void>>()
const checkHits = new Map<string, number[]>()
let running = 0
const waiting: (() => void)[] = []

async function runCheck(address: string) {
  if (running >= 2) await new Promise<void>((r) => waiting.push(r))
  running++
  try {
    const result = await checkAddress(conn, address)
    checked.set(address, { at: Date.now(), body: result, status: 200 })
  } catch (e) {
    const known = e instanceof CheckError
    if (!known) console.warn(`check ${address}: ${(e as Error).message}`)
    // An address that is not a program or a token stays an error; a failed
    // read is forgotten at once so the next ask tries again.
    if (known) checked.set(address, { at: Date.now(), body: { error: e.message }, status: e.status })
    else checked.set(address, { at: Date.now() - CHECK_TTL_MS + 5_000, body: { error: "Could not read that address from chain just now. Try again in a minute." }, status: 502 })
  } finally {
    running--
    waiting.shift()?.()
    inflight.delete(address)
    if (checked.size > 500) checked.delete(checked.keys().next().value!)
  }
}

async function check(address: string, ip: string): Promise<[unknown, number]> {
  const hit = checked.get(address)
  if (hit && Date.now() - hit.at < CHECK_TTL_MS) return [hit.body, hit.status]
  let job = inflight.get(address)
  if (!job) {
    const recent = (checkHits.get(ip) ?? []).filter((t) => Date.now() - t < 60_000)
    if (recent.length >= CHECKS_PER_MIN) return [{ error: "Too many checks. Try again in a minute." }, 429]
    checkHits.set(ip, [...recent, Date.now()])
    job = runCheck(address)
    inflight.set(address, job)
  }
  await Promise.race([job, pause(WAIT_MS)])
  const done = checked.get(address)
  if (done && !inflight.has(address)) return [done.body, done.status]
  return [{ pending: true, retryAfterSecs: 3 }, 202]
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-cache" } })

/** A feed response: open to any origin, its exact body signed. */
function signed(body: unknown, status = 200): Response {
  const text = JSON.stringify(body)
  return new Response(text, {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-cache",
      "access-control-allow-origin": "*",
      "access-control-expose-headers": "x-pexiz-signer, x-pexiz-signature",
      "x-pexiz-signer": signer.address,
      "x-pexiz-signature": signer.sign(text),
    },
  })
}

const ADDRESS = "[1-9A-HJ-NP-Za-km-z]{32,44}"

/** The public, versioned feed. */
async function v1(url: URL, ip: string): Promise<Response> {
  const path = url.pathname.replace(/^\/api\/v1/, "") || "/"
  const lastPass = Number(store.meta("last_pass") ?? 0) || null
  if (path === "/" ) {
    return signed({
      version: FEED_VERSION,
      signer: signer.address,
      endpoints: {
        "/api/v1/venues": "Every watched protocol's admin risk, read from mainnet every few minutes.",
        "/api/v1/venues/{id}": "One protocol, with its admin history.",
        "/api/v1/check/{address}": "Any program or token mint, read on request. 202 means still reading: ask again after retryAfterSecs.",
      },
      signature: "x-pexiz-signature is the Ed25519 signature, hex, of the exact response body; x-pexiz-signer is the key.",
    })
  }
  if (path === "/venues") {
    return signed({ version: FEED_VERSION, generatedAt: Math.floor(Date.now() / 1000), lastPass, pollSecs: POLL_SECS, venues: store.states().map((s) => feedVenue(s, POLL_SECS)) })
  }
  const one = path.match(/^\/venues\/([a-z0-9-]+)$/)
  if (one) {
    const s = store.state(one[1])
    if (!s) return signed({ error: "unknown protocol" }, 404)
    return signed({ version: FEED_VERSION, generatedAt: Math.floor(Date.now() / 1000), venue: feedVenue(s, POLL_SECS), history: store.events(one[1], 100) })
  }
  const c = path.match(new RegExp(`^/check/(${ADDRESS})$`))
  if (c) {
    const [body, status] = await check(c[1], ip)
    // 202 means the read is still running: ask again after retryAfterSecs.
    return signed(status === 200 ? { version: FEED_VERSION, generatedAt: Math.floor(Date.now() / 1000), result: body } : body, status)
  }
  return signed({ error: "not found" }, 404)
}

Bun.serve({
  port: PORT,
  // A check traces several keys through their transactions; give it time.
  idleTimeout: 120,
  hostname: "127.0.0.1",
  async fetch(req) {
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
    const ip = req.headers.get("x-forwarded-for") ?? "local"
    if (url.pathname === "/api/v1" || url.pathname.startsWith("/api/v1/")) return v1(url, ip)
    const c = url.pathname.match(new RegExp(`^/api/check/(${ADDRESS})$`))
    if (c) return check(c[1], ip).then(([body, status]) => json(body, status))
    if (url.pathname.startsWith("/api/check/")) return json({ error: "That is not a Solana address." }, 400)
    const m = url.pathname.match(/^\/api\/venues\/([a-z0-9-]+)\/events$/)
    if (m) {
      if (!VENUES.some((v) => v.id === m[1])) return json({ error: "unknown protocol" }, 404)
      const limit = Math.min(200, Number(url.searchParams.get("limit") ?? 50) || 50)
      return json({ events: store.events(m[1], limit) })
    }
    return json({ error: "not found" }, 404)
  },
})

console.log(`pexiz watcher on :${PORT}, every ${POLL_SECS}s, ${bot.username ? `bot @${bot.username}` : "alerts to the log"}, feed signed by ${signer.address}${WEBHOOKS.length ? `, ${WEBHOOKS.length} webhooks` : ""}`)
void bot.listen()
await loop()
