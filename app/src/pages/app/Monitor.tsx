import { useState } from "react"
import { Link, useLocation } from "wouter"
import { cn } from "@/lib/cn"
import { ago, duration } from "@/lib/format"
import { MEASURED_ON } from "@/data/facts"
import { useBoard, type Assessment, type BoardRow } from "@/data/chain"
import { useVault } from "@/data/vault"
import { FlagPill, Skeleton, flagLabel } from "@/components/ui/kit"
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
  tag?: string
}

const windowText = (s: number | undefined) => (s === undefined ? "—" : s <= 0 ? "None" : duration(s))

function fromBoard(r: BoardRow): Row {
  return {
    id: r.venue.id,
    href: `/monitor/${r.venue.id}`,
    name: r.venue.name,
    kind: r.venue.kind,
    admin: r.threshold ? `${r.threshold} of ${r.members} signers` : r.venue.note ?? "—",
    delay: r.timeLockSecs !== undefined ? duration(r.timeLockSecs) : r.venue.admin === "squads-v3" ? "None" : "—",
    window: windowText(r.exitWindowSecs),
    flag: r.assessment,
    live: r.live,
    why: r.why,
  }
}

const FILTERS: (Assessment | "all")[] = ["all", "green", "amber", "red", "unrated"]

export function Monitor() {
  const { rows, readAt } = useBoard()
  const { data } = useVault()
  const [filter, setFilter] = useState<Assessment | "all">("all")
  const [q, setQ] = useState("")
  const [, go] = useLocation()

  const canaryRow: Row | null = data
    ? {
        id: "canary",
        href: "/vault/canary",
        name: "Canary venue",
        kind: "Test venue · devnet",
        admin: `${data.venue.threshold} of ${data.venue.members.length} signers`,
        delay: duration(data.venue.timeLockSecs),
        window: windowText(data.venue.exitWindowSecs),
        flag: data.venue.flag,
        live: true,
        why: data.reasons[0] ? data.reasons[0][0].toUpperCase() + data.reasons[0].slice(1) + "." : "Every condition clear.",
        tag: "On-chain oracle",
      }
    : null
  const all: Row[] | null = rows ? [...(canaryRow ? [canaryRow] : []), ...rows.map(fromBoard)] : null
  const shown = all?.filter((r) => (filter === "all" || r.flag === filter) && r.name.toLowerCase().includes(q.trim().toLowerCase()))
  const count = (f: Assessment | "all") => (all ? (f === "all" ? all.length : all.filter((r) => r.flag === f).length) : 0)

  return (
    <div>
      <PageHead
        title="Monitor"
        sub="Who can move the money in each venue, and whether you would have time to leave."
        right={<span className="flex items-center gap-2 text-sm text-ink-3"><span className="live-dot text-safe" />{readAt ? `Mainnet read ${ago(readAt)}` : "Reading mainnet…"}</span>}
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
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search venues"
          className="ml-auto h-9 w-full rounded-full border border-line bg-paper px-4 text-sm outline-none focus:border-ink sm:w-56"
        />
      </div>

      {/* Desktop table */}
      <div className="card hidden overflow-hidden p-0 md:block">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.08em] text-ink-3">
            <tr className="border-b border-line">
              <th className="px-5 py-3.5 font-medium">Venue</th>
              <th className="px-5 py-3.5 font-medium">Admin</th>
              <th className="px-5 py-3.5 font-medium">Delay</th>
              <th className="px-5 py-3.5 font-medium">Exit window</th>
              <th className="px-5 py-3.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {!shown
              ? Array.from({ length: 6 }).map((_, k) => <tr key={k}><td colSpan={5} className="px-5 py-5"><Skeleton className="h-8 w-full" /></td></tr>)
              : shown.map((r) => (
                  <tr key={r.id} onClick={() => go(r.href)} className="cursor-pointer transition-colors hover:bg-sand/50">
                    <td className="px-5 py-4">
                      <Link href={r.href} className="font-semibold">{r.name}</Link>
                      <div className="flex items-center gap-2 text-ink-3">{r.kind}{r.tag && <span className="rounded-full bg-lemon/25 px-2 py-0.5 text-[11px] font-semibold text-ink">{r.tag}</span>}</div>
                    </td>
                    <td className="px-5 py-4 text-ink-2">{r.admin}</td>
                    <td className="tabular px-5 py-4">{r.delay}</td>
                    <td className="tabular px-5 py-4 text-lg font-medium">{r.window}</td>
                    <td className="px-5 py-4">
                      <FlagPill flag={r.flag} live={r.live} />
                      <div className="mt-1 max-w-[260px] text-xs text-ink-3">{r.why}</div>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
        {shown && !shown.length && <div className="px-5 py-10 text-center text-sm text-ink-2">No venue matches.</div>}
      </div>

      {/* Phone cards */}
      <div className="space-y-3 md:hidden">
        {!shown
          ? Array.from({ length: 4 }).map((_, k) => <Skeleton key={k} className="h-28 w-full rounded-[var(--radius-card)]" />)
          : shown.map((r) => (
              <Link key={r.id} href={r.href} className="card block p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{r.name}</div>
                    <div className="text-sm text-ink-3">{r.kind}</div>
                  </div>
                  <FlagPill flag={r.flag} live={r.live} />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                  <div><div className="text-xs text-ink-3">Admin</div><div className="font-medium">{r.admin.split(" signers")[0]}</div></div>
                  <div><div className="text-xs text-ink-3">Delay</div><div className="tabular font-medium">{r.delay}</div></div>
                  <div><div className="text-xs text-ink-3">Exit window</div><div className="tabular font-medium">{r.window}</div></div>
                </div>
              </Link>
            ))}
      </div>

      <p className="mt-4 text-xs text-ink-3">Exit window = admin delay minus 30 minutes to notice and withdraw. Squads v4 venues are read live; others use the {MEASURED_ON} snapshot.</p>
    </div>
  )
}
