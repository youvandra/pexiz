import { useEffect, useState } from "react"
import { cn } from "@/lib/cn"
import { Button, FlagPill, flagColor } from "@/components/ui/kit"
import type { Assessment } from "@/data/chain"
import { Nav } from "@/components/landing/Nav"
import { Display, LinkButton } from "@/components/ui/kit"
import { Arrow } from "@/components/landing/Hero"

interface Step {
  at: string
  day: number
  chain: string
  flag: Assessment
  reason: string
  vault: string
  holder: string
  vaultSafe: boolean
}

// Real dates and parameters from the April 2026 takeover; the oracle and vault
// are run through the same rules the programs enforce.
const STEPS: Step[] = [
  { at: "20 Mar", day: -3, chain: "2-of-5 multisig, delay in place", flag: "green", reason: "No condition holds.", vault: "Holding the LP token", holder: "Holding the LP token", vaultSafe: true },
  { at: "23 Mar", day: 0, chain: "Nonce accounts appear for two signers", flag: "amber", reason: "SIGNER_PRESIGNING: a member controls a live durable nonce.", vault: "Deposits paused", holder: "Unaware", vaultSafe: true },
  { at: "25 Mar", day: 2, chain: "Nonce still live, 48 hours later", flag: "red", reason: "AMBER_ESCALATED: the warning went unresolved for 48h.", vault: "Exited to USDC in the update transaction", holder: "Unaware", vaultSafe: true },
  { at: "27 Mar", day: 4, chain: "Multisig timelock set to 0", flag: "red", reason: "TIME_LOCK_BELOW_MIN: approved changes land at once.", vault: "Out, in USDC", holder: "Unaware", vaultSafe: true },
  { at: "1 Apr 16:05", day: 9, chain: "Pre-signed transaction hands over admin", flag: "red", reason: "Admin control transferred.", vault: "Out, in USDC", holder: "Exposed", vaultSafe: true },
  { at: "1 Apr 16:12", day: 9.2, chain: "Stolen JLP redeemed; SOL custody 886,921 → 1,138", flag: "red", reason: "The exit is used up by the attacker.", vault: "Out, in USDC", holder: "Stuck behind the attacker", vaultSafe: true },
]

export function Replay() {
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => setI((x) => {
      if (x >= STEPS.length - 1) { setPlaying(false); return x }
      return x + 1
    }), 1800)
    return () => clearInterval(t)
  }, [playing])
  const s = STEPS[i]

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-[1100px] px-5 pb-24 pt-10 md:px-8 md:pt-16">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <div>
          <Display as="h1" top="Nine days of warning." bottom="Replayed with Pexiz." className="text-5xl md:text-7xl" />
          <p className="mt-5 max-w-xl text-ink-2">The March–April 2026 admin takeover, step by step: what was on chain, what the Pexiz oracle would read, and where an LP ends up with and without the vault.</p>
        </div>
        {
          <div className="flex gap-2">
            <Button variant="line" className="h-10" onClick={() => { setI(0); setPlaying(false) }}>Reset</Button>
            <Button className="h-10" onClick={() => { if (i >= STEPS.length - 1) setI(0); setPlaying((p) => !p) }}>{playing ? "Pause" : "Play"}</Button>
          </div>
        }
      </div>

      <div className="card p-5 md:p-7">
        <div className="relative pt-2">
          <div className="absolute left-0 right-0 top-[1.15rem] h-1 rounded-full bg-sand" />
          <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${STEPS.length}, minmax(0,1fr))` }}>
            {STEPS.map((x, k) => (
              <li key={x.at} className="flex flex-col items-center text-center">
                <button
                  aria-label={x.at}
                  onClick={() => { setI(k); setPlaying(false) }}
                  className={cn("grid size-8 place-items-center rounded-full border-2 transition-transform", k === i ? "scale-110" : "")}
                  style={{ borderColor: k <= i ? flagColor(x.flag) : "var(--line-2)", background: k <= i ? flagColor(x.flag) : "var(--paper)" }}
                >
                  <span className="size-2 rounded-full bg-paper" />
                </button>
                <span className={cn("tabular mt-2 text-xs", k === i ? "font-semibold text-ink" : "text-ink-3")}>{x.at}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_1fr_1fr]">
        <div className="card p-6">
          <div className="text-xs uppercase tracking-[0.08em] text-ink-3">On chain</div>
          <div key={s.chain} className="mt-2 text-2xl font-semibold tracking-tight">{s.chain}</div>
          <div className="mt-6 flex items-center gap-3">
            <FlagPill flag={s.flag} live className="text-sm" />
            <span className="text-sm text-ink-2">Pexiz oracle</span>
          </div>
          <p className="mt-3 font-mono text-xs leading-relaxed text-ink-2">{s.reason}</p>
        </div>
        <div className="card p-6" style={{ background: "var(--safe-soft)" }}>
          <div className="text-xs uppercase tracking-[0.08em] text-safe">Pexiz escape vault</div>
          <div key={s.vault} className="mt-2 text-xl font-semibold tracking-tight">{s.vault}</div>
          <div className="mt-6 tabular tracking-display text-5xl font-medium text-safe">{s.vaultSafe ? "100%" : "—"}</div>
          <div className="text-sm text-ink-2">of deposits recoverable</div>
        </div>
        <div className="card p-6" style={{ background: i >= 4 ? "var(--danger-soft)" : undefined }}>
          <div className="text-xs uppercase tracking-[0.08em] text-ink-3">An LP who waits</div>
          <div key={s.holder} className="mt-2 text-xl font-semibold tracking-tight">{s.holder}</div>
          <div className={cn("mt-6 tabular tracking-display text-5xl font-medium", i >= 5 ? "text-danger" : "")}>{i >= 5 ? "SOL 0" : i >= 4 ? "Racing" : "—"}</div>
          <div className="text-sm text-ink-2">{i >= 5 ? "left in the pool's SOL custody" : "no alert, no exit"}</div>
        </div>
      </div>
      <p className="mt-4 text-xs text-ink-3">Dates and parameters from the April 2026 takeover. Flag and vault states follow the rules the deployed programs enforce.</p>
      <div className="card mt-12 flex flex-wrap items-center justify-between gap-4 p-6 md:p-8">
        <div>
          <div className="text-2xl font-semibold tracking-tight">Run the same rules on a live vault</div>
          <p className="mt-1 text-ink-2">The canary vault on devnet is watched by the deployed oracle.</p>
        </div>
        <LinkButton href="/app/vault/canary">Open the canary vault <Arrow /></LinkButton>
      </div>
      </main>
    </div>
  )
}
