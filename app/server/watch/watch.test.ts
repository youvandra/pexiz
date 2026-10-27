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

describe("check", () => {
  test("takes a program address and nothing else", async () => {
    const { parseAddress } = await import("./check")
    expect(parseAddress(" PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu ").toBase58()).toBe("PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu")
    expect(() => parseAddress("notanaddress")).toThrow("That is not a Solana address.")
  })
})

describe("tokens", () => {
  test("reads authorities from a classic mint and Token-2022 extensions", async () => {
    const { decodeMint, TOKEN_2022 } = await import("./token")
    const data = Buffer.alloc(166 + 4 + 32 + 4 + 33)
    data.writeUInt32LE(1, 0); key(1).toBuffer().copy(data, 4) // mint authority
    data[44] = 6; data[45] = 1 // decimals, initialized
    data.writeUInt32LE(1, 46); key(2).toBuffer().copy(data, 50) // freeze authority
    data[165] = 1 // account type: mint
    let o = 166
    data.writeUInt16LE(12, o); data.writeUInt16LE(32, o + 2); key(3).toBuffer().copy(data, o + 4); o += 36 // permanent delegate
    data.writeUInt16LE(26, o); data.writeUInt16LE(33, o + 2); key(4).toBuffer().copy(data, o + 4); data[o + 36] = 1 // pausable, paused
    const m = decodeMint("m", TOKEN_2022, data)
    expect(m.authorities).toEqual([
      { role: "mint", key: key(1).toBase58() },
      { role: "freeze", key: key(2).toBase58() },
      { role: "permanent-delegate", key: key(3).toBase58() },
      { role: "pause", key: key(4).toBase58() },
    ])
    expect(m.paused).toBe(true)
  })

  test("the fastest power over holders decides", async () => {
    const { tokenVerdict } = await import("./check")
    const p = (role: "mint" | "metadata", severe: boolean, waitSecs: number | null, control: "single-key" | "squads-v4" = "squads-v4") =>
      ({ role, does: role, severe, holder: { key: "k", control, threshold: 4, members: ["a", "b", "c", "d", "e"], timeLockSecs: waitSecs ?? 0 }, waitSecs })
    expect(tokenVerdict([]).assessment).toBe("green")
    expect(tokenVerdict([p("metadata", false, 0, "single-key")]).assessment).toBe("green")
    expect(tokenVerdict([p("mint", true, 86_400)]).assessment).toBe("green")
    expect(tokenVerdict([p("mint", true, 3_600)]).assessment).toBe("amber")
    expect(tokenVerdict([p("mint", true, 0, "single-key")]).why).toContain("one key")
    expect(tokenVerdict([p("mint", true, null)]).assessment).toBe("unrated")
    expect(tokenVerdict([p("mint", true, 86_400)], true).assessment).toBe("red")
  })
})

describe("feed", () => {
  test("a signed body verifies against its signer, and a changed one does not", async () => {
    const { loadSigner, verifyFeed } = await import("./feed")
    const { mkdtempSync } = await import("node:fs")
    const { tmpdir } = await import("node:os")
    const s = loadSigner(`${mkdtempSync(`${tmpdir()}/feed-`)}/k.pem`)
    const body = JSON.stringify({ status: "green" })
    const sig = s.sign(body)
    expect(verifyFeed(body, sig, s.address)).toBe(true)
    expect(verifyFeed(body.replace("green", "red"), sig, s.address)).toBe(false)
  })

  test("a venue reads as stale after three missed passes", async () => {
    const { feedVenue } = await import("./feed")
    const v = feedVenue({ ...base, venue: "drift", readAt: 1_000, timeLockSecs: 3600, threshold: 4, members: ["a", "b"] }, 300, 1_000 + 901)
    expect(v.stale).toBe(true)
    expect(v.changeDelaySecs).toBe(3600)
    expect(v.authorityAsRecorded).toBe(false)
    expect(feedVenue({ ...base, venue: "drift", readAt: 1_000 }, 300, 1_100).stale).toBe(false)
  })
})

describe("webhooks", () => {
  test("a receiver gets the events with a signature it can check", async () => {
    const { loadSigner, postWebhooks, verifyFeed } = await import("./feed")
    const { mkdtempSync } = await import("node:fs")
    const { tmpdir } = await import("node:os")
    const s = loadSigner(`${mkdtempSync(`${tmpdir()}/hook-`)}/k.pem`)
    let got: { body: string; sig: string | null; signer: string | null } | null = null
    const srv = Bun.serve({ port: 0, async fetch(req) { got = { body: await req.text(), sig: req.headers.get("x-pexiz-signature"), signer: req.headers.get("x-pexiz-signer") }; return new Response("ok") } })
    const e = { key: "k", venue: "drift", at: 1, kind: "status", title: "Status: Safe → Get out", tone: "bad" as const }
    await postWebhooks([`http://127.0.0.1:${srv.port}/hook`], s, [e], [])
    srv.stop()
    expect(got).not.toBeNull()
    expect(JSON.parse(got!.body).events).toEqual([e])
    expect(got!.signer).toBe(s.address)
    expect(verifyFeed(got!.body, got!.sig!, got!.signer!)).toBe(true)
  })
})
