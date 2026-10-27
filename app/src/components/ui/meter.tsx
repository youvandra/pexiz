// Time to exit, drawn as a race on one scale: the time you need to withdraw
// (ink) against how long an approved change must wait (the status colour).
// When the change bar is longer, you are out first. Log scale, so 30 minutes
// and 24 hours both read.
import { cn } from "@/lib/cn"
import { duration } from "@/lib/format"
import { ASSUMED_EXIT_SECS } from "@/data/facts"
import type { Assessment } from "@/data/assess"

const MAX_SECS = 48 * 3600
const pos = (secs: number) => Math.min(1, Math.log1p(Math.max(0, secs) / 60) / Math.log1p(MAX_SECS / 60))

const TONE: Record<Assessment, string> = {
  green: "var(--safe)",
  amber: "var(--warn)",
  exposed: "var(--danger)",
  red: "var(--danger)",
  unrated: "var(--ink-3)",
}

function Bar({ secs, color, thick }: { secs?: number; color: string; thick: boolean }) {
  const w = secs === undefined ? 0 : secs <= 0 ? 0 : Math.max(pos(secs) * 100, 4)
  return (
    <span className={cn("relative block w-full rounded-full", thick ? "h-2.5" : "h-1.5", secs === undefined ? "border border-dashed border-line-2" : "bg-sand")}>
      {w > 0 ? (
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${w}%`, background: color }} />
      ) : secs === 0 ? (
        <span className="absolute inset-y-0 left-0 aspect-square rounded-full" style={{ background: color }} />
      ) : null}
    </span>
  )
}

/** Two stacked bars for tables and cards: you (top) against the change (bottom). */
export function ExitRace({ delaySecs, flag, className }: { delaySecs?: number; flag: Assessment; className?: string }) {
  // No delay to compare against: leave the space empty rather than draw half a race.
  if (delaySecs === undefined) return <span className={cn("w-24 shrink-0", className)} aria-hidden />
  return (
    <span
      className={cn("flex w-24 shrink-0 flex-col gap-1", className)}
      role="img"
      aria-label={delaySecs === undefined ? "Change delay unknown" : `You need ${duration(ASSUMED_EXIT_SECS)}; changes wait ${delaySecs ? duration(delaySecs) : "nothing"}`}
    >
      <Bar secs={ASSUMED_EXIT_SECS} color="var(--ink)" thick={false} />
      <Bar secs={delaySecs} color={TONE[flag]} thick={false} />
    </span>
  )
}

/** The same race with its labels, for a protocol's page. */
export function ExitRaceDetail({ delaySecs, flag }: { delaySecs?: number; flag: Assessment }) {
  const spare = delaySecs === undefined ? undefined : delaySecs - ASSUMED_EXIT_SECS
  const rows: [string, number | undefined, string, string][] = [
    ["You need to withdraw", ASSUMED_EXIT_SECS, "var(--ink)", duration(ASSUMED_EXIT_SECS)],
    ["An approved change waits", delaySecs, TONE[flag], delaySecs === undefined ? "Unknown" : delaySecs ? duration(delaySecs) : "Not at all"],
  ]
  return (
    <div className="mt-5">
      <div className="grid gap-3 sm:grid-cols-[11rem_1fr_5rem] sm:items-center sm:gap-x-4">
        {rows.map(([label, secs, color, text]) => (
          <div key={label} className="contents">
            <span className="text-sm text-ink-2">{label}</span>
            <Bar secs={secs} color={color} thick />
            <Dur text={text} className="text-sm font-semibold sm:text-right" />
          </div>
        ))}
      </div>
      <p className="mt-4 border-t border-line pt-3 text-sm">
        {spare === undefined ? (
          <span className="text-ink-2">The change delay cannot be read, so there is no verdict.</span>
        ) : spare > 0 ? (
          <><span className="font-semibold"><Dur text={duration(spare)} /> to spare.</span> <span className="text-ink-2">You would be out before an approved change lands.</span></>
        ) : (
          <><span className="font-semibold text-danger">No time to spare.</span> <span className="text-ink-2">An approved change can land before you are out.</span></>
        )}
      </p>
    </div>
  )
}

/** "23h 50m" with the units set small, so the numbers carry the weight. */
export function Dur({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(\d+(?:\.\d+)?)([a-z]+)/).filter(Boolean)
  if (!/\d/.test(text)) return <span className={className}>{text}</span>
  const out = []
  for (let i = 0; i < parts.length; i++) {
    if (/^\d/.test(parts[i]) && /^[a-z]+$/.test(parts[i + 1] ?? "")) {
      out.push(<span key={i}>{parts[i]}<span className="ml-[0.04em] text-[0.74em] font-medium text-ink-3">{parts[i + 1]}</span></span>)
      i++
    } else {
      out.push(<span key={i}>{parts[i]}</span>)
    }
  }
  return <span className={cn("tabular", className)}>{out}</span>
}
