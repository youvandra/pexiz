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
import {
  ACCOUNT_SIZE, AccountLayout, MINT_SIZE, MintLayout, TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction, createTransferInstruction, getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { JLP_MINT, JUPITER_PERPS_ID, jupiterPerpsPdas, removeLiquidity2Ix } from "@pexiz/sdk/src/jlp";
import { bn } from "@pexiz/sdk/src/canary";
import { ORACLE_PROGRAM_ID, oracleCoder } from "@pexiz/sdk/src/oracle";
import {
  VAULT_PROGRAM_ID, decodeVault, depositJlpIx, exitFloor, exitJlpIx, initJlpVaultIx, jlpNav, jlpVaultAddresses,
  reenterJlpIx, vaultCoder, withdrawIx, type JlpVaultAddresses,
} from "@pexiz/sdk/src/vault";
import {
  autoExitJlpIx, decodeGuard, guardPda, openRouteIx, parseGuardExited, protectJlpIxs,
} from "@pexiz/sdk/src/exit";
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
/** How far ahead the cloned prices are stamped, so one run of this file fits. */
const FRESH_FOR_SECS = 300;
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
/** The USDC a depositor brings. */
const DEPOSIT_USDC = 5_000_000_000n; // $5,000
/**
 * Two venues, preloaded at the flags a crank would have left: one green, so a
 * vault can be opened and funded, and one red, so a vault can leave. A flag
 * cannot be moved here, because this validator has no Squads multisig for
 * Jupiter to read.
 */
const greenVenue = Keypair.generate().publicKey;
const redVenue = Keypair.generate().publicKey;
/** A third venue, green again, for the vault that is coming back. */
const returningVenue = Keypair.generate().publicKey;
let open: JlpVaultAddresses;
let leaving: JlpVaultAddresses;
let returning: JlpVaultAddresses;
/** What the returning vault holds in USDC, and the shares that voted it back. */
const RETURNING_USDC = 2_000_000_000n;
const RETURNING_SHARES = 1_000_000_000n;

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

/**
 * A vault already out and already voted back in, as a crank and its holders
 * would have left it. It is preloaded because a flag cannot be moved on this
 * validator: Jupiter's Squads multisig is not here for the oracle to read, so
 * the same vault cannot be walked from green to red and back.
 */
async function returningVault(): Promise<PreloadedAccount[]> {
  returning = jlpVaultAddresses(returningVenue, USDC_MINT, new PublicKey(dump.pool.address));
  const data = await vaultCoder.accounts.encode("Vault", {
    venue: returningVenue, pool: new PublicKey(dump.pool.address), lp_mint: JLP_MINT, usdc_mint: USDC_MINT,
    share_mint: returning.shareMint, vault_usdc: returning.vaultUsdc, vault_lp: returning.vaultLp,
    share_escrow: returning.shareEscrow, exited: true, exited_at_slot: bn(0n), exits: 1,
    reentry_votes: bn(RETURNING_SHARES), bump: PublicKey.findProgramAddressSync([Buffer.from("vault"), returningVenue.toBuffer()], VAULT_PROGRAM_ID)[1],
  });
  const mint = Buffer.alloc(MINT_SIZE);
  MintLayout.encode({
    mintAuthorityOption: 1, mintAuthority: returning.vault, supply: RETURNING_SHARES, decimals: 6,
    isInitialized: true, freezeAuthorityOption: 0, freezeAuthority: PublicKey.default,
  }, mint);
  return [
    { address: returning.vault, owner: VAULT_PROGRAM_ID, data },
    { address: returning.shareMint, owner: TOKEN_PROGRAM_ID, data: mint },
  ];
}

/** A venue account as the oracle would have left it, at the flag given. */
async function venueAccount(address: PublicKey, flag: "Green" | "Red"): Promise<PreloadedAccount> {
  const zero32 = Array.from({ length: 32 }, () => 0);
  const data = await oracleCoder.accounts.encode("Venue", {
    params_program: JUPITER_PERPS_ID, program_data: PublicKey.default, multisig: PublicKey.default,
    upgrade_authority: PublicKey.default, vault_index: 0, min_time_lock_secs: 3600, exit_time_secs: 1800,
    snapshot: { threshold: 4, time_lock_secs: 0, member_count: 8, members_hash: zero32, replaced_7d: 0, taken_at: bn(0n) },
    members: [], presigners: [], flag: { [flag]: {} }, reasons: 1, active_reasons: 1,
    amber_since: bn(0n), red_since: bn(0n), clear_since: bn(0n), baseline_threshold: 4, replaced_window_start: bn(0n),
    replaced_window_base: 0, low_threshold_since: bn(0n), last_update_slot: bn(0n),
    bump: 255, pending_upgrades: [],
  });
  return { address, owner: ORACLE_PROGRAM_ID, data };
}
const owner = Keypair.generate();
/** A JLP holder who never deposits anywhere: they approve the exit program and keep the JLP in their wallet. */
const holder = Keypair.generate();
const keeper = Keypair.generate();

beforeAll(async () => {
  if (!ready) return;
  dump = await Bun.file(INDEX).json();
  // The pool refuses a price older than 5 seconds, and a dump is older than
  // that the moment it is written, so the cloned Doves accounts are restamped
  // before the validator starts. The stamp is set a few minutes ahead, which
  // the pool accepts, so every test in this file stays inside the window.
  // Only the timestamp is touched; the price is the one that was on mainnet
  // when `jlp.py` ran.
  const doves = new Map(dump.custodies.map((c) => [c.priceAccounts[DOVES_PRICE].address, c.priceAccounts[DOVES_PRICE].owner]));
  const restamped: PreloadedAccount[] = [];
  for (const [address, dovesOwner] of doves) {
    const raw = await Bun.file(join(DIR, `${address}.json`)).json();
    const data = Buffer.from(raw.account.data[0], "base64");
    data.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1000) + FRESH_FOR_SECS), DOVES_PUBLISH_TIME);
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
  // The wallet gets two lots: one it redeems itself, one it hands to a vault.
  const holding = (holder: PublicKey, lots = 1n) => [
    { address: getAssociatedTokenAddressSync(JLP_MINT, holder, true), owner: TOKEN_PROGRAM_ID, data: tokenAccount(JLP_MINT, holder, LP_AMOUNT * lots) },
    { address: getAssociatedTokenAddressSync(new PublicKey(sol.mint), holder, true), owner: TOKEN_PROGRAM_ID, data: tokenAccount(new PublicKey(sol.mint), holder, 0n) },
  ];
  v = await startValidator({
    canaryAuthority: PublicKey.default,
    programs: [[JUPITER_PERPS_ID, SO], [PROBE_ID, PROBE_SO]],
    accountFiles: files.map((f) => ({ address: new PublicKey(f.replace(/\.json$/, "")), file: join(DIR, f) })),
    accounts: [
      // The JLP each owner is about to burn, and the account the wSOL comes back to.
      ...holding(owner.publicKey, 2n),
      ...holding(PROBE_OWNER),
      // The auto-exit holder's JLP and empty USDC account, and the keeper's USDC account.
      ...holding(holder.publicKey),
      { address: getAssociatedTokenAddressSync(USDC_MINT, holder.publicKey, true), owner: TOKEN_PROGRAM_ID, data: tokenAccount(USDC_MINT, holder.publicKey, 0n) },
      { address: getAssociatedTokenAddressSync(USDC_MINT, keeper.publicKey, true), owner: TOKEN_PROGRAM_ID, data: tokenAccount(USDC_MINT, keeper.publicKey, 0n) },
      // The venues the two vaults watch, and the USDC a depositor brings.
      await venueAccount(greenVenue, "Green"),
      await venueAccount(redVenue, "Red"),
      await venueAccount(returningVenue, "Green"),
      ...(await returningVault()),
      { address: getAssociatedTokenAddressSync(USDC_MINT, owner.publicKey, true), owner: TOKEN_PROGRAM_ID, data: tokenAccount(USDC_MINT, owner.publicKey, DEPOSIT_USDC) },
      { address: returning.vaultUsdc, owner: TOKEN_PROGRAM_ID, data: tokenAccount(USDC_MINT, returning.vault, RETURNING_USDC) },
      { address: returning.vaultLp, owner: TOKEN_PROGRAM_ID, data: tokenAccount(JLP_MINT, returning.vault, 0n) },
      ...restamped,
    ],
  });
  await v.conn.confirmTransaction(await v.conn.requestAirdrop(owner.publicKey, 1_000_000_000), "confirmed");
  await v.conn.confirmTransaction(await v.conn.requestAirdrop(holder.publicKey, 1_000_000_000), "confirmed");
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

/** The USDC custody: what a Pexiz vault deposits through and exits into. */
function usdcCustody() {
  const c = dump.custodies.find((x) => x.mint === USDC_MINT.toBase58())!;
  return {
    address: new PublicKey(c.address),
    liquidity: {
      ...jupiterPerpsPdas(),
      custody: new PublicKey(c.address),
      custodyDovesPriceAccount: new PublicKey(c.priceAccounts[DOVES_PRICE].address),
      custodyPythnetPriceAccount: new PublicKey(c.priceAccounts[0].address),
      custodyTokenAccount: new PublicKey(c.tokenAccount),
      jupiterProgram: JUPITER_PERPS_ID,
      aumAccounts: [
        ...dump.custodies.map((x) => new PublicKey(x.address)),
        ...dump.custodies.map((x) => new PublicKey(x.priceAccounts[DOVES_PRICE].address)),
      ],
    },
  };
}

const balance = async (account: PublicKey) => AccountLayout.decode((await v.conn.getAccountInfo(account))!.data).amount;

test.skipIf(!ready)("a vault can be opened against the real pool and funded with real JLP", async () => {
  const { address: custody, liquidity } = usdcCustody();
  const pool = new PublicKey(dump.pool.address);
  open = jlpVaultAddresses(greenVenue, USDC_MINT, pool);
  const userShares = getAssociatedTokenAddressSync(open.shareMint, owner.publicKey, true);
  await send(v, [
    await initJlpVaultIx(v.payer.publicKey, open, custody),
    createAssociatedTokenAccountIdempotentInstruction(v.payer.publicKey, userShares, owner.publicKey, open.shareMint),
  ]);
  // Its own transaction: the deposit already carries Jupiter's fourteen
  // accounts and every custody behind them.
  await send(v, [
    await depositJlpIx(open, liquidity, owner.publicKey, getAssociatedTokenAddressSync(USDC_MINT, owner.publicKey, true), userShares, DEPOSIT_USDC),
  ], [owner]);

  const held = await balance(open.vaultLp);
  const shares = await balance(userShares);
  const worth = jlpNav(0n, held, await poolAum(), await mintSupply(JLP_MINT));
  console.log(`vault opened: $${DEPOSIT_USDC / 1_000_000n} in, ${held} JLP held, worth ${worth}, ${shares} shares out`);
  // The first deposit mints one share per USDC, and the JLP bought is worth
  // about what was paid: Jupiter charges a fee, so it is a little less.
  expect(shares).toBe(DEPOSIT_USDC);
  expect(worth).toBeGreaterThan((DEPOSIT_USDC * 97n) / 100n);
  expect(worth).toBeLessThanOrEqual(DEPOSIT_USDC);
}, 120_000);

test.skipIf(!ready)("and a vault on a red venue leaves, at no worse than the pool's own price", async () => {
  const { address: custody, liquidity } = usdcCustody();
  const pool = new PublicKey(dump.pool.address);
  leaving = jlpVaultAddresses(redVenue, USDC_MINT, pool);
  await send(v, [await initJlpVaultIx(v.payer.publicKey, leaving, custody)]);
  // This vault is funded by hand: its venue is already red, so it could never
  // have taken a deposit.
  await send(v, [
    createTransferInstruction(getAssociatedTokenAddressSync(JLP_MINT, owner.publicKey, true), leaving.vaultLp, owner.publicKey, LP_AMOUNT),
  ], [owner]);

  const floor = exitFloor(LP_AMOUNT, await poolAum(), await mintSupply(JLP_MINT));
  await send(v, [await exitJlpIx(leaving, liquidity, LP_AMOUNT, floor)]);

  const got = await balance(leaving.vaultUsdc);
  console.log(`vault exited: ${LP_AMOUNT} JLP out, ${got} USDC back, floor was ${floor}`);
  expect(got).toBeGreaterThanOrEqual(floor);
  expect(await balance(leaving.vaultLp)).toBe(0n);
  expect(decodeVault((await v.conn.getAccountInfo(leaving.vault))!.data).exited).toBe(true);
}, 120_000);

test.skipIf(!ready)("and a holder withdraws their share of the JLP vault", async () => {
  const userShares = getAssociatedTokenAddressSync(open.shareMint, owner.publicKey, true);
  const userLp = getAssociatedTokenAddressSync(JLP_MINT, owner.publicKey, true);
  const userUsdc = getAssociatedTokenAddressSync(USDC_MINT, owner.publicKey, true);
  const half = (await balance(userShares)) / 2n;
  const heldBefore = await balance(open.vaultLp);
  const mineBefore = await balance(userLp);

  await send(v, [await withdrawIx(open, owner.publicKey, { userShares, userUsdc, userLp }, half)], [owner]);

  const got = (await balance(userLp)) - mineBefore;
  console.log(`withdrew ${half} shares: ${got} JLP out of ${heldBefore} held`);
  // Half the shares, half the JLP, with the rounding in the vault's favour.
  expect(got).toBeGreaterThan((heldBefore / 2n) - 2n);
  expect(got).toBeLessThanOrEqual(heldBefore / 2n);
}, 120_000);

test.skipIf(!ready)("and a vault that was voted back buys its JLP again", async () => {
  const { liquidity } = usdcCustody();
  await send(v, [await reenterJlpIx(returning, liquidity)]);

  const bought = await balance(returning.vaultLp);
  const worth = jlpNav(0n, bought, await poolAum(), await mintSupply(JLP_MINT));
  const after = decodeVault((await v.conn.getAccountInfo(returning.vault))!.data);
  console.log(`vault returned: ${RETURNING_USDC} USDC in, ${bought} JLP held, worth ${worth}`);
  expect(await balance(returning.vaultUsdc)).toBe(0n);
  expect(worth).toBeGreaterThan((RETURNING_USDC * 97n) / 100n);
  expect(after.exited).toBe(false);
  expect(after.reentryVotes).toBe(0n);
}, 120_000);

test.skipIf(!ready)("a holder who never deposited is taken out of the real pool by a keeper, to their own wallet", async () => {
  const { liquidity } = usdcCustody();
  const holderLp = getAssociatedTokenAddressSync(JLP_MINT, holder.publicKey, true);
  const holderUsdc = getAssociatedTokenAddressSync(USDC_MINT, holder.publicKey, true);
  const keeperUsdc = getAssociatedTokenAddressSync(USDC_MINT, keeper.publicKey, true);
  await send(v, [await openRouteIx(v.payer.publicKey, USDC_MINT), await openRouteIx(v.payer.publicKey, JLP_MINT)]);
  // One signature from the holder: approve the exit program and name the venue.
  await send(v, await protectJlpIxs(holder.publicKey, redVenue, holderLp, holderUsdc, LP_AMOUNT), [holder]);

  const floor = exitFloor(LP_AMOUNT, await poolAum(), await mintSupply(JLP_MINT));
  // Anyone can send this; here the validator's payer does, naming the keeper's account for the fee.
  const sig = await send(v, [await autoExitJlpIx({ holder: holder.publicKey, venue: redVenue, usdcDest: holderUsdc }, liquidity, holderLp, keeperUsdc)]);
  const tx = await v.conn.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  const [e] = parseGuardExited(tx!.meta!.logMessages!);

  const got = await balance(holderUsdc);
  const fee = await balance(keeperUsdc);
  console.log(`auto-exit: ${LP_AMOUNT} JLP out of the holder's wallet, ${got} USDC to the holder, ${fee} to the keeper, floor ${floor}`);
  expect(await balance(holderLp)).toBe(0n);
  expect(e.usdcOut).toBeGreaterThanOrEqual(floor);
  expect(got + fee).toBe(e.usdcOut);
  expect(fee).toBe((e.usdcOut * 10n) / 10_000n);
  expect(decodeGuard((await v.conn.getAccountInfo(guardPda(holder.publicKey, JLP_MINT)))!.data).exits).toBe(1);
}, 120_000);

test.skipIf(!ready)("and the same exit is refused on a green venue", async () => {
  const { liquidity } = usdcCustody();
  const other = Keypair.generate();
  await v.conn.confirmTransaction(await v.conn.requestAirdrop(other.publicKey, 1_000_000_000), "confirmed");
  const lp = getAssociatedTokenAddressSync(JLP_MINT, owner.publicKey, true);
  const usdc = getAssociatedTokenAddressSync(USDC_MINT, owner.publicKey, true);
  await send(v, await protectJlpIxs(owner.publicKey, greenVenue, lp, usdc, 1n), [owner]);
  const ix = await autoExitJlpIx({ holder: owner.publicKey, venue: greenVenue, usdcDest: usdc }, liquidity, lp, getAssociatedTokenAddressSync(USDC_MINT, keeper.publicKey, true));
  await expect(send(v, [ix])).rejects.toThrow(/VenueNotRed|0x1771/);
}, 120_000);
