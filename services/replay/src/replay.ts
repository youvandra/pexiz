// Replays the March–April 2026 admin-takeover sequence in an in-process SVM
// (LiteSVM) with a warped clock. Parameters and dates are the measured ones
// (PLAN §2); every account is synthetic, and the canary venue program stands
// in for the drained venue's program.
import { FailedTransactionMetadata } from "litesvm";
import { Keypair, PublicKey } from "@solana/web3.js";
import { CANARY_PROGRAM_ID, parseFlagChanged, parseVaultExited, reasonNames, type FlagChanged } from "@pexiz/sdk";
import { USDC, World } from "@pexiz/localnet";

const utc = (s: string) => Math.floor(Date.parse(`${s}Z`) / 1000);

/** Drift Security Council at the time of the attack: 2 of 5. */
export const ATTACK = {
  threshold: 2,
  members: 5,
  /**
   * Timelock before the 27 Mar migration. Not measured for March; the replay
   * uses Drift's timelock measured on 26 Oct 2026 (3600 s).
   */
  timeLockBefore: 3600,
  exitTimeSecs: 600,
  updateAdmin: utc("2026-04-01T16:05:19"),
  updateAdminTx: "4BKBmAJn6TdsENij7CsVbyMVLJU1tX27nfrMM1zgKv1bs2KJy6Am2NqdA3nJm4g9C6eC64UAf5sNs974ygB9RsN1",
};

export interface Row {
  when: number;
  event: string;
  flag: string;
  reasons: string[];
  vault: string;
  proofs: number;
  action: string;
}

export interface ReplayResult {
  rows: Row[];
  exitAt: number | null;
  exitReasons: string[];
  usdcOut: bigint;
  events: FlagChanged[];
}

type Step = { at: string; event: string; apply?: (w: World, s: State) => void };
interface State { nonces: { address: PublicKey; member: PublicKey }[] }

const STEPS: Step[] = [
  { at: "2026-03-22T12:00:00", event: "Venue registered: 2-of-5 Security Council, 3600 s timelock; vault holds $1M" },
  {
    at: "2026-03-23T00:00:00", event: "Durable-nonce accounts appear for two Security Council signers",
    apply: (w, s) => { for (const k of w.signers.slice(0, 2)) s.nonces.push({ address: w.env.addNonce(k.publicKey), member: k.publicKey }); },
  },
  { at: "2026-03-24T00:00:00", event: "crank tick" },
  { at: "2026-03-25T00:00:00", event: "crank tick (48 h after the nonces)" },
  { at: "2026-03-26T00:00:00", event: "crank tick" },
  { at: "2026-03-27T00:00:00", event: "Security Council migrated to timelock 0", apply: (w) => w.setTimeLock(0) },
  { at: "2026-03-28T00:00:00", event: "crank tick" },
  {
    at: "2026-03-30T00:00:00", event: "Member updated; new nonce account tied to the new member",
    apply: (w, s) => {
      const fresh = Keypair.generate().publicKey;
      w.env.editMultisig(w.multisig, (m) => { m.members[4].key = fresh; });
      s.nonces.push({ address: w.env.addNonce(fresh), member: fresh });
    },
  },
  { at: "2026-04-01T15:58:00", event: "Squads proposal created, approved, executed" },
  { at: "2026-04-01T16:05:19", event: "UpdateAdmin executes (nonce transaction)" },
  { at: "2026-04-01T16:08:00", event: "Attacker starts redeeming ~41M JLP" },
];

/**
 * `presigning: false` hides the nonce accounts from the crank, to show what
 * the timelock rule alone would have done.
 */
