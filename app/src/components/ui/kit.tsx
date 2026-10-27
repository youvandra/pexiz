import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react"
import { Link } from "wouter"
import { cn } from "@/lib/cn"
import { Mark } from "@/components/ui/mark"
import type { Assessment } from "@/data/chain"

type Variant = "ink" | "line" | "ghost"

export function Button({ variant = "ink", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button {...p} className={cn("btn", `btn-${variant}`, className)} />
}

export function LinkButton({ href, variant = "ink", className, children, external }: { href: string; variant?: Variant; className?: string; children: ReactNode; external?: boolean }) {
  const cls = cn("btn", `btn-${variant}`, className)
  if (external || href.startsWith("http")) {
    return <a href={href} target="_blank" rel="noreferrer" className={cls}>{children}</a>
  }
  return <Link href={href} className={cls}>{children}</Link>
}

export function A(p: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a target="_blank" rel="noreferrer" {...p} className={cn("underline decoration-line-2 underline-offset-4 hover:decoration-ink", p.className)} />
}

const FLAG: Record<Assessment, { label: string; level: number; fg: string; bg: string; edge: string }> = {
  green: { label: "Safe", level: 1, fg: "var(--safe)", bg: "var(--safe-soft)", edge: "color-mix(in srgb, var(--safe) 28%, transparent)" },
  amber: { label: "Watch", level: 2, fg: "var(--warn)", bg: "var(--warn-soft)", edge: "color-mix(in srgb, var(--warn) 30%, transparent)" },
  exposed: { label: "No delay", level: 3, fg: "var(--danger)", bg: "var(--paper)", edge: "color-mix(in srgb, var(--danger) 40%, transparent)" },
  red: { label: "Get out", level: 3, fg: "var(--danger)", bg: "var(--danger-soft)", edge: "color-mix(in srgb, var(--danger) 30%, transparent)" },
  unrated: { label: "Unrated", level: 0, fg: "var(--ink-3)", bg: "var(--paper)", edge: "var(--line-2)" },
}

/** Three rising bars: how close the exit is. Filled up to the flag's level. */
function RiskLadder({ level }: { level: number }) {
  return (
    <svg viewBox="0 0 12 12" className="size-3 shrink-0" aria-hidden>
      {[4, 7, 10].map((h, i) => (
        <rect key={i} x={i * 4.2} y={12 - h} width="3" height={h} rx="1" fill="currentColor" opacity={i < level ? 1 : 0.22} />
      ))}
    </svg>
  )
}

/** The risk ladder alone on the flag's tint: a timeline marker. */
export function FlagMark({ flag, className }: { flag: Assessment; className?: string }) {
  const f = FLAG[flag]
  return (
    <span className={cn("grid size-6 shrink-0 place-items-center rounded-md border", className)} style={{ color: f.fg, background: f.bg, borderColor: f.edge }}>
      <RiskLadder level={f.level} />
    </span>
  )
}

/** The Pexiz status mark: a risk ladder and a word, on the flag's tint. */
export function FlagPill({ flag, label, size = "sm", className }: { flag: Assessment; label?: string; live?: boolean; size?: "sm" | "md"; className?: string }) {
  const f = FLAG[flag]
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border font-semibold leading-none",
        size === "md" ? "h-8 px-2.5 text-sm" : "h-6 px-2 text-xs",
        className,
      )}
      style={{ color: f.fg, background: f.bg, borderColor: f.edge }}
    >
      <RiskLadder level={f.level} />
      {label ?? f.label}
    </span>
  )
}

/** A page header surface tinted by the flag, light enough to sit under text. */
export const flagSurface = (f: Assessment) => ({
  background: `linear-gradient(180deg, color-mix(in srgb, ${FLAG[f].bg} 80%, var(--paper)), var(--paper))`,
  borderColor: FLAG[f].edge,
})

export const flagLabel = (f: Assessment) => FLAG[f].label

export const flagColor = (f: Assessment) =>
  f === "green" ? "var(--safe)" : f === "amber" ? "var(--warn)" : f === "red" || f === "exposed" ? "var(--danger)" : "var(--ink-3)"

export function Eyebrow({ n, children, className }: { n?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline gap-3 text-[1.35rem] font-medium tracking-tight md:text-2xl", className)}>
      {n && <span className="tabular text-ink-3">{n}</span>}
      <span>{children}</span>
    </div>
  )
}

/** Two-tone display heading: ink first line, muted second line. */
export function Skeleton({ className }: { className?: string }) {
  return <span className={cn("block animate-pulse rounded-md bg-sand", className)} />
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-[1.15rem] font-semibold tracking-tight", className)}>
      <Mark className="size-[1.1rem]" />
      pexiz
    </span>
  )
}

export function Stat({ value, label, className }: { value: ReactNode; label: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="tabular tracking-display text-4xl font-medium md:text-5xl">{value}</div>
      <div className="mt-1.5 text-sm text-ink-2">{label}</div>
    </div>
  )
}

/** A venue's own logo on a neutral tile, or its initial when there is none. */
export function VenueLogo({ src, name, className }: { src?: string; name: string; className?: string }) {
  return (
    <span className={cn("grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-paper", className)}>
      {src ? <img src={src} alt={`${name} logo`} className="size-full object-contain" /> : <span className="text-sm font-semibold text-ink-2">{name[0]}</span>}
    </span>
  )
}
