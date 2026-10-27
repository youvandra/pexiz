import { useEffect, useState } from "react"
import { Link, useLocation, useParams } from "wouter"
import { duration, short } from "@/lib/format"
import { VENUES, explorer } from "@/data/facts"
import { STATUS_MEANING, type Assessment } from "@/data/assess"
import type { WatchEvent } from "@/data/watch"
import { Button, FlagPill, Skeleton, flagSurface } from "@/components/ui/kit"
import { Dur } from "@/components/ui/meter"
import { Icon, PageHead, Svg } from "@/components/app/chrome"
import { StatTile } from "@/components/app/bits"
import { ChangeList } from "@/components/app/changes"

type Control = "immutable" | "squads-v4" | "squads-v3" | "governance" | "single-key" | "program"

interface CheckResult {
  program: string
  watched?: string
  control: Control
  authority: string | null
  deployedAt?: number
  multisig?: string
  threshold?: number
  members?: string[]
  timeLockSecs?: number
  txIndex?: number
  pendingUpgrades?: { index: number; approvedAt?: number; readyAt?: number }[]
  verdict: { assessment: Assessment; why: string; exitWindowSecs?: number }
  events: WatchEvent[]
  historyCut?: boolean
}

const CONTROL: Record<Control, string> = {
  "squads-v4": "Multisig",
  "squads-v3": "Old multisig",
  governance: "DAO vote",
  "single-key": "One key",
  program: "Another program",
  immutable: "Nobody",
}

/** Programs to try, one of each kind of answer. */
const EXAMPLES = [
  { name: "Jupiter Perps", program: VENUES.find((v) => v.id === "jupiter-perps")!.program },
  { name: "Kamino Lend", program: "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD" },
  { name: "SPL Token", program: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
]

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const day = (unix: number) => new Date(unix * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })

