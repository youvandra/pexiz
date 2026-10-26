// Subscribes to FlagChanged events and posts amber/red (and all-clear) alerts
// to Telegram with the reason bits decoded into plain language.
//
//   bun run src/index.ts                 logs subscription, posts to Telegram
//   bun run src/index.ts --poll          poll signatures instead of websockets
//   bun run src/index.ts --dry-run       print messages instead of posting
//   bun run src/index.ts --dry-run --from-replay
//                                        print the alerts the March 2026 replay
//                                        would have sent (no RPC needed)
//
// Env: PEXIZ_RPC_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, ALERTS_POLL_SECS.
import { Connection } from "@solana/web3.js";
import { formatAlert } from "./format";
import { poll, subscribe } from "./sources";
import { dryRunSink, telegramSink, type Sink } from "./telegram";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");

let sink: Sink;
if (dryRun) {
  sink = dryRunSink();
} else {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) throw new Error("set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID, or pass --dry-run");
  sink = telegramSink(token, chat);
}

if (args.has("--from-replay")) {
  const { runReplay } = await import("../../replay/src/replay");
  const r = await runReplay();
  console.log("Alerts for the March 2026 replay (synthetic accounts, real dates):\n");
  for (const e of r.events) await sink.send(formatAlert(e));
  process.exit(0);
}

const rpc = process.env.PEXIZ_RPC_URL ?? "http://127.0.0.1:8899";
const conn = new Connection(rpc, { commitment: "confirmed", wsEndpoint: process.env.PEXIZ_WS_URL });
const seen = new Set<string>();
const onEvent = async (e: Parameters<typeof formatAlert>[0], sig: string) => {
  const key = `${sig}:${e.venue.toBase58()}`;
  if (seen.has(key)) return;
  seen.add(key);
  try {
    await sink.send(`${formatAlert(e)}\nTx: ${sig}`);
  } catch (err: any) {
    console.error(`${new Date().toISOString()} send failed: ${err?.message ?? err}`);
  }
};

console.log(`alerts rpc=${rpc} mode=${args.has("--poll") ? "poll" : "logs"} ${dryRun ? "dry-run" : "telegram"}`);
if (args.has("--poll")) await poll(conn, onEvent, Number(process.env.ALERTS_POLL_SECS ?? 10) * 1000);
else subscribe(conn, onEvent);
