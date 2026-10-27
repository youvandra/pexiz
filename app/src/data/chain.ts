import { useEffect, useState } from "react"
import { Connection, PublicKey } from "@solana/web3.js"
// SDK subpaths, so the app pulls in only what it reads.
import { decodeMultisig, decodeUpgradeAuthority, programDataAddress, vaultPda } from "@pexiz/sdk/src/squads"
import { findPendingUpgrades } from "@pexiz/sdk/src/upgrades"
import { decodeVenue, type Venue } from "@pexiz/sdk/src/oracle"
import { decodeVault, vaultAddresses, type VaultState } from "@pexiz/sdk/src/vault"
import { describeReasons } from "@pexiz/sdk/src/reasons"
import { DEVNET, VENUES, type WatchedVenue } from "./facts"
import { assess, type Assessment, type PendingUpgrade } from "./assess"
import { loadWatch, type WatchedState } from "./watch"

export { assess }

const MAINNET = import.meta.env.VITE_MAINNET_RPC ?? `${location.origin}/rpc/mainnet`
const DEVNET_RPC = import.meta.env.VITE_DEVNET_RPC ?? "https://api.devnet.solana.com"
export const mainnet = new Connection(MAINNET, "confirmed")
export const devnet = new Connection(DEVNET_RPC, "confirmed")

export type { Assessment, PendingUpgrade } from "./assess"

export interface BoardRow {
  venue: WatchedVenue
  live: boolean
  threshold?: number
  members?: number
  memberKeys?: string[]
  /** Squads transactions created so far: the multisig's activity count. */
  txIndex?: number
  timeLockSecs?: number
  authorityMatches?: boolean
  exitWindowSecs?: number
  /** Approved proposals that would upgrade the program, oldest first. */
  pendingUpgrades?: PendingUpgrade[]
  assessment: Assessment
  why: string
}

function snapshotRow(v: WatchedVenue): BoardRow {
  return { venue: v, live: false, ...v.snapshot, ...assess(v, v.snapshot.timeLockSecs) }
}


async function readVenue(v: WatchedVenue): Promise<BoardRow> {
  if (v.admin !== "squads-v4" || !v.multisig) return snapshotRow(v)
  const [ms, pd] = await mainnet.getMultipleAccountsInfo([new PublicKey(v.multisig), programDataAddress(new PublicKey(v.program))])
  if (!ms || !pd) return snapshotRow(v)
  const m = decodeMultisig(Buffer.from(ms.data))
  const auth = decodeUpgradeAuthority(Buffer.from(pd.data))
  const multisig = new PublicKey(v.multisig)
  const vaultIndex = [0, 1, 2, 3].find((i) => vaultPda(multisig, i)[0].toBase58() === v.authority) ?? 0
  // No catch: a failed lookup must not read as "no upgrade queued".
  const found = await findPendingUpgrades(mainnet, multisig, m.transactionIndex, vaultIndex, programDataAddress(new PublicKey(v.program)), 12)
  const pendingUpgrades = found.map((p) => ({ index: p.index, approvedAt: p.approvedAt, readyAt: p.approvedAt !== undefined ? p.approvedAt + m.timeLock : undefined }))
  return {
    venue: v,
    live: true,
    threshold: m.threshold,
    members: m.members.length,
    memberKeys: m.members.map((x) => x.key.toBase58()),
    txIndex: Number(m.transactionIndex),
    timeLockSecs: m.timeLock,
    authorityMatches: auth?.toBase58() === v.authority,
    pendingUpgrades,
    ...assess(v, m.timeLock, pendingUpgrades, { threshold: m.threshold, authorityMatches: auth?.toBase58() === v.authority }),
  }
}

// One board read shared by every page, kept for a minute, so moving between
// pages never re-reads mainnet or waits on it again.
const BOARD_TTL_MS = 60_000
let board: { rows: BoardRow[]; at: number } | null = null
let boardInflight: Promise<{ rows: BoardRow[]; at: number }> | null = null

/**
 * A live read that failed or ran out of time. A multisig venue we could not
 * read is shown as unread, never as its old snapshot: an old Safe would hide a
 * change made since.
 */
function unreadRow(v: WatchedVenue): BoardRow {
  if (v.admin !== "squads-v4") return snapshotRow(v)
  return { ...snapshotRow(v), assessment: "unrated", why: "Could not be read from chain just now. Try again in a minute.", exitWindowSecs: undefined }
}

/** A row from the watcher's last read, which also covers signers' durable nonces. */
function watchedRow(v: WatchedVenue, s: WatchedState): BoardRow {
  return {
    venue: v,
    live: s.ok,
    threshold: s.threshold,
    members: s.members?.length,
    memberKeys: s.members,
    txIndex: s.txIndex,
    timeLockSecs: s.timeLockSecs,
    authorityMatches: s.authority === undefined ? undefined : s.authority === v.authority,
    exitWindowSecs: s.exitWindowSecs,
    pendingUpgrades: s.pendingUpgrades?.map((p) => ({ ...p, index: BigInt(p.index) })),
    assessment: s.assessment,
    why: s.why,
  }
}

async function fromWatcher(): Promise<{ rows: BoardRow[]; at: number } | null> {
  const w = await loadWatch()
  if (!w) return null
  const states = new Map(w.venues.map((s) => [s.venue, s]))
  const rows = VENUES.map((v) => {
    const s = states.get(v.id)
    return s ? watchedRow(v, s) : unreadRow(v)
  })
  return { rows, at: (w.lastPass ?? Math.max(...w.venues.map((s) => s.readAt))) * 1000 }
}

function loadBoard() {
  if (board && Date.now() - board.at < BOARD_TTL_MS) return Promise.resolve(board)
  // Two venues at a time keeps the public RPC under its rate limit; a venue
  // that takes longer than 12s is shown as unread rather than holding the page.
  const timed = (v: WatchedVenue) =>
    Promise.race([readVenue(v), new Promise<BoardRow>((ok) => setTimeout(() => ok(unreadRow(v)), 12_000))]).catch(() => unreadRow(v))
  const run = async () => {
    const rows: BoardRow[] = new Array(VENUES.length)
    let next = 0
    const worker = async () => {
      while (next < VENUES.length) {
        const i = next++
        rows[i] = await timed(VENUES[i])
      }
    }
    await Promise.all([worker(), worker()])
    return rows
  }
  boardInflight ??= fromWatcher()
    .then(async (w) => w ?? { rows: await run(), at: Date.now() })
    .then((b) => (board = b))
    .finally(() => { boardInflight = null })
  return boardInflight
}

export function useBoard() {
  const [state, setState] = useState(board)
  useEffect(() => {
    let on = true
    loadBoard().then((b) => { if (on) setState(b) })
    return () => { on = false }
  }, [])
  return { rows: state?.rows ?? null, readAt: state?.at ?? null }
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
