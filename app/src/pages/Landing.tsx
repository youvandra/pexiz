import { Nav } from "@/components/landing/Nav"
import { Hero, Protocols } from "@/components/landing/Hero"
import { Faq, Footer, How, Problem, TryIt, Venues } from "@/components/landing/Sections"

export function Landing() {
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
