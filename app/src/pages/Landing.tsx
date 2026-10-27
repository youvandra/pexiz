import { useLayoutEffect } from "react"
import { Nav } from "@/components/landing/Nav"
import { Hero, Protocols } from "@/components/landing/Hero"
import { Faq, Footer, How, Problem, TryIt, Venues } from "@/components/landing/Sections"

export function Landing() {
  // Scale the whole page with the window past a laptop (see `html.fluid`).
  // Before paint, so a wide screen never shows the small version first.
  useLayoutEffect(() => {
    document.documentElement.classList.add("fluid")
    return () => document.documentElement.classList.remove("fluid")
  }, [])
  return (
    <div className="min-h-screen">
      <Nav />
      <main>
        <Hero />
        <Protocols />
        <Problem />
        <How />
        <Venues />
        <TryIt />
        <Faq />
      </main>
      <Footer />
    </div>
  )
}
