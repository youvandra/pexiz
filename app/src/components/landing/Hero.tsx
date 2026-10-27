import { cn } from "@/lib/cn"
import { Link } from "wouter"
import { ago } from "@/lib/format"
import { useBoard } from "@/data/chain"
import { VENUES } from "@/data/facts"
import { FlagPill, LinkButton, Skeleton } from "@/components/ui/kit"
import { DoorGlyph } from "@/components/ui/glyphs"
import { Icon, Svg } from "@/components/ui/icons"

export function Hero() {
  return (
    <section
      className="relative -mt-16 overflow-hidden pt-16"
      style={{ background: "radial-gradient(80% 70% at 85% 0%, #e3f1e4 0%, transparent 60%), radial-gradient(70% 60% at 0% 100%, #f8ecc4 0%, transparent 60%), var(--cream)" }}
    >
      <div className="mx-auto grid max-w-[1180px] gap-14 px-5 pb-16 pt-14 md:px-8 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:pb-24 lg:pt-24">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-paper px-3 py-1.5 text-xs font-medium text-ink-2">
            <img src="/logos/solana.svg" alt="" className="size-3.5" />
            Built on Solana
          </div>
          <h1 className="tracking-display text-[clamp(2.6rem,6vw,4.6rem)] font-medium leading-[1.02]">
            Your LP position, protected from admin takeovers.
          </h1>
          <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-ink-2">
            Pexiz watches who holds the admin keys of the protocols you provide liquidity to. If those keys get weaker, your vault moves to USDC on its own, before anyone can drain the pool.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href="/app/monitor" className="h-12 px-5"><Svg>{Icon.monitor}</Svg>Check a protocol</LinkButton>
            <LinkButton href="/#how" variant="line" className="h-12 px-5">How it works<Svg>{Icon.arrowDown}</Svg></LinkButton>
          </div>
        </div>
        <HeroCard />
      </div>

      <LiveStrip />
    </section>
  )
}

const GROUPS = [
  { flag: "green", empty: "None right now" },
  { flag: "amber", empty: "None right now" },
  { flag: "exposed", empty: "None right now" },
  { flag: "red", empty: "Nothing has changed for the worse" },
] as const

/**
 * What Pexiz is watching, as it stands: every protocol sorted under its
 * status, so the strip says something a logo wall cannot.
 */
function LiveStrip() {
  const { rows, readAt } = useBoard()
  // Before the live read lands, show the venues without a verdict.
  const list = rows ?? []
  const unrated = list.filter((r) => r.assessment === "unrated").length
  return (
    <div className="border-t border-line bg-paper/70">
      <div className="mx-auto max-w-[1180px] px-5 py-8 md:px-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="flex items-center gap-2.5 text-sm font-semibold">
            <span className="live-dot text-safe" />
            Watching {VENUES.length} protocols right now
          </div>
          <div className="text-xs text-ink-3">
            {readAt ? `Read from Solana mainnet ${ago(readAt)}` : "Reading Solana mainnet…"}
            {unrated > 0 && ` · ${unrated} not rated`}
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {GROUPS.map(({ flag, empty }) => {
            const members = list.filter((r) => r.assessment === flag)
            return (
              <Link key={flag} href="/app/monitor" className="group rounded-[var(--radius-card)] border border-line bg-cream p-4 transition-colors hover:border-line-2">
                <div className="flex items-center justify-between">
                  <FlagPill flag={flag} />
                  <span className="tabular text-2xl font-medium tracking-tight">{rows ? members.length : "–"}</span>
                </div>
                {!rows ? (
                  <div className="mt-4 space-y-2"><Skeleton className="h-6 w-28" /><Skeleton className="h-6 w-20" /></div>
                ) : members.length ? (
                  <ul className="mt-4 space-y-2">
                    {members.map((r) => (
                      <li key={r.venue.id} className="flex items-center gap-2.5 text-sm font-medium">
                        <img src={r.venue.logo} alt="" className="size-6 rounded-md object-contain" />
                        <span className="truncate">{r.venue.name}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 text-sm text-ink-3">{empty}</p>
                )}
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** A still picture of the product: one vault, its checks, its state. */
function HeroCard() {
  const checks: [string, boolean][] = [
    ["Changes wait longer than you need to exit", true],
    ["Signers stayed the same this week", true],
    ["No approvals signed in advance", false],
  ]
  return (
    <div className="card mx-auto w-full max-w-[440px] p-0">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div className="flex items-center gap-3">
          <DoorGlyph className="size-9" />
          <div>
            <div className="font-semibold">Your vault</div>
            <div className="text-xs text-ink-3">Example of a warning</div>
          </div>
        </div>
        <FlagPill flag="amber" />
      </div>
      <div className="p-5">
        <div className="text-xs uppercase tracking-[0.08em] text-ink-3">Your position</div>
        <div className="tabular tracking-display mt-1 text-4xl font-medium">$12,480.00</div>
        <ul className="mt-5 space-y-2.5">
          {checks.map(([t, ok]) => (
            <li key={t} className="flex items-center gap-2.5 text-sm">
              <span className={cn("grid size-5 place-items-center rounded-full text-[11px] font-bold", ok ? "bg-safe-soft text-safe" : "bg-warn-soft text-warn")}>{ok ? "✓" : "!"}</span>
              <span className={ok ? "text-ink-2" : "font-medium"}>{t}</span>
            </li>
          ))}
        </ul>
        <div className="mt-5 rounded-xl bg-sand/70 px-4 py-3 text-sm text-ink-2">
          Deposits paused. If this isn't fixed in 48 hours, the vault moves to USDC.
        </div>
      </div>
    </div>
  )
}

export function Arrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cn("size-4", className)} aria-hidden>
      <path d="M3 8h9.5M8.5 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
