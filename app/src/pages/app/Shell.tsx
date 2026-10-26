import type { ReactNode } from "react"
import { Link, useLocation } from "wouter"
import { cn } from "@/lib/cn"
import { Logo } from "@/components/ui/kit"

const NAV = [
  { href: "/", label: "Board", icon: <path d="M3 4h10M3 8h10M3 12h6" /> },
  { href: "/replay", label: "April replay", icon: <><circle cx="8" cy="8" r="5.5" /><path d="M6.8 5.8 10.2 8l-3.4 2.2Z" fill="currentColor" stroke="none" /></> },
  { href: "/vault", label: "Escape vault", icon: <><rect x="3" y="3" width="10" height="10" rx="2.5" /><path d="M8 6v4M6 8h4" /></> },
]

export function AppShell({ children }: { children: ReactNode }) {
  const [loc] = useLocation()
  const active = (h: string) => (h === "/" ? loc === "/" || loc.startsWith("/venue") : loc.startsWith(h))
  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-paper/90 px-4 py-3 backdrop-blur md:h-screen md:flex-col md:items-stretch md:justify-start md:border-b-0 md:border-r md:px-4 md:py-5">
        <Link href="~/" className="px-2"><Logo /></Link>
        <nav className="flex gap-1 md:mt-8 md:flex-col">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active(n.href) ? "bg-ink text-cream" : "text-ink-2 hover:bg-sand hover:text-ink",
              )}
            >
              <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{n.icon}</svg>
              <span className="hidden sm:inline">{n.label}</span>
            </Link>
          ))}
        </nav>
        <div className="mt-auto hidden space-y-2 px-2 text-xs text-ink-3 md:block">
          <div className="flex items-center gap-2"><span className="live-dot text-safe" />Mainnet read · public RPC</div>
          <div className="flex items-center gap-2"><span className="live-dot text-warn" />Oracle · devnet</div>
          <Link href="~/docs" className="block pt-3 text-ink-2 hover:text-ink">Docs</Link>
        </div>
      </aside>
      <main className="min-w-0 px-5 pb-20 pt-8 md:px-10 md:pt-10">{children}</main>
    </div>
  )
}

export function PageHead({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <h1 className="tracking-display text-4xl font-medium md:text-5xl">{title}</h1>
      {right}
    </div>
  )
}
