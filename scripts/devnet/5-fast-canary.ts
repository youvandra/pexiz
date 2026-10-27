// The fast canary: a venue the oracle times in minutes, so a visitor can watch
// a whole attack, exit and recovery. It watches the no-op program in
// fast-canary/, whose upgrade authority sits under its own Squads multisig
// (3 of 5, 60 s timelock). Its vault holds the same canary pool LP as the
// slow one.
//
//   bun run 5-fast-canary.ts setup     deploy the program, multisig, venue, vault, 100,000 USDC deposit
//   bun run 5-fast-canary.ts attack    SetTimeLock 0, wait out the 60 s timelock, execute, crank
//   bun run 5-fast-canary.ts restore   SetTimeLock 60 (runs at once), crank; green 5 min later
//   bun run 5-fast-canary.ts reenter   once green: vote every share, reenter, take the votes back
//   bun run 5-fast-canary.ts status
//
// Build the program first: `cd fast-canary && cargo build-sbf`.
import { PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync, mintTo } from "@solana/spl-token";
import * as multisig from "@sqds/multisig";
import { join } from "node:path";
import {
  BPF_LOADER_UPGRADEABLE_ID, FAST_CANARY_PROGRAM_ID, decodeVault, decodeVenue, depositIx, initVaultIx, programDataAddress,
  reenterIx, registerVenueIx, unvoteIx, vaultAddresses, venuePda, voteReenterIx,
} from "@pexiz/sdk";
import { Crank } from "@pexiz/crank";
import { KEYS, conn, namedKeypair, payer, pk, readState, record, rpcUrl, writeState } from "./common";

const TIME_LOCK = 60;
const stage = process.argv[2];
const state = readState();
const members = [0, 1, 2, 3, 4].map((i) => namedKeypair(`member-${i}`));
const createKey = namedKeypair("fast-squads-create-key");
const [msPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });
const [squadsVault] = multisig.getVaultPda({ multisigPda: msPda, index: 0 });
const venue = venuePda(FAST_CANARY_PROGRAM_ID);

const send = (ixs: TransactionInstruction[]) => sendAndConfirmTransaction(conn, new Transaction().add(...ixs), [payer], { commitment: "confirmed" });

async function landed(sig: string): Promise<string> {
  const bh = await conn.getLatestBlockhash("confirmed");
  await conn.confirmTransaction({ signature: sig, ...bh }, "confirmed");
  return sig;
}

function addresses() {
  return vaultAddresses(venue, pk(state.usdcMint, "usdcMint"));
}

async function crank(step: string) {
  const results = await new Crank(conn, payer, { memberDelayMs: 300 }).cycle();
  const r = results.find((x) => x.venue.equals(venue));
  if (r?.signature) record(`fast: ${step} crank ${r.from} -> ${r.to} (${r.action})`, r.signature);
  else console.log(`crank: ${r ? `${r.from} -> ${r.to}, ${r.action}${r.error ? `, ${r.error}` : ""}` : "venue not found"}`);
}

/** Creates, proposes and approves (3 of 5) a SetTimeLock config transaction, then executes it once the timelock allows. */
async function setTimeLock(secs: number) {
  const ms = await multisig.accounts.Multisig.fromAccountAddress(conn, msPda);
  const transactionIndex = BigInt(ms.transactionIndex.toString()) + 1n;
  await landed(await multisig.rpc.configTransactionCreate({
    connection: conn, feePayer: payer, multisigPda: msPda, transactionIndex, creator: members[0].publicKey,
    rentPayer: payer.publicKey, actions: [{ __kind: "SetTimeLock", newTimeLock: secs }], signers: [members[0]],
  }));
  await landed(await multisig.rpc.proposalCreate({
    connection: conn, feePayer: payer, creator: members[0], rentPayer: payer, multisigPda: msPda, transactionIndex,
  }));
  for (const m of members.slice(0, 3)) {
    await landed(await multisig.rpc.proposalApprove({ connection: conn, feePayer: payer, member: m, multisigPda: msPda, transactionIndex }));
  }
  const wait = ms.timeLock;
  if (wait > 0) {
    console.log(`approved; waiting out the ${wait} s timelock`);
    await Bun.sleep((wait + 3) * 1000);
  }
  for (let i = 0; ; i++) {
    try {
      record(`fast: squads SetTimeLock ${secs} executed`, await landed(await multisig.rpc.configTransactionExecute({
        connection: conn, feePayer: payer, multisigPda: msPda, transactionIndex, member: members[0], rentPayer: payer, signers: [members[0]],
      })));
      return;
    } catch (e) {
      if (i >= 5) throw e;
      await Bun.sleep(5000);
    }
  }
}

