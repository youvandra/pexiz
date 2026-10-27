// The exit window, drawn: how long an approved change must wait (the fill)
// against the time you need to get out (the tick). Fill past the tick means
// you leave first. Log scale, so 30 minutes and 24 hours both read.
import { cn } from "@/lib/cn"
import { ASSUMED_EXIT_SECS } from "@/data/facts"
import type { Assessment } from "@/data/assess"

const MAX_SECS = 48 * 3600
const pos = (secs: number) => Math.min(1, Math.log1p(Math.max(0, secs) / 60) / Math.log1p(MAX_SECS / 60))

const TONE: Record<Assessment, string> = {
  green: "var(--safe)",
  amber: "var(--warn)",
  red: "var(--danger)",
  unrated: "var(--ink-3)",
}

/** `delaySecs` undefined means the delay cannot be read: an empty dashed track. */
export function WindowMeter({ delaySecs, flag, className }: { delaySecs?: number; flag: Assessment; className?: string }) {
  const need = pos(ASSUMED_EXIT_SECS) * 100
  const fill = delaySecs === undefined ? 0 : Math.max(pos(delaySecs) * 100, delaySecs > 0 ? 3 : 0)
  return (
    <span
      className={cn("relative block h-2 w-24 shrink-0 rounded-full", delaySecs === undefined ? "border border-dashed border-line-2" : "bg-sand", className)}
      role="img"
      aria-label={delaySecs === undefined ? "Delay unknown" : `Admin delay against the time needed to exit`}
    >
      {fill > 0 && <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${fill}%`, background: TONE[flag] }} />}
      <span className="absolute -inset-y-1 w-0.5 rounded-full bg-ink" style={{ left: `calc(${need}% - 1px)` }} />
    </span>
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
