import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { useWallet } from "@solana/wallet-adapter-react"
import { PublicKey, type TransactionInstruction } from "@solana/web3.js"
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token"
import { decodeVenue, type Venue } from "@pexiz/sdk/src/oracle"
import { decodeVault, depositIx, reenterIx, unvoteIx, vaultAddresses, voteReenterIx, votePda, withdrawIx, type VaultState } from "@pexiz/sdk/src/vault"
import { describeReasons } from "@pexiz/sdk/src/reasons"
import { DEVNET } from "./facts"
import { devnet } from "./chain"

const UNIT = 1_000_000
export const AUM_CAP = 10_000_000

export const canary = vaultAddresses(new PublicKey(DEVNET.venue), new PublicKey(DEVNET.usdcMint))

export interface Holder {
  sol: number
  usdc: number
  lp: number
  shares: number
  /** Shares escrowed as a re-entry vote. */
  voted: number
  voteCounts: boolean
}

export interface VaultView {
  venue: Venue
  vault: VaultState
  reasons: string[]
  /** USDC and LP held by the vault; the canary LP is minted 1:1 with USDC. */
  usdc: number
  lp: number
  nav: number
  supply: number
  pricePerShare: number
  holder: Holder | null
  readAt: number
}

const amount = (info: { data: Buffer } | null) => (info ? Number(info.data.readBigUInt64LE(64)) / UNIT : 0)
const mintSupply = (info: { data: Buffer } | null) => (info ? Number(info.data.readBigUInt64LE(36)) / UNIT : 0)

export function userAccounts(owner: PublicKey) {
  return {
    usdc: getAssociatedTokenAddressSync(canary.pool.usdcMint, owner),
    lp: getAssociatedTokenAddressSync(canary.pool.lpMint, owner),
    shares: getAssociatedTokenAddressSync(canary.shareMint, owner),
    vote: votePda(canary.vault, owner),
  }
}

async function read(owner: PublicKey | null): Promise<VaultView> {
  const base = [canary.venue, canary.vault, canary.vaultUsdc, canary.vaultLp, canary.shareMint]
  const u = owner ? userAccounts(owner) : null
  const keys = u ? [...base, u.usdc, u.lp, u.shares, u.vote] : base
  const [infos, sol] = await Promise.all([
    devnet.getMultipleAccountsInfo(keys),
    owner ? devnet.getBalance(owner) : Promise.resolve(0),
  ])
  const [venueAcc, vaultAcc, vUsdc, vLp, shareMint, ...mine] = infos as ({ data: Buffer } | null)[]
  if (!venueAcc || !vaultAcc) throw new Error("Vault accounts not found on devnet")
  const venue = decodeVenue(Buffer.from(venueAcc.data), canary.venue)
  const vault = decodeVault(Buffer.from(vaultAcc.data))
  const usdc = amount(vUsdc)
  const lp = amount(vLp)
  const supply = mintSupply(shareMint)
  const nav = usdc + lp
  let holder: Holder | null = null
  if (u) {
    const [uUsdc, uLp, uShares, voteAcc] = mine
    // VoteRecord: disc 8, vault 32, voter 32, round u32, shares u64, counted u64.
    const round = voteAcc ? voteAcc.data.readUInt32LE(72) : 0
    const voted = voteAcc ? Number(voteAcc.data.readBigUInt64LE(76)) / UNIT : 0
    const counted = voteAcc ? Number(voteAcc.data.readBigUInt64LE(84)) / UNIT : 0
    holder = {
      sol: sol / 1e9,
      usdc: amount(uUsdc),
      lp: amount(uLp),
      shares: amount(uShares),
      voted,
      voteCounts: counted > 0 && round === vault.exits && vault.exited,
    }
  }
  return {
    venue, vault, reasons: describeReasons(venue.reasons), usdc, lp, nav, supply,
    pricePerShare: supply > 0 ? nav / supply : 1, holder, readAt: Date.now(),
  }
}

/** Live view of the canary vault and, when a wallet is connected, its holdings. */
function useVaultQuery(owner: PublicKey | null, pollMs = 15_000) {
  const [data, setData] = useState<(VaultView & { owner: string }) | null>(null)
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
  // A wallet switch must never show the previous wallet's holdings.
  const view = useMemo<VaultView | null>(() => (data && data.owner !== key ? { ...data, holder: null } : data), [data, key])
  return { data: view, error, refresh }
}

type VaultQuery = ReturnType<typeof useVaultQuery>
const VaultCtx = createContext<VaultQuery | null>(null)

/** One poller for the whole app, keyed to the connected wallet. */
export function VaultProvider({ children }: { children: ReactNode }) {
  const { publicKey } = useWallet()
  return createElement(VaultCtx.Provider, { value: useVaultQuery(publicKey) }, children)
}

export function useVault(): VaultQuery {
  const c = useContext(VaultCtx)
  if (!c) throw new Error("VaultProvider missing")
  return c
}

const toUnits = (x: number) => BigInt(Math.floor(x * UNIT))

export async function buildDeposit(owner: PublicKey, usdc: number): Promise<TransactionInstruction[]> {
  const u = userAccounts(owner)
  return [
    createAssociatedTokenAccountIdempotentInstruction(owner, u.shares, owner, canary.shareMint),
    await depositIx(canary, owner, u.usdc, u.shares, toUnits(usdc)),
  ]
}

export async function buildWithdraw(owner: PublicKey, shares: number): Promise<TransactionInstruction[]> {
  const u = userAccounts(owner)
  return [
    createAssociatedTokenAccountIdempotentInstruction(owner, u.usdc, owner, canary.pool.usdcMint),
    createAssociatedTokenAccountIdempotentInstruction(owner, u.lp, owner, canary.pool.lpMint),
    await withdrawIx(canary, owner, { userShares: u.shares, userUsdc: u.usdc, userLp: u.lp }, toUnits(shares)),
  ]
}

export async function buildVote(owner: PublicKey, shares: number) {
  return [await voteReenterIx(canary, owner, userAccounts(owner).shares, toUnits(shares))]
}

export async function buildUnvote(owner: PublicKey) {
  return [await unvoteIx(canary, owner, userAccounts(owner).shares)]
}

export async function buildReenter() {
  return [await reenterIx(canary)]
}
