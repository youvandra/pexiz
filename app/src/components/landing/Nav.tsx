import { useEffect, useRef, useState } from "react"
import { Link } from "wouter"
import { cn } from "@/lib/cn"
import { LinkButton, Logo } from "@/components/ui/kit"
import { Icon, Svg } from "@/components/ui/icons"

/** Places on this page. */
const ANCHORS = [
  { href: "/#how", label: "How it works" },
  { href: "/#protocols", label: "Protocols" },
  { href: "/#faq", label: "FAQ" },
]

/**
 * Pages of their own. Each says what it is, because "Docs" and "April 2026"
 * tell a first-time reader nothing about what they will find there.
 */
const PAGES = [
  { href: "/docs", label: "Docs", note: "The rules the oracle follows, and what the vault does with them." },
  { href: "/replay", label: "April 2026", note: "The hack that led to this, replayed hour by hour." },
]

export function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8)
    on()
    window.addEventListener("scroll", on, { passive: true })
    return () => window.removeEventListener("scroll", on)
  }, [])
  return (
    <header className={cn("sticky top-0 z-40 border-b transition-colors", scrolled || open ? "border-line bg-cream/90 backdrop-blur-md" : "border-transparent")}>
      <div className="page flex h-16 items-center justify-between gap-6 px-5 md:px-8">
        <Link href="/" aria-label="Pexiz home"><Logo /></Link>
        <nav className="hidden items-center gap-7 text-[0.95rem] text-ink-2 md:flex">
          {ANCHORS.map((l) => <a key={l.href} href={l.href} className="transition-colors hover:text-ink">{l.label}</a>)}
          <span className="h-4 w-px bg-line-2" aria-hidden />
          <Learn />
        </nav>
        <div className="flex items-center gap-2">
          <LinkButton href="/app" className="h-10 px-4 text-sm">Open app<Svg>{Icon.arrowUpRight}</Svg></LinkButton>
          <button onClick={() => setOpen((o) => !o)} aria-label="Menu" aria-expanded={open} className="grid size-10 place-items-center rounded-xl border border-line-2 bg-paper md:hidden">
            <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">{open ? <path d="m4 4 8 8M12 4l-8 8" /> : <path d="M2.5 5h11M2.5 11h11" />}</svg>
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-line px-5 py-3 md:hidden">
          {ANCHORS.map((l) => <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block py-3 text-lg font-medium">{l.label}</a>)}
          <div className="my-1 h-px bg-line" />
          {PAGES.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block py-3">
              <div className="text-lg font-medium">{l.label}</div>
              <div className="mt-0.5 text-sm text-ink-3">{l.note}</div>
            </Link>
          ))}
        </nav>
      )}
    </header>
  )
}

/** The two reading pages, with a line each saying what they hold. */
function Learn() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", away)
    document.addEventListener("keydown", esc)
    return () => (document.removeEventListener("mousedown", away), document.removeEventListener("keydown", esc))
  }, [open])
  return (
    <div ref={ref} className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex items-center gap-1.5 transition-colors hover:text-ink">
        Learn
        <Svg className={cn("size-3 transition-transform", open && "rotate-180")}>{Icon.chevron}</Svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full w-[21rem] pt-3">
          <div className="card overflow-hidden p-0">
            {PAGES.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block px-4 py-3.5 transition-colors hover:bg-sand/60">
                <div className="flex items-center gap-1.5 font-semibold text-ink">{l.label}<Svg className="size-3.5 text-ink-3">{Icon.arrow}</Svg></div>
                <div className="mt-0.5 text-sm leading-snug text-ink-2">{l.note}</div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
