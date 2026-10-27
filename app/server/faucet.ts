// Devnet faucet: test USDC from the canary mint, plus a little SOL for fees
// when the wallet has none. Shared by the dev server and the production server.
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js"
import { createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token"

const USDC_MINT = new PublicKey("6GCS4RCvHEZbLArUF4UwNguWww1vy4Z2uTPTxSMSDrqX")
const USDC_PER_CLAIM = 1_000n * 1_000_000n
const SOL_TOP_UP = 0.05 * LAMPORTS_PER_SOL
const SOL_FLOOR = 0.02 * LAMPORTS_PER_SOL
/** The faucet keeps this much SOL for the crank and demos. */
const SOL_RESERVE = 1 * LAMPORTS_PER_SOL
const COOLDOWN_MS = 12 * 3600_000

const claims = new Map<string, number>()
let authority: Keypair | null = null

function loadAuthority(): Keypair {
  if (authority) return authority
  const path = (process.env.PEXIZ_FAUCET_KEYPAIR ?? "~/.config/solana/id.json").replace(/^~/, homedir())
  authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))))
  return authority
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

export async function faucet(req: Request, ip: string): Promise<Response> {
  if (req.method !== "POST") return json(405, { error: "POST only" })
  let wallet: PublicKey
  try {
    const body = (await req.json()) as { wallet?: string }
    wallet = new PublicKey(body.wallet ?? "")
  } catch {
    return json(400, { error: "Send a valid wallet address." })
  }
  const now = Date.now()
  for (const key of [wallet.toBase58(), `ip:${ip}`]) {
    const last = claims.get(key)
    if (last && now - last < COOLDOWN_MS) {
      return json(429, { error: "Already claimed. Try again later.", retryAt: last + COOLDOWN_MS })
    }
  }

  const conn = new Connection(process.env.PEXIZ_DEVNET_RPC_URL ?? "https://api.devnet.solana.com", "confirmed")
  let payer: Keypair
  try {
    payer = loadAuthority()
  } catch {
    return json(503, { error: "The faucet is not set up on this server." })
  }
  const ata = getAssociatedTokenAddressSync(USDC_MINT, wallet)
  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, ata, wallet, USDC_MINT),
    createMintToInstruction(USDC_MINT, ata, payer.publicKey, USDC_PER_CLAIM),
  )
  const [walletSol, faucetSol] = await Promise.all([conn.getBalance(wallet), conn.getBalance(payer.publicKey)])
  const sol = walletSol < SOL_FLOOR && faucetSol > SOL_RESERVE + SOL_TOP_UP
  if (sol) tx.add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: wallet, lamports: SOL_TOP_UP }))

  try {
    const signature = await conn.sendTransaction(tx, [payer])
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash()
    await conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed")
    claims.set(wallet.toBase58(), now)
    claims.set(`ip:${ip}`, now)
    return json(200, { signature, usdc: Number(USDC_PER_CLAIM / 1_000_000n), sol: sol ? SOL_TOP_UP / LAMPORTS_PER_SOL : 0 })
  } catch (e) {
    return json(502, { error: "Devnet did not accept the transaction. Try again in a minute.", detail: String((e as Error).message ?? e) })
  }
}
