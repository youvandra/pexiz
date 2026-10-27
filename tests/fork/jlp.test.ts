// Does the JLP exit path work against the real Jupiter Perps program?
//
// The program and the JLP pool's accounts are dumped from mainnet by
// `scripts/measure/jlp.py` and loaded into a local validator. The test calls
// `removeLiquidity2` straight from a wallet first, because until that works
// there is nothing for the vault to call through. What it settles is written
// up in docs/open-questions.md: which remaining accounts the pool needs, and
// whether the program accepts a CPI caller.
//
// Skipped unless the fixtures are there: run
// `python3 scripts/measure/jlp.py --program` and `bun run build:probe` first.
import { beforeAll, afterAll, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { ACCOUNT_SIZE, AccountLayout, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { JLP_MINT, JUPITER_PERPS_ID, removeLiquidity2Ix } from "@pexiz/sdk/src/jlp";
import { startValidator, send, type PreloadedAccount, type Validator } from "../validator/harness";

const DIR = join(import.meta.dir, "../fixtures/jlp");
const PROBE_SO = join(import.meta.dir, "../cpi-probe/target/deploy/cpi_probe.so");
const PROBE_ID = new PublicKey("EyhkNRS16RjzLSMo3QX5b8cjDvFNNbHsvra6yYEeHiXt");
/** The probe signs as this PDA, the way the vault would. */
const PROBE_OWNER = PublicKey.findProgramAddressSync([Buffer.from("owner")], PROBE_ID)[0];
const SO = join(DIR, "jupiter_perps.so");
const INDEX = join(DIR, "index.json");
const ready = existsSync(SO) && existsSync(INDEX) && existsSync(PROBE_SO);

interface Dump {
  pool: { address: string; name: string };
  custodies: { address: string; mint: string; tokenAccount: string; decimals: number; priceAccounts: { address: string; owner: string }[] }[];
}

let v: Validator;
let dump: Dump;
/** The JLP we hand ourselves, and the wSOL custody we take out. */
const LP_AMOUNT = 1_000_000_000n; // 1,000 JLP at 6 decimals
/** Which of a custody's price accounts the pool values its AUM with, and where that account keeps its timestamp. */
const DOVES_PRICE = 2;
const DOVES_PUBLISH_TIME = 177;
const owner = Keypair.generate();

beforeAll(async () => {
  if (!ready) return;
  dump = await Bun.file(INDEX).json();
  // The pool refuses a price older than 5 seconds, and a dump is older than
  // that the moment it is written, so the cloned Doves accounts are restamped
  // with the current time. Only the timestamp is touched; the price is the
  // one that was on mainnet when `jlp.py` ran.
  const doves = new Map(dump.custodies.map((c) => [c.priceAccounts[DOVES_PRICE].address, c.priceAccounts[DOVES_PRICE].owner]));
  const restamped: PreloadedAccount[] = [];
  for (const [address, dovesOwner] of doves) {
    const raw = await Bun.file(join(DIR, `${address}.json`)).json();
    const data = Buffer.from(raw.account.data[0], "base64");
    data.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1000)), DOVES_PUBLISH_TIME);
    restamped.push({ address: new PublicKey(address), owner: new PublicKey(dovesOwner), data, lamports: raw.account.lamports });
  }
  const files = readdirSync(DIR).filter((f) => f.endsWith(".json") && f !== "index.json" && !doves.has(f.replace(/\.json$/, "")));
  const sol = dump.custodies[0];
  const tokenAccount = (mint: PublicKey, holder: PublicKey, amount: bigint) => {
    const data = Buffer.alloc(ACCOUNT_SIZE);
    AccountLayout.encode({
      mint, owner: holder, amount, delegateOption: 0, delegate: PublicKey.default, state: 1,
      isNativeOption: 0, isNative: 0n, delegatedAmount: 0n, closeAuthorityOption: 0, closeAuthority: PublicKey.default,
    }, data);
    return data;
  };
  const holding = (holder: PublicKey) => [
    { address: getAssociatedTokenAddressSync(JLP_MINT, holder, true), owner: TOKEN_PROGRAM_ID, data: tokenAccount(JLP_MINT, holder, LP_AMOUNT) },
    { address: getAssociatedTokenAddressSync(new PublicKey(sol.mint), holder, true), owner: TOKEN_PROGRAM_ID, data: tokenAccount(new PublicKey(sol.mint), holder, 0n) },
  ];
  v = await startValidator({
    canaryAuthority: PublicKey.default,
    programs: [[JUPITER_PERPS_ID, SO], [PROBE_ID, PROBE_SO]],
    accountFiles: files.map((f) => ({ address: new PublicKey(f.replace(/\.json$/, "")), file: join(DIR, f) })),
    accounts: [
      // The JLP each owner is about to burn, and the account the wSOL comes back to.
      ...holding(owner.publicKey),
      ...holding(PROBE_OWNER),
      ...restamped,
    ],
  });
  await v.conn.confirmTransaction(await v.conn.requestAirdrop(owner.publicKey, 1_000_000_000), "confirmed");
}, 120_000);

afterAll(() => v?.stop());

/** The exit a holder would make: 1,000 JLP out of the wSOL custody. */
function exitIx(holder: PublicKey) {
  const sol = dump.custodies[0];
  const prices = sol.priceAccounts.map((p) => new PublicKey(p.address));
  return removeLiquidity2Ix({
    owner: holder,
    tokenAccount: getAssociatedTokenAddressSync(new PublicKey(sol.mint), holder, true),
    lpTokenAccount: getAssociatedTokenAddressSync(JLP_MINT, holder, true),
    pool: new PublicKey(dump.pool.address),
    custody: new PublicKey(sol.address),
    custodyDovesPriceAccount: prices[DOVES_PRICE],
    custodyPythnetPriceAccount: prices[0],
    custodyTokenAccount: new PublicKey(sol.tokenAccount),
    // The pool values its AUM before it can price the LP token, so every
    // custody comes along, then every custody's Doves price account.
    remaining: [
      ...dump.custodies.map((c) => new PublicKey(c.address)),
      ...dump.custodies.map((c) => new PublicKey(c.priceAccounts[DOVES_PRICE].address)),
    ],
  }, LP_AMOUNT, 0n);
}

async function received(holder: PublicKey): Promise<bigint> {
  const sol = dump.custodies[0];
  const acc = await v.conn.getAccountInfo(getAssociatedTokenAddressSync(new PublicKey(sol.mint), holder, true));
  return AccountLayout.decode(acc!.data).amount;
}

test.skipIf(!ready)("a wallet can take its liquidity out of the real pool", async () => {
  await send(v, [exitIx(owner.publicKey)], [owner]);
  const out = await received(owner.publicKey);
  console.log(`wallet: ${LP_AMOUNT} JLP out, ${out} lamports of wSOL back`);
  expect(out).toBeGreaterThan(0n);
}, 120_000);

test.skipIf(!ready)("so can a program signing as a PDA, so the vault can hold JLP", async () => {
  const inner = exitIx(PROBE_OWNER);
  const ix = new TransactionInstruction({
    programId: PROBE_ID,
    keys: [{ pubkey: JUPITER_PERPS_ID, isSigner: false, isWritable: false }, ...inner.keys.map((k) => ({ ...k, isSigner: false }))],
    data: inner.data,
  });
  await send(v, [ix]);
  const out = await received(PROBE_OWNER);
  console.log(`PDA via CPI: ${LP_AMOUNT} JLP out, ${out} lamports of wSOL back`);
  expect(out).toBeGreaterThan(0n);
}, 120_000);
