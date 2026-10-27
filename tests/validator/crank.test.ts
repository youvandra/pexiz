// Integration test on a local solana-test-validator: the crank finds a real
// System nonce account (amber), then sees the timelock cut and sends the
// oracle update and the vault exit in one transaction, then takes a holder
// who guarded their own LP out to their wallet.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { Keypair, NONCE_ACCOUNT_LENGTH, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction, createMint, getAssociatedTokenAddressSync, mintTo,
} from "@solana/spl-token";
import {
  addLiquidityIx, openRouteIx, parseGuardExited, protectCanaryIxs,
  CANARY_PROGRAM_ID, Permission, SQUADS_V4_ID, VAULT_PROGRAM_ID, canaryPool, decodeMultisig, decodeVault, depositIx,
  initPoolIx, initVaultIx, registerVenueIx, vaultAddresses, vaultPda, venuePda, encodeMultisig, type Multisig,
} from "@pexiz/sdk";
import { Crank, type CycleResult } from "../../services/crank/src/crank";
import { poll } from "../../services/alerts/src/sources";
import { formatAlert } from "../../services/alerts/src/format";
import { send, setMultisigIx, startValidator, type Validator } from "./harness";

let v: Validator;
const multisig = Keypair.generate().publicKey;
const members = Array.from({ length: 5 }, () => Keypair.generate());
const ms: Multisig = {
  createKey: Keypair.generate().publicKey, configAuthority: PublicKey.default, threshold: 3, timeLock: 86_400,
  transactionIndex: 0n, staleTransactionIndex: 0n, rentCollector: null, bump: 255,
  members: members.map((k) => ({ key: k.publicKey, permissions: Permission.All })),
};
const lines: string[] = [];
let crank: Crank;

beforeAll(async () => {
  v = await startValidator({
    canaryAuthority: vaultPda(multisig)[0],
    accounts: [{ address: multisig, owner: SQUADS_V4_ID, data: encodeMultisig(ms) }],
  });
  crank = new Crank(v.conn, v.payer, { log: (l) => lines.push(l) });
}, 90_000);

afterAll(() => v?.stop());

