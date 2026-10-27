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
import { JLP_MINT, JUPITER_PERPS_ID, jupiterPerpsPdas, removeLiquidity2Ix } from "@pexiz/sdk/src/jlp";
import { bn } from "@pexiz/sdk/src/canary";
import { ORACLE_PROGRAM_ID, oracleCoder } from "@pexiz/sdk/src/oracle";
import { VAULT_PROGRAM_ID, decodeVault, exitFloor, exitJlpIx, vaultAddresses, vaultCoder } from "@pexiz/sdk/src/vault";
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
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
/** The venue the vault watches; its flag is preloaded red, as after a crank. */
const venueKey = Keypair.generate().publicKey;
const vaultAddrs = vaultAddresses(venueKey, USDC_MINT);

async function poolAum(): Promise<bigint> {
  const acc = await v.conn.getAccountInfo(new PublicKey(dump.pool.address));
  return acc!.data.readBigUInt64LE(JLP_POOL_AUM_OFFSET);
}

async function mintSupply(mint: PublicKey): Promise<bigint> {
  const acc = await v.conn.getAccountInfo(mint);
  return acc!.data.readBigUInt64LE(36);
}

/** Mirrors JLP_POOL_AUM_OFFSET in the vault program. */
const JLP_POOL_AUM_OFFSET = 212;

/** A venue whose flag is already red, and a vault already holding JLP. */
async function pexizAccounts(): Promise<PreloadedAccount[]> {
  const zero32 = Array.from({ length: 32 }, () => 0);
  const venue = await oracleCoder.accounts.encode("Venue", {
    params_program: PublicKey.default, program_data: PublicKey.default, multisig: PublicKey.default,
    upgrade_authority: PublicKey.default, vault_index: 0, min_time_lock_secs: 3600, exit_time_secs: 1800,
    snapshot: { threshold: 4, time_lock_secs: 0, member_count: 8, members_hash: zero32, replaced_7d: 0, taken_at: bn(0n) },
    members: [], presigners: [], flag: { Red: {} }, reasons: 1, active_reasons: 1,
    amber_since: bn(0n), red_since: bn(0n), clear_since: bn(0n), baseline_threshold: 4, replaced_window_start: bn(0n),
    replaced_window_base: 0, low_threshold_since: bn(0n), last_update_slot: bn(0n),
    bump: 255, pending_upgrades: [],
  });
  const vault = await vaultCoder.accounts.encode("Vault", {
    venue: venueKey, pool: new PublicKey(dump.pool.address), lp_mint: JLP_MINT, usdc_mint: USDC_MINT,
    share_mint: vaultAddrs.shareMint, vault_usdc: vaultAddrs.vaultUsdc, vault_lp: vaultAddrs.vaultLp,
    share_escrow: vaultAddrs.shareEscrow, exited: false, exited_at_slot: bn(0n), exits: 0, reentry_votes: bn(0n),
    bump: PublicKey.findProgramAddressSync([Buffer.from("vault"), venueKey.toBuffer()], VAULT_PROGRAM_ID)[1],
  });
  return [
    { address: venueKey, owner: ORACLE_PROGRAM_ID, data: venue },
    { address: vaultAddrs.vault, owner: VAULT_PROGRAM_ID, data: vault },
  ];
}
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
      // The vault, its venue, and the token accounts it exits with.
      ...(await pexizAccounts()),
      { address: vaultAddrs.vaultLp, owner: TOKEN_PROGRAM_ID, data: tokenAccount(JLP_MINT, vaultAddrs.vault, LP_AMOUNT) },
      { address: vaultAddrs.vaultUsdc, owner: TOKEN_PROGRAM_ID, data: tokenAccount(USDC_MINT, vaultAddrs.vault, 0n) },
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

test.skipIf(!ready)("and the vault itself, through exit_jlp, with the floor from the pool's own AUM", async () => {
  const usdc = dump.custodies.find((c) => c.mint === USDC_MINT.toBase58())!;
  const lpOut = LP_AMOUNT / 10n;
  const floor = exitFloor(lpOut, await poolAum(), await mintSupply(JLP_MINT));
  const ix = await exitJlpIx(vaultAddrs, {
    pool: new PublicKey(dump.pool.address),
    lpMint: JLP_MINT,
    ...jupiterPerpsPdas(),
    custody: new PublicKey(usdc.address),
    custodyDovesPriceAccount: new PublicKey(usdc.priceAccounts[DOVES_PRICE].address),
    custodyPythnetPriceAccount: new PublicKey(usdc.priceAccounts[0].address),
    custodyTokenAccount: new PublicKey(usdc.tokenAccount),
    jupiterProgram: JUPITER_PERPS_ID,
    aumAccounts: [
      ...dump.custodies.map((c) => new PublicKey(c.address)),
      ...dump.custodies.map((c) => new PublicKey(c.priceAccounts[DOVES_PRICE].address)),
    ],
  }, lpOut, floor);
  await send(v, [ix]);
  const acc = await v.conn.getAccountInfo(vaultAddrs.vaultUsdc);
  const got = AccountLayout.decode(acc!.data).amount;
  console.log(`vault: ${lpOut} JLP out, ${got} USDC back, floor was ${floor}`);
  expect(got).toBeGreaterThanOrEqual(floor);
  expect(decodeVault((await v.conn.getAccountInfo(vaultAddrs.vault))!.data).exited).toBe(true);
}, 120_000);
