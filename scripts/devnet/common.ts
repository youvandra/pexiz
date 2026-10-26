// Shared setup for the devnet scripts: connection, payer, persistent state in
// keys/devnet-state.json (gitignored) and the signature log in docs/devnet.md.
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const ROOT = join(import.meta.dir, "../..");
export const KEYS = join(ROOT, "keys");
const STATE = join(KEYS, "devnet-state.json");
const LOG = join(ROOT, "docs/devnet.md");

export const rpcUrl = process.env.PEXIZ_RPC_URL ?? "https://api.devnet.solana.com";
export const cluster = rpcUrl.includes("devnet") ? "devnet" : "custom";
export const conn = new Connection(rpcUrl, "confirmed");

export function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path.replace(/^~/, process.env.HOME ?? ""), "utf8"))));
}

export const payer = loadKeypair(process.env.PEXIZ_KEYPAIR ?? "~/.config/solana/id.json");

/** A keypair stored under keys/, created on first use. */
export function namedKeypair(name: string): Keypair {
  mkdirSync(KEYS, { recursive: true });
  const path = join(KEYS, `${name}.json`);
  if (existsSync(path)) return loadKeypair(path);
  const k = Keypair.generate();
  writeFileSync(path, JSON.stringify(Array.from(k.secretKey)), { mode: 0o600 });
  return k;
}

export interface DevnetState {
  multisig?: string;
  vaultPda?: string;
  usdcMint?: string;
  venue?: string;
  vault?: string;
  nonce?: string;
  timelockTxIndex?: string;
}

export function readState(): DevnetState {
  return existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {};
}

export function writeState(s: DevnetState) {
  mkdirSync(KEYS, { recursive: true });
  writeFileSync(STATE, JSON.stringify(s, null, 2));
}

export const pk = (s: string | undefined, what: string) => {
  if (!s) throw new Error(`${what} missing from keys/devnet-state.json; run the earlier scripts first`);
  return new PublicKey(s);
};

/** Appends a row to the signature table in docs/devnet.md and prints it. */
export function record(step: string, signature: string) {
  const when = new Date().toISOString().replace("T", " ").slice(0, 19);
  const link = `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
  appendFileSync(LOG, `| ${when} | ${step} | [\`${signature.slice(0, 16)}…\`](${link}) |\n`);
  console.log(`${step}: ${signature}`);
}
