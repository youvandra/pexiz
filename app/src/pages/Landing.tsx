import { Shell } from "@/components/landing/Shell"
import { Hero, Protocols } from "@/components/landing/Hero"
import { Faq, How, Problem, TryIt, Venues } from "@/components/landing/Sections"

export function Landing() {
  return (
    <Shell>
      <Hero />
      <Protocols />
      <Problem />
      <How />
      <Venues />
      <TryIt />
      <Faq />
    </Shell>
  )
}
