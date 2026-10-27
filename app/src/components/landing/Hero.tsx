import { cn } from "@/lib/cn"
import { Link } from "wouter"
import { VENUES } from "@/data/facts"
import { FlagPill, LinkButton } from "@/components/ui/kit"
import { Icon, Svg } from "@/components/ui/icons"
import { Reveal } from "@/components/ui/reveal"

export function Hero() {
  return (
    <section
      className="relative -mt-16 overflow-hidden pt-16"
      style={{ background: "radial-gradient(80% 70% at 85% 0%, #e3f1e4 0%, transparent 60%), radial-gradient(70% 60% at 0% 100%, #f8ecc4 0%, transparent 60%), var(--cream)" }}
    >
      <div className="mx-auto grid max-w-[1180px] gap-14 px-5 pb-16 pt-14 md:px-8 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:pb-24 lg:pt-24">
        <Reveal>
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
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href="#protocols" className="btn btn-ink h-12 rounded-full px-5">
              Find your protocol
              <span className="grid size-7 place-items-center rounded-full bg-paper/15 motion-safe:animate-[nudge_2.4s_ease-in-out_infinite]"><Svg className="size-3.5">{Icon.arrowDown}</Svg></span>
            </a>
            <a href="#how" className="inline-flex h-12 items-center gap-2 rounded-full px-5 text-sm font-semibold text-ink-2 transition-colors hover:text-ink">
              See how it works
            </a>
          </div>
        </Reveal>
        <Reveal delay={120}>
          <HeroCard />
        </Reveal>
      </div>

      <WatchStrip />
    </section>
  )
}

/**
 * The protocols Pexiz watches, by name only. Their status lives in the app,
 * one click away: the strip answers "is mine covered?", the app answers
 * "is it safe?". One button for all of them, since every name is already a
 * link to its own page.
 */
function WatchStrip() {
  return (
    <div id="protocols" className="scroll-mt-16 border-t border-line bg-paper/70">
      <div className="mx-auto max-w-[1180px] px-5 py-10 md:px-8">
        <Reveal className="text-center">
          <div className="text-lg font-semibold tracking-tight">Is your protocol on the list?</div>
          <p className="mt-1 text-sm text-ink-2">Pexiz watches {VENUES.length} perps and prediction markets on Solana.</p>
        </Reveal>
        <ul className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {VENUES.map((v, i) => (
            <Reveal as="li" key={v.id} delay={40 * i}>
              <Link href={`/app/monitor/${v.id}`} className="flex h-full flex-col items-center gap-2.5 rounded-[var(--radius-card)] border border-line bg-cream px-3 py-4 text-center transition-[transform,border-color] hover:-translate-y-0.5 hover:border-ink">
                <img src={v.logo} alt="" className="size-10 rounded-xl object-contain" />
                <div>
                  <div className="text-sm font-semibold">{v.name}</div>
                  <div className="text-xs text-ink-3">{v.category === "prediction" ? "Prediction market" : "Perps"}</div>
                </div>
              </Link>
            </Reveal>
          ))}
        </ul>
        <Reveal className="mt-7 flex justify-center">
          <LinkButton href="/app/monitor" variant="line" className="h-11 px-5"><Svg>{Icon.monitor}</Svg>Check a protocol</LinkButton>
        </Reveal>
      </div>
    </div>
  )
}

/** A still picture of the product, on the protocol most people hold: Jupiter. */
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
          <img src="/logos/jupiter.svg" alt="" className="size-9 rounded-xl object-contain" />
          <div>
            <div className="font-semibold">Jupiter Perps vault</div>
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
