// A token mint, read for the keys that can act on holders: who can mint more,
// freeze an account, move or burn anyone's tokens, pause transfers, or run
// code on every transfer. Classic SPL Token and Token-2022, with the
// Token-2022 extensions that carry an authority.
import { PublicKey } from "@solana/web3.js"

export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
export const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
const METAPLEX = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")

/** What a key can do to holders, most severe first. */
export type Role = "permanent-delegate" | "mint" | "freeze" | "pause" | "transfer-hook" | "multiplier" | "default-frozen" | "close" | "metadata"

export interface TokenAuthority {
  role: Role
  key: string
}

export interface MintInfo {
  mint: string
  tokenProgram: "spl-token" | "token-2022"
  decimals: number
  supply: bigint
  name?: string
  symbol?: string
  authorities: TokenAuthority[]
  /** The program a transfer hook calls, when there is one. */
  hookProgram?: string
  /** New accounts start frozen until the issuer thaws them. */
  defaultFrozen?: boolean
  paused?: boolean
}

const MINT_LEN = 82
/** Token-2022 pads a mint to an account's length, then a type byte, then TLV entries. */
const T22_TLV = 166
const key = (b: Buffer, o: number) => new PublicKey(b.subarray(o, o + 32)).toBase58()
const zero = (b: Buffer, o: number) => b.subarray(o, o + 32).every((x) => x === 0)
/** COption<Pubkey>: a u32 tag, then the key. */
const coption = (b: Buffer, o: number) => (b.readUInt32LE(o) === 1 ? key(b, o + 4) : null)
/** OptionalNonZeroPubkey: all zeroes means none. */
const nonzero = (b: Buffer, o: number) => (zero(b, o) ? null : key(b, o))

function borshString(b: Buffer, o: number): [string, number] {
  const n = b.readUInt32LE(o)
  return [b.subarray(o + 4, o + 4 + n).toString("utf8").replace(/\0+$/, "").trim(), o + 4 + n]
}

export function decodeMint(address: string, owner: string, data: Buffer): MintInfo {
  if (owner !== TOKEN_PROGRAM && owner !== TOKEN_2022) throw new Error("not a token mint")
  if (data.length < MINT_LEN || data[45] !== 1) throw new Error("not an initialized mint")
  const out: MintInfo = {
    mint: address,
    tokenProgram: owner === TOKEN_PROGRAM ? "spl-token" : "token-2022",
    supply: data.readBigUInt64LE(36),
    decimals: data[44],
    authorities: [],
  }
  const mintAuth = coption(data, 0)
  const freezeAuth = coption(data, 46)
  if (mintAuth) out.authorities.push({ role: "mint", key: mintAuth })
  if (freezeAuth) out.authorities.push({ role: "freeze", key: freezeAuth })

  if (out.tokenProgram === "token-2022" && data.length > T22_TLV && data[T22_TLV - 1] === 1) {
    let o = T22_TLV
    while (o + 4 <= data.length) {
      const type = data.readUInt16LE(o)
      const len = data.readUInt16LE(o + 2)
      const v = o + 4
      if (type === 0 || v + len > data.length) break
      const push = (role: Role, at: number) => {
        const k = nonzero(data, at)
        if (k) out.authorities.push({ role, key: k })
      }
      if (type === 3) push("close", v)
      else if (type === 6) out.defaultFrozen = data[v] === 2
      else if (type === 10) push("multiplier", v) // interest-bearing rate authority
      else if (type === 12) push("permanent-delegate", v)
      else if (type === 14) {
        push("transfer-hook", v)
        out.hookProgram = nonzero(data, v + 32) ?? undefined
      } else if (type === 19) {
        push("metadata", v)
        let p = v + 64
        ;[out.name, p] = borshString(data, p)
        ;[out.symbol] = borshString(data, p)
      } else if (type === 25) push("multiplier", v) // scaled UI amount
      else if (type === 26) {
        push("pause", v)
        out.paused = data[v + 32] === 1
      }
      o = v + len
    }
  }
  return out
}

export function metaplexPda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("metadata"), METAPLEX.toBuffer(), mint.toBuffer()], METAPLEX)[0]
}

/** Name, symbol and update authority from a Metaplex metadata account. */
export function decodeMetaplex(data: Buffer): { name: string; symbol: string; updateAuthority: string } | null {
  try {
    const updateAuthority = key(data, 1)
    const [name, p] = borshString(data, 65)
    const [symbol] = borshString(data, p)
    return { name, symbol, updateAuthority }
  } catch {
    return null
  }
}
