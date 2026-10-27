// The feed a lender, curator or keeper reads: every watched protocol's admin
// risk in a stable, versioned shape, signed so it can be relayed and checked.
//
// Every /api/v1 response body is signed with one Ed25519 key. The signature
// covers the exact bytes of the body, so a keeper can pass body and signature
// to Solana's Ed25519 program and a lending program can check them on chain.
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { PublicKey } from "@solana/web3.js"
import { VENUES, WATCHED_TOKENS } from "../../src/data/facts"
import { flagLabel } from "./labels"
import type { TokenState, VenueState, WatchEvent } from "./types"

export const FEED_VERSION = 1

export interface Signer {
  /** The public key as a Solana address. */
  address: string
  sign(body: string): string
}

/** Loads the feed key from `path`, making one on first run. */
export function loadSigner(path: string): Signer {
  let key: KeyObject
  if (existsSync(path)) key = createPrivateKey(readFileSync(path, "utf8"))
  else {
    key = generateKeyPairSync("ed25519").privateKey
    writeFileSync(path, key.export({ type: "pkcs8", format: "pem" }) as string, { mode: 0o600 })
  }
  // The raw 32-byte key is the last 32 bytes of its SPKI encoding.
  const raw = (createPublicKey(key).export({ type: "spki", format: "der" }) as Buffer).subarray(-32)
  return {
    address: new PublicKey(raw).toBase58(),
    sign: (body) => sign(null, Buffer.from(body), key).toString("hex"),
  }
}

/** Checks a body against a hex signature and a signer address, as a reader would. */
export function verifyFeed(body: string, signatureHex: string, signer: string): boolean {
  const der = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), new PublicKey(signer).toBuffer()])
  return verify(null, Buffer.from(body), createPublicKey({ key: der, format: "der", type: "spki" }), Buffer.from(signatureHex, "hex"))
}

/** One protocol as the feed states it. Field names are part of the version. */
export interface FeedVenue {
  id: string
  name: string
  category: "perps" | "prediction"
  program: string
  /** green | amber | exposed | red | unrated */
  status: VenueState["assessment"]
  statusLabel: string
  reason: string
  /** Seconds an LP has to leave after a change is approved; negative means none. Null when unknown. */
  exitWindowSecs: number | null
  changeDelaySecs: number | null
  approvalsNeeded: number | null
  signers: number | null
  upgradeAuthority: string | null
  /** False when the upgrade authority is no longer the recorded multisig vault. */
  authorityAsRecorded: boolean | null
  pendingUpgrades: { proposal: number; approvedAt: number | null; executableAt: number | null }[]
  /** Signers holding durable-nonce accounts; null when not scanned yet. */
  presigningSigners: number | null
  /** Unix seconds of the read this is based on. */
  readAt: number
  /** True when the last read is older than three passes: treat the status as unknown. */
  stale: boolean
}

export function feedVenue(s: VenueState, pollSecs: number, now = Math.floor(Date.now() / 1000)): FeedVenue {
  const v = VENUES.find((x) => x.id === s.venue)!
  return {
    id: v.id,
    name: v.name,
    category: v.category,
    program: v.program,
    status: s.assessment,
    statusLabel: flagLabel(s.assessment),
    reason: s.why,
    exitWindowSecs: s.exitWindowSecs ?? null,
    changeDelaySecs: s.timeLockSecs ?? null,
    approvalsNeeded: s.threshold ?? null,
    signers: s.members?.length ?? null,
    upgradeAuthority: s.authority ?? null,
    authorityAsRecorded: s.authority === undefined ? null : s.authority === v.authority,
    pendingUpgrades: (s.pendingUpgrades ?? []).map((p) => ({ proposal: p.index, approvedAt: p.approvedAt ?? null, executableAt: p.readyAt ?? null })),
    presigningSigners: s.nonces ? new Set(s.nonces.map((n) => n.member)).size : null,
    readAt: s.readAt,
    stale: !s.ok || now - s.readAt > 3 * pollSecs,
  }
}

/** One collateral token as the feed states it. */
export interface FeedToken {
  id: string
  name: string
  symbol: string
  kind: string
  mint: string
  status: TokenState["assessment"]
  statusLabel: string
  reason: string
  /** The shortest wait behind any key that can mint, freeze, move or pause; null when unknown or none. */
  fastestWaitSecs: number | null
  powers: { role: string; does: string; severe: boolean; key: string; holder: string; waitSecs: number | null }[]
  paused: boolean
  readAt: number
  stale: boolean
}

export function feedToken(t: TokenState, everySecs: number, now = Math.floor(Date.now() / 1000)): FeedToken {
  const w = WATCHED_TOKENS.find((x) => x.id === t.id)!
  const waits = t.powers.filter((p) => p.severe && p.waitSecs !== null).map((p) => p.waitSecs!)
  return {
    id: t.id,
    name: w.name,
    symbol: w.symbol,
    kind: w.kind,
    mint: w.mint,
    status: t.assessment,
    statusLabel: flagLabel(t.assessment),
    reason: t.why,
    fastestWaitSecs: waits.length ? Math.min(...waits) : null,
    powers: t.powers,
    paused: !!t.paused,
    readAt: t.readAt,
    stale: !t.ok || now - t.readAt > 3 * everySecs,
  }
}

/** Posts new events to every webhook, signed like the feed. Failures are logged, never retried. */
export async function postWebhooks(urls: string[], signer: Signer, events: WatchEvent[], venues: FeedVenue[], tokens: FeedToken[] = []) {
  if (!urls.length || !events.length) return
  const body = JSON.stringify({ version: FEED_VERSION, kind: "changes", at: Math.floor(Date.now() / 1000), events, venues, tokens })
  const headers = { "content-type": "application/json", "x-pexiz-signer": signer.address, "x-pexiz-signature": signer.sign(body) }
  await Promise.all(
    urls.map((url) =>
      fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(5_000) })
        .then((r) => { if (!r.ok) console.warn(`webhook ${url}: ${r.status}`) })
        .catch((e) => console.warn(`webhook ${url}: ${e.message}`)),
    ),
  )
}
