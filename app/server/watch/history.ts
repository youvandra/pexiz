// What a Squads v4 multisig has done to itself and to the program it guards,
// read back from its own transaction accounts.
//
// Every executed config transaction (signers, approvals, delay) and every
// executed vault transaction that upgrades, re-authorises or closes the
// program becomes one event, stamped with the time its proposal was executed.
// Squads lets a multisig close old transaction accounts for rent, so what was
// closed is gone from here; the live diff covers everything from the day the
// watcher starts.
import { createHash } from "node:crypto"
import { Connection, PublicKey } from "@solana/web3.js"
import { programDataAddress } from "@pexiz/sdk/src/squads"
import { ProposalStatus, decodeProposal, decodeVaultTx, proposalPda, transactionPda } from "@pexiz/sdk/src/upgrades"
import { duration } from "../../src/lib/format"
import { short, type WatchEvent } from "./types"

const disc = (name: string) => createHash("sha256").update(`account:${name}`).digest().subarray(0, 8)
export const CONFIG_TX_DISCRIMINATOR = disc("ConfigTransaction")

const BPF_LOADER = "BPFLoaderUpgradeab1e11111111111111111111111"

export type ConfigAction =
  | { kind: "add-member"; key: string }
  | { kind: "remove-member"; key: string }
  | { kind: "threshold"; value: number }
  | { kind: "time-lock"; value: number }
  | { kind: "spending-limit-added" }
  | { kind: "spending-limit-removed" }
  | { kind: "rent-collector" }

/**
 * The actions of a ConfigTransaction: discriminator, multisig, creator, index
 * u64, bump u8, then a Vec<ConfigAction>. Returns null for any other account;
 * an action it cannot read ends the list rather than guessing at the rest.
 */
export function decodeConfigTx(data: Buffer): ConfigAction[] | null {
  if (data.length < 8 + 32 + 32 + 8 + 1 + 4 || !data.subarray(0, 8).equals(CONFIG_TX_DISCRIMINATOR)) return null
  let o = 8 + 32 + 32 + 8 + 1
  const n = data.readUInt32LE(o)
  o += 4
  const key = () => {
    const k = new PublicKey(data.subarray(o, o + 32)).toBase58()
    o += 32
    return k
  }
  const out: ConfigAction[] = []
  try {
    for (let i = 0; i < n; i++) {
      const tag = data[o++]
      if (tag === 0) {
        out.push({ kind: "add-member", key: key() })
        o += 1 // permissions
      } else if (tag === 1) out.push({ kind: "remove-member", key: key() })
      else if (tag === 2) {
        out.push({ kind: "threshold", value: data.readUInt16LE(o) })
        o += 2
      } else if (tag === 3) {
        out.push({ kind: "time-lock", value: data.readUInt32LE(o) })
        o += 4
      } else if (tag === 4) {
        // create_key, vault_index u8, mint, amount u64, period u8, members, destinations
        o += 32 + 1 + 32 + 8 + 1
        o += 4 + data.readUInt32LE(o) * 32
        o += 4 + data.readUInt32LE(o) * 32
        out.push({ kind: "spending-limit-added" })
      } else if (tag === 5) {
        o += 32
        out.push({ kind: "spending-limit-removed" })
      } else if (tag === 6) {
        o += data[o] === 1 ? 33 : 1
        out.push({ kind: "rent-collector" })
      } else break
    }
  } catch {
    // A short account: keep what was read.
  }
  return out
}

/** How a config action reads to an LP, and whether it weakens the setup. */
export function describeAction(a: ConfigAction, ctx: { prevTimeLock?: number; prevThreshold?: number }): Pick<WatchEvent, "kind" | "title" | "tone"> {
  switch (a.kind) {
    case "add-member":
      return { kind: "signer-added", title: `Signer added: ${short(a.key)}`, tone: "info" }
    case "remove-member":
      return { kind: "signer-removed", title: `Signer removed: ${short(a.key)}`, tone: "info" }
    case "threshold": {
      const was = ctx.prevThreshold
      return {
        kind: "threshold",
        title: was !== undefined ? `Approvals needed: ${was} → ${a.value}` : `Approvals needed set to ${a.value}`,
        tone: was !== undefined && a.value < was ? "bad" : "info",
      }
    }
    case "time-lock": {
      const was = ctx.prevTimeLock
      const fmt = (s: number) => (s ? duration(s) : "none")
      return {
        kind: "time-lock",
        title: was !== undefined ? `Change delay: ${fmt(was)} → ${fmt(a.value)}` : `Change delay set to ${fmt(a.value)}`,
        tone: was !== undefined && a.value < was ? "bad" : a.value === 0 ? "bad" : "info",
      }
    }
    case "spending-limit-added":
      return { kind: "spending-limit", title: "Spending limit added", tone: "info" }
    case "spending-limit-removed":
      return { kind: "spending-limit", title: "Spending limit removed", tone: "info" }
    case "rent-collector":
      return { kind: "config", title: "Rent collector changed", tone: "info" }
  }
}

