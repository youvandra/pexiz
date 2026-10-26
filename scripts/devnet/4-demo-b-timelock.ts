// Demo (b): the multisig sets its own time_lock to 0 through a real Squads
// config transaction. The current 24 h timelock applies to this change too,
// so it runs in two stages:
//
//   bun run 4-demo-b-timelock.ts propose   create, propose, approve (3 of 5)
//   bun run 4-demo-b-timelock.ts execute   24 h later: execute, then crank
//
// After execution one crank cycle sends oracle update + vault exit in one tx.
import * as multisig from "@sqds/multisig";
import { Crank } from "@pexiz/crank";
import { conn, namedKeypair, payer, pk, readState, record, writeState } from "./common";

const stage = process.argv[2];
const state = readState();
const msPda = pk(state.multisig, "multisig");
const members = [0, 1, 2, 3, 4].map((i) => namedKeypair(`member-${i}`));

/** Waits until a signature is confirmed, so the next instruction sees its writes. */
async function landed(sig: string): Promise<string> {
  const bh = await conn.getLatestBlockhash("confirmed");
  await conn.confirmTransaction({ signature: sig, ...bh }, "confirmed");
  return sig;
}

if (stage === "propose") {
  const ms = await multisig.accounts.Multisig.fromAccountAddress(conn, msPda);
  const last = BigInt(ms.transactionIndex.toString());
  // Resume a half-finished run: reuse the latest config transaction if it has no proposal yet.
  const [lastProposal] = multisig.getProposalPda({ multisigPda: msPda, transactionIndex: last });
  const resume = last > 0n && !(await conn.getAccountInfo(lastProposal));
  const transactionIndex = resume ? last : last + 1n;
  if (!resume) {
    record("demo (b): squads configTransactionCreate SetTimeLock 0", await landed(await multisig.rpc.configTransactionCreate({
      connection: conn, feePayer: payer, multisigPda: msPda, transactionIndex, creator: members[0].publicKey,
      rentPayer: payer.publicKey, actions: [{ __kind: "SetTimeLock", newTimeLock: 0 }], signers: [members[0]],
    })));
  }
  record("demo (b): squads proposalCreate", await landed(await multisig.rpc.proposalCreate({
    connection: conn, feePayer: payer, creator: members[0], rentPayer: payer, multisigPda: msPda, transactionIndex,
  })));
  for (const m of members.slice(0, 3)) {
    record(`demo (b): squads proposalApprove ${m.publicKey.toBase58().slice(0, 8)}`, await landed(await multisig.rpc.proposalApprove({
      connection: conn, feePayer: payer, member: m, multisigPda: msPda, transactionIndex,
    })));
  }
  writeState({ ...state, timelockTxIndex: transactionIndex.toString() });
  console.log(`approved; executable after the ${ms.timeLock} s timelock`);
} else if (stage === "execute") {
  const transactionIndex = BigInt(state.timelockTxIndex ?? "0");
  if (!transactionIndex) throw new Error("run the propose stage first");
  record("demo (b): squads configTransactionExecute (time_lock = 0)", await multisig.rpc.configTransactionExecute({
    connection: conn, feePayer: payer, multisigPda: msPda, transactionIndex, member: members[0], rentPayer: payer, signers: [members[0]],
  }));
  const [r] = await new Crank(conn, payer, { memberDelayMs: 300 }).cycle();
  if (r?.signature) record(`demo (b): crank ${r.from} -> ${r.to} (${r.action})`, r.signature);
} else {
  console.error("usage: bun run 4-demo-b-timelock.ts propose|execute");
  process.exit(1);
}
