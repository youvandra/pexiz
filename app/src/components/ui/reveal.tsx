// Entrance motion for the landing page.
//
// Two rules hold here. Nothing is ever hidden unless the browser has told us
// it can show it again: the hidden state is set in an effect, so a page that
// never runs this code renders in full. And nothing depends on a frame loop,
// so a tab opened in the background still reveals on its own when it comes
// forward. A failsafe shows everything after a second and a half whatever
// happens.
import { useEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "@/lib/cn"

const FAILSAFE_MS = 1500

function useReveal<T extends HTMLElement>(again: boolean) {
  const ref = useRef<T>(null)
  const [shown, setShown] = useState(false)
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    const el = ref.current
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (!el || still || typeof IntersectionObserver !== "function") return setShown(true)
    // Already on screen at first paint: show it, with the transition armed so
    // it fades in rather than appearing.
    setArmed(true)
    let failsafe: ReturnType<typeof setTimeout> | undefined
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setShown(true)
            if (failsafe) clearTimeout(failsafe)
            if (!again) io.disconnect()
            // Once it has been seen, it never hides again on its own: a
            // failsafe that fires later must not blank what is on screen.
            return
          }
          // Out of view and on its way back: let it fade so the next pass in
          // is a fresh entrance. Only when it has left the screen entirely.
          if (again) setShown(false)
        }),
      { rootMargin: "0px 0px -8% 0px", threshold: 0.01 },
    )
    io.observe(el)
    failsafe = setTimeout(() => (setShown(true), again || io.disconnect()), FAILSAFE_MS)
    return () => (failsafe && clearTimeout(failsafe), io.disconnect())
  }, [again])
  return { ref, hidden: armed && !shown, shown: !armed || shown }
}

/**
 * Fades its children up into place as they come into view. `delay` staggers a
 * row of cards; keep it under a third of a second. With `again`, the fade runs
 * both ways: it plays out as the element leaves the screen and in again on the
 * way back, which suits a whole section but would make a row of cards flicker.
 */
export function Reveal({ children, className, delay = 0, again = false, as: As = "div" }: { children: ReactNode; className?: string; delay?: number; again?: boolean; as?: "div" | "li" | "section" }) {
  const { ref, hidden } = useReveal<HTMLDivElement>(again)
  return (
    <As
      ref={ref as never}
      className={cn("motion-safe:transition-[opacity,transform] motion-safe:duration-700 motion-safe:ease-out", hidden && "motion-safe:translate-y-4 motion-safe:opacity-0", className)}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </As>
  )
}

/**
 * True once the element has been seen. For drawings that play themselves in:
 * a bar that grows, a line that is drawn.
 */
export function useInView<T extends HTMLElement>() {
  const { ref, shown } = useReveal<T>(false)
  return [ref, shown] as const
}
