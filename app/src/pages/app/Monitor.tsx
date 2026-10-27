import { useState } from "react"
import { Link, useLocation } from "wouter"
import { cn } from "@/lib/cn"
import { ago, duration } from "@/lib/format"
import { useBoard, type Assessment, type BoardRow } from "@/data/chain"
import { STATUS_MEANING } from "@/data/assess"
import { useVault } from "@/data/vault"
import { FlagPill, Skeleton, VenueLogo, flagLabel } from "@/components/ui/kit"
import { DoorGlyph } from "@/components/ui/glyphs"
import { Icon, Svg } from "@/components/ui/icons"
import { Dur, ExitRace } from "@/components/ui/meter"
import { PageHead } from "@/components/app/chrome"

interface Row {
  id: string
  href: string
  name: string
  kind: string
  admin: string
  delay: string
  window: string
  flag: Assessment
  live: boolean
  why: string
  logo?: string
  category: "perps" | "prediction"
  /** Admin delay for the meter; undefined when it cannot be read. */
  delaySecs?: number
}

const ADMIN_SHORT = { "squads-v4": "Multisig", "squads-v3": "Old multisig", governance: "DAO vote", dormant: "One key" } as const

const windowText = (s: number | undefined) => (s === undefined ? "—" : s <= 0 ? "No time" : duration(s))

function fromBoard(r: BoardRow): Row {
  return {
    id: r.venue.id,
    href: `/monitor/${r.venue.id}`,
    name: r.venue.name,
    kind: r.venue.kind,
    admin: r.threshold ? `${r.threshold} of ${r.members}` : ADMIN_SHORT[r.venue.admin],
    delay: r.timeLockSecs ? duration(r.timeLockSecs) : r.timeLockSecs === 0 || r.venue.admin === "squads-v3" ? "None" : "—",
    window: windowText(r.exitWindowSecs),
    flag: r.assessment,
    live: r.live,
    why: r.why,
    logo: r.venue.logo,
    category: r.venue.category,
    delaySecs: r.timeLockSecs ?? (r.venue.admin === "squads-v3" ? 0 : undefined),
  }
}

const FILTERS: (Assessment | "all")[] = ["all", "green", "amber", "exposed", "red", "unrated"]

