import { useEffect, useState } from "react"
import { useWallet } from "@solana/wallet-adapter-react"
import { cn } from "@/lib/cn"
import { ago, short } from "@/lib/format"
import { useSend } from "@/lib/solana"
import { DEVNET, explorer } from "@/data/facts"
import { buildAddLiquidity, buildProtect, buildUnprotect, useDemo, useProtect, type DemoRun, type DemoStep, type Wallet } from "@/data/protect"
import { Button, FlagPill, Skeleton, flagSurface } from "@/components/ui/kit"
import { DoorGlyph } from "@/components/ui/glyphs"
import { Faucet, Icon, Svg, WalletButton } from "@/components/app/chrome"
import { Conditions } from "@/components/app/bits"

const fmt = (n: number, d = 2) => n.toLocaleString("en-US", { maximumFractionDigits: d })

const STATE = {
  green: { tone: "bg-safe-soft", title: "Safe", body: "Your LP stays in your wallet and earns as usual. Nothing can move it while this reads Safe." },
  amber: { tone: "bg-warn-soft", title: "Warning open", body: "A signer holds an approval signed in advance. Your LP stays put; if the warning is still open after 2 minutes here (48 hours on a real venue), it leaves." },
  red: { tone: "bg-danger-soft", title: "Get out", body: "The next update takes every guarded wallet's LP out to USDC, in that wallet." },
}

