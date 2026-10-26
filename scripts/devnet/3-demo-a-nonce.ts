// Demo (a): a multisig member creates a durable-nonce account. One crank
// cycle finds it and turns the flag amber.
import { Keypair, NONCE_ACCOUNT_LENGTH, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { Crank } from "@pexiz/crank";
import { conn, namedKeypair, payer, readState, record, writeState } from "./common";

const member = namedKeypair("member-0");
const nonce = Keypair.generate();
const rent = await conn.getMinimumBalanceForRentExemption(NONCE_ACCOUNT_LENGTH);
const sig = await sendAndConfirmTransaction(conn, new Transaction().add(
  SystemProgram.createAccount({ fromPubkey: payer.publicKey, newAccountPubkey: nonce.publicKey, lamports: rent, space: NONCE_ACCOUNT_LENGTH, programId: SystemProgram.programId }),
  SystemProgram.nonceInitialize({ noncePubkey: nonce.publicKey, authorizedPubkey: member.publicKey }),
), [payer, nonce], { commitment: "confirmed" });
record(`demo (a): nonce account for member ${member.publicKey.toBase58().slice(0, 8)}`, sig);
writeState({ ...readState(), nonce: nonce.publicKey.toBase58() });

const [r] = await new Crank(conn, payer, { memberDelayMs: 300 }).cycle();
if (r?.signature) record(`demo (a): crank ${r.from} -> ${r.to} (${r.action})`, r.signature);
