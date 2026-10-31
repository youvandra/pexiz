// Stands up the canary venue on devnet:
//  1. a Squads v4 multisig, 3 of 5, 24 h timelock, through the real Squads program;
//  2. the canary program's upgrade authority moved to the multisig vault PDA;
//  3. a test USDC mint and the canary pool;
//  4. the oracle venue and the escape vault, with a 1,000 USDC deposit.
import { PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, createMint, getAssociatedTokenAddressSync, mintTo } from "@solana/spl-token";
import * as multisig from "@sqds/multisig";
import {
  BPF_LOADER_UPGRADEABLE_ID, CANARY_PROGRAM_ID, canaryPool, depositIx, initPoolIx, initVaultIx, programDataAddress,
  registerVenueIx, vaultAddresses, venuePda,
} from "@pexiz/sdk";
import { conn, namedKeypair, payer, readState, record, writeState } from "./common";

const send = (ixs: TransactionInstruction[]) => sendAndConfirmTransaction(conn, new Transaction().add(...ixs), [payer], { commitment: "confirmed" });
const state = readState();
const members = [0, 1, 2, 3, 4].map((i) => namedKeypair(`member-${i}`));

// Members need a little SOL to sign proposals and votes.
for (const m of members) {
  if ((await conn.getBalance(m.publicKey)) < 20_000_000) {
    record(`fund ${m.publicKey.toBase58().slice(0, 8)}`, await send([SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: m.publicKey, lamports: 50_000_000 })]));
  }
}

// 1. Squads multisig.
const createKey = namedKeypair("squads-create-key");
const [msPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });
const [vaultPda] = multisig.getVaultPda({ multisigPda: msPda, index: 0 });
if (!(await conn.getAccountInfo(msPda))) {
  const [configPda] = multisig.getProgramConfigPda({});
  const { treasury } = await multisig.accounts.ProgramConfig.fromAccountAddress(conn, configPda);
  const sig = await multisig.rpc.multisigCreateV2({
    connection: conn, treasury, createKey, creator: payer, multisigPda: msPda, configAuthority: null,
    threshold: 3, timeLock: 86_400, rentCollector: null,
    members: members.map((m) => ({ key: m.publicKey, permissions: multisig.types.Permissions.all() })),
  });
  await conn.confirmTransaction(sig, "confirmed");
  record("squads multisigCreateV2 3-of-5, 24 h timelock", sig);
}
writeState({ ...state, multisig: msPda.toBase58(), vaultPda: vaultPda.toBase58() });

// 2. Upgrade authority -> Squads vault. BPF upgradeable loader SetAuthority (4).
const pd = await conn.getAccountInfo(programDataAddress(CANARY_PROGRAM_ID));
const current = pd && pd.data[12] === 1 ? new PublicKey(pd.data.subarray(13, 45)) : null;
if (current && !current.equals(vaultPda)) {
  const data = Buffer.alloc(4);
  data.writeUInt32LE(4, 0);
  record("canary upgrade authority -> squads vault", await send([new TransactionInstruction({
    programId: BPF_LOADER_UPGRADEABLE_ID,
    keys: [
      { pubkey: programDataAddress(CANARY_PROGRAM_ID), isSigner: false, isWritable: true },
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
      { pubkey: vaultPda, isSigner: false, isWritable: false },
    ],
    data,
  })]));
}

// 3. Test USDC and the canary pool.
let usdc = state.usdcMint ? new PublicKey(state.usdcMint) : null;
if (!usdc) {
  usdc = await createMint(conn, payer, payer.publicKey, null, 6, namedKeypair("test-usdc-mint"));
  console.log(`test USDC mint ${usdc.toBase58()}`);
}
const pool = canaryPool(usdc);
if (!(await conn.getAccountInfo(pool.pool))) record("canary init_pool", await send([await initPoolIx(payer.publicKey, pool)]));

// 4. Oracle venue and vault.
const venue = venuePda(CANARY_PROGRAM_ID);
if (!(await conn.getAccountInfo(venue))) {
  record("oracle register_venue (canary)", await send([await registerVenueIx(payer.publicKey, {
    program: CANARY_PROGRAM_ID, multisig: msPda, exitTimeSecs: 600,
  })]));
}
const v = vaultAddresses(venue, usdc);
if (!(await conn.getAccountInfo(v.vault))) record("vault init_vault", await send([await initVaultIx(payer.publicKey, v)]));

const userUsdc = getAssociatedTokenAddressSync(usdc, payer.publicKey);
const userShares = getAssociatedTokenAddressSync(v.shareMint, payer.publicKey, true);
await send([
  createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, userUsdc, payer.publicKey, usdc),
  createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, userShares, payer.publicKey, v.shareMint),
]);
if ((await conn.getTokenAccountBalance(v.vaultLp)).value.amount === "0") {
  await mintTo(conn, payer, usdc, userUsdc, payer, 1_000_000_000n);
  record("vault deposit 1,000 test USDC", await send([await depositIx(v, payer.publicKey, userUsdc, userShares, 1_000_000_000n)]));
}

writeState({ ...readState(), usdcMint: usdc.toBase58(), venue: venue.toBase58(), vault: v.vault.toBase58() });
console.log(`multisig ${msPda.toBase58()}\nvault PDA ${vaultPda.toBase58()}\nvenue ${venue.toBase58()}\nescape vault ${v.vault.toBase58()}`);
