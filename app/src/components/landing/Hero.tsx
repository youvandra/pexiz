import { cn } from "@/lib/cn"
import { Link } from "wouter"
import { VENUES } from "@/data/facts"
import { Icon, Svg } from "@/components/ui/icons"
import { Console } from "@/components/landing/Console"
import { Reveal } from "@/components/ui/reveal"

export function Hero() {
  return (
    <section
      className="relative -mt-16 overflow-hidden pt-16"
      style={{ background: "radial-gradient(80% 70% at 85% 0%, #e3f1e4 0%, transparent 60%), radial-gradient(70% 60% at 0% 100%, #f8ecc4 0%, transparent 60%), var(--cream)" }}
    >
      {/* One column of words over the product until there is room for both
          side by side. The console reads its own width, so it is the same
          board at every size: a list on a phone, a table in a column, the
          whole app on a wide screen. */}
      <div className="page grid items-center gap-12 px-5 pb-16 pt-12 md:gap-16 md:px-8 md:pb-24 md:pt-20 xl:min-h-[calc(100svh-4rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] xl:gap-14 xl:py-12">
        <Reveal>
          <div className="max-w-[40rem]">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-paper px-3 py-1.5 text-xs font-medium text-ink-2">
              <img src="/logos/solana.svg" alt="" className="size-3.5" />
              Built on Solana
            </div>
            <h1 className="tracking-display text-balance text-[2.5rem] font-medium leading-[1.04] sm:text-[3.25rem] md:text-[4rem] xl:text-[3.6rem]">
              Your LP position, protected from admin takeovers.
            </h1>
            <p className="mt-6 max-w-[34rem] text-[1.0625rem] leading-relaxed text-ink-2 md:text-lg">
              Pexiz watches who holds the admin keys of the protocols you provide liquidity to. If those keys get weaker, your vault moves to USDC on its own, before anyone can drain the pool.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a href="#protocols" className="btn btn-ink h-12 justify-center rounded-full pl-5 pr-2.5">
                Find your protocol
                <span className="grid size-7 place-items-center rounded-full bg-paper/15 motion-safe:animate-[nudge_2.4s_ease-in-out_infinite]"><Svg className="size-3.5">{Icon.arrowDown}</Svg></span>
              </a>
              <a href="#how" className="btn btn-line h-12 justify-center rounded-full px-5">
                See how it works
              </a>
            </div>
          </div>
        </Reveal>
        <Reveal delay={120} className="min-w-0">
          <Console className="shadow-[0_24px_60px_-28px_rgba(13,13,12,0.28)]" />
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
      <div className="band page px-5 py-20 md:px-8">
        <Reveal again className="max-w-3xl">
          <div className="text-sm font-semibold text-ink-3">Protocols we watch</div>
          <h2 className="tracking-display text-balance mt-3 text-[clamp(2.2rem,4.4vw,3.6rem)] font-medium leading-[1.04]">Is your protocol on the list?</h2>
          <p className="mt-5 text-lg leading-relaxed text-ink-2 md:text-xl">
            Pexiz reads the admin keys of {VENUES.length} perps and prediction markets on Solana, straight from chain. Pick one to see who can change it and how fast.
          </p>
        </Reveal>
        <ul className="mt-10 grid gap-3 sm:grid-cols-2 md:mt-14 md:gap-4 lg:grid-cols-4">
          {VENUES.map((v, i) => (
            <Reveal as="li" key={v.id} delay={40 * i}>
              <Link
                href={`/app/monitor/${v.id}`}
                className="group flex h-full items-center gap-4 rounded-[var(--radius-card)] border border-line bg-cream px-4 py-4 transition md:px-5 md:py-5-[transform,border-color] hover:-translate-y-0.5 hover:border-ink"
              >
                <img src={v.logo} alt="" className="size-10 shrink-0 rounded-xl object-contain md:size-12" />
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
              className="group flex h-full items-center gap-4 rounded-[var(--radius-card)] border border-dashed border-line-2 px-4 py-4 transition-colors md:px-5 md:py-5 hover:border-ink"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-cream md:size-12"><Svg className="size-5">{Icon.monitor}</Svg></span>
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

export function Arrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cn("size-4", className)} aria-hidden>
      <path d="M3 8h9.5M8.5 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
