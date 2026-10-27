// Who controls the collateral on Kamino. Reads every collateral-enabled
// reserve from Kamino's public API, then runs the app's token check on each
// mint holding at least MIN_USD: every key that can mint, freeze, move or
// pause the token, who holds it, and how long it waits.
//
//   bun run scripts/measure/collateral.ts [out.json]
//
// Uses PEXIZ_MAINNET_RPC_URL, else the public mainnet RPC (slow: a token
// takes one to two minutes there).
import { Connection } from "@solana/web3.js"
import { writeFileSync } from "node:fs"
import { readToken } from "../../app/server/watch/collateral"

const MIN_USD = 3_000_000
const API = "https://api.kamino.finance"
const out = process.argv[2] ?? "collateral.json"
const conn = new Connection(process.env.PEXIZ_MAINNET_RPC_URL ?? "https://api.mainnet-beta.solana.com", "confirmed")

const get = async (path: string) => (await fetch(API + path)).json() as Promise<any>
const markets: { lendingMarket: string; name: string; isCurated?: boolean }[] = await get("/v2/kamino-market")
const byMint = new Map<string, { symbol: string; supplyUsd: number; borrowUsd: number; markets: string[] }>()
for (const m of markets) {
  const reserves: any[] = await get(`/kamino-market/${m.lendingMarket}/reserves/metrics`)
  for (const r of reserves) {
    if (Number(r.maxLtv) <= 0) continue
    const e = byMint.get(r.liquidityTokenMint) ?? { symbol: r.liquidityToken, supplyUsd: 0, borrowUsd: 0, markets: [] as string[] }
    e.supplyUsd += Number(r.totalSupplyUsd)
    e.markets.push(m.name)
    byMint.set(r.liquidityTokenMint, e)
  }
}
const total = [...byMint.values()].reduce((s, e) => s + e.supplyUsd, 0)
const todo = [...byMint.entries()].filter(([, e]) => e.supplyUsd >= MIN_USD).sort((a, b) => b[1].supplyUsd - a[1].supplyUsd)
console.log(`${markets.length} markets, $${(total / 1e6).toFixed(1)}M collateral-enabled, checking ${todo.length} mints`)

const rows: any[] = []
const save = () => writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), markets: markets.length, collateralUsd: total, rows }, null, 1))
let next = 0
async function worker() {
  while (next < todo.length) {
    const [mint, e] = todo[next++]
    try {
      const t = await readToken(conn, { id: e.symbol, name: e.symbol, symbol: e.symbol, kind: "Bridged", mint })
      rows.push({ mint, ...e, assessment: t.assessment, why: t.why, powers: t.powers })
      console.log(`${e.symbol.padEnd(10)} $${(e.supplyUsd / 1e6).toFixed(1).padStart(6)}M  ${t.assessment}  ${t.why ?? ""}`)
    } catch (err) {
      rows.push({ mint, ...e, error: String((err as Error).message ?? err) })
      console.log(`${e.symbol.padEnd(10)} error ${(err as Error).message}`)
    }
    save()
  }
}
await Promise.all([worker(), worker(), worker()])
save()
