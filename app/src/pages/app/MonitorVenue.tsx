import { Link, Redirect, useParams } from "wouter"
import { ago, duration, short } from "@/lib/format"
import { MEASURED_ON, VAULTS, VENUES, explorer } from "@/data/facts"
import { useBoard, type Assessment } from "@/data/chain"
import { STATUS_MEANING } from "@/data/assess"
import { Dur, ExitRaceDetail } from "@/components/ui/meter"
import { Button, FlagPill, LinkButton, Skeleton, VenueLogo, flagSurface } from "@/components/ui/kit"
import { useToasts } from "@/lib/solana"
import { EmptyState, Icon, Svg } from "@/components/app/chrome"
import { StatTile } from "@/components/app/bits"
import { useState } from "react"
import { telegramLink, useEvents, useWatch, type WatchEvent } from "@/data/watch"

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
    ["Program address", venue.program],
    ["Who can upgrade it", venue.authority],
    ["Multisig address", venue.multisig],
  ]

  return (
    <div>
      <Link href="/monitor" className="text-sm text-ink-3 hover:text-ink">← Monitor</Link>
      <div className="mt-4 mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-card)] border p-5 md:p-6" style={r ? flagSurface(r.assessment) : { background: "var(--paper)" }}>
        <div className="flex items-center gap-4">
          <VenueLogo src={venue.logo} name={venue.name} className="size-14 rounded-2xl" />
          <div>
          <h1 className="tracking-display text-4xl font-medium md:text-5xl">{venue.name}</h1>
          <div className="mt-2 text-sm text-ink-3">{venue.kind} · {ADMIN_LABEL[venue.admin]} · {r?.live && readAt ? `updated ${ago(readAt)}` : r ? `as of ${MEASURED_ON}` : "reading…"}</div>
          </div>
        </div>
        {r ? <FlagPill flag={r.assessment} size="md" /> : <Skeleton className="h-8 w-28 rounded-full" />}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <StatTile label="Time to exit" value={r ? <Dur text={r.exitWindowSecs === undefined ? "—" : r.exitWindowSecs <= 0 ? "No time" : duration(r.exitWindowSecs)} /> : null} sub="Spare time after you withdraw" />
        <StatTile label="Change delay" value={r ? <Dur text={r.timeLockSecs ? duration(r.timeLockSecs) : r.timeLockSecs === 0 || venue.admin === "squads-v3" ? "None" : "—"} /> : null} sub="How long an approved change waits" />
        <StatTile label="Approvals needed" value={r ? (r.threshold ? `${r.threshold} of ${r.members}` : "—") : null} unit={r?.threshold ? "signers" : undefined} sub={r?.txIndex !== undefined ? `${r.txIndex} proposals so far` : undefined} />
      </div>

      <section className="card mt-6 p-6">
        <h2 className="font-semibold">Would you get out in time?</h2>
        <p className="mt-1 text-sm text-ink-2">{r?.why ?? "Reading…"}</p>
        {r && <p className="mt-3 flex flex-wrap items-center gap-2 text-sm"><FlagPill flag={r.assessment} /><span className="text-ink-2">{STATUS_MEANING[r.assessment]}</span></p>}
        {r && <ExitRaceDetail delaySecs={r.timeLockSecs ?? (venue.admin === "squads-v3" ? 0 : undefined)} flag={r.assessment} />}
        {venue.note && <p className="mt-4 text-sm text-ink-3">{venue.note}.</p>}
        {r?.authorityMatches === false && <p className="mt-3 text-sm font-semibold text-danger">The upgrade authority no longer matches the recorded multisig vault.</p>}
      </section>

      {r?.pendingUpgrades && r.pendingUpgrades.length > 0 && (
        <section className="card mt-6 p-0">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="font-semibold">Approved upgrades waiting to execute</h2>
            <span className="text-xs text-ink-3">Approved changes to the program's code</span>
          </div>
          <ul className="divide-y divide-line text-sm">
            {r.pendingUpgrades.map((p) => {
              const now = Date.now() / 1000
              const ready = p.readyAt !== undefined && p.readyAt <= now
              return (
                <li key={String(p.index)} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div>
                    <div className="font-semibold">Proposal #{String(p.index)}</div>
                    <div className="text-ink-3">{p.approvedAt ? `Approved ${new Date(p.approvedAt * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}, ${Math.floor((Date.now() / 1000 - p.approvedAt) / 86_400)} days ago` : "Approved"}</div>
                  </div>
                  <span className={ready ? "rounded-md border border-warn/30 bg-warn-soft px-2 py-1 text-xs font-semibold text-warn" : "rounded-md border border-line-2 px-2 py-1 text-xs font-semibold text-ink-2"}>
                    {ready ? "Can execute now" : p.readyAt ? `Lands in ${duration(Math.round(p.readyAt - now))}` : "Waiting"}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <History id={venue.id} />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-0">
          <div className="border-b border-line px-5 py-4 font-semibold">Signers{r?.threshold ? <span className="font-normal text-ink-3"> · {r.threshold} must approve</span> : null}</div>
          {r?.memberKeys ? (
            <ul className="divide-y divide-line text-sm">
              {r.memberKeys.map((k, i) => (
                <li key={k} className="flex items-center justify-between px-5 py-3">
                  <span className="text-ink-3">Signer {i + 1}</span>
                  <a href={explorer(k)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-mono text-xs hover:underline">{short(k, 6)}<Svg className="size-3 text-ink-3">{Icon.ext}</Svg></a>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-5 py-8 text-sm text-ink-2">{rows ? "Signers are listed for Squads multisigs only." : <Skeleton className="h-20 w-full" />}</div>
          )}
        </section>

        <div className="space-y-6">
          <section className="card p-0">
            <div className="border-b border-line px-5 py-4 font-semibold">Addresses</div>
            <dl className="divide-y divide-line text-sm">
              {facts.filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <dt className="text-ink-2">{k}</dt>
                  <dd><a href={explorer(v!)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-mono text-xs hover:underline">{short(v!, 6)}<Svg className="size-3 text-ink-3">{Icon.ext}</Svg></a></dd>
                </div>
              ))}
            </dl>
          </section>
          <Alerts id={venue.id} name={venue.name} />
          <ShareCard id={venue.id} name={venue.name} />
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


/** The protocol's share card, with ways to pass it on. */
function ShareCard({ id, name }: { id: string; name: string }) {
  const { push } = useToasts()
  const url = `${location.origin}/app/monitor/${id}`
  const image = `/og/${id}.png`
  const post = `https://x.com/intent/post?text=${encodeURIComponent(`Would you have time to leave ${name}? Read from chain by Pexiz.`)}&url=${encodeURIComponent(url)}`
  return (
    <section className="card p-0">
      <div className="border-b border-line px-5 py-4 font-semibold">Share this status</div>
      <div className="p-5">
        <img src={image} alt={`${name} status card`} className="aspect-[1200/630] w-full rounded-xl border border-line bg-sand object-cover" loading="lazy" />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="line" className="h-9 px-3 text-sm" onClick={() => { navigator.clipboard?.writeText(url); push({ kind: "info", title: "Link copied" }) }}><Svg>{Icon.copy}</Svg>Copy link</Button>
          <LinkButton href={post} variant="line" className="h-9 px-3 text-sm" external><Svg>{Icon.arrowUpRight}</Svg>Post on X</LinkButton>
          <a href={image} download={`pexiz-${id}.png`} className="btn btn-line h-9 px-3 text-sm"><Svg>{Icon.deposit}</Svg>Save image</a>
        </div>
      </div>
    </section>
  )
}

const TONE: Record<WatchEvent["tone"], string> = { bad: "bg-danger", good: "bg-safe", info: "bg-line-2" }
const day = (unix: number) => new Date(unix * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
const SHOWN = 8

/** Every change to the admin setup the watcher has seen or read back from chain. */
function History({ id }: { id: string }) {
  const { events, failed } = useEvents(id)
  const [all, setAll] = useState(false)
  if (failed) return null
  const list = events && (all ? events : events.slice(0, SHOWN))
  return (
    <section className="card mt-6 p-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-4">
        <h2 className="font-semibold">What changed</h2>
        <span className="text-xs text-ink-3">Signers, approvals, delay and upgrades, read from chain</span>
      </div>
      {!list ? (
        <div className="p-5"><Skeleton className="h-24 w-full" /></div>
      ) : list.length === 0 ? (
        <p className="px-5 py-6 text-sm text-ink-2">Nothing recorded yet.</p>
      ) : (
        <ol className="divide-y divide-line text-sm">
          {list.map((e) => (
            <li key={e.key} className="grid grid-cols-[6.5rem_1fr] gap-x-4 px-5 py-3.5 sm:grid-cols-[7.5rem_1fr]">
              <span className="tabular text-ink-3">{day(e.at)}</span>
              <div className="flex min-w-0 items-start gap-2.5">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${TONE[e.tone]}`} aria-hidden />
                <div className="min-w-0">
                  <div className={e.tone === "bad" ? "font-semibold text-danger" : "font-medium"}>{e.title}</div>
                  {e.detail && <div className="mt-0.5 text-ink-3">{e.detail}</div>}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      {events && events.length > SHOWN && (
        <div className="border-t border-line px-5 py-3">
          <button onClick={() => setAll((a) => !a)} className="text-sm font-semibold">{all ? "Show fewer" : `Show all ${events.length}`}</button>
        </div>
      )}
    </section>
  )
}

/** Follow this protocol on Telegram. */
function Alerts({ id, name }: { id: string; name: string }) {
  const w = useWatch()
  const n = w?.venues.find((v) => v.venue === id)?.subscribers ?? 0
  return (
    <section className="card p-5">
      <div className="font-semibold">Get alerts for {name}</div>
      <p className="mt-1 text-sm text-ink-2">A Telegram message when a signer, the approvals needed, the change delay or the status changes. Checked every {w ? Math.round(w.pollSecs / 60) : 5} minutes.</p>
      {w?.bot ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <LinkButton href={telegramLink(w.bot, id)} className="h-10 px-4 text-sm" external><Svg>{Icon.bell}</Svg>Follow on Telegram</LinkButton>
          {n > 0 && <span className="text-sm text-ink-3">{n} following</span>}
        </div>
      ) : (
        <p className="mt-4 text-sm text-ink-3">Alerts are not switched on here yet.</p>
      )}
    </section>
  )
}
