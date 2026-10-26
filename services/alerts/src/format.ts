import { PublicKey } from "@solana/web3.js";
import { CANARY_PROGRAM_ID, describeReasons, type FlagChanged } from "@pexiz/sdk";

/**
 * Display names for watched programs. A venue left out of this map is shown
 * by program id only (some measured findings are not public yet).
 */
export const VENUE_NAMES: Record<string, string> = {
  PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu: "Jupiter Perps",
  dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH: "Drift",
  [CANARY_PROGRAM_ID.toBase58()]: "Canary venue (demo)",
};

export function venueName(program: PublicKey): string {
  const id = program.toBase58();
  return VENUE_NAMES[id] ?? `program ${id}`;
}

const HEADLINE = {
  red: "RED: get out now",
  amber: "AMBER: admin can pre-sign",
  green: "GREEN: all clear again",
} as const;

export function formatAlert(e: FlagChanged): string {
  const when = new Date(e.unixTimestamp * 1000).toISOString().replace("T", " ").slice(0, 16);
  const lines = [`Pexiz ${HEADLINE[e.to]} | ${venueName(e.program)}`, `Flag ${e.from} -> ${e.to} at ${when} UTC, slot ${e.slot}.`];
  const reasons = describeReasons(e.reasons);
  if (e.to !== "green" && reasons.length) {
    lines.push("Why:");
    for (const r of reasons) lines.push(`- ${r[0].toUpperCase()}${r.slice(1)}.`);
  }
  if (e.to === "red") lines.push("Escape vaults on this venue exit to USDC in the same transaction as this update.");
  if (e.to === "green") lines.push("Every condition has been clear for the 7-day cool-off.");
  lines.push(`Venue account: ${e.venue.toBase58()}`);
  return lines.join("\n");
}