if (stage === "setup") {
  const prog = await conn.getAccountInfo(FAST_CANARY_PROGRAM_ID);
  if (!prog) {
    const p = Bun.spawnSync([
      "solana", "program", "deploy", "--url", rpcUrl, "--keypair", (process.env.PEXIZ_KEYPAIR ?? "~/.config/solana/id.json").replace(/^~/, process.env.HOME ?? ""),
      "--program-id", join(KEYS, "fast_canary-keypair.json"), join(import.meta.dir, "fast-canary/target/deploy/fast_canary.so"), "--output", "json",
    ]);
    if (p.exitCode !== 0) throw new Error(`fast_canary deploy failed:\n${p.stdout}\n${p.stderr}`);
    const j = JSON.parse(p.stdout.toString());
    if (j.signature) record("fast: deploy fast_canary", j.signature);
  }

  if (!(await conn.getAccountInfo(msPda))) {
    const [configPda] = multisig.getProgramConfigPda({});
    const { treasury } = await multisig.accounts.ProgramConfig.fromAccountAddress(conn, configPda);
    record(`fast: squads multisigCreateV2 3-of-5, ${TIME_LOCK} s timelock`, await landed(await multisig.rpc.multisigCreateV2({
      connection: conn, treasury, createKey, creator: payer, multisigPda: msPda, configAuthority: null,
      threshold: 3, timeLock: TIME_LOCK, rentCollector: null,
      members: members.map((m) => ({ key: m.publicKey, permissions: multisig.types.Permissions.all() })),
    })));
  }

  const pd = await conn.getAccountInfo(programDataAddress(FAST_CANARY_PROGRAM_ID));
  const current = pd && pd.data[12] === 1 ? new PublicKey(pd.data.subarray(13, 45)) : null;
  if (current && !current.equals(squadsVault)) {
    const data = Buffer.alloc(4);
    data.writeUInt32LE(4, 0); // BPF upgradeable loader SetAuthority
    record("fast: upgrade authority -> squads vault", await send([new TransactionInstruction({
      programId: BPF_LOADER_UPGRADEABLE_ID,
      keys: [
        { pubkey: programDataAddress(FAST_CANARY_PROGRAM_ID), isSigner: false, isWritable: true },
        { pubkey: payer.publicKey, isSigner: true, isWritable: false },
        { pubkey: squadsVault, isSigner: false, isWritable: false },
      ],
      data,
    })]));
  }

  if (!(await conn.getAccountInfo(venue))) {
    record("fast: oracle register_venue", await send([await registerVenueIx(payer.publicKey, {
      program: FAST_CANARY_PROGRAM_ID, multisig: msPda, minTimeLockSecs: 30, exitTimeSecs: 0,
    })]));
  }
  const v = addresses();
  if (!(await conn.getAccountInfo(v.vault))) record("fast: vault init_vault", await send([await initVaultIx(payer.publicKey, v)]));

  const usdc = pk(state.usdcMint, "usdcMint");
  const userUsdc = getAssociatedTokenAddressSync(usdc, payer.publicKey);
  const userShares = getAssociatedTokenAddressSync(v.shareMint, payer.publicKey, true);
  await send([
    createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, userUsdc, payer.publicKey, usdc),
    createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, userShares, payer.publicKey, v.shareMint),
  ]);
  // The house deposit is large so its own vote always carries re-entry,
  // whatever visitors deposit beside it.
  if ((await conn.getTokenAccountBalance(v.vaultLp)).value.amount === "0") {
    await mintTo(conn, payer, usdc, userUsdc, payer, 100_000_000_000n);
    record("fast: vault deposit 100,000 test USDC", await send([await depositIx(v, payer.publicKey, userUsdc, userShares, 100_000_000_000n)]));
  }
  writeState({ ...readState(), fastMultisig: msPda.toBase58(), fastVenue: venue.toBase58(), fastVault: v.vault.toBase58() });
  console.log(`fast multisig ${msPda.toBase58()}\nsquads vault ${squadsVault.toBase58()}\nvenue ${venue.toBase58()}\nescape vault ${v.vault.toBase58()}`);
} else if (stage === "attack") {
  await setTimeLock(0);
  await crank("attack");
} else if (stage === "restore") {
  await setTimeLock(TIME_LOCK);
  await crank("restore");
  console.log("the flag turns green after 5 minutes clear; run status, then reenter");
} else if (stage === "reenter") {
  await crank("reenter");
  const v = addresses();
  const userShares = getAssociatedTokenAddressSync(v.shareMint, payer.publicKey, true);
  const shares = BigInt((await conn.getTokenAccountBalance(userShares)).value.amount);
  record("fast: vote_reenter, reenter, unvote", await send([
    await voteReenterIx(v, payer.publicKey, userShares, shares),
    await reenterIx(v),
    await unvoteIx(v, payer.publicKey, userShares),
  ]));
} else if (stage === "status") {
  const ven = await conn.getAccountInfo(venue);
  const ms = await multisig.accounts.Multisig.fromAccountAddress(conn, msPda).catch(() => null);
  const vlt = await conn.getAccountInfo(addresses().vault);
  console.log({
    timeLock: ms?.timeLock,
    flag: ven ? decodeVenue(ven.data).flag : "unregistered",
    exited: vlt ? decodeVault(vlt.data).exited : "no vault",
  });
} else {
  console.error("usage: bun run 5-fast-canary.ts setup|attack|restore|reenter|status");
  process.exit(1);
}
