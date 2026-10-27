// The live attack on the fast canary, run by the server so a visitor can
// press one button and watch: the fast canary's own Squads multisig cuts its
// timelock to zero (a real proposal, three real approvals, its real 60 s
// timelock), the crank turns the flag red and takes every guarded holder out
// to their own wallet, then the multisig restores the timelock and the flag
// clears five minutes later. One run at a time, for everyone.
//
//   PEXIZ_DEMO_KEYS        directory with member-0..4.json and fast-squads-create-key.json (default ../keys)
//   PEXIZ_FAUCET_KEYPAIR   pays fees and rent, and is the keeper paid for the exits
//   PEXIZ_DEVNET_RPC_URL
import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { Connection, Keypair, PublicKey } from "@solana/web3.js"
import * as multisig from "@sqds/multisig"
import { Crank } from "@pexiz/crank"
import { FAST_CANARY_PROGRAM_ID, decodeVenue, venuePda } from "@pexiz/sdk"

const RESTORED_TIME_LOCK = 60
/** The fast canary's cool-off, mirrored from Timing::FAST. */
const COOL_OFF_SECS = 5 * 60

export type StepKey = "propose" | "timelock" | "cut" | "exit" | "restore" | "clear"
export interface Step {
  key: StepKey
  at?: number
  /** When a waiting step is expected to finish. */
  until?: number
  signatures: string[]
  detail?: string
}
export interface DemoRun {
  id: number
  startedAt: number
  finishedAt?: number
  error?: string
  steps: Step[]
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let current: DemoRun | null = null
let last: DemoRun | null = null
const byIp = new Map<string, number>()
const IP_GAP_MS = 10 * 60_000

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } })

function keyfile(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path.replace(/^~/, homedir()), "utf8"))))
}

function setup() {
  const dir = process.env.PEXIZ_DEMO_KEYS ?? join(import.meta.dir, "../../keys")
  if (!existsSync(join(dir, "fast-squads-create-key.json"))) return null
  const members = [0, 1, 2, 3, 4].map((i) => keyfile(join(dir, `member-${i}.json`)))
  const createKey = keyfile(join(dir, "fast-squads-create-key.json"))
  const payer = keyfile(process.env.PEXIZ_FAUCET_KEYPAIR ?? "~/.config/solana/id.json")
  const conn = new Connection(process.env.PEXIZ_DEVNET_RPC_URL ?? "https://api.devnet.solana.com", "confirmed")
  const [msPda] = multisig.getMultisigPda({ createKey: createKey.publicKey })
  return { conn, payer, members, msPda }
}

type Ctx = NonNullable<ReturnType<typeof setup>>

async function landed(c: Ctx, sig: string) {
  const bh = await c.conn.getLatestBlockhash("confirmed")
  await c.conn.confirmTransaction({ signature: sig, ...bh }, "confirmed")
  return sig
}

/** A SetTimeLock config transaction, proposed and approved 3 of 5. Returns its index and signatures. */
async function propose(c: Ctx, secs: number) {
  const ms = await multisig.accounts.Multisig.fromAccountAddress(c.conn, c.msPda)
  const transactionIndex = BigInt(ms.transactionIndex.toString()) + 1n
  const sigs: string[] = []
  sigs.push(await landed(c, await multisig.rpc.configTransactionCreate({
    connection: c.conn, feePayer: c.payer, multisigPda: c.msPda, transactionIndex, creator: c.members[0].publicKey,
    rentPayer: c.payer.publicKey, actions: [{ __kind: "SetTimeLock", newTimeLock: secs }], signers: [c.members[0]],
  })))
  sigs.push(await landed(c, await multisig.rpc.proposalCreate({
    connection: c.conn, feePayer: c.payer, creator: c.members[0], rentPayer: c.payer, multisigPda: c.msPda, transactionIndex,
  })))
  for (const m of c.members.slice(0, 3)) {
    sigs.push(await landed(c, await multisig.rpc.proposalApprove({ connection: c.conn, feePayer: c.payer, member: m, multisigPda: c.msPda, transactionIndex })))
  }
  return { transactionIndex, sigs, timeLock: ms.timeLock }
}

async function execute(c: Ctx, transactionIndex: bigint) {
  for (let i = 0; ; i++) {
    try {
      return await landed(c, await multisig.rpc.configTransactionExecute({
        connection: c.conn, feePayer: c.payer, multisigPda: c.msPda, transactionIndex, member: c.members[0], rentPayer: c.payer, signers: [c.members[0]],
      }))
    } catch (e) {
      if (i >= 6) throw e
      await sleep(5000)
    }
  }
}

async function crank(c: Ctx) {
  const venue = venuePda(FAST_CANARY_PROGRAM_ID)
  const info = await c.conn.getAccountInfo(venue)
  if (!info) throw new Error("fast canary venue not registered")
  return new Crank(c.conn, c.payer, { memberDelayMs: 300, log: () => {} }).crankVenue(decodeVenue(info.data, venue))
}

async function run(c: Ctx, r: DemoRun) {
  const step = (key: StepKey) => {
    const s: Step = { key, at: Date.now(), signatures: [] }
    r.steps.push(s)
    return s
  }
  const p = step("propose")
  const cut = await propose(c, 0)
  p.signatures = cut.sigs

  const t = step("timelock")
  t.until = Date.now() + (cut.timeLock + 3) * 1000
  await sleep((cut.timeLock + 3) * 1000)

  step("cut").signatures.push(await execute(c, cut.transactionIndex))

  const x = step("exit")
  const res = await crank(c)
  if (res.signature) x.signatures.push(res.signature)
  for (const g of res.guardExits ?? []) x.signatures.push(g.signature)
  x.detail = `${res.from} → ${res.to}; ${res.guardExits?.length ?? 0} wallet${res.guardExits?.length === 1 ? "" : "s"} taken out`

  const rs = step("restore")
  const back = await propose(c, RESTORED_TIME_LOCK)
  rs.signatures.push(...back.sigs, await execute(c, back.transactionIndex))
  const after = await crank(c)
  if (after.signature) rs.signatures.push(after.signature)

  const cl = step("clear")
  cl.until = Date.now() + (COOL_OFF_SECS + 5) * 1000
  await sleep((COOL_OFF_SECS + 5) * 1000)
  const green = await crank(c)
  if (green.signature) cl.signatures.push(green.signature)
  cl.detail = `${green.from} → ${green.to}`
}

let runs = 0

export async function demo(req: Request, ip: string): Promise<Response> {
  if (req.method === "GET") return json(200, { running: current, last })
  if (req.method !== "POST") return json(405, { error: "GET or POST" })
  if (current) return json(409, { error: "An attack is already running. Watch it, or try again when it ends.", running: current })
  const prev = byIp.get(ip)
  if (prev && Date.now() - prev < IP_GAP_MS) return json(429, { error: "You ran one a few minutes ago. Try again later.", retryAt: prev + IP_GAP_MS })
  const c = setup()
  if (!c) return json(503, { error: "The live attack is not set up on this server." })
  byIp.set(ip, Date.now())
  const r: DemoRun = { id: ++runs, startedAt: Date.now(), steps: [] }
  current = r
  run(c, r)
    .catch((e) => { r.error = String((e as Error)?.message ?? e).split("\n")[0] })
    .finally(() => { r.finishedAt = Date.now(); last = r; current = null })
  return json(202, { running: r })
}