export function Protect() {
  const { publicKey } = useWallet()
  const { data, error, refresh } = useProtect(publicKey)
  const demo = useDemo()
  const v = data?.venue
  const state = v ? STATE[v.flag] : null
  // Read faster while an attack runs, so each step shows as it lands.
  useEffect(() => {
    if (!demo.state?.running) return
    const t = setInterval(refresh, 3_000)
    return () => clearInterval(t)
  }, [demo.state?.running, refresh])

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-card)] border p-5 md:p-6" style={v ? flagSurface(v.flag) : { background: "var(--paper)" }}>
        <div className="flex items-center gap-4">
          <DoorGlyph className="size-14" />
          <div>
            <h1 className="tracking-display text-4xl font-medium md:text-5xl">Protect your wallet</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-ink-3">
              <span>Fast canary on devnet</span>·<span>{data ? `updated ${ago(data.readAt)}` : error ? "network unreachable" : "reading…"}</span>
            </div>
          </div>
        </div>
        {v ? <FlagPill flag={v.flag} size="md" /> : <Skeleton className="h-8 w-28 rounded-md" />}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          {state ? (
            <div className={cn("rounded-[var(--radius-card)] p-5", state.tone)}>
              <div className="font-semibold">{state.title}</div>
              <p className="mt-1 text-sm text-ink-2">{state.body}</p>
            </div>
          ) : <Skeleton className="h-24 w-full rounded-[var(--radius-card)]" />}

          <section className="card p-0">
            <div className="border-b border-line px-5 py-4 font-semibold">How it works</div>
            <ol className="grid gap-px bg-line xl:grid-cols-3">
              {[
                ["Approve once", "Your LP stays in your wallet. You let the exit program take up to an amount you choose, and only to your own USDC account."],
                ["The venue turns red", "The oracle reads the venue's multisig on chain. Red needs proof that exists on chain, so nobody can fake it."],
                ["USDC lands in your wallet", "Anyone can run the exit and keeps 0.1%. It redeems your LP in the venue's own pool, at no worse than 1% under its value."],
              ].map(([t, b], i) => (
                <li key={t} className="bg-paper p-5">
                  <div className="text-xs font-semibold text-ink-3">0{i + 1}</div>
                  <div className="mt-1 font-semibold">{t}</div>
                  <p className="mt-1.5 text-sm text-ink-2">{b}</p>
                </li>
              ))}
            </ol>
          </section>

          <Attack demo={demo} wallet={data?.wallet ?? null} />

          <section className="card p-0">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="font-semibold">What the oracle checks</h2>
              <span className="text-xs text-ink-3">Minutes here, days on a real venue</span>
            </div>
            <div className="px-5"><Conditions reasons={v?.reasons} /></div>
          </section>

          <section className="card p-0">
            <div className="border-b border-line px-5 py-4 font-semibold">Addresses</div>
            <dl className="divide-y divide-line text-sm">
              {([
                ["Exit program", DEVNET.exit],
                ["Fast canary status account", DEVNET.fastVenue],
                ["Its multisig, 3 of 5, 60 s delay", DEVNET.fastMultisig],
                ["Oracle program", DEVNET.oracle],
              ] as const).map(([k, a]) => (
                <div key={k} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <dt className="text-ink-2">{k}</dt>
                  <dd><a href={explorer(a, "devnet")} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-mono text-xs hover:underline">{short(a, 6)}<Svg className="size-3 text-ink-3">{Icon.ext}</Svg></a></dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <aside className="-order-1 lg:sticky lg:top-24 lg:order-none lg:self-start">
          <Panel wallet={data?.wallet ?? null} refresh={refresh} />
        </aside>
      </div>
    </div>
  )
}

function Panel({ wallet: w, refresh }: { wallet: Wallet | null; refresh: () => void }) {
  const { publicKey } = useWallet()
  const send = useSend()
  const [amt, setAmt] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const n = Number(amt) || 0

  const act = async (label: string, build: () => Promise<Parameters<typeof send>[1]>) => {
    if (!publicKey) return
    setBusy(label)
    const sig = await send(label, await build())
    setBusy(null)
    if (sig) { setAmt(""); refresh() }
  }

  if (!publicKey) {
    return (
      <div className="card p-5">
        <div className="font-semibold">Try it with your own wallet</div>
        <p className="mt-1.5 text-sm text-ink-2">Devnet only. You get test USDC, put it in the canary pool, guard the LP, then watch it leave when the attack lands.</p>
        <WalletButton className="mt-4 h-12 w-full justify-center" label="Connect a wallet" />
      </div>
    )
  }
  if (!w) return <div className="card p-5"><Skeleton className="h-64 w-full" /></div>

  const unguarded = Math.max(0, w.lp - w.guarded)
  return (
    <div className="card overflow-hidden p-0">
      <div className="grid grid-cols-3 border-b border-line bg-sand/50 text-center">
        {[["USDC", w.usdc], ["Canary LP", w.lp], ["Guarded", w.guarded]].map(([k, val]) => (
          <div key={k as string} className="px-2 py-4">
            <div className="text-xs text-ink-3">{k}</div>
            <div className="tabular mt-1 text-lg font-semibold">{fmt(val as number)}</div>
          </div>
        ))}
      </div>
      <div className="space-y-5 p-5">
        <Row n="1" title="Get test USDC" done={w.usdc > 0 || w.lp > 0}>
          <Faucet owner={publicKey.toBase58()} variant="button" onDone={refresh} />
        </Row>
        <Row n="2" title="Add it to the pool" done={w.lp > 0} hint="You hold the LP yourself. Nothing is deposited with us.">
          <div className="flex gap-2">
            <input
              inputMode="decimal" placeholder="USDC" value={amt}
              onChange={(e) => { const x = e.target.value.replace(",", "."); if (/^\d*\.?\d{0,6}$/.test(x)) setAmt(x) }}
              className="tabular h-10 min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 outline-none focus:border-ink"
              aria-label="USDC to add"
            />
            <Button className="h-10 text-sm" disabled={n <= 0 || n > w.usdc || !!busy} onClick={() => act(`Add ${fmt(n)} USDC`, () => buildAddLiquidity(publicKey, n))}>
              {busy?.startsWith("Add") ? "Adding…" : "Add"}
            </Button>
          </div>
        </Row>
        <Row n="3" title="Guard your LP" done={w.guarded > 0 && unguarded === 0} hint="One signature. Revoke it any time.">
          {w.lp <= 0 ? (
            <div className="text-sm text-ink-3">Add liquidity first.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button className="h-10 text-sm" disabled={unguarded <= 0 || !!busy} onClick={() => act(`Guard ${fmt(w.lp)} LP`, () => buildProtect(publicKey, w.lp, !!w.guard))}>
                <Svg>{Icon.door}</Svg>{busy?.startsWith("Guard") ? "Guarding…" : unguarded > 0 ? `Guard ${fmt(w.lp)} LP` : "All guarded"}
              </Button>
              {w.guard && (
                <Button variant="line" className="h-10 text-sm" disabled={!!busy} onClick={() => act("Stop guarding", () => buildUnprotect(publicKey))}>Stop</Button>
              )}
            </div>
          )}
        </Row>
        {w.guard && w.guard.exits > 0 && (
          <div className="rounded-xl bg-safe-soft p-4 text-sm">
            <div className="font-semibold">Taken out {w.guard.exits === 1 ? "once" : `${w.guard.exits} times`}</div>
            <p className="mt-1 text-ink-2">The USDC went to your own account. Add it again to run another round.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ n, title, done, hint, children }: { n: string; title: string; done: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className={cn("grid size-6 place-items-center rounded-full text-xs font-semibold", done ? "bg-ink text-paper" : "bg-sand text-ink-2")}>
          {done ? <Svg className="size-3.5">{Icon.check}</Svg> : n}
        </span>
        <span className="font-semibold">{title}</span>
      </div>
      {hint && <p className="mb-2 text-xs text-ink-3">{hint}</p>}
      {children}
    </div>
  )
}

const STEPS: [DemoStep["key"], string, string][] = [
  ["propose", "Signers approve cutting the delay", "A real Squads proposal: SetTimeLock 0, three of five approve."],
  ["timelock", "The current delay runs out", "The multisig's own 60 s timelock still applies to this change."],
  ["cut", "The delay is now zero", "Any approved change can land at once. On a real venue this is the moment to leave."],
  ["exit", "Red, and guarded wallets are taken out", "One crank cycle writes red with its proof, then exits every guarded wallet."],
  ["restore", "The delay is put back", "SetTimeLock 60, approved and executed."],
  ["clear", "Five minutes clear, then Safe", "The cool-off is 7 days on a real venue."],
]

function Attack({ demo, wallet }: { demo: ReturnType<typeof useDemo>; wallet: Wallet | null }) {
  const [err, setErr] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const run: DemoRun | null = demo.state?.running ?? demo.state?.last ?? null
  const live = !!demo.state?.running
  useEffect(() => {
    if (!live) return
    const t = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(t)
  }, [live])

  const go = async () => {
    setErr(null)
    setErr(await demo.start())
  }

  return (
    <section className="card p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="font-semibold">Run the attack</h2>
          <p className="mt-0.5 text-sm text-ink-2">The same move that opened the April drain: cut the delay to zero. About eight minutes, start to Safe.</p>
        </div>
        <Button className="h-10 text-sm" disabled={live || demo.state === null} onClick={go}>
          {live ? "Running…" : "Run the attack"}
        </Button>
      </div>
      {err && <div className="border-b border-line bg-danger-soft px-5 py-3 text-sm">{err}</div>}
      {!live && wallet && wallet.guarded <= 0 && (
        <div className="border-b border-line px-5 py-3 text-sm text-ink-2">Guard some LP first to watch your own wallet leave.</div>
      )}
      {run ? (
        <ol className="divide-y divide-line">
          {STEPS.map(([key, title, body]) => {
            const s = run.steps.find((x) => x.key === key)
            const last = run.steps[run.steps.length - 1]
            const active = live && s === last
            const failed = !!run.error && s === last
            return (
              <li key={key} className={cn("flex gap-4 px-5 py-4", !s && "opacity-45")}>
                <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs", failed ? "bg-danger text-paper" : s && !active ? "bg-ink text-paper" : "border border-line-2")}>
                  {s && !active && !failed && <Svg className="size-3.5">{Icon.check}</Svg>}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold">{title}</span>
                    {s?.at && <span className="tabular text-xs text-ink-3">{new Date(s.at).toLocaleTimeString()}</span>}
                  </div>
                  <p className="mt-0.5 text-sm text-ink-2">{s?.detail ?? body}</p>
                  {active && s?.until && <p className="tabular mt-1 text-sm font-medium">{Math.max(0, Math.ceil((s.until - now) / 1000))} s left</p>}
                  {failed && <p className="mt-1 text-sm text-danger">{run.error}</p>}
                  {!!s?.signatures.length && (
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                      {s.signatures.map((sig) => (
                        <a key={sig} href={explorer(sig, "devnet", "tx")} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-ink-2 hover:text-ink hover:underline">
                          {short(sig, 5)}<Svg className="size-3 text-ink-3">{Icon.ext}</Svg>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      ) : (
        <div className="px-5 py-6 text-sm text-ink-2">{demo.state === null ? "Reading…" : "No attack has run since the server started."}</div>
      )}
    </section>
  )
}
