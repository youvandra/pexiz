// A holder on the fast canary who never deposits anywhere: they hold canary
// LP in their own wallet and guard it with the exit program. Then run the
// attack (the app's "Run the attack", or 5-fast-canary.ts attack) and check
// that the LP left for USDC in the same wallet.
//
//   bun run 6-auto-exit.ts setup    open the USDC route, fund the holder, add 250 USDC of LP, guard it
//   bun run 6-auto-exit.ts status
import { SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js"
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync, mintTo } from "@solana/spl-token"
import {
  FAST_CANARY_PROGRAM_ID, addLiquidityIx, canaryPool, decodeGuard, guardPda, openRouteIx, protectCanaryIxs, routePda, venuePda,
} from "@pexiz/sdk"
import { conn, namedKeypair, payer, pk, readState, record } from "./common"

const stage = process.argv[2]
const usdc = pk(readState().usdcMint, "usdcMint")
const pool = canaryPool(usdc)
const holder = namedKeypair("demo-holder")
const holderUsdc = getAssociatedTokenAddressSync(usdc, holder.publicKey)
const holderLp = getAssociatedTokenAddressSync(pool.lpMint, holder.publicKey)
const AMOUNT = 250_000_000n

const send = (ixs: TransactionInstruction[], signers = [payer]) =>
  sendAndConfirmTransaction(conn, new Transaction().add(...ixs), signers, { commitment: "confirmed" })
const balance = async (a: typeof holderUsdc) => (await conn.getTokenAccountBalance(a).catch(() => null))?.value.uiAmountString ?? "0"

if (stage === "setup") {
  if (!(await conn.getAccountInfo(routePda(usdc)))) record("exit: open_route (test USDC)", await send([await openRouteIx(payer.publicKey, usdc)]))
  if ((await conn.getBalance(holder.publicKey)) < 20_000_000) {
    record("exit: fund demo holder", await send([SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: holder.publicKey, lamports: 50_000_000 })]))
  }
  await send([
    createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, holderUsdc, holder.publicKey, usdc),
    createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, holderLp, holder.publicKey, pool.lpMint),
  ])
  await mintTo(conn, payer, usdc, holderUsdc, payer, AMOUNT)
  record("exit: holder adds 250 USDC to the canary pool, LP in own wallet", await send(
    [await addLiquidityIx(pool, { user: holder.publicKey, userUsdc: holderUsdc, userLp: holderLp }, AMOUNT)], [holder],
  ))
  const guarded = await conn.getAccountInfo(guardPda(holder.publicKey, pool.lpMint))
  const [approve, guard] = await protectCanaryIxs(holder.publicKey, venuePda(FAST_CANARY_PROGRAM_ID), pool, holderLp, holderUsdc, AMOUNT)
  record("exit: holder approves and guards with the fast canary (one signature)", await send(guarded ? [approve] : [approve, guard], [holder]))
} else if (stage === "status") {
  const g = await conn.getAccountInfo(guardPda(holder.publicKey, pool.lpMint))
  console.log({
    holder: holder.publicKey.toBase58(),
    usdc: await balance(holderUsdc),
    lp: await balance(holderLp),
    exits: g ? decodeGuard(g.data).exits : "no guard",
  })
} else {
  console.error("usage: bun run 6-auto-exit.ts setup|status")
  process.exit(1)
}
