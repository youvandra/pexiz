import { describe, expect, test } from "bun:test"
import { PublicKey } from "@solana/web3.js"
import { CONFIG_TX_DISCRIMINATOR, decodeConfigTx, describeAction } from "./history"
import { diff } from "./diff"
import { openStore } from "./store"
import { findVenue, reply } from "./telegram"
import type { VenueState } from "./types"

const key = (n: number) => new PublicKey(Buffer.alloc(32, n))

function configTx(actions: Buffer[]): Buffer {
  const head = Buffer.alloc(8 + 32 + 32 + 8 + 1 + 4)
  CONFIG_TX_DISCRIMINATOR.copy(head, 0)
  head.writeUInt32LE(actions.length, 8 + 32 + 32 + 8 + 1)
  return Buffer.concat([head, ...actions])
}
const u16 = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b }
const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b }

describe("config transactions", () => {
  test("decodes each action in order", () => {
    const data = configTx([
      Buffer.concat([Buffer.from([0]), key(1).toBuffer(), Buffer.from([7])]),
      Buffer.concat([Buffer.from([1]), key(2).toBuffer()]),
      Buffer.concat([Buffer.from([2]), u16(3)]),
      Buffer.concat([Buffer.from([3]), u32(3600)]),
      // a spending limit with one member and no destinations, then the rent collector cleared
      Buffer.concat([Buffer.from([4]), key(3).toBuffer(), Buffer.from([0]), key(4).toBuffer(), Buffer.alloc(8), Buffer.from([0]), u32(1), key(5).toBuffer(), u32(0)]),
      Buffer.from([6, 0]),
    ])
    expect(decodeConfigTx(data)).toEqual([
      { kind: "add-member", key: key(1).toBase58() },
      { kind: "remove-member", key: key(2).toBase58() },
      { kind: "threshold", value: 3 },
      { kind: "time-lock", value: 3600 },
      { kind: "spending-limit-added" },
      { kind: "rent-collector" },
    ])
  })

  test("is not fooled by another account", () => {
    expect(decodeConfigTx(Buffer.alloc(200))).toBeNull()
  })

  test("a shorter delay reads as bad, with the value it replaced", () => {
    const d = describeAction({ kind: "time-lock", value: 0 }, { prevTimeLock: 86_400 })
    expect(d.tone).toBe("bad")
    expect(d.title).toBe("Change delay: 24h → none")
    expect(describeAction({ kind: "time-lock", value: 86_400 }, { prevTimeLock: 3600 }).tone).toBe("info")
  })
})

const base: VenueState = {
  venue: "drift",
  readAt: 100,
  ok: true,
  assessment: "green",
  why: "",
  authority: key(9).toBase58(),
  pendingUpgrades: [],
  nonces: [],
}

describe("diff", () => {
  test("nothing changed, nothing to say", () => {
    expect(diff(base, { ...base, readAt: 200 })).toEqual([])
  })

  test("a worse status, a moved authority, a queued upgrade and a new nonce", () => {
    const next: VenueState = {
      ...base,
      readAt: 200,
      assessment: "red",
      why: "Someone else now controls upgrades to the program.",
      authority: key(8).toBase58(),
      pendingUpgrades: [{ index: 21 }],
      nonces: [{ address: key(6).toBase58(), member: key(7).toBase58() }],
    }
    const out = diff(base, next)
    expect(out.map((e) => e.kind)).toEqual(["status", "authority", "upgrade-queued", "nonce"])
    expect(out.every((e) => e.tone === "bad")).toBe(true)
    expect(out[0].title).toBe("Status: Safe → Get out")
  })

  test("nonces are compared only when both reads looked", () => {
    const next = { ...base, readAt: 200, nonces: undefined }
    expect(diff(base, next)).toEqual([])
    expect(diff({ ...base, nonces: undefined }, { ...base, readAt: 200, nonces: [{ address: "a", member: "b" }] })).toEqual([])
  })

  test("an unread status is not news", () => {
    expect(diff(base, { ...base, readAt: 200, assessment: "unrated" })).toEqual([])
  })
})

describe("store and bot", () => {
  test("events are stored once", () => {
    const s = openStore(":memory:")
    const e = { key: "k", venue: "drift", at: 1, kind: "watch", title: "t", tone: "info" as const }
    expect(s.addEvents([e])).toHaveLength(1)
    expect(s.addEvents([e])).toHaveLength(0)
    expect(s.events("drift")).toEqual([e])
  })

  test("names are matched loosely", () => {
    expect(findVenue("Jupiter Perps")).toBe("jupiter-perps")
    expect(findVenue("jupiter")).toBe("jupiter-perps")
    expect(findVenue("all")).toBe("all")
    expect(findVenue("nope")).toBeNull()
  })

  test("a deep link subscribes, /stop all clears", () => {
    const s = openStore(":memory:")
    expect(reply(s, 1, "/start drift")).toContain("Watching <b>Drift</b>")
    expect(s.subscriptions(1)).toEqual(["drift"])
    expect(s.watchersOf("drift")).toEqual([1])
    reply(s, 1, "/stop all")
    expect(s.subscriptions(1)).toEqual([])
  })
})
