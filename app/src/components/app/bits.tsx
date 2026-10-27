import type { ReactNode } from "react"
import { useWallet } from "@solana/wallet-adapter-react"
import { Reason } from "@pexiz/sdk/src/reasons"
import { cn } from "@/lib/cn"
import { short, usd } from "@/lib/format"
import { explorer } from "@/data/facts"
import type { ActivityEvent } from "@/data/activity"
import { FlagPill, Skeleton } from "@/components/ui/kit"
import { Icon, Svg } from "./chrome"

export function StatTile({ label, value, sub, className }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cn("card min-w-0 p-5", className)}>
      <div className="truncate text-xs uppercase tracking-[0.08em] text-ink-3">{label}</div>
      <div className="tabular tracking-display mt-2 truncate text-[1.75rem] font-medium leading-tight md:text-[2rem]" title={typeof value === "string" ? value : undefined}>{value ?? <Skeleton className="h-9 w-24" />}</div>
      {sub && <div className="mt-1 truncate text-sm text-ink-2">{sub}</div>}
    </div>
  )
}

const CONDITIONS: [number, string, string][] = [
  [Reason.TIME_LOCK_BELOW_MIN, "Timelock at or above minimum", "An approved change waits long enough for users to leave."],
  [Reason.THRESHOLD_DROPPED, "Approval threshold held", "No fewer signers are needed than before."],
  [Reason.MEMBERS_REPLACED, "Signer set stable", "Under a third of signers replaced in 7 days."],
  [Reason.UPGRADE_AUTHORITY_MOVED, "Upgrade authority in place", "The program is still upgraded only by this multisig."],
  [Reason.SIGNER_PRESIGNING, "No pre-signing accounts", "No signer controls a durable nonce that could hold a pre-signed approval."],
  [Reason.AMBER_ESCALATED, "No stale warning", "No warning has been left unresolved for 48 hours."],
]

/** The six checks the oracle runs, each shown passing or failing. */
export function Conditions({ reasons }: { reasons: number | undefined }) {
  return (
    <ul className="divide-y divide-line">
      {CONDITIONS.map(([bit, title, body]) => {
        const fail = reasons !== undefined && (reasons & bit) !== 0
        return (
          <li key={bit} className="flex gap-3 py-3.5">
            {reasons === undefined ? (
              <Skeleton className="size-6 rounded-full" />
            ) : (
              <span className={cn("grid size-6 shrink-0 place-items-center rounded-full", fail ? "bg-danger-soft text-danger" : "bg-safe-soft text-safe")}>
                <Svg className="size-3.5">{fail ? Icon.x : Icon.check}</Svg>
              </span>
            )}
            <div>
              <div className={cn("text-sm font-semibold", fail && "text-danger")}>{title}</div>
              <div className="text-sm text-ink-2">{body}</div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

const when = (ms: number) =>
  new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

const TITLE: Record<ActivityEvent["kind"], string> = {
  deposit: "Deposit",
  withdraw: "Withdrawal",
  exit: "Vault exited to USDC",
  flag: "Flag changed",
  vote: "Voted to re-enter",
  unvote: "Took back a vote",
  reenter: "Vault re-entered",
  check: "Oracle check",
}

const DOT: Record<ActivityEvent["kind"], string> = {
  deposit: "bg-safe",
  withdraw: "bg-ink",
  exit: "bg-danger",
  flag: "bg-warn",
  vote: "bg-rose",
  unvote: "bg-ink-3",
  reenter: "bg-safe",
  check: "bg-line-2",
}

export function EventRow({ e }: { e: ActivityEvent }) {
  const { publicKey } = useWallet()
  const you = publicKey?.toBase58() === e.who
  const money = e.kind === "exit"
    ? `${(e.usdc ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC out`
    : e.usdc ? usd(Math.abs(e.usdc), 2) : e.lp ? `${e.lp.toLocaleString("en-US", { maximumFractionDigits: 2 })} LP` : ""
  return (
    <a href={explorer(e.sig, "devnet", "tx")} target="_blank" rel="noreferrer" className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-sand/50">
      <span className={cn("size-2.5 shrink-0 rounded-full", DOT[e.kind])} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          {TITLE[e.kind]}
          {e.kind === "flag" && e.from && e.to && (
            <span className="flex items-center gap-1.5"><FlagPill flag={e.from} /><span className="text-ink-3">→</span><FlagPill flag={e.to} /></span>
          )}
          {e.failed && <span className="rounded-full bg-sand px-2 py-0.5 text-[11px] font-semibold text-ink-3">Failed</span>}
        </div>
        <div className="mt-0.5 truncate text-xs text-ink-3">
          {when(e.at)} · {you ? "You" : e.kind === "flag" || e.kind === "check" || e.kind === "exit" ? "Crank" : short(e.who, 4)}
          {e.reasons?.length ? ` · ${e.reasons.join(", ").toLowerCase().replaceAll("_", " ")}` : ""}
        </div>
      </div>
      {money && <div className="tabular text-right text-sm font-semibold">{money}</div>}
      <Svg className="text-ink-3 opacity-0 transition-opacity group-hover:opacity-100">{Icon.ext}</Svg>
    </a>
  )
}

export function EventList({ events, empty }: { events: ActivityEvent[] | null; empty: ReactNode }) {
  if (!events) {
    return <div className="divide-y divide-line">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="px-5 py-4"><Skeleton className="h-9 w-full" /></div>)}</div>
  }
  if (!events.length) return <div className="px-5 py-10 text-center text-sm text-ink-2">{empty}</div>
  return <div className="divide-y divide-line">{events.map((e, i) => <EventRow key={`${e.sig}-${e.kind}-${i}`} e={e} />)}</div>
}
