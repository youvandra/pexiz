// Quick pass over Kamino collateral: decode each mint's authorities and say
// what kind of account holds each one, without tracing further. Two batched
// RPC reads, so it runs on the public endpoint in seconds. collateral.ts does
// the full trace, one token at a time.
//
//   PEXIZ_MAINNET_RPC_URL=https://api.mainnet-beta.solana.com bun run scripts/measure/collateral-quick.ts in.json out.json
import { Connection, PublicKey } from "@solana/web3.js"
import { readFileSync, writeFileSync } from "node:fs"
import { decodeMint } from "../../app/server/watch/token"
import { decodeMultisig } from "@pexiz/sdk/src/squads"

const SQUADS_V4 = "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf"
const SQUADS_V3 = "SMPLecH534NA9acpos4G6x7uf3LWbCAwZQE9e8ZekMu"
const SYSTEM = "11111111111111111111111111111111"
const conn = new Connection(process.env.PEXIZ_MAINNET_RPC_URL ?? "https://api.mainnet-beta.solana.com", "confirmed")
const [input, output] = process.argv.slice(2)

const { rows } = JSON.parse(readFileSync(input, "utf8")) as { rows: { symbol: string; mint: string; supplyUsd: number; market: string }[] }
const byMint = new Map<string, { symbol: string; supplyUsd: number; markets: string[] }>()
for (const r of rows as any[]) {
  if (r.maxLtv <= 0) continue
  const e = byMint.get(r.mint) ?? { symbol: r.symbol, supplyUsd: 0, markets: [] as string[] }
  e.supplyUsd += r.supplyUsd
  e.markets.push(r.market)
  byMint.set(r.mint, e)
}

async function many(keys: string[]) {
  const out = []
  for (let i = 0; i < keys.length; i += 100) out.push(...(await conn.getMultipleAccountsInfo(keys.slice(i, i + 100).map((k) => new PublicKey(k)))))
  return out
}

const mints = [...byMint.keys()]
const mintInfos = await many(mints)
const decoded = mints.map((m, i) => (mintInfos[i] ? decodeMint(m, mintInfos[i]!.owner.toBase58(), Buffer.from(mintInfos[i]!.data)) : null))
const holders = [...new Set(decoded.flatMap((d) => d?.authorities.map((a) => a.key) ?? []))]
const holderInfos = new Map(holders.map((k, i) => [k, null as any]))
const hi = await many(holders)
holders.forEach((k, i) => holderInfos.set(k, hi[i]))

const TOKEN_PROGRAMS = new Set(["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"])

/** wait: seconds a change waits; null when the holder is a program and needs a trace. */
function holderKind(key: string): { kind: string; wait: number | null } {
  const info = holderInfos.get(key)
  const owner = info?.owner.toBase58()
  // An off-curve key has no private key: a program signs for it.
  if (!PublicKey.isOnCurve(new PublicKey(key).toBytes())) return { kind: "PDA (a program decides)", wait: null }
  if (!info || owner === SYSTEM) return { kind: "one wallet", wait: 0 }
  if (TOKEN_PROGRAMS.has(owner!) && info.data.length === 355) {
    return { kind: `SPL token multisig ${info.data[0]}/${info.data[1]}`, wait: 0 }
  }
  if (owner === SQUADS_V4) {
    const m = decodeMultisig(Buffer.from(info.data))
    return { kind: `Squads v4 ${m.threshold}/${m.members.length}`, wait: m.timeLock }
  }
  if (owner === SQUADS_V3) return { kind: "Squads v3 (no timelock)", wait: 0 }
  return { kind: `program-owned (${owner.slice(0, 8)})`, wait: null }
}

const SEVERE = new Set(["permanent-delegate", "mint", "freeze", "pause", "transfer-hook"])
const result = mints.map((mint, i) => {
  const e = byMint.get(mint)!
  const d = decoded[i]
  const powers = (d?.authorities ?? []).filter((a) => SEVERE.has(a.role)).map((a) => ({ role: a.role, key: a.key, ...holderKind(a.key) }))
  return { mint, ...e, tokenProgram: d?.tokenProgram, powers }
}).sort((a, b) => b.supplyUsd - a.supplyUsd)
writeFileSync(output, JSON.stringify({ at: new Date().toISOString(), rows: result }, null, 1))

const usd = (x: number) => `$${(x / 1e6).toFixed(1)}M`
const total = result.reduce((s, r) => s + r.supplyUsd, 0)
const none = result.filter((r) => r.powers.length === 0)
const direct = result.filter((r) => r.powers.some((p) => p.wait === 0))
const wallet = result.filter((r) => r.powers.some((p) => p.kind === "one wallet"))
const prog = result.filter((r) => !direct.includes(r) && r.powers.some((p) => p.wait === null))
console.log(`collateral ${usd(total)} in ${result.length} mints`)
console.log(`no mint/freeze/move/pause key: ${usd(none.reduce((s, r) => s + r.supplyUsd, 0))} (${none.length})`)
console.log(`a key that acts with no delay (wallet, token multisig, Squads v3, or v4 with 0 timelock): ${usd(direct.reduce((s, r) => s + r.supplyUsd, 0))} (${direct.length})`)
console.log(`  of which one wallet alone: ${usd(wallet.reduce((s, r) => s + r.supplyUsd, 0))} (${wallet.length})`)
const delayed = result.filter((r) => r.powers.length && !direct.includes(r) && r.powers.every((p) => p.wait !== null))
console.log(`every key waits: ${usd(delayed.reduce((s, r) => s + r.supplyUsd, 0))} (${delayed.length})`)
console.log(`held by a program (needs a trace): ${usd(prog.reduce((s, r) => s + r.supplyUsd, 0))} (${prog.length})`)
for (const r of result.slice(0, 45)) console.log(`${r.symbol.padEnd(10)} ${usd(r.supplyUsd).padStart(8)}  ${r.powers.map((p) => `${p.role}:${p.kind}${p.wait ? ` ${p.wait}s` : ""}`).join(", ") || "none"}`)
