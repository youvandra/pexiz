import { useEffect, useState } from "react"
import { Link } from "wouter"
import { cn } from "@/lib/cn"
import { LinkButton, Logo } from "@/components/ui/kit"

export function Nav() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24)
    on()
    window.addEventListener("scroll", on, { passive: true })
    return () => window.removeEventListener("scroll", on)
  }, [])
  return (
    <header className={cn("sticky top-0 z-40 transition-colors duration-300", scrolled && "border-b border-line bg-cream/85 backdrop-blur-md")}>
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-5 md:px-8">
        <Link href="/" aria-label="Pexiz home"><Logo /></Link>
        <nav className="hidden items-center gap-8 text-[0.93rem] text-ink-2 md:flex">
          <a href="/#warning" className="hover:text-ink">The warning</a>
          <a href="/#board" className="hover:text-ink">Venues</a>
          <a href="/#how" className="hover:text-ink">How it works</a>
          <Link href="/docs" className="hover:text-ink">Docs</Link>
        </nav>
        <LinkButton href="/app" variant="line" className="h-10 px-4 text-sm">Launch app</LinkButton>
      </div>
    </header>
  )
}
