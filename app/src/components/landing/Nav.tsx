import { useEffect, useState } from "react"
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

/** Pages of their own, kept apart from the anchors by a rule. */
const PAGES = [
  { href: "/docs", label: "Docs" },
  { href: "/replay", label: "April 2026" },
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
      <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between gap-6 px-5 md:px-8">
        <Link href="/" aria-label="Pexiz home"><Logo /></Link>
        <nav className="hidden items-center gap-7 text-[0.95rem] text-ink-2 md:flex">
          {ANCHORS.map((l) => <a key={l.href} href={l.href} className="transition-colors hover:text-ink">{l.label}</a>)}
          <span className="h-4 w-px bg-line-2" aria-hidden />
          {PAGES.map((l) => <Link key={l.href} href={l.href} className="transition-colors hover:text-ink">{l.label}</Link>)}
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
          {PAGES.map((l) => <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block py-3 text-lg font-medium">{l.label}</Link>)}
        </nav>
      )}
    </header>
  )
}
