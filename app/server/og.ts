// Share card for one protocol: a 1200x630 PNG with its status, exit window
// and the reason, read from mainnet when asked. Shared by the dev server and
// the production server, so link previews look the same everywhere.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Resvg } from "@resvg/resvg-js"
import { Connection, PublicKey } from "@solana/web3.js"
import { decodeMultisig, programDataAddress, vaultPda } from "@pexiz/sdk/src/squads"
import { findPendingUpgrades } from "@pexiz/sdk/src/upgrades"
import { ASSUMED_EXIT_SECS, VENUES, type WatchedVenue } from "../src/data/facts"
import { assess, type Assessment, type Verdict } from "../src/data/assess"
import { duration } from "../src/lib/format"

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const FONTS = ["InterTight-Medium.ttf", "InterTight-SemiBold.ttf"].map((f) => join(ROOT, "server/fonts", f))
const TTL_MS = 5 * 60_000
const cache = new Map<string, { at: number; png: Buffer }>()

const COLORS: Record<Assessment, { fg: string; bg: string; label: string; level: number }> = {
  green: { fg: "#2e9f60", bg: "#e3f1e4", label: "Safe", level: 1 },
  amber: { fg: "#b98a00", bg: "#fbf0c9", label: "Watch", level: 2 },
  red: { fg: "#d95a3a", bg: "#fbe4da", label: "Get out", level: 3 },
  unrated: { fg: "rgba(13,13,12,.46)", bg: "#fffdf9", label: "Unrated", level: 0 },
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

async function read(v: WatchedVenue): Promise<Verdict & { delay?: number }> {
  const snapshot = { ...assess(v, v.snapshot.timeLockSecs), delay: v.snapshot.timeLockSecs ?? (v.admin === "squads-v3" ? 0 : undefined) }
  if (v.admin !== "squads-v4" || !v.multisig) return snapshot
  try {
    const conn = new Connection(process.env.PEXIZ_MAINNET_RPC_URL ?? "https://api.mainnet-beta.solana.com", "confirmed")
    const ms = new PublicKey(v.multisig)
    const info = await conn.getAccountInfo(ms)
    if (!info) return snapshot
    const m = decodeMultisig(info.data)
    const vaultIndex = [0, 1, 2, 3].find((i) => vaultPda(ms, i)[0].toBase58() === v.authority) ?? 0
    const found = await findPendingUpgrades(conn, ms, m.transactionIndex, vaultIndex, programDataAddress(new PublicKey(v.program))).catch(() => [])
    const pending = found.map((p) => ({ index: p.index, approvedAt: p.approvedAt, readyAt: p.approvedAt !== undefined ? p.approvedAt + m.timeLock : undefined }))
    return { ...assess(v, m.timeLock, pending), delay: m.timeLock }
  } catch {
    return snapshot
  }
}

function logoData(path: string): string {
  const file = join(ROOT, "public", path)
  const mime = path.endsWith(".svg") ? "image/svg+xml" : "image/png"
  return `data:${mime};base64,${readFileSync(file).toString("base64")}`
}

/** Splits a sentence into lines of at most `max` characters. */
function wrap(text: string, max: number): string[] {
  const lines: string[] = []
  let line = ""
  for (const word of text.split(" ")) {
    if ((line + " " + word).trim().length > max) {
      lines.push(line)
      line = word
    } else line = (line + " " + word).trim()
  }
  if (line) lines.push(line)
  return lines.slice(0, 3)
}

/** "23h 50m" as SVG tspans, units small and muted. */
function durSpans(text: string, size: number): string {
  if (!/\d/.test(text)) return `<tspan>${esc(text)}</tspan>`
  return text.split(" ").map((part) => {
    const m = part.match(/^(\d+)([a-z]+)$/)
    return m ? `<tspan>${m[1]}</tspan><tspan font-size="${Math.round(size * 0.55)}" fill="rgba(13,13,12,.46)">${m[2]} </tspan>` : `<tspan>${esc(part)} </tspan>`
  }).join("")
}

const meterPos = (secs: number) => Math.min(1, Math.log1p(Math.max(0, secs) / 60) / Math.log1p((48 * 3600) / 60))

export function cardSvg(v: WatchedVenue, r: Verdict & { delay?: number }, now = new Date()): string {
  const c = COLORS[r.assessment]
  const windowText = r.exitWindowSecs === undefined ? "Not rated" : r.exitWindowSecs <= 0 ? "None" : duration(r.exitWindowSecs)
  const mx = 72, my = 470, mw = 520
  const need = mx + meterPos(ASSUMED_EXIT_SECS) * mw
  const fill = r.delay === undefined ? 0 : Math.max(meterPos(r.delay) * mw, r.delay > 0 ? 14 : 0)
  const bars = [16, 28, 40].map((h, i) => `<rect x="${i * 17}" y="${40 - h}" width="12" height="${h}" rx="3" fill="${c.fg}" opacity="${i < c.level ? 1 : 0.22}"/>`).join("")
  const why = wrap(r.why, 30)
  const date = now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" font-family="Inter Tight">
  <defs><linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.bg}"/><stop offset=".55" stop-color="#fbf6ef"/></linearGradient></defs>
  <rect width="1200" height="630" fill="url(#t)"/>
  <g transform="translate(72 64)">
    <rect width="34" height="34" rx="9" fill="#0d0d0c"/>
    <path d="M13.6 10.5h7.8v12.6" stroke="#fbf6ef" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <path d="M21.4 10.5 11.2 21.4" stroke="#e9c22e" stroke-width="3.4" stroke-linecap="round"/>
    <text x="48" y="26" font-size="30" font-weight="600" fill="#0d0d0c">pexiz</text>
  </g>
  <text x="1128" y="90" font-size="24" fill="rgba(13,13,12,.46)" text-anchor="end">Protocol monitor</text>
  <g transform="translate(72 170)">
    <rect width="104" height="104" rx="24" fill="#fffdf9" stroke="rgba(13,13,12,.1)" stroke-width="2"/>
    <image href="${logoData(v.logo)}" x="8" y="8" width="88" height="88" preserveAspectRatio="xMidYMid meet"/>
    <text x="132" y="54" font-size="60" font-weight="600" fill="#0d0d0c" letter-spacing="-1.5">${esc(v.name)}</text>
    <text x="134" y="94" font-size="26" fill="rgba(13,13,12,.55)">${esc(v.kind)}</text>
  </g>
  <g transform="translate(828 176)">
    <rect width="300" height="92" rx="16" fill="${c.bg}" stroke="${c.fg}" stroke-opacity=".35" stroke-width="2"/>
    <g transform="translate(30 26)">${bars}</g>
    <text x="104" y="60" font-size="40" font-weight="600" fill="${c.fg}">${esc(c.label)}</text>
  </g>
  <text x="72" y="364" font-size="22" font-weight="600" fill="rgba(13,13,12,.46)" letter-spacing="2">EXIT WINDOW</text>
  <text x="70" y="444" font-size="84" font-weight="500" fill="#0d0d0c" letter-spacing="-2">${durSpans(windowText, 84)}</text>
  <rect x="${mx}" y="${my}" width="${mw}" height="14" rx="7" fill="#f3ece1"/>
  ${fill > 0 ? `<rect x="${mx}" y="${my}" width="${fill}" height="14" rx="7" fill="${c.fg}"/>` : ""}
  <rect x="${need - 2}" y="${my - 8}" width="4" height="30" rx="2" fill="#0d0d0c"/>
  <text x="${mx}" y="${my + 50}" font-size="20" fill="rgba(13,13,12,.55)">${r.delay === undefined ? "Admin delay unknown" : r.delay ? `Admin delay ${duration(r.delay)}` : "No admin delay"} · you need ${duration(ASSUMED_EXIT_SECS)} to withdraw</text>
  <rect x="684" y="342" width="4" height="${why.length * 38 + 8}" rx="2" fill="${c.fg}"/>
  ${why.map((l, i) => `<text x="708" y="${376 + i * 38}" font-size="28" fill="#0d0d0c">${esc(l)}</text>`).join("")}
  <line x1="72" y1="570" x2="1128" y2="570" stroke="rgba(13,13,12,.1)" stroke-width="2"/>
  <text x="72" y="604" font-size="20" fill="rgba(13,13,12,.46)">Read from Solana mainnet · ${esc(date)}</text>
  <text x="1128" y="604" font-size="20" fill="rgba(13,13,12,.46)" text-anchor="end">Know your way out</text>
</svg>`
}

export async function ogCard(id: string): Promise<Response> {
  const v = VENUES.find((x) => x.id === id)
  if (!v) return new Response("unknown protocol", { status: 404 })
  const hit = cache.get(id)
  let png = hit && Date.now() - hit.at < TTL_MS ? hit.png : null
  if (!png) {
    const svg = cardSvg(v, await read(v))
    png = Buffer.from(new Resvg(svg, { font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: "Inter Tight" } }).render().asPng())
    cache.set(id, { at: Date.now(), png })
  }
  return new Response(png, { headers: { "content-type": "image/png", "cache-control": "public, max-age=300" } })
}

/** Title and description for link previews of a protocol page. */
export function ogMeta(id: string): { title: string; description: string } | null {
  const v = VENUES.find((x) => x.id === id)
  if (!v) return null
  return { title: `${v.name} on Pexiz`, description: `Who controls ${v.name}, and whether you would have time to leave if they changed it.` }
}
