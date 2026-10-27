import { Link, Redirect, useParams } from "wouter"
import { ago, duration, short } from "@/lib/format"
import { ASSUMED_EXIT_SECS, VAULTS, VENUES, explorer } from "@/data/facts"
import { useBoard } from "@/data/chain"
import { FlagPill, LinkButton, Skeleton, VenueLogo } from "@/components/ui/kit"
import { EmptyState, Icon, Svg } from "@/components/app/chrome"
import { StatTile } from "@/components/app/bits"

const ADMIN_LABEL = {
  "squads-v4": "Squads v4 multisig",
  "squads-v3": "Squads v3 multisig",
  governance: "SPL Governance",
  dormant: "Single key, unused",
}

export function MonitorVenue() {
  const { id } = useParams<{ id: string }>()
  const venue = VENUES.find((v) => v.id === id)
  const { rows, readAt } = useBoard()
  if (id === "canary") return <Redirect to="/vault/canary" />
  if (!venue) return <EmptyState title="Unknown protocol" body="Pexiz does not watch this protocol yet." action={<LinkButton href="/monitor" variant="line">Back to Monitor</LinkButton>} />
  const r = rows?.find((x) => x.venue.id === id)
  const vault = VAULTS.find((v) => v.monitorId === id)

  const facts: [string, string | undefined][] = [
    ["Program", venue.program],
    ["Upgrade authority", venue.authority],
    ["Multisig", venue.multisig],
  ]

  return (
    <div>
      <Link href="/monitor" className="text-sm text-ink-3 hover:text-ink">← Monitor</Link>
      <div className="mt-4 mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <VenueLogo src={venue.logo} name={venue.name} className="size-14 rounded-2xl" />
          <div>
          <h1 className="tracking-display text-4xl font-medium md:text-5xl">{venue.name}</h1>
          <div className="mt-2 text-sm text-ink-3">{venue.kind} · {ADMIN_LABEL[venue.admin]} · {r?.live && readAt ? `read from mainnet ${ago(readAt)}` : r ? "snapshot" : "reading…"}</div>
          </div>
        </div>
        {r ? <FlagPill flag={r.assessment} live={r.live} className="px-3.5 py-1.5 text-sm" /> : <Skeleton className="h-8 w-28 rounded-full" />}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <StatTile label="Exit window" value={r ? (r.exitWindowSecs === undefined ? "—" : r.exitWindowSecs <= 0 ? "None" : duration(r.exitWindowSecs)) : null} sub="Time left to act after a change is approved" />
        <StatTile label="Admin delay" value={r ? (r.timeLockSecs !== undefined ? duration(r.timeLockSecs) : venue.admin === "squads-v3" ? "None" : "—") : null} sub="Timelock on approved changes" />
        <StatTile label="Signers" value={r ? (r.threshold ? `${r.threshold} of ${r.members}` : "—") : null} sub={r?.txIndex !== undefined ? `${r.txIndex} multisig transactions so far` : "Approvals needed"} />
      </div>

      <section className="card mt-6 p-6">
        <h2 className="font-semibold">Would you get out in time?</h2>
        <p className="mt-1 text-sm text-ink-2">{r?.why ?? "Reading…"}</p>
        {r && <WindowBar delay={r.timeLockSecs ?? 0} />}
        {venue.note && <p className="mt-4 text-sm text-ink-3">{venue.note}.</p>}
        {r?.authorityMatches === false && <p className="mt-3 text-sm font-semibold text-danger">The upgrade authority no longer matches the recorded multisig vault.</p>}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-0">
          <div className="border-b border-line px-5 py-4 font-semibold">Signers</div>
          {r?.memberKeys ? (
            <ul className="divide-y divide-line text-sm">
              {r.memberKeys.map((k, i) => (
                <li key={k} className="flex items-center justify-between px-5 py-3">
                  <span className="text-ink-3">Member {i + 1}</span>
                  <a href={explorer(k)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-mono text-xs hover:underline">{short(k, 6)}<Svg className="size-3 text-ink-3">{Icon.ext}</Svg></a>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-5 py-8 text-sm text-ink-2">{rows ? "Signer list is read only for Squads v4 venues." : <Skeleton className="h-20 w-full" />}</div>
          )}
        </section>

        <div className="space-y-6">
          <section className="card p-0">
            <div className="border-b border-line px-5 py-4 font-semibold">On chain</div>
            <dl className="divide-y divide-line text-sm">
              {facts.filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <dt className="text-ink-2">{k}</dt>
                  <dd><a href={explorer(v!)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-mono text-xs hover:underline">{short(v!, 6)}<Svg className="size-3 text-ink-3">{Icon.ext}</Svg></a></dd>
                </div>
              ))}
            </dl>
          </section>
          {vault && (
            <Link href={`/vault/${vault.id}`} className="card flex items-center justify-between gap-4 p-5 transition-colors hover:bg-sand/40">
              <div>
                <div className="font-semibold">{vault.name} vault</div>
                <div className="text-sm text-ink-2">{vault.status === "live" ? "Open now" : "Planned for mainnet"}</div>
              </div>
              <span className="text-sm font-semibold">View →</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

/** Delay drawn against the time a user needs to leave. */
function WindowBar({ delay }: { delay: number }) {
  const span = Math.max(delay, ASSUMED_EXIT_SECS) * 1.15
  const exitPct = (ASSUMED_EXIT_SECS / span) * 100
  const delayPct = (delay / span) * 100
  const safe = delay > ASSUMED_EXIT_SECS
  return (
    <div className="mt-6">
      <div className="relative h-12 rounded-xl bg-sand">
        <div className="absolute inset-y-0 left-0 rounded-xl" style={{ width: `${Math.max(delayPct, 1.5)}%`, background: safe ? "var(--safe-soft)" : "var(--danger-soft)" }} />
        <div className="absolute inset-y-1.5 left-0 rounded-lg bg-ink/85" style={{ width: `${exitPct}%`, marginLeft: 6 }} />
        <div className="absolute inset-y-0 border-r-2 border-dashed" style={{ left: `${delayPct}%`, borderColor: safe ? "var(--safe)" : "var(--danger)" }} />
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-ink-2">
        <span><span className="mr-1.5 inline-block size-2 rounded-full bg-ink" />Time you need: {duration(ASSUMED_EXIT_SECS)}</span>
        <span><span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: safe ? "var(--safe)" : "var(--danger)" }} />Admin delay: {delay ? duration(delay) : "none"}</span>
      </div>
    </div>
  )
}
