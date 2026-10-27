// Production server: the built app, the mainnet RPC relay and the devnet faucet.
//   PEXIZ_MAINNET_RPC_URL  mainnet RPC the board reads through (public RPC by default)
//   PEXIZ_FAUCET_KEYPAIR   mint authority of the test USDC
//   PORT                   default 5261
import { join } from "node:path"
import { faucet } from "./faucet"

const DIST = join(import.meta.dir, "../dist")
const MAINNET = process.env.PEXIZ_MAINNET_RPC_URL ?? "https://api.mainnet-beta.solana.com"

async function relay(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("POST only", { status: 405 })
  const res = await fetch(MAINNET, { method: "POST", headers: { "content-type": "application/json" }, body: await req.text() })
  return new Response(res.body, { status: res.status, headers: { "content-type": "application/json" } })
}

async function file(path: string): Promise<Response> {
  const f = Bun.file(join(DIST, path))
  if (path !== "/" && (await f.exists())) {
    const cache = path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache"
    return new Response(f, { headers: { "cache-control": cache } })
  }
  return new Response(Bun.file(join(DIST, "index.html")), { headers: { "cache-control": "no-cache" } })
}

const server = Bun.serve({
  port: Number(process.env.PORT ?? 5261),
  async fetch(req, srv) {
    const url = new URL(req.url)
    const ip = req.headers.get("x-real-ip") ?? srv.requestIP(req)?.address ?? "?"
    if (url.pathname === "/rpc/mainnet") return relay(req)
    if (url.pathname === "/api/faucet") return faucet(req, ip)
    return file(decodeURIComponent(url.pathname))
  },
})
console.log(`pexiz app on :${server.port}`)
