import { useEffect, useState } from "react"
import type { ParsedTransactionWithMeta, PublicKey } from "@solana/web3.js"
import { parseFlagChanged } from "@pexiz/sdk/src/oracle"
import { parseVaultExited } from "@pexiz/sdk/src/vault"
import { reasonNames, type FlagName } from "@pexiz/sdk/src/reasons"
import { devnet } from "./chain"
import { canary } from "./vault"

export type EventKind = "deposit" | "withdraw" | "exit" | "flag" | "vote" | "unvote" | "reenter" | "check"

export interface ActivityEvent {
  sig: string
  at: number
  kind: EventKind
  who: string
  /** USDC moved, when the event moves money. */
  usdc?: number
  lp?: number
  from?: FlagName
  to?: FlagName
  reasons?: string[]
  failed: boolean
}

function ownerDelta(tx: ParsedTransactionWithMeta, owner: string, mint: string): number {
  type Bal = NonNullable<NonNullable<ParsedTransactionWithMeta["meta"]>["postTokenBalances"]>
  const sum = (bs: Bal | null | undefined) =>
    (bs ?? [])
      .filter((b) => b.owner === owner && b.mint === mint)
      .reduce((a, b) => a + (b.uiTokenAmount.uiAmount ?? 0), 0)
  return sum(tx.meta?.postTokenBalances) - sum(tx.meta?.preTokenBalances)
}

function classify(sig: string, tx: ParsedTransactionWithMeta): ActivityEvent[] {
  const logs = tx.meta?.logMessages ?? []
  const who = tx.transaction.message.accountKeys[0].pubkey.toBase58()
  const base = { sig, at: (tx.blockTime ?? 0) * 1000, who, failed: !!tx.meta?.err }
  const out: ActivityEvent[] = []
  const has = (name: string) => logs.some((l) => l === `Program log: Instruction: ${name}`)
  const usdcMint = canary.pool.usdcMint.toBase58()
  const lpMint = canary.pool.lpMint.toBase58()

  for (const f of base.failed ? [] : parseFlagChanged(logs)) {
    out.push({ ...base, kind: "flag", from: f.from, to: f.to, reasons: reasonNames(f.reasons), at: f.unixTimestamp * 1000 || base.at })
  }
  for (const e of base.failed ? [] : parseVaultExited(logs)) {
    out.push({ ...base, kind: "exit", lp: Number(e.lpRedeemed) / 1e6, usdc: Number(e.usdcOut) / 1e6 })
  }
  if (has("Deposit")) out.push({ ...base, kind: "deposit", usdc: -ownerDelta(tx, who, usdcMint) })
  if (has("Withdraw")) out.push({ ...base, kind: "withdraw", usdc: ownerDelta(tx, who, usdcMint), lp: ownerDelta(tx, who, lpMint) })
  if (has("VoteReenter")) out.push({ ...base, kind: "vote" })
  if (has("Unvote")) out.push({ ...base, kind: "unvote" })
  if (has("Reenter")) out.push({ ...base, kind: "reenter" })
  if (!out.length && has("Update")) out.push({ ...base, kind: "check" })
  return out
}

// Parsed transactions never change; keep them so each poll fetches only new ones.
const txCache = new Map<string, ParsedTransactionWithMeta | null>()
let inflight: Promise<ActivityEvent[]> | null = null
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fetchMissing(sigs: string[]) {
  const missing = sigs.filter((s) => !txCache.has(s))
  // Small batches: the public devnet RPC rate-limits large ones.
  for (let i = 0; i < missing.length; i += 5) {
    const part = missing.slice(i, i + 5)
    const txs = await devnet.getParsedTransactions(part, { maxSupportedTransactionVersion: 0 })
    part.forEach((s, k) => txCache.set(s, txs[k]))
    if (i + 5 < missing.length) await pause(250)
  }
}

async function load(limit: number): Promise<ActivityEvent[]> {
  const sources = [canary.vault, canary.venue]
  const lists = await Promise.all(sources.map((a) => devnet.getSignaturesForAddress(a, { limit })))
  const seen = new Set<string>()
  const sigs = lists.flat().filter((s) => (seen.has(s.signature) ? false : (seen.add(s.signature), true)))
  sigs.sort((a, b) => (b.blockTime ?? 0) - (a.blockTime ?? 0))
  const top = sigs.slice(0, limit).map((s) => s.signature)
  await fetchMissing(top)
  return top.flatMap((sig) => {
    const tx = txCache.get(sig)
    return tx ? classify(sig, tx) : []
  }).sort((a, b) => b.at - a.at)
}

/** One request at a time across every component that shows activity. */
function loadShared(limit: number) {
  inflight ??= load(limit).finally(() => { inflight = null })
  return inflight
}

/** Vault and oracle history for the canary venue, newest first. */
export function useActivity(limit = 40, pollMs = 30_000) {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let on = true
    const run = () =>
      loadShared(limit)
        .then((e) => { if (on) { setEvents(e); setError(null) } })
        .catch((e) => { if (on) setError(String(e?.message ?? e)) })
    run()
    const t = setInterval(run, pollMs)
    return () => { on = false; clearInterval(t) }
  }, [limit, pollMs])
  return { events, error }
}

export const mine = (events: ActivityEvent[] | null, owner: PublicKey | null) =>
  owner && events ? events.filter((e) => e.who === owner.toBase58()) : null