test("crank: green no-op, nonce → amber, timelock cut → update+exit in one tx", async () => {
  const { conn, payer } = v;
  const usdc = await createMint(conn, payer, payer.publicKey, null, 6);
  const pool = canaryPool(usdc);
  await send(v, [await initPoolIx(payer.publicKey, pool)]);
  await send(v, [await registerVenueIx(payer.publicKey, { program: CANARY_PROGRAM_ID, multisig, minTimeLockSecs: 3600, exitTimeSecs: 600 })]);
  const va = vaultAddresses(venuePda(CANARY_PROGRAM_ID), usdc);
  await send(v, [await initVaultIx(payer.publicKey, va)]);

  const userUsdc = getAssociatedTokenAddressSync(usdc, payer.publicKey);
  const userShares = getAssociatedTokenAddressSync(va.shareMint, payer.publicKey, true);
  await send(v, [
    createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, userUsdc, payer.publicKey, usdc),
    createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, userShares, payer.publicKey, va.shareMint),
  ]);
  await mintTo(conn, payer, usdc, userUsdc, payer, 5_000_000_000n);
  await send(v, [await depositIx(va, payer.publicKey, userUsdc, userShares, 5_000_000_000n)]);

  // A holder keeps 300 USDC of canary LP in their own wallet and guards it.
  const holder = Keypair.generate();
  await conn.confirmTransaction(await conn.requestAirdrop(holder.publicKey, 1_000_000_000), "confirmed");
  const holderUsdc = getAssociatedTokenAddressSync(usdc, holder.publicKey);
  const holderLp = getAssociatedTokenAddressSync(pool.lpMint, holder.publicKey);
  await send(v, [
    createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, holderUsdc, holder.publicKey, usdc),
    createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, holderLp, holder.publicKey, pool.lpMint),
    await openRouteIx(payer.publicKey, usdc),
  ]);
  await mintTo(conn, payer, usdc, holderUsdc, payer, 300_000_000n);
  await send(v, [await addLiquidityIx(pool, { user: holder.publicKey, userUsdc: holderUsdc, userLp: holderLp }, 300_000_000n)], [holder]);
  await send(v, await protectCanaryIxs(holder.publicKey, venuePda(CANARY_PROGRAM_ID), pool, holderLp, holderUsdc, 300_000_000n), [holder]);

  // The alerts service polls the oracle in the background.
  const alerts: string[] = [];
  const stopAlerts = new AbortController();
  const polling = poll(conn, (e) => { alerts.push(formatAlert(e)); }, 300, stopAlerts.signal);

  // Cycle 1: healthy, nothing to send.
  let r: CycleResult[] = await crank.cycle();
  expect(r.length).toBe(1);
  expect(r[0]).toMatchObject({ from: "green", to: "green", action: "none", proofs: 0 });

  // A member creates a real durable nonce account.
  const nonce = Keypair.generate();
  const rent = await conn.getMinimumBalanceForRentExemption(NONCE_ACCOUNT_LENGTH);
  await send(v, [
    SystemProgram.createAccount({ fromPubkey: payer.publicKey, newAccountPubkey: nonce.publicKey, lamports: rent, space: NONCE_ACCOUNT_LENGTH, programId: SystemProgram.programId }),
    SystemProgram.nonceInitialize({ noncePubkey: nonce.publicKey, authorizedPubkey: members[2].publicKey }),
  ], [nonce]);
  r = await crank.cycle();
  expect(r[0]).toMatchObject({ from: "green", to: "amber", action: "update", proofs: 1 });

  // The multisig cuts its timelock to 0.
  const cur = decodeMultisig((await conn.getAccountInfo(multisig))!.data);
  await send(v, [setMultisigIx(v, multisig, { ...cur, timeLock: 0 })]);
  r = await crank.cycle();
  expect(r[0]).toMatchObject({ from: "amber", to: "red", action: "update+exit" });

  const tx = await conn.getTransaction(r[0].signature!, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  const programs = tx!.transaction.message.compiledInstructions.map((ix) => tx!.transaction.message.staticAccountKeys[ix.programIdIndex].toBase58());
  expect(programs).toContain("68dVVoeeYPmcPrNRycHwJAsLK25tMn6yiQhHQDWp2d7n");
  expect(programs).toContain(VAULT_PROGRAM_ID.toBase58());
  const vault = decodeVault((await conn.getAccountInfo(va.vault))!.data);
  expect(vault.exited).toBe(true);
  expect(vault.exitedAtSlot).toBe(BigInt(tx!.slot));
  expect((await conn.getTokenAccountBalance(va.vaultUsdc)).value.amount).toBe("4995000000");

  // The same cycle took the guarded holder out: 300 LP at 99.9%, less the crank's 0.1%.
  expect(r[0].guardExits?.length).toBe(1);
  const gx = await conn.getTransaction(r[0].guardExits![0].signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  expect(parseGuardExited(gx!.meta!.logMessages!)[0].usdcOut).toBe(299_700_000n);
  expect((await conn.getTokenAccountBalance(holderLp)).value.amount).toBe("0");
  expect((await conn.getTokenAccountBalance(holderUsdc)).value.amount).toBe(String(299_700_000n - 299_700n));

  // Cycle 4: already red and exited; nothing to send.
  r = await crank.cycle();
  expect(r[0]).toMatchObject({ from: "red", to: "red", action: "none" });

  await Bun.sleep(1500);
  stopAlerts.abort();
  await polling;
  expect(alerts.length).toBe(2);
  expect(alerts[0]).toContain("AMBER");
  expect(alerts[1]).toContain("RED");

  const cycleLines = lines.filter((l) => !l.startsWith("guard exit"));
  expect(cycleLines.length).toBe(4);
  expect(lines.filter((l) => l.startsWith("guard exit")).length).toBe(1);
  for (const l of cycleLines) expect(l).toMatch(/venue=CHpLfS2B.* flag=\S+ reasons=\S+ proofs=\d action=\S+/);
}, 120_000);
