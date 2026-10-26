import { useEffect, useState } from "react"
import { Connection, PublicKey } from "@solana/web3.js"
// Browser-safe SDK modules only; the JLP module needs Node's crypto.
import { decodeMultisig, decodeUpgradeAuthority, programDataAddress } from "@pexiz/sdk/src/squads"
import { decodeVenue, type Venue } from "@pexiz/sdk/src/oracle"
import { decodeVault, vaultAddresses, type VaultState } from "@pexiz/sdk/src/vault"
import { describeReasons, type FlagName } from "@pexiz/sdk/src/reasons"
import { ASSUMED_EXIT_SECS, DEVNET, VENUES, type WatchedVenue } from "./facts"

const MAINNET = import.meta.env.VITE_MAINNET_RPC ?? `${location.origin}/rpc/mainnet`
const DEVNET_RPC = import.meta.env.VITE_DEVNET_RPC ?? "https://api.devnet.solana.com"
export const mainnet = new Connection(MAINNET, "confirmed")
export const devnet = new Connection(DEVNET_RPC, "confirmed")

export type Assessment = FlagName | "unrated"

export interface BoardRow {
  venue: WatchedVenue
  live: boolean
  threshold?: number
  members?: number
  timeLockSecs?: number
  authorityMatches?: boolean
  exitWindowSecs?: number
  assessment: Assessment
  why: string
}

/**
 * The board's reading of a mainnet venue. The on-chain oracle is on devnet;
 * here the same inputs are read straight from mainnet and judged by one
 * rule: is there time to leave before an approved change can land?
 */
export function assess(v: WatchedVenue, timeLockSecs?: number): Pick<BoardRow, "assessment" | "why" | "exitWindowSecs"> {
  if (v.admin === "squads-v3") return { assessment: "red", why: "No delay: an approved change lands at once.", exitWindowSecs: -ASSUMED_EXIT_SECS }
  if (v.admin === "governance") return { assessment: "unrated", why: "Governance delay is a voting period; read per proposal." }
  if (v.admin === "dormant") return { assessment: "unrated", why: "Authority has been unused since 2024." }
  if (timeLockSecs === undefined) return { assessment: "unrated", why: "Multisig could not be read." }
  const win = timeLockSecs - ASSUMED_EXIT_SECS
  if (win <= 0) return { assessment: "red", why: "A change can land before users get out.", exitWindowSecs: win }
  if (win < 12 * 3600) return { assessment: "amber", why: "Under 12 hours to notice and leave.", exitWindowSecs: win }
  return { assessment: "green", why: "A full day's notice before any change lands.", exitWindowSecs: win }
}

function snapshotRow(v: WatchedVenue): BoardRow {
  return { venue: v, live: false, ...v.snapshot, ...assess(v, v.snapshot.timeLockSecs) }
}

export const SNAPSHOT_BOARD: BoardRow[] = VENUES.map(snapshotRow)

async function readVenue(v: WatchedVenue): Promise<BoardRow> {
  if (v.admin !== "squads-v4" || !v.multisig) return snapshotRow(v)
  const [ms, pd] = await mainnet.getMultipleAccountsInfo([new PublicKey(v.multisig), programDataAddress(new PublicKey(v.program))])
  if (!ms || !pd) return snapshotRow(v)
  const m = decodeMultisig(Buffer.from(ms.data))
  const auth = decodeUpgradeAuthority(Buffer.from(pd.data))
  return {
    venue: v,
    live: true,
    threshold: m.threshold,
    members: m.members.length,
    timeLockSecs: m.timeLock,
    authorityMatches: auth?.toBase58() === v.authority,
    ...assess(v, m.timeLock),
  }
}

export function useBoard() {
  const [rows, setRows] = useState<BoardRow[] | null>(null)
  const [readAt, setReadAt] = useState<number | null>(null)
  useEffect(() => {
    let on = true
    Promise.all(VENUES.map((v) => readVenue(v).catch(() => snapshotRow(v)))).then((r) => {
      if (!on) return
      setRows(r)
      setReadAt(Date.now())
    })
    return () => { on = false }
  }, [])
  return { rows, readAt }
}

export interface Canary {
  venue: Venue
  vault: VaultState
  vaultUsdc: number
  vaultLp: number
  reasons: string[]
  readAt: number
}

async function readCanary(): Promise<Canary> {
  const venueKey = new PublicKey(DEVNET.venue)
  const addrs = vaultAddresses(venueKey, new PublicKey(DEVNET.usdcMint))
  const [venueAcc, vaultAcc] = await devnet.getMultipleAccountsInfo([venueKey, addrs.vault])
  if (!venueAcc || !vaultAcc) throw new Error("devnet accounts missing")
  const venue = decodeVenue(Buffer.from(venueAcc.data), venueKey)
  const vault = decodeVault(Buffer.from(vaultAcc.data))
  const bal = async (k: PublicKey) => {
    try {
      return Number((await devnet.getTokenAccountBalance(k)).value.uiAmount ?? 0)
    } catch {
      return 0
    }
  }
  const [vaultUsdc, vaultLp] = await Promise.all([bal(addrs.vaultUsdc), bal(addrs.vaultLp)])
  return { venue, vault, vaultUsdc, vaultLp, reasons: describeReasons(venue.reasons), readAt: Date.now() }
}

export function useCanary(pollMs = 20_000) {
  const [data, setData] = useState<Canary | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let on = true
    const tick = () =>
      readCanary()
        .then((d) => { if (on) { setData(d); setError(null) } })
        .catch((e) => { if (on) setError(String(e?.message ?? e)) })
    tick()
    const t = setInterval(tick, pollMs)
    return () => { on = false; clearInterval(t) }
  }, [pollMs])
  return { data, error }
}
