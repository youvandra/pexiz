import type { ReactNode } from "react"
import { useWallet } from "@solana/wallet-adapter-react"
import { Reason } from "@pexiz/sdk/src/reasons"
import { cn } from "@/lib/cn"
import { amount, money, short } from "@/lib/format"
import { explorer } from "@/data/facts"
import type { ActivityEvent } from "@/data/activity"
import { FlagMark, FlagPill, Skeleton } from "@/components/ui/kit"
import { Icon, Svg } from "./chrome"

/** A plain-words label, then the value with its unit. `sub` only when it adds something. */
export function StatTile({ label, value, unit, sub, className }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode; className?: string }) {
  return (
    <div className={cn("card min-w-0 p-5", className)}>
      <div className="truncate text-sm text-ink-2">{label}</div>
      <div className="tabular tracking-display mt-2 truncate text-[1.75rem] font-medium leading-tight md:text-[2rem]" title={typeof value === "string" ? `${value}${unit ? ` ${unit}` : ""}` : undefined}>
        {value ?? <Skeleton className="h-9 w-24" />}
        {value != null && unit && <span className="ml-1.5 text-[0.55em] font-medium tracking-normal text-ink-3">{unit}</span>}
      </div>
      {sub && <div className="mt-1 truncate text-sm text-ink-2">{sub}</div>}
    </div>
  )
}

const CONDITIONS: [number, string, string][] = [
  [Reason.TIME_LOCK_BELOW_MIN, "Changes still wait long enough", "An approved change waits longer than you need to withdraw."],
  [Reason.THRESHOLD_DROPPED, "Same number of approvals needed", "Nobody lowered how many signers must agree."],
  [Reason.MEMBERS_REPLACED, "Signers stayed the same", "Fewer than a third of signers were swapped this week."],
  [Reason.UPGRADE_AUTHORITY_MOVED, "Same group controls upgrades", "Only this multisig can change the program."],
  [Reason.SIGNER_PRESIGNING, "No approvals signed in advance", "No signer holds an account that keeps a signature ready to use later."],
  [Reason.UPGRADE_PENDING, "No upgrade waiting to land", "No approved proposal is queued to replace the program."],
  [Reason.AMBER_ESCALATED, "No warning left open", "No warning has stayed unresolved for 48 hours. A long warning is flagged, but only a rule change moves money."],
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

const TITLE: Record<ActivityEvent["kind"], string> = {
  deposit: "Deposit",
  withdraw: "Withdrawal",
  exit: "Vault moved to USDC",
  flag: "Status changed",
  vote: "Voted to go back in",
  unvote: "Took back a vote",
  reenter: "Vault went back in",
  check: "Routine check",
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

const PLAIN_REASON: Record<string, string> = {
  TIME_LOCK_BELOW_MIN: "change delay cut",
  THRESHOLD_DROPPED: "fewer approvals needed",
  MEMBERS_REPLACED: "signers swapped",
  UPGRADE_AUTHORITY_MOVED: "upgrade control moved",
  SIGNER_PRESIGNING: "approvals signed in advance",
  AMBER_ESCALATED: "warning open 48h",
  UPGRADE_PENDING: "upgrade waiting",
}

const day = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
const time = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })

/** Timeline marker: the risk ladder for flag changes, a dot for the rest. */
function Marker({ e }: { e: ActivityEvent }) {
  if (e.kind === "flag" && e.to) return <FlagMark flag={e.to} />
  if (e.kind === "exit") return <FlagMark flag="red" />
  return (
    <span className="grid size-6 place-items-center">
      <span className={cn("size-2.5 rounded-full ring-4 ring-paper", DOT[e.kind])} />
    </span>
  )
}

export function EventRow({ e }: { e: ActivityEvent }) {
  const { publicKey } = useWallet()
  const you = publicKey?.toBase58() === e.who
  const value = e.kind === "exit"
    ? `${amount(e.usdc ?? 0)} USDC out`
    : e.usdc ? money(Math.abs(e.usdc)) : e.lp ? `${amount(e.lp)} LP` : ""
  return (
    <li className="relative">
      <a href={explorer(e.sig, "devnet", "tx")} target="_blank" rel="noreferrer" className="group flex items-start gap-4 rounded-xl px-3 py-3 transition-colors hover:bg-sand/50">
        <span className="relative z-10 mt-0.5"><Marker e={e} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {TITLE[e.kind]}
            {e.kind === "flag" && e.from && e.to && (
              <span className="flex items-center gap-1.5"><FlagPill flag={e.from} /><Svg className="size-3 text-ink-3">{Icon.arrow}</Svg><FlagPill flag={e.to} /></span>
            )}
            {e.failed && <span className="rounded-md border border-line-2 px-1.5 py-0.5 text-[11px] font-semibold text-ink-3">Failed</span>}
          </div>
          <div className="mt-0.5 truncate text-xs text-ink-3">
            {time(e.at)} · {you ? "You" : e.kind === "flag" || e.kind === "check" || e.kind === "exit" ? "Pexiz oracle" : short(e.who, 4)}
            {e.reasons?.length ? ` · ${e.reasons.map((r) => PLAIN_REASON[r] ?? r).join(", ")}` : ""}
          </div>
        </div>
        {value && <div className="tabular shrink-0 pt-0.5 text-right text-sm font-semibold">{value}</div>}
        <Svg className="mt-0.5 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100">{Icon.ext}</Svg>
      </a>
    </li>
  )
}

/** Events as a vertical timeline, grouped by day. */
export function EventList({ events, empty }: { events: ActivityEvent[] | null; empty: ReactNode }) {
  if (!events) {
    return <div className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
  }
  if (!events.length) return <div className="px-5 py-10 text-center text-sm text-ink-2">{empty}</div>
  const groups: [string, ActivityEvent[]][] = []
  for (const e of events) {
    const d = day(e.at)
    if (groups.at(-1)?.[0] === d) groups.at(-1)![1].push(e)
    else groups.push([d, [e]])
  }
  return (
    <div className="px-2 py-3">
      {groups.map(([d, list]) => (
        <section key={d} className="mb-2 last:mb-0">
          <div className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">{d}</div>
          <ol className="relative before:absolute before:bottom-4 before:left-[23px] before:top-4 before:w-px before:bg-line-2">
            {list.map((e, i) => <EventRow key={`${e.sig}-${e.kind}-${i}`} e={e} />)}
          </ol>
        </section>
      ))}
    </div>
  )
}
