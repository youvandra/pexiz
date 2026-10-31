import { describe, expect, test } from "bun:test"
import { underRoot } from "./static"

const ROOT = "/srv/pexiz/app/dist"

describe("underRoot", () => {
  test("serves files inside the root", () => {
    expect(underRoot(ROOT, "/assets/index.js")).toBe(`${ROOT}/assets/index.js`)
    expect(underRoot(ROOT, "/")).toBe(ROOT)
    expect(underRoot(ROOT, "/app/monitor/jupiter")).toBe(`${ROOT}/app/monitor/jupiter`)
  })

  test("refuses an encoded step out of the root", () => {
    expect(underRoot(ROOT, "/%2e%2e%2f%2e%2e%2fkeys%2fmember-0.json")).toBeNull()
    expect(underRoot(ROOT, "/..%2fdata%2ffeed-key.pem")).toBeNull()
    expect(underRoot(ROOT, "/%2e%2e%2f%2e%2e%2f%2e%2e%2f.config/solana/id.json")).toBeNull()
  })

  test("refuses a sibling that shares the root's prefix", () => {
    expect(underRoot(ROOT, "/..%2fdist-old%2fsecret")).toBeNull()
  })

  test("refuses malformed escapes and NUL bytes", () => {
    expect(underRoot(ROOT, "/%E0%A4%A")).toBeNull()
    expect(underRoot(ROOT, "/index.html%00.png")).toBeNull()
  })
})
