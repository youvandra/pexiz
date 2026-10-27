// Time to exit, drawn as the thing it actually is: a door closing while you
// walk toward it.
//
// One ruler carries both times, so they can be compared by eye instead of by
// arithmetic. The hatched band is the half hour you need to get your money
// out. The line that runs across is how long an approved change has to wait,
// ending at the door. Where the door lands past the hatching, you are out
// first; where it lands inside it, you are not.
import { useId } from "react"
import { cn } from "@/lib/cn"
import { duration } from "@/lib/format"
import { ASSUMED_EXIT_SECS } from "@/data/facts"
import { useInView } from "@/components/ui/reveal"
import { Dur } from "@/components/ui/meter"
import type { Assessment } from "@/data/assess"

const MAX_SECS = 48 * 3600
// 30 minutes is not here: the marker for where you are out already labels it.
const TICKS = [3600, 6 * 3600, 24 * 3600, 48 * 3600]
/** Log scale: half an hour and two days both have to read on one ruler. */
const pos = (secs: number) => Math.min(1, Math.log1p(Math.max(0, secs) / 60) / Math.log1p(MAX_SECS / 60))

const TONE: Record<Assessment, string> = {
  green: "var(--safe)",
  amber: "var(--warn)",
  exposed: "var(--danger)",
  red: "var(--danger)",
  unrated: "var(--ink-3)",
}

export function ExitTrack({ delaySecs, flag, className }: { delaySecs?: number; flag: Assessment; className?: string }) {
  const [ref, seen] = useInView<HTMLDivElement>()
  const id = useId()
  const tone = TONE[flag]
  const mine = pos(ASSUMED_EXIT_SECS) * 100
  const theirs = delaySecs === undefined ? 0 : Math.max(pos(delaySecs) * 100, 1.5)
  const spare = delaySecs === undefined ? undefined : delaySecs - ASSUMED_EXIT_SECS
  const safe = spare !== undefined && spare > 0

  return (
    <div ref={ref} className={cn("select-none", className)}>
      <div className="relative h-[132px]">
        <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="absolute inset-x-0 top-[48px] h-[38px] w-full" aria-hidden>
          <defs>
            <pattern id={`${id}-hatch`} width="3" height="10" patternUnits="userSpaceOnUse" patternTransform="skewX(-20)">
              <rect width="3" height="10" fill="var(--sand)" />
              <rect width="1" height="10" fill="var(--line-2)" />
            </pattern>
          </defs>
          {/* The half hour you are still inside. */}
          <rect x="0" y="0" width={mine} height="10" fill={`url(#${id}-hatch)`} />
          <rect x="0" y="0" width="100" height="10" fill="none" stroke="var(--line)" strokeWidth="0.15" vectorEffect="non-scaling-stroke" />
        </svg>

        {/* The ruler. */}
        <div className="absolute inset-x-0 top-[86px] h-5">
          {TICKS.map((t) => (
            <span key={t} className="absolute top-0 -translate-x-1/2 text-[10px] font-medium text-ink-3" style={{ left: `${pos(t) * 100}%` }}>
              <span className="absolute -top-2 left-1/2 h-1.5 w-px -translate-x-1/2 bg-line-2" />
              {duration(t)}
            </span>
          ))}
        </div>

        {/* How long the change waits, and the door at the end of it. */}
        <div className="absolute inset-x-0 top-[58px] h-[18px]">
          <div
            className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full transition-[width] duration-[900ms] ease-out"
            style={{ width: seen ? `${theirs}%` : 0, background: tone }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 transition-[left] duration-[900ms] ease-out"
            style={{ left: seen ? `calc(${theirs}% - 11px)` : "-11px" }}
          >
            <Door open={safe} color={tone} />
          </div>
        </div>

        {/* Where you are out, read off the same ruler. */}
        <div className="absolute top-0 h-[48px] -translate-x-1/2 text-center" style={{ left: `${mine}%` }}>
          <div className="whitespace-nowrap text-xs font-semibold">You are out<span className="ml-1 font-normal text-ink-3">{duration(ASSUMED_EXIT_SECS)}</span></div>
          <div className="mx-auto mt-1.5 h-[24px] w-px bg-ink" />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-3">
        <span className="h-2.5 w-7 rounded-[2px] border border-line-2" style={{ background: `repeating-linear-gradient(115deg, var(--line-2) 0 1px, var(--sand) 1px 4px)` }} />
        The half hour it takes you to withdraw
      </div>

      <p className="mt-6 flex flex-wrap items-baseline gap-x-2.5 border-t border-line pt-5 text-sm md:text-base">
        {spare === undefined ? (
          <span className="text-ink-2">The change delay cannot be read, so there is no verdict.</span>
        ) : safe ? (
          <>
            <Dur text={duration(spare)} className="tracking-display text-3xl font-medium md:text-4xl" />
            <span className="font-semibold">to spare.</span>
            <span className="text-ink-2">The door is still open when you are out.</span>
          </>
        ) : (
          <>
            <span className="tracking-display text-3xl font-medium text-danger md:text-4xl">No time</span>
            <span className="font-semibold text-danger">to spare.</span>
            <span className="text-ink-2">The door can shut while you are still inside.</span>
          </>
        )}
      </p>
    </div>
  )
}

/** The door: open when you make it out, shut when you do not. */
function Door({ open, color }: { open: boolean; color: string }) {
  return (
    <svg viewBox="0 0 22 28" className="h-[34px] w-[26px] overflow-visible" aria-hidden>
      <rect x="1" y="1" width="20" height="26" rx="3.5" fill="var(--cream)" stroke="var(--line-2)" strokeWidth="1.2" />
      {/* Open: the leaf swung back, a way through beside it. Shut: filled. */}
      <path
        d={open ? "M4 4h7a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H4Z" : "M4 4h14v20H4Z"}
        fill={color}
        className="transition-all duration-500"
      />
      <circle cx={open ? 12.3 : 16} cy="14.5" r="1" fill="var(--cream)" />
    </svg>
  )
}