function useCheck(program: string | undefined) {
  const [state, setState] = useState<{ result?: CheckResult; error?: string; loading: boolean }>({ loading: false })
  useEffect(() => {
    if (!program) return setState({ loading: false })
    let on = true
    setState({ loading: true })
    fetch(`/api/check/${program}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({ error: "The checker is not running right now." }))
        if (!on) return
        setState(r.ok ? { result: body, loading: false } : { error: body.error ?? "Something went wrong.", loading: false })
      })
      .catch(() => on && setState({ error: "The checker is not running right now.", loading: false }))
    return () => { on = false }
  }, [program])
  return state
}

export function Check() {
  const { program } = useParams<{ program?: string }>()
  const [, go] = useLocation()
  const [text, setText] = useState(program ?? "")
  const { result, error, loading } = useCheck(program)
  useEffect(() => setText(program ?? ""), [program])
  const valid = BASE58.test(text.trim())

  return (
    <div>
      <PageHead
        title="Check a program"
        sub="Paste any Solana program address. Pexiz reads who can change its code, how many must agree, how long a change waits, and what they have changed before."
      />

      <form
        className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center"
        onSubmit={(e) => { e.preventDefault(); if (valid) go(`/check/${text.trim()}`) }}
      >
        <label className="sr-only" htmlFor="program">Program address</label>
        <input
          id="program"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Program address, e.g. PERPHjGB…"
          spellCheck={false}
          autoComplete="off"
          className="h-12 min-w-0 flex-1 rounded-xl bg-transparent px-3 font-mono text-sm outline-none placeholder:font-sans placeholder:text-ink-3"
        />
        <Button type="submit" disabled={!valid || loading} className="h-12 justify-center px-6">{loading ? "Reading…" : "Check"}</Button>
      </form>
      {text && !valid && <p className="mt-2 text-sm text-danger">That does not look like a Solana address.</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-3">Try</span>
        {EXAMPLES.map((x) => (
          <Link key={x.program} href={`/check/${x.program}`} className="rounded-full border border-line bg-paper px-3 py-1 text-ink-2 transition-colors hover:border-ink hover:text-ink">{x.name}</Link>
        ))}
      </div>

      <div className="mt-8">
        {loading && <Loading />}
        {error && !loading && (
          <div className="card p-6">
            <div className="font-semibold">Could not check that program</div>
            <p className="mt-1 text-sm text-ink-2">{error}</p>
          </div>
        )}
        {result && !loading && <Result r={result} />}
        {!program && <Reads />}
      </div>
    </div>
  )
}

/** Before anything is checked: what a check answers. */
function Reads() {
  const items = [
    ["Who can change it", "One key, a multisig, a DAO, or nobody at all."],
    ["How many must agree", "For a Squads multisig: the approvals needed and who the signers are."],
    ["How long a change waits", "The delay between approval and the change landing, and any upgrade already queued."],
    ["What they changed before", "Signers swapped, delays cut, code upgraded, with dates, from the multisig's own record."],
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map(([t, b]) => (
        <div key={t} className="rounded-[var(--radius-card)] border border-line p-5">
          <div className="font-semibold">{t}</div>
          <p className="mt-1 text-sm text-ink-2">{b}</p>
        </div>
      ))}
    </div>
  )
}

function Loading() {
  return (
    <div className="space-y-4">
      <div className="card p-6">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="mt-3 h-4 w-80 max-w-full" />
        <p className="mt-4 text-sm text-ink-3">Reading from chain. A busy multisig takes up to half a minute.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-[var(--radius-card)]" />)}</div>
    </div>
  )
}

function Result({ r }: { r: CheckResult }) {
  const v = r.verdict
  const watched = r.watched && VENUES.find((x) => x.id === r.watched)
  const now = Date.now() / 1000
  const delay = r.timeLockSecs === undefined ? (r.control === "squads-v3" || r.control === "single-key" ? "None" : "—") : r.timeLockSecs ? duration(r.timeLockSecs) : "None"
  return (
    <div className="space-y-6">
      <section className="rounded-[var(--radius-card)] border p-5 md:p-6" style={flagSurface(v.assessment)}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm text-ink-3">{watched ? watched.name : "Program"}</div>
            <a href={explorer(r.program)} target="_blank" rel="noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1.5 font-mono text-lg font-semibold hover:underline md:text-xl">
              <span className="truncate">{short(r.program, 8)}</span><Svg className="size-4 shrink-0 text-ink-3">{Icon.ext}</Svg>
            </a>
          </div>
          <FlagPill flag={v.assessment} size="md" />
        </div>
        <p className="mt-4 font-medium">{v.why}</p>
        <p className="mt-1 text-sm text-ink-2">{STATUS_MEANING[v.assessment]}</p>
        {watched && (
          <Link href={`/monitor/${watched.id}`} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold">
            Pexiz watches this one around the clock<Svg>{Icon.arrow}</Svg>
          </Link>
        )}
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Who can change it" value={CONTROL[r.control]} sub={r.authority ? short(r.authority, 4) : "No upgrade key"} />
        <StatTile label="Approvals needed" value={r.threshold ? `${r.threshold} of ${r.members?.length}` : r.control === "single-key" ? "1" : "—"} sub={r.txIndex !== undefined ? `${r.txIndex} proposals so far` : undefined} />
        <StatTile label="Change delay" value={<Dur text={delay} />} sub="How long an approved change waits" />
        <StatTile label="Last deployed" value={r.deployedAt ? day(r.deployedAt) : "—"} sub="Its code last changed" />
      </div>

      {r.pendingUpgrades && r.pendingUpgrades.length > 0 && (
        <section className="card p-0">
          <div className="border-b border-line px-5 py-4 font-semibold">Approved upgrades waiting to run</div>
          <ul className="divide-y divide-line text-sm">
            {r.pendingUpgrades.map((p) => {
              const ready = p.readyAt !== undefined && p.readyAt <= now
              return (
                <li key={p.index} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div>
                    <div className="font-semibold">Proposal #{p.index}</div>
                    <div className="text-ink-3">{p.approvedAt ? `Approved ${day(p.approvedAt)}` : "Approved"}</div>
                  </div>
                  <span className={ready ? "rounded-md border border-warn/30 bg-warn-soft px-2 py-1 text-xs font-semibold text-warn" : "rounded-md border border-line-2 px-2 py-1 text-xs font-semibold text-ink-2"}>
                    {ready ? "Can run now" : p.readyAt ? `Can run in ${duration(Math.round(p.readyAt - now))}` : "Waiting"}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {r.control === "squads-v4" && (
        <ChangeList events={r.events} note={r.historyCut ? "Its latest 300 transactions" : undefined} />
      )}

      {r.members && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card p-0">
            <div className="border-b border-line px-5 py-4 font-semibold">Signers<span className="font-normal text-ink-3"> · {r.threshold} must approve</span></div>
            <ul className="divide-y divide-line text-sm">
              {r.members.map((k, i) => (
                <li key={k} className="flex items-center justify-between px-5 py-3">
                  <span className="text-ink-3">Signer {i + 1}</span>
                  <a href={explorer(k)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-mono text-xs hover:underline">{short(k, 6)}<Svg className="size-3 text-ink-3">{Icon.ext}</Svg></a>
                </li>
              ))}
            </ul>
          </section>
          <section className="card p-0">
            <div className="border-b border-line px-5 py-4 font-semibold">Addresses</div>
            <dl className="divide-y divide-line text-sm">
              {([["Program", r.program], ["Upgrade key", r.authority], ["Multisig", r.multisig]] as const).filter(([, a]) => a).map(([k, a]) => (
                <div key={k} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <dt className="text-ink-2">{k}</dt>
                  <dd><a href={explorer(a!)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-mono text-xs hover:underline">{short(a!, 6)}<Svg className="size-3 text-ink-3">{Icon.ext}</Svg></a></dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      )}
    </div>
  )
}