const LOADER_TITLES: Record<number, Pick<WatchEvent, "kind" | "title" | "tone">> = {
  3: { kind: "upgrade", title: "Program upgraded", tone: "info" },
  4: { kind: "authority", title: "Upgrade authority handed to another key", tone: "bad" },
  5: { kind: "authority", title: "Program closed", tone: "bad" },
  7: { kind: "authority", title: "Upgrade authority handed to another key", tone: "bad" },
}

export interface HistoryVenue {
  id: string
  multisig: string
  program: string
}

/**
 * Events from transactions `from`..`to` (inclusive) that were executed.
 * Approved but unexecuted ones are left for a later scan to pick up.
 */
export async function readHistory(conn: Connection, v: HistoryVenue, from: bigint, to: bigint, opts: { batch?: number; pauseMs?: number } = {}): Promise<WatchEvent[]> {
  const ms = new PublicKey(v.multisig)
  const programData = programDataAddress(new PublicKey(v.program))
  const batch = opts.batch ?? 50
  const found: { index: bigint; at: number; actions: ConfigAction[] | null; loaderTags: number[] }[] = []
  for (let start = from; start <= to; start += BigInt(batch)) {
    const idx: bigint[] = []
    for (let i = start; i <= to && i < start + BigInt(batch); i++) idx.push(i)
    const [txs, props] = await Promise.all([
      conn.getMultipleAccountsInfo(idx.map((i) => transactionPda(ms, i))),
      conn.getMultipleAccountsInfo(idx.map((i) => proposalPda(ms, i))),
    ])
    idx.forEach((index, k) => {
      const tx = txs[k]
      const p = props[k] ? decodeProposal(Buffer.from(props[k]!.data)) : null
      if (!tx || !p || p.status !== ProposalStatus.Executed || p.timestamp === undefined) return
      const data = Buffer.from(tx.data)
      const actions = decodeConfigTx(data)
      const vt = actions ? null : decodeVaultTx(data)
      const loaderTags = vt
        ? vt.instructions
            .filter((ix) => vt.accountKeys[ix.programIdIndex]?.toBase58() === BPF_LOADER && ix.data.length >= 4)
            .filter((ix) => {
              const first = ix.accountIndexes[0]
              const target = first === undefined ? undefined : vt.accountKeys[first]
              return !target || target.equals(programData)
            })
            .map((ix) => ix.data.readUInt32LE(0))
            .filter((t) => t in LOADER_TITLES)
        : []
      if (actions?.length || loaderTags.length) found.push({ index, at: p.timestamp, actions, loaderTags })
    })
    if (opts.pauseMs) await new Promise((r) => setTimeout(r, opts.pauseMs))
  }

  // Oldest first, so each delay or threshold change can name the value it replaced.
  found.sort((a, b) => (a.index < b.index ? -1 : 1))
  const ctx: { prevTimeLock?: number; prevThreshold?: number } = {}
  const out: WatchEvent[] = []
  for (const f of found) {
    const ref = `squads:${v.id}:${f.index}`
    f.actions?.forEach((a, i) => {
      out.push({ key: `${ref}:${i}`, venue: v.id, at: f.at, ...describeAction(a, ctx), detail: `Squads transaction #${f.index}` })
      if (a.kind === "time-lock") ctx.prevTimeLock = a.value
      if (a.kind === "threshold") ctx.prevThreshold = a.value
    })
    // One event per transaction: a release often carries several loader calls.
    const tag = f.loaderTags.find((t) => t !== 3) ?? f.loaderTags[0]
    if (tag !== undefined) out.push({ key: `${ref}:program`, venue: v.id, at: f.at, ...LOADER_TITLES[tag], detail: `Squads transaction #${f.index}` })
  }
  return out
}
