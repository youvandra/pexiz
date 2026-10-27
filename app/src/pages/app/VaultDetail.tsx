import { Link, useParams } from "wouter"
import { cn } from "@/lib/cn"
import { ago, duration, money, short } from "@/lib/format"
import { DEVNET, VAULTS, explorer } from "@/data/facts"
import { AUM_CAP, canary, useVault } from "@/data/vault"
import { useActivity } from "@/data/activity"
import { FlagPill, LinkButton, Skeleton, flagSurface } from "@/components/ui/kit"
import { DoorGlyph } from "@/components/ui/glyphs"
import { EmptyState, Icon, Svg } from "@/components/app/chrome"
import { Conditions, EventList, StatTile } from "@/components/app/bits"
import { ActionPanel } from "@/components/app/ActionPanel"
import { Dur } from "@/components/ui/meter"

const STATE = {
  green: { tone: "bg-safe-soft", title: "All clear", body: "Deposits are open. The vault holds Canary LP and earns what LPs earn." },
  amber: { tone: "bg-warn-soft", title: "Warning open", body: "Your position stays in the LP while the warning holds. If it is still open after 48 hours, the vault leaves for USDC." },
  red: { tone: "bg-danger-soft", title: "Leaving now", body: "The next update moves the vault to USDC in the same transaction." },
  exited: { tone: "bg-danger-soft", title: "Moved to USDC", body: "The vault sold its LP when the status turned to Get out. Withdraw your USDC, or vote to go back in once it reads Safe again." },
}

export function VaultDetail() {
  const { id } = useParams<{ id: string }>()
  const listing = VAULTS.find((v) => v.id === id)
  if (!listing) return <EmptyState title="No vault here" body="That address does not match a Pexiz vault." action={<LinkButton href="/" variant="line">All vaults</LinkButton>} />
  if (listing.status !== "live") return <Planned id={listing.id} />
  return <Canary />
}

function Canary() {
  const { data, error } = useVault()
  const { events } = useActivity()
  const v = data?.venue
  const state = data ? (data.vault.exited ? STATE.exited : STATE[data.venue.flag]) : null
  const flagEvents = events?.filter((e) => e.kind === "flag" || e.kind === "exit") ?? null
  const transfers = events?.filter((e) => e.kind !== "check" && e.kind !== "flag") ?? null

  return (
    <div>
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">← Vaults</Link>
      <div className="mt-4 mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-card)] border p-5 md:p-6" style={v ? flagSurface(v.flag) : { background: "var(--paper)" }}>
        <div className="flex items-center gap-4">
          <DoorGlyph className="size-14" />
          <div>
            <h1 className="tracking-display text-4xl font-medium md:text-5xl">Canary Pool</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-ink-3">
              <span>Holds Canary LP</span>·<span>{data ? `updated ${ago(data.readAt)}` : error ? "network unreachable" : "reading…"}</span>
            </div>
          </div>
        </div>
        {v ? <FlagPill flag={v.flag} size="md" /> : <Skeleton className="h-8 w-28 rounded-md" />}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          {state ? (
            <div className={cn("rounded-[var(--radius-card)] p-5", state.tone)}>
              <div className="font-semibold">{state.title}</div>
              <p className="mt-1 text-sm text-ink-2">{state.body}</p>
            </div>
          ) : <Skeleton className="h-24 w-full rounded-[var(--radius-card)]" />}

          <div className="grid grid-cols-2 gap-3 2xl:grid-cols-4">
            <StatTile label="Total deposited" value={data ? money(data.nav, 0) : null} />
            <StatTile label="Value of one share" value={data ? `$${data.pricePerShare.toFixed(3)}` : null} />
            <StatTile label="Times it has exited" value={data ? (data.vault.exits ? String(data.vault.exits) : "Never") : null} />
            <StatTile label="Space before the cap" value={data ? money(AUM_CAP - data.nav, 0) : null} sub="The cap is $10M" />
          </div>

          <section className="card p-0">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="font-semibold">What Pexiz checks</h2>
              <span className="text-xs text-ink-3">Checked on chain at every update</span>
            </div>
            <div className="px-5"><Conditions reasons={v?.reasons} /></div>
          </section>

          <section className="card p-0">
            <div className="border-b border-line px-5 py-4 font-semibold">Who controls this protocol</div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-5 p-5 text-sm md:grid-cols-4">
              {[
                ["Approvals needed", v ? `${v.threshold} of ${v.members.length} signers` : null],
                ["Change delay", v ? duration(v.timeLockSecs) : null],
                ["Time to exit", v ? (v.exitWindowSecs > 0 ? duration(v.exitWindowSecs) : "No time") : null],
                ["Approvals signed in advance", v ? (v.presigners.length ? `${v.presigners.length} found` : "None") : null],
              ].map(([k, val]) => (
                <div key={k}>
                  <dt className="text-ink-3">{k}</dt>
                  <dd className="mt-1 text-lg font-semibold">{val ? <Dur text={val} /> : <Skeleton className="h-6 w-16" />}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="card p-0">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="font-semibold">Status history</h2>
              <Link href="/activity" className="text-sm text-ink-2 underline decoration-line-2 underline-offset-4 hover:text-ink">All activity</Link>
            </div>
            <EventList events={flagEvents?.slice(0, 6) ?? null} empty="The status has not changed yet." />
          </section>

          <section className="card p-0">
            <div className="border-b border-line px-5 py-4 font-semibold">Recent deposits and withdrawals</div>
            <EventList events={transfers?.slice(0, 6) ?? null} empty="No deposits yet. Be the first." />
          </section>

          <section className="card p-0">
            <div className="border-b border-line px-5 py-4 font-semibold">Addresses</div>
            <dl className="divide-y divide-line text-sm">
              {([
                ["This vault", canary.vault.toBase58()],
                ["Its status account", DEVNET.venue],
                ["Protocol multisig", DEVNET.multisig],
                ["Vault program", DEVNET.vault],
                ["Oracle program", DEVNET.oracle],
              ] as const).map(([k, a]) => (
                <div key={k} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <dt className="text-ink-2">{k}</dt>
                  <dd><a href={explorer(a, "devnet")} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-mono text-xs hover:underline">{short(a, 6)}<Svg className="size-3 text-ink-3">{Icon.ext}</Svg></a></dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <aside className="-order-1 lg:sticky lg:top-24 lg:order-none lg:self-start">
          <ActionPanel />
        </aside>
      </div>
    </div>
  )
}

function Planned({ id }: { id: string }) {
  const v = VAULTS.find((x) => x.id === id)!
  return (
    <div>
      <Link href="/" className="text-sm text-ink-3 hover:text-ink">← Vaults</Link>
      <div className="mt-6">
        <EmptyState
          glyph={<DoorGlyph className="size-16" tint="#E9C22E" />}
          title={`${v.name} vault is planned`}
          body={`${v.blurb} It opens on mainnet after the canary vault has run a full exit and re-entry cycle.`}
          action={<div className="flex flex-wrap justify-center gap-2"><LinkButton href={`/monitor/${v.monitorId}`}><Svg>{Icon.monitor}</Svg>Watch the protocol</LinkButton><LinkButton href="/vault/canary" variant="line"><Svg>{Icon.vault}</Svg>Try the canary vault</LinkButton></div>}
        />
      </div>
    </div>
  )
}