export function Monitor() {
  const { rows, readAt } = useBoard()
  const { data } = useVault()
  const [filter, setFilter] = useState<Assessment | "all">("all")
  const [q, setQ] = useState("")
  const [type, setType] = useState<"all" | "perps" | "prediction">("all")
  const [, go] = useLocation()

  const canaryRow: Row | null = data
    ? {
        id: "canary",
        href: "/vault/canary",
        name: "Canary Pool",
        kind: "Test protocol",
        admin: `${data.venue.threshold} of ${data.venue.members.length}`,
        delay: duration(data.venue.timeLockSecs),
        window: windowText(data.venue.exitWindowSecs),
        flag: data.venue.flag,
        live: true,
        category: "perps",
        delaySecs: data.venue.timeLockSecs,
        why: data.reasons[0] ? data.reasons[0][0].toUpperCase() + data.reasons[0].slice(1) + "." : "Every condition clear.",
      }
    : null
  const all: Row[] | null = rows ? [...(canaryRow ? [canaryRow] : []), ...rows.map(fromBoard)] : null
  const shown = all?.filter((r) => (filter === "all" || r.flag === filter) && (type === "all" || r.category === type) && r.name.toLowerCase().includes(q.trim().toLowerCase()))
  const count = (f: Assessment | "all") => (all ? (f === "all" ? all.length : all.filter((r) => r.flag === f).length) : 0)

  return (
    <div>
      <PageHead
        title="Monitor"
        sub="Perps and prediction markets on Solana: who controls each one, and whether you would have time to leave if they changed it."
        right={<span className="flex items-center gap-2 text-sm text-ink-3"><span className="live-dot text-safe" />{readAt ? `Updated ${ago(readAt)}` : "Reading…"}</span>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn("flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors", filter === f ? "border-ink bg-ink text-cream" : "border-line bg-paper text-ink-2 hover:text-ink")}
            >
              {f === "all" ? "All" : flagLabel(f)}
              <span className={cn("tabular text-xs", filter === f ? "text-cream/70" : "text-ink-3")}>{count(f)}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 rounded-full border border-line bg-paper p-1 text-sm font-medium">
          {([["all", "All types"], ["perps", "Perps"], ["prediction", "Prediction"]] as const).map(([t, label]) => (
            <button key={t} onClick={() => setType(t)} className={cn("h-7 rounded-full px-3", type === t ? "bg-sand text-ink" : "text-ink-2 hover:text-ink")}>{label}</button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search protocols"
          className="ml-auto h-9 w-full rounded-full border border-line bg-paper px-4 text-sm outline-none focus:border-ink sm:w-56"
        />
      </div>

      <details className="card group mb-4 p-0">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 text-sm font-semibold">
          What each status means
          <Svg className="text-ink-3 transition-transform group-open:rotate-180">{Icon.chevron}</Svg>
        </summary>
        <ul className="grid gap-x-8 gap-y-3 border-t border-line px-5 py-4 text-sm md:grid-cols-2">
          {(["green", "amber", "exposed", "red", "unrated"] as const).map((f) => (
            <li key={f} className="flex items-start gap-3">
              <FlagPill flag={f} className="mt-px w-[5.75rem] justify-start" />
              <span className="text-ink-2">{STATUS_MEANING[f]}</span>
            </li>
          ))}
        </ul>
      </details>

      {/* Desktop table */}
      <div className="card hidden overflow-hidden p-0 md:block">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.08em] text-ink-3">
            <tr className="border-b border-line">
              <th className="px-5 py-3.5 font-medium">Protocol</th>
              <th className="px-5 py-3.5 font-medium">Approvals needed</th>
              <th className="px-5 py-3.5 font-medium">Change delay</th>
              <th className="px-5 py-3.5 font-medium">Time to exit</th>
              <th className="px-5 py-3.5 text-right font-medium">Status</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {!shown
              ? Array.from({ length: 6 }).map((_, k) => <tr key={k}><td colSpan={6} className="px-5 py-5"><Skeleton className="h-8 w-full" /></td></tr>)
              : shown.map((r) => (
                  <tr key={r.id} onClick={() => go(r.href)} className="cursor-pointer transition-colors hover:bg-sand/50">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <Mark r={r} />
                        <div>
                          <Link href={r.href} className="font-semibold">{r.name}</Link>
                          <div className="text-ink-3">{r.kind}</div>
                        </div>
                      </div>
                    </td>
                    <td className="tabular px-5 py-4 text-ink-2">{r.admin}</td>
                    <td className="px-5 py-4 text-ink-2"><Dur text={r.delay} /></td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <ExitRace delaySecs={r.delaySecs} flag={r.flag} className="w-20" />
                        <Dur text={r.window} className="font-semibold" />
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right"><FlagPill flag={r.flag} /></td>
                    <td className="pr-4 text-ink-3"><Svg className="-rotate-90">{Icon.chevron}</Svg></td>
                  </tr>
                ))}
          </tbody>
        </table>
        {shown && !shown.length && <div className="px-5 py-10 text-center text-sm text-ink-2">No protocol matches.</div>}
      </div>

      {/* Phone cards */}
      <div className="space-y-3 md:hidden">
        {!shown
          ? Array.from({ length: 4 }).map((_, k) => <Skeleton key={k} className="h-28 w-full rounded-[var(--radius-card)]" />)
          : shown.map((r) => (
              <Link key={r.id} href={r.href} className="card block p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Mark r={r} />
                    <div>
                      <div className="font-semibold">{r.name}</div>
                      <div className="text-sm text-ink-3">{r.kind}</div>
                    </div>
                  </div>
                  <FlagPill flag={r.flag} />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                  <div><div className="text-xs text-ink-3">Approvals</div><div className="tabular font-medium">{r.admin}</div></div>
                  <div><div className="text-xs text-ink-3">Change delay</div><Dur text={r.delay} className="font-medium" /></div>
                  <div><div className="text-xs text-ink-3">Time to exit</div><Dur text={r.window} className="font-medium" /><ExitRace delaySecs={r.delaySecs} flag={r.flag} className="mt-1.5 w-full" /></div>
                </div>
              </Link>
            ))}
      </div>

      <p className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-3"><span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-ink" />The 30 minutes you need to withdraw</span><span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-ink-3" />How long an approved change waits</span><span>Longer bottom bar: you are out first.</span></p>
    </div>
  )
}

function Mark({ r }: { r: Row }) {
  return r.logo ? <VenueLogo src={r.logo} name={r.name} /> : <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-paper"><DoorGlyph className="size-7" /></span>
}
