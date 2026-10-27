import { useCallback, useEffect, useMemo, useState } from "react"
import { PublicKey, type TransactionInstruction } from "@solana/web3.js"
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token"
import { decodeVenue, type Venue } from "@pexiz/sdk/src/oracle"
import { addLiquidityIx, canaryPool } from "@pexiz/sdk/src/canary"
import { decodeGuard, exitAuthority, guardPda, protectCanaryIxs, unprotectIxs, type GuardState } from "@pexiz/sdk/src/exit"
import { DEVNET } from "./facts"
import { devnet } from "./chain"

const UNIT = 1_000_000
export const pool = canaryPool(new PublicKey(DEVNET.usdcMint))
export const fastVenue = new PublicKey(DEVNET.fastVenue)

export interface Wallet {
  sol: number
  usdc: number
  lp: number
  /** LP the exit program may take: the delegation, up to what is held. */
  guarded: number
  guard: GuardState | null
}

export interface ProtectView {
  venue: Venue
  wallet: Wallet | null
  readAt: number
}

/** SPL token account: amount at 64, delegate COption at 72, delegated amount at 121. */
function token(data: Buffer | undefined) {
  if (!data) return { amount: 0, delegate: null as string | null, delegated: 0 }
  const delegate = data.readUInt32LE(72) === 1 ? new PublicKey(data.subarray(76, 108)).toBase58() : null
  return { amount: Number(data.readBigUInt64LE(64)) / UNIT, delegate, delegated: Number(data.readBigUInt64LE(121)) / UNIT }
}

export function accountsOf(owner: PublicKey) {
  return {
    usdc: getAssociatedTokenAddressSync(pool.usdcMint, owner),
    lp: getAssociatedTokenAddressSync(pool.lpMint, owner),
    guard: guardPda(owner, pool.lpMint),
  }
}

async function read(owner: PublicKey | null): Promise<ProtectView> {
  const a = owner ? accountsOf(owner) : null
  const keys = a ? [fastVenue, a.usdc, a.lp, a.guard] : [fastVenue]
  const [infos, sol] = await Promise.all([devnet.getMultipleAccountsInfo(keys), owner ? devnet.getBalance(owner) : Promise.resolve(0)])
  const [venueAcc, usdcAcc, lpAcc, guardAcc] = infos
  if (!venueAcc) throw new Error("Fast canary not found on devnet")
  const venue = decodeVenue(Buffer.from(venueAcc.data), fastVenue)
  let wallet: Wallet | null = null
  if (a) {
    const lp = token(lpAcc ? Buffer.from(lpAcc.data) : undefined)
    const guard = guardAcc ? decodeGuard(Buffer.from(guardAcc.data)) : null
    const ours = lp.delegate === exitAuthority().toBase58()
    wallet = {
      sol: sol / 1e9,
      usdc: token(usdcAcc ? Buffer.from(usdcAcc.data) : undefined).amount,
      lp: lp.amount,
      guarded: guard && ours ? Math.min(lp.delegated, lp.amount) : 0,
      guard,
    }
  }
  return { venue, wallet, readAt: Date.now() }
}

/** Live view of the fast canary and, with a wallet, what it holds and guards. */
export function useProtect(owner: PublicKey | null, pollMs = 5_000) {
  const [data, setData] = useState<(ProtectView & { owner: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const key = owner?.toBase58() ?? ""
  const refresh = useCallback(() => setTick((t) => t + 1), [])
  useEffect(() => {
    let on = true
    const run = () =>
      read(key ? new PublicKey(key) : null)
        .then((d) => { if (on) { setData({ ...d, owner: key }); setError(null) } })
        .catch((e) => { if (on) setError(String(e?.message ?? e)) })
    run()
    const t = setInterval(run, pollMs)
    return () => { on = false; clearInterval(t) }
  }, [key, pollMs, tick])
  const view = useMemo<ProtectView | null>(() => (data && data.owner !== key ? { ...data, wallet: null } : data), [data, key])
  return { data: view, error, refresh }
}

const units = (x: number) => BigInt(Math.floor(x * UNIT))

/** USDC into the canary pool; the LP lands in the holder's own wallet. */
export async function buildAddLiquidity(owner: PublicKey, usdc: number): Promise<TransactionInstruction[]> {
  const a = accountsOf(owner)
  return [
    createAssociatedTokenAccountIdempotentInstruction(owner, a.lp, owner, pool.lpMint),
    await addLiquidityIx(pool, { user: owner, userUsdc: a.usdc, userLp: a.lp }, units(usdc)),
  ]
}

/** One signature: approve the exit program for `lp` and, the first time, open the guard. */
export async function buildProtect(owner: PublicKey, lp: number, hasGuard: boolean): Promise<TransactionInstruction[]> {
  const a = accountsOf(owner)
  const [approve, guard] = await protectCanaryIxs(owner, fastVenue, pool, a.lp, a.usdc, units(lp))
  return hasGuard ? [approve] : [approve, guard]
}

export async function buildUnprotect(owner: PublicKey): Promise<TransactionInstruction[]> {
  const a = accountsOf(owner)
  return unprotectIxs(owner, pool.lpMint, a.lp)
}

export type StepKey = "propose" | "timelock" | "cut" | "exit" | "restore" | "clear"
export interface DemoStep { key: StepKey; at?: number; until?: number; signatures: string[]; detail?: string }
export interface DemoRun { id: number; startedAt: number; finishedAt?: number; error?: string; steps: DemoStep[] }

/** The server's live attack: the run in progress, or the last one. */
export function useDemo() {
  const [state, setState] = useState<{ running: DemoRun | null; last: DemoRun | null } | null>(null)
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick((t) => t + 1), [])
  useEffect(() => {
    let on = true
    const run = () => fetch("/api/demo").then((r) => r.json()).then((j) => { if (on) setState(j) }).catch(() => {})
    run()
    const t = setInterval(run, state?.running ? 2_000 : 10_000)
    return () => { on = false; clearInterval(t) }
  }, [tick, !!state?.running])
  const start = useCallback(async (): Promise<string | null> => {
    const r = await fetch("/api/demo", { method: "POST" })
    const j = await r.json().catch(() => ({}))
    refresh()
    return r.ok ? null : (j.error ?? "The attack could not start.")
  }, [refresh])
  return { state, start, refresh }
}
