import { Link, useParams } from "wouter"
import { duration, short } from "@/lib/format"
import { VENUES, explorer } from "@/data/facts"
import { useBoard } from "@/data/chain"
import { FlagPill, Skeleton } from "@/components/ui/kit"
import { PageHead } from "./Shell"

export function VenuePage() {
  const { id } = useParams<{ id: string }>()
  const venue = VENUES.find((v) => v.id === id)
  const { rows } = useBoard()
  const r = rows?.find((x) => x.venue.id === id)
  if (!venue) return <div className="text-ink-2">Unknown venue. <Link href="/" className="underline">Back to the board</Link></div>

  const facts: [string, string | undefined, string?][] = [
    ["Program", venue.program, explorer(venue.program)],
    ["Upgrade authority", venue.authority, explorer(venue.authority)],
    ["Multisig", venue.multisig, venue.multisig && explorer(venue.multisig)],
  ]

  return (
    <div className="mx-auto max-w-[1000px]">
      <Link href="/" className="text-sm text-ink-3 hover:text-ink">← Board</Link>
      <PageHead title={venue.name} right={r ? <FlagPill flag={r.assessment} live={r.live} className="text-sm" /> : <Skeleton className="h-7 w-24 rounded-full" />} />
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["Exit window", r ? (r.exitWindowSecs === undefined ? "—" : r.exitWindowSecs <= 0 ? "None" : duration(r.exitWindowSecs)) : null],
          ["Admin delay", r ? (r.timeLockSecs !== undefined ? duration(r.timeLockSecs) : venue.admin === "squads-v3" ? "None" : "—") : null],
          ["Signers", r ? (r.threshold ? `${r.threshold} of ${r.members}` : "—") : null],
        ].map(([k, v]) => (
          <div key={k} className="card p-5">
            <div className="text-xs uppercase tracking-[0.08em] text-ink-3">{k}</div>
            <div className="tabular tracking-display mt-2 text-4xl font-medium">{v ?? <Skeleton className="h-10 w-28" />}</div>
          </div>
        ))}
      </div>
      <div className="card mt-4 p-5">
        <div className="font-semibold">Reading</div>
        <p className="mt-1 text-ink-2">{r?.why ?? "Reading…"}</p>
        {venue.note && <p className="mt-2 text-sm text-ink-3">{venue.note}</p>}
        {r?.authorityMatches === false && <p className="mt-2 text-sm font-medium text-danger">Upgrade authority no longer matches the recorded multisig vault.</p>}
      </div>
      <dl className="card mt-4 divide-y divide-line p-0 text-sm">
        {facts.filter(([, v]) => v).map(([k, v, href]) => (
          <div key={k} className="flex flex-wrap justify-between gap-3 px-5 py-4">
            <dt className="text-ink-2">{k}</dt>
            <dd><a href={href} target="_blank" rel="noreferrer" className="font-mono text-xs underline decoration-line-2 underline-offset-4" title={v}>{short(v!, 8)}</a></dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
