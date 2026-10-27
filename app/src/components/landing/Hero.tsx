import { cn } from "@/lib/cn"
import { Link } from "wouter"
import { VENUES } from "@/data/facts"
import { FlagPill } from "@/components/ui/kit"
import { Icon, Svg } from "@/components/ui/icons"
import { Reveal } from "@/components/ui/reveal"

export function Hero() {
  return (
    <section
      className="hero-screen relative -mt-16 overflow-hidden pt-16"
      style={{ background: "radial-gradient(80% 70% at 85% 0%, #e3f1e4 0%, transparent 60%), radial-gradient(70% 60% at 0% 100%, #f8ecc4 0%, transparent 60%), var(--cream)" }}
    >
      <div className="mx-auto grid w-full max-w-[1180px] gap-14 px-5 py-16 md:px-8 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:py-20">
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

    </section>
  )
}

/**
 * The protocols Pexiz watches, by name only. Their status lives in the app,
 * one click away: the strip answers "is mine covered?", the app answers
 * "is it safe?". One button for all of them, since every name is already a
 * link to its own page.
 */
export function Protocols() {
  return (
    <section id="protocols" className="scroll-mt-16 border-y border-line bg-paper/70">
      <div className="band mx-auto max-w-[1180px] px-5 py-20 md:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <div className="text-sm font-semibold text-ink-3">Protocols we watch</div>
          <h2 className="tracking-display mt-3 text-[clamp(2.2rem,4.4vw,3.6rem)] font-medium leading-[1.04]">Is your protocol on the list?</h2>
          <p className="mt-5 text-lg leading-relaxed text-ink-2 md:text-xl">
            Pexiz reads the admin keys of {VENUES.length} perps and prediction markets on Solana, straight from chain. Pick one to see who can change it and how fast.
          </p>
        </Reveal>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 md:mt-14 lg:grid-cols-4">
          {VENUES.map((v, i) => (
            <Reveal as="li" key={v.id} delay={40 * i}>
              <Link
                href={`/app/monitor/${v.id}`}
                className="group flex h-full items-center gap-4 rounded-[var(--radius-card)] border border-line bg-cream px-5 py-5 transition-[transform,border-color] hover:-translate-y-0.5 hover:border-ink"
              >
                <img src={v.logo} alt="" className="size-12 shrink-0 rounded-xl object-contain" />
                <div className="min-w-0">
                  <div className="truncate text-lg font-semibold">{v.name}</div>
                  <div className="text-sm text-ink-3">{v.category === "prediction" ? "Prediction market" : "Perps"}</div>
                </div>
                <Svg className="ml-auto size-4 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5">{Icon.arrow}</Svg>
              </Link>
            </Reveal>
          ))}
          <Reveal as="li" delay={40 * VENUES.length}>
            <Link
              href="/app/monitor"
              className="group flex h-full items-center gap-4 rounded-[var(--radius-card)] border border-dashed border-line-2 px-5 py-5 transition-colors hover:border-ink"
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-xl border border-line bg-cream"><Svg className="size-5">{Icon.monitor}</Svg></span>
              <div className="min-w-0">
                <div className="text-lg font-semibold">See all of them</div>
                <div className="text-sm text-ink-3">With live status</div>
              </div>
              <Svg className="ml-auto size-4 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5">{Icon.arrow}</Svg>
            </Link>
          </Reveal>
        </ul>
      </div>
    </section>
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
    <div className="card mx-auto w-full max-w-[500px] p-0">
      <div className="flex items-center justify-between border-b border-line px-6 py-5">
        <div className="flex items-center gap-3">
          <img src="/logos/jupiter.svg" alt="" className="size-11 rounded-xl object-contain" />
          <div>
            <div className="text-lg font-semibold">Jupiter Perps vault</div>
            <div className="text-sm text-ink-3">Example of a warning</div>
          </div>
        </div>
        <FlagPill flag="amber" />
      </div>
      <div className="p-6 md:p-7">
        <div className="text-xs uppercase tracking-[0.08em] text-ink-3">Your position</div>
        <div className="tabular tracking-display mt-2 text-5xl font-medium">$12,480.00</div>
        <ul className="mt-7 space-y-3.5">
          {checks.map(([t, ok]) => (
            <li key={t} className="flex items-center gap-3">
              <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold", ok ? "bg-safe-soft text-safe" : "bg-warn-soft text-warn")}>{ok ? "✓" : "!"}</span>
              <span className={ok ? "text-ink-2" : "font-medium"}>{t}</span>
            </li>
          ))}
        </ul>
        <div className="mt-7 rounded-xl bg-sand/70 px-5 py-4 text-ink-2">
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
