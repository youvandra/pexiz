// Permissionless crank: for each registered venue, build an oracle `update`
// with the multisig, program-data and any signer pre-signing accounts, and
// append the vault `exit` when the update is expected to turn the flag red.
//
// Env: PEXIZ_RPC_URL, PEXIZ_KEYPAIR (path to a keypair JSON),
//      CRANK_INTERVAL_SECS (default 30), CRANK_MEMBER_DELAY_MS (default 0).
import { Connection, Keypair } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { Crank } from "./crank";

const rpc = process.env.PEXIZ_RPC_URL ?? "http://127.0.0.1:8899";
const keypairPath = process.env.PEXIZ_KEYPAIR ?? `${process.env.HOME}/.config/solana/id.json`;
const interval = Number(process.env.CRANK_INTERVAL_SECS ?? 30) * 1000;
const once = process.argv.includes("--once");

const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keypairPath, "utf8"))));
const crank = new Crank(new Connection(rpc, "confirmed"), payer, { memberDelayMs: Number(process.env.CRANK_MEMBER_DELAY_MS ?? 0) });

console.log(`crank rpc=${rpc} payer=${payer.publicKey.toBase58()} interval=${interval / 1000}s`);
do {
  try {
    await crank.cycle();
  } catch (e: any) {
    console.error(`${new Date().toISOString()} cycle failed: ${e?.message ?? e}`);
  }
  if (!once) await new Promise((r) => setTimeout(r, interval));
} while (!once);
