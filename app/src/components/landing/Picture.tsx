// The hero's one picture: the April 2026 takeover on a single time axis, and
// where a Pexiz vault left it.
//
// Three lanes share the axis so they read top to bottom as cause and effect:
// the status Pexiz would have shown, the pool the attacker emptied, and a
// vault that swapped to USDC the moment the status turned. The gap between
// the vault's exit and the drain is the whole product, so it is the one thing
// called out.
//
// Days come from `ATTACK`, so this cannot drift from the timeline below it.
// Every label is HTML placed by percentage rather than SVG text, so it stays
// readable on a phone instead of shrinking with the drawing.
import { cn } from "@/lib/cn"
import { ATTACK } from "@/data/facts"
import { DoorGlyph } from "@/components/ui/glyphs"

const START = -2
const END = 10
const at = (day: number) => ((day - START) / (END - START)) * 100

const WARN = ATTACK.find((a) => a.flag === "amber")!.day
const EXIT = ATTACK.find((a) => a.pexiz)!.day
const TAKEOVER = ATTACK.find((a) => a.title === "Admin handed over")!.day
const DRAIN = ATTACK[ATTACK.length - 1].day
const LEAD = Math.floor(TAKEOVER - EXIT)

const STATUS = [
  { from: START, to: WARN, label: "Safe", fg: "var(--safe)", bg: "var(--safe-soft)" },
  { from: WARN, to: EXIT, label: "Watch", fg: "var(--warn)", bg: "var(--warn-soft)" },
  { from: EXIT, to: END, label: "Get out", fg: "var(--danger)", bg: "var(--danger-soft)" },
]

const TICKS = [
  { day: WARN, label: "23 Mar" },
  { day: EXIT, label: "25 Mar" },
  { day: TAKEOVER, label: "1 Apr" },
]

function Lane({ name, children, className }: { name: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">{name}</div>
      {children}
    </div>
  )
}

export function Picture({ className }: { className?: string }) {
  const exit = at(EXIT)
  const drain = at(DRAIN)
  return (
    <figure className={cn("card relative overflow-hidden p-5 sm:p-7", className)}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-sm font-semibold">The April 2026 takeover, replayed</span>
        <span className="text-xs text-ink-3">One pool, one Pexiz vault</span>
      </figcaption>

      {/* The axis column the lanes hang from. The exit and the drain are
          drawn through every lane, so the eye can drop straight down. */}
      <div className="relative mt-7">
        <div className="pointer-events-none absolute inset-y-0 border-l border-dashed border-safe/60" style={{ left: `${exit}%` }} aria-hidden />
        <div className="pointer-events-none absolute inset-y-0 border-l border-dashed border-danger/60" style={{ left: `${drain}%` }} aria-hidden />

        <Lane name="Status">
          <div className="flex h-8 overflow-hidden rounded-lg">
            {STATUS.map((s) => (
              <div
                key={s.label}
                className="flex min-w-0 items-center overflow-hidden px-1.5 text-[11px] font-semibold sm:px-2 sm:text-xs"
                style={{ width: `${at(s.to) - at(s.from)}%`, color: s.fg, background: s.bg }}
              >
                <span className="whitespace-nowrap">{s.label}</span>
              </div>
            ))}
          </div>
        </Lane>

        <Lane name="The pool" className="mt-6">
          <div className="relative h-28 sm:h-32">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden>
              <defs>
                <linearGradient id="pool-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#0d0d0c" stopOpacity=".14" />
                  <stop offset="1" stopColor="#0d0d0c" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={`M0 12 L${drain - 0.6} 12 L${drain + 0.6} 98 L100 98 L100 100 L0 100 Z`} fill="url(#pool-fill)" />
              <path d={`M0 12 L${drain - 0.6} 12 L${drain + 0.6} 98 L100 98`} fill="none" stroke="#0d0d0c" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            </svg>
            <div className="absolute bottom-3 text-right" style={{ right: `${100 - drain + 2}%` }}>
              <div className="text-sm font-semibold text-danger">Drained</div>
              <div className="text-xs text-ink-2">1 Apr, in minutes</div>
            </div>
          </div>
        </Lane>

        <Lane name="Your vault" className="mt-6">
          <div className="relative flex h-11 items-stretch">
            <div className="flex items-center rounded-l-lg border border-line bg-sand px-2.5 text-xs font-semibold text-ink-2" style={{ width: `${exit}%` }}>
              <span className="truncate">LP</span>
            </div>
            <div className="flex flex-1 items-center justify-end rounded-r-lg bg-safe px-3 text-xs font-semibold text-paper">
              <span className="truncate">Safe in USDC</span>
            </div>
            <span className="absolute top-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-line bg-paper shadow-sm" style={{ left: `${exit}%` }}>
              <DoorGlyph className="size-7" />
            </span>
          </div>
        </Lane>

        {/* The lead: from the vault's exit to the takeover. */}
        <div className="relative mt-5 h-12">
          <div className="absolute top-2 h-3 rounded-b-md border-x-2 border-b-2 border-ink" style={{ left: `${exit}%`, width: `${at(TAKEOVER) - exit}%` }} aria-hidden />
          <div className="absolute top-7 -translate-x-1/2 whitespace-nowrap text-sm font-semibold" style={{ left: `${(exit + at(TAKEOVER)) / 2}%` }}>
            Out {LEAD} days before the takeover
          </div>
        </div>
      </div>

      {/* The axis. */}
      <div className="relative mt-2 h-5 border-t border-line text-[11px] font-medium text-ink-3">
        {TICKS.map((t) => (
          <span key={t.label} className="absolute top-1.5 -translate-x-1/2 whitespace-nowrap" style={{ left: `${at(t.day)}%` }}>{t.label}</span>
        ))}
      </div>
    </figure>
  )
}
