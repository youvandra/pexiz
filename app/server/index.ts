// Production server: the built app, the mainnet RPC relay, the devnet faucet
// and protocol share cards.
//   PEXIZ_MAINNET_RPC_URL  mainnet RPC the board reads through (see relay.ts)
//   PEXIZ_FAUCET_KEYPAIR   mint authority of the test USDC
//   PEXIZ_PUBLIC_URL       public origin for link-preview image URLs (behind a proxy)
//   PEXIZ_WATCH_PORT       where the watcher serves /api/venues (default 5262)
//   PORT                   default 5261
import { join } from "node:path"
import { faucet } from "./faucet"
import { relay } from "./relay"
import { ogCard, ogMeta } from "./og"

const DIST = join(import.meta.dir, "../dist")

/** The app shell, with link-preview tags for a protocol page. */
async function shell(url: URL): Promise<Response> {
  let html = await Bun.file(join(DIST, "index.html")).text()
  const id = url.pathname.match(/^\/app\/monitor\/([a-z0-9-]+)$/)?.[1]
  const meta = id ? ogMeta(id) : null
  if (meta) {
    const origin = process.env.PEXIZ_PUBLIC_URL ?? url.origin
    const image = `${origin}/og/${id}.png`
    const tags = [
      `<meta property="og:title" content="${meta.title}">`,
      `<meta property="og:description" content="${meta.description}">`,
      `<meta property="og:image" content="${image}">`,
      `<meta property="og:url" content="${origin}${url.pathname}">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="twitter:image" content="${image}">`,
    ].join("")
    html = html.replace("</head>", `${tags}</head>`).replace(/<title>[^<]*<\/title>/, `<title>${meta.title}</title>`)
  }
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } })
}

async function file(path: string, url: URL): Promise<Response> {
  const f = Bun.file(join(DIST, path))
  if (path !== "/" && path !== "/index.html" && (await f.exists())) {
    const cache = path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache"
    return new Response(f, { headers: { "cache-control": cache } })
  }
  return shell(url)
}

/** The watcher's read-only API, passed through; it listens on loopback only. */
async function watcher(url: URL, ip: string): Promise<Response> {
  try {
    const res = await fetch(`http://127.0.0.1:${process.env.PEXIZ_WATCH_PORT ?? 5262}${url.pathname}${url.search}`, { headers: { "x-forwarded-for": ip } })
    return new Response(res.body, { status: res.status, headers: { "content-type": "application/json", "cache-control": "no-cache" } })
  } catch {
    return new Response(JSON.stringify({ error: "watcher not running" }), { status: 503, headers: { "content-type": "application/json" } })
  }
}

const server = Bun.serve({
  port: Number(process.env.PORT ?? 5261),
  async fetch(req, srv) {
    const url = new URL(req.url)
    const ip = req.headers.get("x-real-ip") ?? srv.requestIP(req)?.address ?? "?"
    if (url.pathname === "/rpc/mainnet") return relay(req, ip)
    if (url.pathname === "/api/faucet") return faucet(req, ip)
    if (url.pathname.startsWith("/api/venues") || url.pathname.startsWith("/api/check/")) return watcher(url, ip)
    const og = url.pathname.match(/^\/og\/([a-z0-9-]+)\.png$/)
    if (og) return ogCard(og[1])
    return file(decodeURIComponent(url.pathname), url)
  },
})
console.log(`pexiz app on :${server.port}`)
