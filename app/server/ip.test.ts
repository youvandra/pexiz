import { describe, expect, test } from "bun:test"
import { clientIp } from "./ip"

describe("clientIp", () => {
  test("believes X-Real-IP from the proxy on loopback", () => {
    expect(clientIp("203.0.113.7", "127.0.0.1")).toBe("203.0.113.7")
    expect(clientIp("203.0.113.7", "::1")).toBe("203.0.113.7")
  })

  test("ignores X-Real-IP from anyone else", () => {
    expect(clientIp("1.1.1.1", "198.51.100.9")).toBe("198.51.100.9")
  })

  test("falls back to the peer, then to a placeholder", () => {
    expect(clientIp(null, "127.0.0.1")).toBe("127.0.0.1")
    expect(clientIp(null, undefined)).toBe("?")
  })
})
