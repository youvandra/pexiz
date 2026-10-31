// The hero's one picture: two lines that start as one. The black line is the
// pool through the April 2026 takeover; the green one is a Pexiz vault, which
// branches off when the status turns and stays level while the pool falls.
// Nothing else is drawn, so the fork and the cliff are the whole story.
//
// Days come from `ATTACK`, so this cannot drift from the timeline below it.
// Labels are HTML placed by percentage rather than SVG text, so they stay
// readable on a phone instead of shrinking with the drawing.
import { cn } from "@/lib/cn"
import { ATTACK } from "@/data/facts"

const START = -2
const END = 12
const at = (day: number) => ((day - START) / (END - START)) * 100

const EXIT = ATTACK.find((a) => a.pexiz)!.day
const TAKEOVER = ATTACK.find((a) => a.title === "Admin handed over")!.day
const DRAIN = ATTACK[ATTACK.length - 1].day
const LEAD = Math.floor(TAKEOVER - EXIT)

// Heights, in the drawing's 0-100 box.
const LEVEL = 46
const SAFE = 20
const FLOOR = 90

export function Picture({ className }: { className?: string }) {
  const x = at(EXIT)
  const d = at(DRAIN)
  const pool = `M0 ${LEVEL} L${d - 0.4} ${LEVEL} L${d + 0.4} ${FLOOR} L100 ${FLOOR}`
  const vault = `M${x} ${LEVEL} C${x + 5} ${LEVEL} ${x + 3} ${SAFE} ${x + 9} ${SAFE} L100 ${SAFE}`
  return (
    <figure className={cn("card p-5 sm:p-8", className)}>
      <figcaption className="flex items-center justify-between gap-4">
        <span className="text-sm text-ink-2">April 2026 takeover, replayed</span>
        <span className="shrink-0 rounded-full bg-safe-soft px-3 py-1 text-xs font-semibold text-safe">Out {LEAD} days early</span>
      </figcaption>

      <div className="relative mt-8 h-56 sm:h-64">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
          <defs>
            <linearGradient id="picture-pool" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#0d0d0c" stopOpacity=".08" />
              <stop offset="1" stopColor="#0d0d0c" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${pool} L100 100 L0 100 Z`} fill="url(#picture-pool)" />
          <path d={pool} fill="none" stroke="#0d0d0c" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <path d={vault} fill="none" stroke="var(--safe)" strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>

        {/* Where the vault leaves. */}
        <Dot x={x} y={LEVEL} className="bg-safe" />
        <div className="absolute -translate-x-1/2 whitespace-nowrap text-center" style={{ left: `${x}%`, top: `${LEVEL + 6}%` }}>
          <div className="text-sm font-semibold">Moved to USDC</div>
          <div className="text-xs text-ink-3">27 Mar, by Pexiz</div>
        </div>

        {/* Where the pool is emptied. */}
        <Dot x={d} y={FLOOR} className="bg-danger" />
        <div className="absolute text-right" style={{ right: `${100 - d + 3}%`, top: `${FLOOR - 16}%` }}>
          <div className="text-sm font-semibold text-danger">Pool drained</div>
          <div className="text-xs text-ink-3">1 Apr, in minutes</div>
        </div>
      </div>

      <div className="mt-6 flex gap-5 border-t border-line pt-4 text-sm text-ink-2">
        <span className="inline-flex items-center gap-2"><span className="h-[3px] w-5 rounded-full bg-safe" />Your vault</span>
        <span className="inline-flex items-center gap-2"><span className="h-0.5 w-5 rounded-full bg-ink" />The pool</span>
      </div>
    </figure>
  )
}

function Dot({ x, y, className }: { x: number; y: number; className?: string }) {
  return (
    <span
      className={cn("absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-4 ring-paper", className)}
      style={{ left: `${x}%`, top: `${y}%` }}
      aria-hidden
    />
  )
}
