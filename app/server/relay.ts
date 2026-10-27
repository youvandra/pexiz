// Mainnet RPC relay. The public endpoint refuses browser origins, so the board
// reads mainnet through here in dev and in production, with the same rules.
//   PEXIZ_MAINNET_RPC_URL  mainnet RPC to forward to (public RPC by default)

/** The board reads accounts and nothing else. A wider list is an open RPC endpoint on our bill. */
const ALLOWED = new Set(["getMultipleAccounts", "getAccountInfo"])
const MAX_BODY = 64 * 1024
const WINDOW_MS = 60_000
// One board read is about 13 calls, so this is roughly a refresh every five seconds.
const PER_WINDOW = 180

const hits = new Map<string, number[]>()

function overLimit(ip: string): boolean {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  recent.push(now)
  hits.set(ip, recent)
  if (hits.size > 5_000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k)
  return recent.length > PER_WINDOW
}

export async function relay(req: Request, ip: string): Promise<Response> {
  if (req.method !== "POST") return new Response("POST only", { status: 405 })
  const text = await req.text()
  if (text.length > MAX_BODY) return new Response("Body too large", { status: 413 })
  let calls: { method?: string }[]
  try {
    const parsed = JSON.parse(text)
    calls = Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    return new Response("Invalid JSON", { status: 400 })
  }
  const blocked = calls.find((c) => !ALLOWED.has(c?.method ?? ""))
  if (blocked) return new Response(`Method not relayed: ${blocked.method ?? "?"}`, { status: 403 })
  if (overLimit(ip)) return new Response("Too many requests", { status: 429 })
  const upstream = process.env.PEXIZ_MAINNET_RPC_URL ?? "https://api.mainnet-beta.solana.com"
  const res = await fetch(upstream, { method: "POST", headers: { "content-type": "application/json" }, body: text })
  return new Response(res.body, { status: res.status, headers: { "content-type": "application/json" } })
}
