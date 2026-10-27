// The frame every marketing page shares: the nav, the footer, and the root
// scaling that keeps one composition from a laptop to a 4K display (see
// `html.fluid`). The app has its own frame and keeps the browser's size.
import { useLayoutEffect, type ReactNode } from "react"
import { cn } from "@/lib/cn"
import { Nav } from "@/components/landing/Nav"
import { Footer } from "@/components/landing/Sections"

export function Shell({ children }: { children: ReactNode }) {
  // Before paint, so a wide screen never shows the small version first.
  useLayoutEffect(() => {
    document.documentElement.classList.add("fluid")
    return () => document.documentElement.classList.remove("fluid")
  }, [])
  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  )
}

/** The top of a reading page, set like the landing's sections. */
export function PageHead({ kicker, title, body, className, children }: { kicker: string; title: string; body?: string; className?: string; children?: ReactNode }) {
  return (
    <header className={cn("max-w-3xl", className)}>
      <div className="text-sm font-semibold text-ink-3">{kicker}</div>
      <h1 className="tracking-display mt-3 text-balance text-[2.5rem] font-medium leading-[1.04] sm:text-[3.25rem] md:text-[4rem]">{title}</h1>
      {body && <p className="mt-5 text-lg leading-relaxed text-ink-2 md:text-xl">{body}</p>}
      {children}
    </header>
  )
}
