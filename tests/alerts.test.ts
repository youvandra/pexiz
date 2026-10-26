import { expect, test } from "bun:test";
import { Keypair } from "@solana/web3.js";
import { CANARY_PROGRAM_ID, Reason } from "@pexiz/sdk";
import { formatAlert, venueName } from "../services/alerts/src/format";
import { dryRunSink } from "../services/alerts/src/telegram";
import { runReplay } from "../services/replay/src/replay";

const ev = (to: "green" | "amber" | "red", reasons: number, program = CANARY_PROGRAM_ID) => ({
  venue: Keypair.generate().publicKey, program, from: "green" as const, to, reasons, slot: 410344009n, unixTimestamp: 1775059519,
});

test("red alert lists every reason in plain English", () => {
  const m = formatAlert(ev("red", Reason.TIME_LOCK_BELOW_MIN | Reason.SIGNER_PRESIGNING));
  expect(m).toContain("RED");
  expect(m).toContain("Canary venue (demo)");
  expect(m).toContain("The multisig timelock is below the minimum");
  expect(m).toContain("durable-nonce account");
  expect(m).toContain("2026-04-01 16:05 UTC");
  expect(m).not.toContain("TIME_LOCK_BELOW_MIN");
});

test("amber alert explains pre-signing", () => {
  expect(formatAlert(ev("amber", Reason.SIGNER_PRESIGNING))).toContain("AMBER");
});

test("green alert says all clear and lists no reasons", () => {
  const m = formatAlert(ev("green", 0));
  expect(m).toContain("all clear");
  expect(m).not.toContain("Why:");
});

test("unnamed venues are shown by program id only", () => {
  const p = Keypair.generate().publicKey;
  expect(venueName(p)).toBe(`program ${p.toBase58()}`);
});

test("dry run prints the replay alerts: amber then red", async () => {
  const printed: string[] = [];
  const sink = dryRunSink((s) => printed.push(s));
  for (const e of (await runReplay()).events) await sink.send(formatAlert(e));
  expect(printed.length).toBe(2);
  expect(printed[0]).toContain("AMBER");
  expect(printed[1]).toContain("RED");
  expect(printed[1]).toContain("unresolved for 48 hours");
});
