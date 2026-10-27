import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react"
import { Link } from "wouter"
import { cn } from "@/lib/cn"
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

const FLAG: Record<Assessment, { label: string; cls: string; dot: string }> = {
  green: { label: "Safe to stay", cls: "bg-safe-soft text-safe", dot: "text-safe" },
  amber: { label: "Watch", cls: "bg-warn-soft text-warn", dot: "text-warn" },
  red: { label: "Get out", cls: "bg-danger-soft text-danger", dot: "text-danger" },
  unrated: { label: "Unrated", cls: "bg-sand text-ink-2", dot: "text-ink-3" },
}

export function FlagPill({ flag, label, live = false, className }: { flag: Assessment; label?: string; live?: boolean; className?: string }) {
  const f = FLAG[flag]
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", f.cls, className)}>
      <span className={cn(live ? "live-dot" : "size-1.5 rounded-full bg-current", f.dot)} />
      {label ?? f.label}
    </span>
  )
}

export const flagLabel = (f: Assessment) => FLAG[f].label

export const flagColor = (f: Assessment) =>
  f === "green" ? "var(--safe)" : f === "amber" ? "var(--warn)" : f === "red" ? "var(--danger)" : "var(--ink-3)"

export function Eyebrow({ n, children, className }: { n?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline gap-3 text-[1.35rem] font-medium tracking-tight md:text-2xl", className)}>
      {n && <span className="tabular text-ink-3">{n}</span>}
      <span>{children}</span>
    </div>
  )
}

/** Two-tone display heading: ink first line, muted second line. */
export function Display({ top, bottom, className, as: Tag = "h2" }: { top: ReactNode; bottom?: ReactNode; className?: string; as?: "h1" | "h2" }) {
  return (
    <Tag className={cn("tracking-display font-medium leading-[0.92]", className)}>
      <span className="block">{top}</span>
      {bottom && <span className="block text-ink-3">{bottom}</span>}
    </Tag>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <span className={cn("block animate-pulse rounded-md bg-sand", className)} />
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-[1.15rem] font-semibold tracking-tight", className)}>
      <svg viewBox="0 0 20 20" className="size-5" aria-hidden>
        <rect x="1.5" y="1.5" width="17" height="17" rx="5" fill="var(--ink)" />
        <path d="M8 6.2h4.6v7.4" stroke="var(--cream)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M12.6 6.2 6.6 12.6" stroke="var(--lemon)" strokeWidth="2" strokeLinecap="round" />
      </svg>
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
