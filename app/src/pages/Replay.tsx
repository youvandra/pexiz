import { useEffect, useState } from "react"
import { cn } from "@/lib/cn"
import { Button, FlagPill, flagColor } from "@/components/ui/kit"
import type { Assessment } from "@/data/chain"
import { PageHead, Shell } from "@/components/landing/Shell"
import { LinkButton } from "@/components/ui/kit"
import { Icon, Svg } from "@/components/ui/icons"

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
  { at: "20 Mar", day: -3, chain: "2-of-5 multisig, delay in place", flag: "green", reason: "Every check passes.", vault: "Holding the LP token", holder: "Holding the LP token", vaultSafe: true },
  { at: "23 Mar", day: 0, chain: "Two signers can now sign in advance", flag: "amber", reason: "A signer can now sign approvals in advance.", vault: "Deposits paused", holder: "Unaware", vaultSafe: true },
  { at: "25 Mar", day: 2, chain: "Nonce still live, 48 hours later", flag: "red", reason: "The warning stayed open for 48 hours.", vault: "Exited to USDC in the update transaction", holder: "Unaware", vaultSafe: true },
  { at: "27 Mar", day: 4, chain: "Multisig timelock set to 0", flag: "red", reason: "Approved changes now land at once.", vault: "Out, in USDC", holder: "Unaware", vaultSafe: true },
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
    <Shell>
      <div className="page px-5 pb-24 pt-12 md:px-8 md:pb-32 md:pt-20">
      <PageHead
        kicker="April 2026"
        title="Nine days of warning, replayed with Pexiz."
        body="The March to April 2026 admin takeover, step by step: what was on chain, what the Pexiz oracle would read, and where an LP ends up with and without the vault."
      >
        <div className="mt-8 flex gap-3">
          <Button className="h-12 rounded-full px-6" onClick={() => { if (i >= STEPS.length - 1) setI(0); setPlaying((p) => !p) }}>{playing ? "Pause" : "Play the replay"}</Button>
          <Button variant="line" className="h-12 rounded-full px-5" onClick={() => { setI(0); setPlaying(false) }}><Svg>{Icon.undo}</Svg>Reset</Button>
        </div>
      </PageHead>

      <div className="card mt-12 p-5 md:mt-16 md:p-7">
        <div className="relative pt-2">
          <div className="absolute left-[8.33%] right-[8.33%] top-[1.375rem] h-1 rounded-full bg-sand" />
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
                <span className={cn("tabular mt-2 hidden text-xs sm:block", k === i ? "font-semibold text-ink" : "text-ink-3")}>{x.at}</span>
              </li>
            ))}
          </ol>
          {/* A phone has no room for six dates under six dots: name the one in view. */}
          <div className="mt-4 text-center text-sm sm:hidden">
            <span className="font-semibold">{s.at}</span>
            <span className="text-ink-3"> · step {i + 1} of {STEPS.length}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_1fr_1fr]">
        <div className="card p-6">
          <div className="text-xs uppercase tracking-[0.08em] text-ink-3">On chain</div>
          <div key={s.chain} className="mt-2 text-2xl font-semibold tracking-tight">{s.chain}</div>
          <div className="mt-6 flex items-center gap-3">
            <FlagPill flag={s.flag} size="md" />
            <span className="text-sm text-ink-2">Pexiz status</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-ink-2">{s.reason}</p>
        </div>
        <div className="card p-6" style={{ background: "var(--safe-soft)" }}>
          <div className="text-xs uppercase tracking-[0.08em] text-safe">Pexiz vault</div>
          <div key={s.vault} className="mt-2 text-xl font-semibold tracking-tight">{s.vault}</div>
          <div className="mt-6 tabular tracking-display text-5xl font-medium text-safe">{s.vaultSafe ? "100%" : "—"}</div>
          <div className="text-sm text-ink-2">of deposits recoverable</div>
        </div>
        <div className="card p-6" style={{ background: i >= 4 ? "var(--danger-soft)" : undefined }}>
          <div className="text-xs uppercase tracking-[0.08em] text-ink-3">An LP who waits</div>
          <div key={s.holder} className="mt-2 text-xl font-semibold tracking-tight">{s.holder}</div>
          <div className={cn("mt-6 tabular tracking-display text-5xl font-medium", i >= 5 ? "text-danger" : "")}>{i >= 5 ? "SOL 0" : i >= 4 ? "Racing" : "Still in"}</div>
          <div className="text-sm text-ink-2">{i >= 5 ? "left in the pool's SOL custody" : "no alert, no exit"}</div>
        </div>
      </div>
      <p className="mt-4 text-xs text-ink-3">Dates and parameters from the April 2026 takeover. Flag and vault states follow the rules the deployed programs enforce.</p>
      <div className="card mt-12 flex flex-col items-start justify-between gap-5 p-6 sm:flex-row sm:items-center md:p-8">
        <div>
          <div className="text-2xl font-semibold tracking-tight">Run the same rules on a live vault</div>
          <p className="mt-1 text-ink-2">The test vault is watched by the deployed oracle.</p>
        </div>
        <LinkButton href="/app/vault/canary" className="h-12 rounded-full px-5"><Svg>{Icon.vault}</Svg>Open the test vault</LinkButton>
      </div>
      </div>
    </Shell>
  )
}
