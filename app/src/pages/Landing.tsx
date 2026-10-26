import { Nav } from "@/components/landing/Nav"
import { Hero } from "@/components/landing/Hero"
import { BoardPreview, Capacity, Faq, Footer, How, LiveDevnet, Stats, Warning } from "@/components/landing/Sections"

export function Landing() {
  return (
    <div className="min-h-screen">
      <Nav />
      <main>
        <Hero />
        <Stats />
        <Warning />
        <BoardPreview />
        <How />
        <Capacity />
        <LiveDevnet />
        <Faq />
      </main>
      <Footer />
    </div>
  )
}