export async function runReplay(opts: { presigning?: boolean } = {}): Promise<ReplayResult> {
  const w = await World.create({
    threshold: ATTACK.threshold, members: ATTACK.members, timeLock: ATTACK.timeLockBefore,
    exitTimeSecs: ATTACK.exitTimeSecs, start: utc(STEPS[0].at),
  });
  const lp = w.user(USDC(1_000_000));
  await w.deposit(lp, USDC(1_000_000));

  const s: State = { nonces: [] };
  const rows: Row[] = [];
  const events: FlagChanged[] = [];
  let exitAt: number | null = null;
  let exitReasons: string[] = [];
  let usdcOut = 0n;

  for (const step of STEPS) {
    w.env.setTime(utc(step.at));
    step.apply?.(w, s);
    const current = new Set(w.env.multisig(w.multisig).members.map((m) => m.key.toBase58()));
    const proofs = opts.presigning === false ? [] : s.nonces.filter((n) => current.has(n.member.toBase58())).map((n) => n.address);

    let action = "update";
    let logs: string[];
    const update = await w.updateIx(proofs);
    if (!w.vault().exited) {
      const r = w.env.trySend([update, await w.exitIx()]);
      if (r instanceof FailedTransactionMetadata) {
        logs = w.env.send([await w.updateIx(proofs)]).logs();
      } else {
        logs = r.logs();
        action = "update+exit";
        const [ex] = parseVaultExited(logs);
        exitAt = utc(step.at);
        usdcOut = ex.usdcOut;
      }
    } else {
      logs = w.env.send([update]).logs();
    }
    const v = w.env.venue(CANARY_PROGRAM_ID);
    if (action === "update+exit") exitReasons = reasonNames(v.reasons);
    const changed = parseFlagChanged(logs)[0];
    if (changed) events.push(changed);
    rows.push({
      when: utc(step.at),
      event: step.event,
      flag: changed ? `${changed.from} → ${changed.to}` : v.flag,
      reasons: reasonNames(v.activeReasons),
      vault: w.vault().exited ? "exited (USDC)" : "in venue (LP)",
      proofs: proofs.length,
      action,
    });
  }
  return { rows, exitAt, exitReasons, usdcOut, events };
}

export function formatReplay(r: ReplayResult, timelockOnly?: ReplayResult): string {
  const fmt = (t: number) => new Date(t * 1000).toISOString().replace("T", " ").slice(0, 19);
  const header = ["When (UTC)", "Event", "Flag", "Active reasons", "Proofs", "Tx", "Vault"];
  const body = r.rows.map((x) => [fmt(x.when), x.event, x.flag, x.reasons.join(", ") || "-", String(x.proofs), x.action, x.vault]);
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((b) => b[i].length)));
  const line = (cells: string[]) => `| ${cells.map((c, i) => c.padEnd(widths[i])).join(" | ")} |`;
  const out = [
    "Pexiz replay: Drift admin takeover, 23 Mar – 1 Apr 2026",
    "",
    "This replays real parameters and dates with SYNTHETIC accounts in an",
    "in-process SVM (LiteSVM) with a warped clock. The canary venue program",
    "stands in for the drained venue's program; multisig members and nonce",
    "accounts are generated keys. Pre-migration timelock: 3600 s (Drift's value",
    "measured 26 Oct 2026; the March value was not measured).",
    "",
    line(header),
    `|${widths.map((w) => "-".repeat(w + 2)).join("|")}|`,
    ...body.map(line),
    "",
  ];
  if (r.exitAt) {
    const lead = ATTACK.updateAdmin - r.exitAt;
    out.push(`Vault exited at ${fmt(r.exitAt)} UTC (reasons: ${r.exitReasons.join(", ")}), receiving ${Number(r.usdcOut) / 1e6} USDC.`);
    out.push(`That is ${Math.floor(lead / 86_400)} d ${Math.floor((lead % 86_400) / 3600)} h before UpdateAdmin (tx ${ATTACK.updateAdminTx.slice(0, 12)}…, slot 410344009).`);
  } else {
    out.push("Vault did not exit.");
  }
  if (timelockOnly?.exitAt) {
    const lead = ATTACK.updateAdmin - timelockOnly.exitAt;
    out.push(`Without the pre-signing proofs, the timelock rule alone exits at ${fmt(timelockOnly.exitAt)} UTC, ${Math.floor(lead / 86_400)} d ${Math.floor((lead % 86_400) / 3600)} h before UpdateAdmin.`);
  }
  return out.join("\n");
}
