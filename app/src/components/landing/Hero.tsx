import { useEffect, useState } from "react"
import { cn } from "@/lib/cn"
import { Display, FlagPill, LinkButton } from "@/components/ui/kit"
import { DoorGlyph } from "@/components/ui/glyphs"
import type { Assessment } from "@/data/chain"

interface Beat {
  date: string
  event: string
  flag: Assessment
  window: string
  windowNote: string
  vault: string
  wash: "sage" | "lemon" | "peach"
}

// The March–April 2026 takeover, replayed through Pexiz.
const BEATS: Beat[] = [
  { date: "20 Mar", event: "2 of 5 signers · delay in place", flag: "green", window: "Open", windowNote: "a delay stands before any change", vault: "Holding the LP token", wash: "sage" },
  { date: "23 Mar", event: "Signer holds a pre-signing account", flag: "amber", window: "48h", windowNote: "to resolve, deposits paused", vault: "Watching the signer", wash: "lemon" },
  { date: "25 Mar", event: "Warning unresolved for 48h", flag: "red", window: "Exit", windowNote: "update + exit in one transaction", vault: "Out to USDC", wash: "peach" },
  { date: "27 Mar", event: "Timelock cut to 0", flag: "red", window: "0s", windowNote: "any change lands at once", vault: "Already out", wash: "peach" },
  { date: "1 Apr", event: "Admin handed over · pool drained", flag: "red", window: "−99.9%", windowNote: "SOL custody in 4.5 min", vault: "Safe in USDC", wash: "peach" },
]
const STEP_MS = 2600

const WASH = {
  sage: "radial-gradient(120% 90% at 85% 10%, #cfe9d4 0%, transparent 60%), radial-gradient(90% 80% at 10% 100%, #e6f2df 0%, transparent 65%), #f6efe3",
  lemon: "radial-gradient(120% 90% at 85% 10%, #f6e39a 0%, transparent 60%), radial-gradient(90% 80% at 10% 100%, #f8ecc4 0%, transparent 65%), #f6efe3",
  peach: "radial-gradient(120% 90% at 85% 10%, #f6bd96 0%, transparent 60%), radial-gradient(90% 80% at 10% 100%, #f8d9c2 0%, transparent 65%), #f6efe3",
}

export function Hero() {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (document.documentElement.classList.contains("motion-off")) return
    const t = setInterval(() => setI((x) => (x + 1) % BEATS.length), STEP_MS)
    return () => clearInterval(t)
  }, [])
  const b = BEATS[i]

  return (
    <section className="grain relative -mt-16 overflow-hidden pt-16">
      {(["sage", "lemon", "peach"] as const).map((w) => (
        <div
          key={w}
          aria-hidden
          className="absolute inset-0 -z-10 transition-opacity duration-[900ms] ease-out"
          style={{ background: WASH[w], opacity: b.wash === w ? 1 : 0 }}
        />
      ))}
      <div className="mx-auto grid max-w-[1240px] gap-12 px-5 pb-20 pt-14 md:px-8 lg:grid-cols-[1.25fr_1fr] lg:items-center lg:pb-28 lg:pt-20">
        <div className="reveal">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-line-2 bg-paper/60 px-3 py-1.5 text-xs font-medium text-ink-2">
            <span className="live-dot text-safe" /> Live on Solana devnet
          </div>
          <Display
            as="h1"
            top={<>Know your</>}
            bottom={
              <span className="inline-flex items-center gap-3 text-ink">
                way out
                <DoorGlyph className="inline-block size-[0.82em] -translate-y-[0.04em]" />
              </span>
            }
            className="text-[clamp(3.4rem,8.6vw,7.4rem)]"
          />
          <p className="mt-7 max-w-[30rem] text-lg leading-relaxed text-ink-2">
            Pexiz reads who can move the money in a Solana venue, and moves yours out before a weakened admin can.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <LinkButton href="/app">Open the board <Arrow /></LinkButton>
            <LinkButton href="/app/replay" variant="line">Watch the April replay</LinkButton>
          </div>
        </div>

        <div className="reveal relative mx-auto w-full max-w-[440px]" style={{ animationDelay: "120ms" }}>
          <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-paper/30 blur-2xl" />
          <div className="card overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5 text-xs text-ink-2">
              <span className="font-medium text-ink">Admin-takeover replay</span>
              <span className="tabular">{b.date} 2026</span>
            </div>
            <div className="px-5 pb-5 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{b.event}</span>
              </div>
              <div className="mt-5 flex items-end justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.08em] text-ink-3">Exit window</div>
                  <div key={b.window} className="reveal tabular tracking-display mt-1 text-[3.4rem] font-medium leading-none">{b.window}</div>
                  <div className="mt-2 text-sm text-ink-2">{b.windowNote}</div>
                </div>
                <FlagPill flag={b.flag} live />
              </div>
              <div className="mt-6 grid grid-cols-5 gap-1.5" aria-hidden>
                {BEATS.map((x, k) => (
                  <span
                    key={k}
                    className={cn("h-1.5 rounded-full transition-colors duration-500", k <= i ? "" : "bg-sand")}
                    style={k <= i ? { background: x.flag === "green" ? "var(--safe)" : x.flag === "amber" ? "var(--lemon)" : "var(--danger)" } : undefined}
                  />
                ))}
              </div>
              <div className="mt-5 flex items-center justify-between rounded-xl bg-sand/70 px-4 py-3">
                <span className="text-sm text-ink-2">Escape vault</span>
                <span key={b.vault} className="reveal text-sm font-semibold">{b.vault}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function Arrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cn("size-4", className)} aria-hidden>
      <path d="M3 8h9.5M8.5 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
