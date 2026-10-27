// One pass over one protocol: who can upgrade it, and for a Squads v4
// multisig, how many approvals it needs, who signs, how long changes wait,
// which upgrades are queued and whether any signer holds a durable nonce.
import { Connection, PublicKey } from "@solana/web3.js"
import { decodeMultisig, decodeUpgradeAuthority, programDataAddress, vaultPda } from "@pexiz/sdk/src/squads"
import { findPendingUpgrades } from "@pexiz/sdk/src/upgrades"
import { findPresigningAccounts } from "@pexiz/sdk/src/nonce"
import { assess } from "../../src/data/assess"
import type { WatchedVenue } from "../../src/data/facts"
import type { VenueState } from "./types"

/** The program-data header only: a program's data account can run to megabytes. */
const HEADER = { offset: 0, length: 45 }

export async function readVenue(conn: Connection, v: WatchedVenue, opts: { nonces?: boolean } = {}): Promise<VenueState> {
  const now = Math.floor(Date.now() / 1000)
  const programData = programDataAddress(new PublicKey(v.program))
  const keys = v.multisig ? [programData, new PublicKey(v.multisig)] : [programData]
  const infos = await conn.getMultipleAccountsInfo(keys, { dataSlice: HEADER })
  if (!infos[0]) throw new Error(`${v.id}: program data not found`)
  const authority = decodeUpgradeAuthority(Buffer.from(infos[0].data))?.toBase58() ?? null
  const authorityMatches = authority === v.authority

  if (v.admin !== "squads-v4" || !v.multisig) {
    const verdict = authorityMatches
      ? assess(v, v.snapshot.timeLockSecs)
      : { assessment: "red" as const, why: "Someone else now controls upgrades to the program." }
    return { venue: v.id, readAt: now, ok: true, authority, ...verdict }
  }

  // The multisig itself, in full this time: its member list sits past the header.
  const msInfo = await conn.getAccountInfo(new PublicKey(v.multisig))
  if (!msInfo) throw new Error(`${v.id}: multisig not found`)
  const m = decodeMultisig(Buffer.from(msInfo.data))
  const multisig = new PublicKey(v.multisig)
  const vaultIndex = [0, 1, 2, 3].find((i) => vaultPda(multisig, i)[0].toBase58() === v.authority) ?? 0
  const found = await findPendingUpgrades(conn, multisig, m.transactionIndex, vaultIndex, programData, 12)
  const pendingUpgrades = found.map((p) => ({ index: Number(p.index), approvedAt: p.approvedAt, readyAt: p.approvedAt !== undefined ? p.approvedAt + m.timeLock : undefined }))
  const nonces = opts.nonces
    ? (await findPresigningAccounts(conn, m.members.map((x) => x.key), { delayMs: 400 })).map((n) => ({ address: n.address.toBase58(), member: n.member.toBase58() }))
    : undefined
  const verdict = assess(
    v,
    m.timeLock,
    pendingUpgrades.map((p) => ({ ...p, index: BigInt(p.index) })),
    { threshold: m.threshold, authorityMatches },
  )
  // A signer able to sign in advance is the April 2026 opening move.
  const presigned = nonces?.length && verdict.assessment === "green"
    ? { assessment: "amber" as const, why: `${nonces.length === 1 ? "A signer holds" : `${nonces.length} signers hold`} a durable nonce, so approvals can be signed now and used later.` }
    : null
  return {
    venue: v.id,
    readAt: now,
    ok: true,
    authority,
    threshold: m.threshold,
    members: m.members.map((x) => x.key.toBase58()),
    timeLockSecs: m.timeLock,
    txIndex: Number(m.transactionIndex),
    pendingUpgrades,
    nonces,
    ...verdict,
    ...presigned,
  }
}
