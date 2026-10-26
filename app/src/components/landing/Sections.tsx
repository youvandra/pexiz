import { Link } from "wouter"
import { Area, AreaChart, Bar, BarChart, Cell, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { cn } from "@/lib/cn"
import { duration } from "@/lib/format"
import { ATTACK, EXIT_CAPACITY, HEADLINE, JLP_SUPPLY, MEASURED_ON } from "@/data/facts"
import { SNAPSHOT_BOARD, useBoard, useCanary } from "@/data/chain"
import { Display, Eyebrow, FlagPill, LinkButton, Skeleton, Stat } from "@/components/ui/kit"
import { BellGlyph, DoorGlyph, EyeGlyph, KeysGlyph, ProofGlyph } from "@/components/ui/glyphs"
import { Arrow } from "./Hero"

export function Stats() {
  return (
    <section className="border-y border-line bg-paper">
      <div className="mx-auto grid max-w-[1240px] grid-cols-2 gap-y-10 px-5 py-12 md:grid-cols-4 md:px-8">
        <Stat value={`$${HEADLINE.drained}M`} label={`drained in ${HEADLINE.minutes} minutes, 1 Apr 2026`} />
        <Stat value={`${HEADLINE.warningDays} days`} label="the warning sat on-chain first" />
        <Stat value={`${HEADLINE.lpReaction}%`} label="of LP supply moved in that window" />
        <Stat value={`$${HEADLINE.capCapacity}M`} label="exits under 1% impact, then it fills" />
      </div>
    </section>
  )
}

export function Warning() {
  return (
    <section id="warning" className="mx-auto max-w-[1240px] scroll-mt-20 px-5 py-24 md:px-8 md:py-32">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <Eyebrow n="01">The nine-day warning</Eyebrow>
          <Display top="Everyone could see it." bottom="Nobody moved." className="mt-5 text-5xl md:text-7xl" />
        </div>
        <p className="max-w-sm text-ink-2">JLP supply, March to April 2026. Flat through every on-chain warning, then the attacker reaches the exit first.</p>
      </div>

      <div className="mt-14 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="card p-5 md:p-7">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium">JLP supply, millions</span>
            <span className="text-xs text-ink-3">DefiLlama TVL ÷ CoinGecko price</span>
          </div>
          <div className="mt-4 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={JLP_SUPPLY} margin={{ top: 10, right: 6, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="sup" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#0d0d0c" stopOpacity=".16" />
                    <stop offset="1" stopColor="#0d0d0c" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <ReferenceArea x1="23 Mar" x2="1 Apr" fill="#e9c22e" fillOpacity={0.16} />
                <ReferenceLine x="2 Apr" stroke="#d95a3a" strokeDasharray="3 4" />
                <XAxis dataKey="d" tick={{ fontSize: 11, fill: "rgba(13,13,12,.5)" }} tickLine={false} axisLine={false} interval={3} />
                <YAxis domain={[170, 235]} tick={{ fontSize: 11, fill: "rgba(13,13,12,.5)" }} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ stroke: "rgba(13,13,12,.2)" }}
                  contentStyle={{ background: "#fffdf9", border: "1px solid rgba(13,13,12,.12)", borderRadius: 12, fontSize: 12 }}
                  formatter={(v) => [`${v}M JLP`, "Supply"]}
                />
                <Area type="monotone" dataKey="v" stroke="#0d0d0c" strokeWidth={2} fill="url(#sup)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap gap-5 text-xs text-ink-2">
            <span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-sm bg-lemon/50" /> Warning window, −0.8%</span>
            <span className="inline-flex items-center gap-2"><span className="h-0.5 w-4 bg-danger" /> 2 Apr: −45.1M, ~41M of it the attacker</span>
          </div>
        </div>

        <ol className="card divide-y divide-line p-2">
          {ATTACK.map((a) => (
            <li key={a.date} className="flex gap-4 px-4 py-4">
              <span className="tabular w-[5.5rem] shrink-0 pt-0.5 text-sm text-ink-3">{a.date}</span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{a.title}</span>
                  {a.pexiz && <span className="rounded-full bg-ink px-2 py-0.5 text-[0.68rem] font-semibold text-cream">Pexiz exits</span>}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-ink-2">{a.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

export function BoardPreview() {
  const { rows } = useBoard()
  const list = rows ?? SNAPSHOT_BOARD
  return (
    <section id="board" className="dot-grid scroll-mt-20 border-y border-line">
      <div className="mx-auto max-w-[1240px] px-5 py-24 md:px-8 md:py-32">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <Eyebrow n="02">Every venue, one number</Eyebrow>
            <Display top="The exit window." bottom="Read from chain." className="mt-5 text-5xl md:text-7xl" />
          </div>
          <LinkButton href="/app" variant="line">Open the board <Arrow /></LinkButton>
        </div>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.slice(0, 3).map((r) => (
            <Link key={r.venue.id} href={`/app/venue/${r.venue.id}`} className="card group block p-6 transition-transform hover:-translate-y-0.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">{r.venue.name}</div>
                  <div className="text-sm text-ink-3">{r.venue.kind}</div>
                </div>
                <FlagPill flag={r.assessment} live={r.live} />
              </div>
              <div className="mt-8 text-xs uppercase tracking-[0.08em] text-ink-3">Exit window</div>
              <div className="tabular tracking-display mt-1 text-5xl font-medium">
                {rows === null ? <Skeleton className="h-12 w-40" /> : r.exitWindowSecs === undefined ? "—" : r.exitWindowSecs <= 0 ? "None" : duration(r.exitWindowSecs)}
              </div>
              <div className="mt-6 flex gap-5 border-t border-line pt-4 text-sm text-ink-2">
                <span>{r.threshold ? `${r.threshold} of ${r.members} signers` : r.venue.note ?? "—"}</span>
                {r.timeLockSecs !== undefined && <span className="tabular">{duration(r.timeLockSecs)} delay</span>}
              </div>
            </Link>
          ))}
        </div>
        <p className="mt-6 text-xs text-ink-3">Exit window = admin delay − 30 minutes to notice and withdraw (an assumption). Snapshot {MEASURED_ON}; live where the chain allows.</p>
      </div>
    </section>
  )
}

const STEPS = [
  { n: "01", title: "Read", body: "Upgrade authority, multisig threshold, timelock, members, and any signer holding a pre-signing account.", glyph: <KeysGlyph className="size-14" />, visual: "keys" },
  { n: "02", title: "Prove", body: "An on-chain flag anyone can update. Every red carries the account that proves it.", glyph: <ProofGlyph className="size-14" />, visual: "proof" },
  { n: "03", title: "Exit", body: "The update that turns red also redeems the vault to USDC, in the same transaction.", glyph: <DoorGlyph className="size-14" />, visual: "exit" },
] as const

function StepVisual({ kind }: { kind: (typeof STEPS)[number]["visual"] }) {
  if (kind === "keys")
    return (
      <div className="grid grid-cols-4 gap-1.5">
        {Array.from({ length: 8 }).map((_, k) => (
          <span key={k} className={cn("h-9 rounded-lg border text-center text-[0.7rem] leading-9", k < 4 ? "border-ink bg-ink text-cream" : "border-line-2 text-ink-3")}>
            {k < 4 ? "sign" : "·"}
          </span>
        ))}
        <span className="col-span-4 mt-1 text-xs text-ink-2">4 of 8 · 24h delay</span>
      </div>
    )
  if (kind === "proof")
    return (
      <div className="space-y-1.5 font-mono text-[0.72rem]">
        {[["multisig", "time_lock = 0", "red"], ["program data", "authority ✓", "green"], ["nonce 7Hx…f3m", "member ✓", "amber"]].map(([a, b, f]) => (
          <div key={a} className="flex items-center justify-between rounded-lg bg-sand/70 px-3 py-2">
            <span className="text-ink-2">{a}</span>
            <span className={f === "red" ? "text-danger" : f === "amber" ? "text-warn" : "text-safe"}>{b}</span>
          </div>
        ))}
      </div>
    )
  return (
    <div className="rounded-xl border border-line-2 p-3">
      <div className="text-[0.7rem] uppercase tracking-[0.08em] text-ink-3">One transaction</div>
      <div className="mt-2 flex items-center gap-2 text-sm font-medium">
        <span className="rounded-md bg-danger-soft px-2 py-1 text-danger">oracle.update → red</span>
        <span className="text-ink-3">+</span>
        <span className="rounded-md bg-safe-soft px-2 py-1 text-safe">vault.exit</span>
      </div>
    </div>
  )
}

export function How() {
  return (
    <section id="how" className="mx-auto max-w-[1240px] scroll-mt-20 px-5 py-24 md:px-8 md:py-32">
      <Eyebrow n="03">How Pexiz works</Eyebrow>
      <Display top="Read. Prove." bottom="Leave first." className="mt-5 text-5xl md:text-7xl" />
      <div className="mt-14 grid gap-4 md:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.n} className="card flex flex-col p-6">
            <div className="flex items-center justify-between">
              {s.glyph}
              <span className="tabular text-3xl font-light text-ink-3">{s.n}</span>
            </div>
            <h3 className="mt-6 text-2xl font-semibold tracking-tight">{s.title}</h3>
            <p className="mt-2 leading-relaxed text-ink-2">{s.body}</p>
            <div className="mt-auto pt-7"><StepVisual kind={s.visual} /></div>
          </div>
        ))}
      </div>
    </section>
  )
}

export function Capacity() {
  return (
    <section className="bg-ink text-cream">
      <div className="mx-auto grid max-w-[1240px] gap-12 px-5 py-24 md:px-8 md:py-32 lg:grid-cols-[1fr_1.2fr] lg:items-center">
        <div>
          <div className="flex items-baseline gap-3 text-2xl font-medium"><span className="tabular text-cream/45">04</span>Exit capacity</div>
          <h2 className="tracking-display mt-5 text-5xl font-medium leading-[0.92] md:text-7xl">
            The door is narrow.<span className="block text-cream/45">Be first through it.</span>
          </h2>
          <p className="mt-6 max-w-md text-cream/70">Selling JLP for USDC. Under $10M the pool absorbs it. Past $20M it runs out. So the vault caps at $10M and exits in the slot the flag turns red.</p>
        </div>
        <div className="rounded-[1.1rem] border border-white/10 bg-white/[0.04] p-6">
          <div className="text-sm text-cream/60">Price impact by size</div>
          <div className="mt-4 h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={EXIT_CAPACITY} margin={{ top: 20, right: 0, left: -18, bottom: 0 }}>
                <XAxis dataKey="size" tick={{ fontSize: 12, fill: "rgba(251,246,239,.6)" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "rgba(251,246,239,.5)" }} tickLine={false} axisLine={false} unit="%" />
                <Tooltip cursor={{ fill: "rgba(255,255,255,.05)" }} contentStyle={{ background: "#1b1b19", border: "1px solid rgba(255,255,255,.12)", borderRadius: 12, fontSize: 12, color: "#fbf6ef" }} formatter={(v) => [`${v}%`, "Impact"]} />
                <Bar dataKey="impact" radius={[8, 8, 2, 2]} label={{ position: "top", fill: "#fbf6ef", fontSize: 12, formatter: (v: unknown) => `${v}%` }}>
                  {EXIT_CAPACITY.map((e) => <Cell key={e.size} fill={e.impact < 1 ? "#3fb874" : e.impact < 10 ? "#e9c22e" : "#f2772f"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 text-xs text-cream/50">Jupiter aggregator quotes, measured {MEASURED_ON}.</div>
        </div>
      </div>
    </section>
  )
}

export function LiveDevnet() {
  const { data } = useCanary(30_000)
  return (
    <section className="mx-auto max-w-[1240px] px-5 py-24 md:px-8 md:py-32">
      <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-center">
        <div>
          <Eyebrow n="05">Running now</Eyebrow>
          <Display top="A real multisig." bottom="A real flag." className="mt-5 text-5xl md:text-7xl" />
          <p className="mt-6 max-w-md text-ink-2">A canary venue on devnet under a 3-of-5 Squads multisig. One signer opened a pre-signing account; the oracle caught it.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href="/app/vault">See the vault <Arrow /></LinkButton>
            <LinkButton href="/docs" variant="line">Read the rules</LinkButton>
          </div>
        </div>
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <EyeGlyph className="size-10" />
              <div>
                <div className="font-semibold">Canary venue</div>
                <div className="text-sm text-ink-3">pexiz-oracle · devnet</div>
              </div>
            </div>
            {data ? <FlagPill flag={data.venue.flag} live /> : <Skeleton className="h-6 w-20 rounded-full" />}
          </div>
          <div className="mt-6 grid grid-cols-3 gap-3">
            {[
              ["Signers", data ? `${data.venue.threshold} of ${data.venue.members.length}` : null],
              ["Delay", data ? duration(data.venue.timeLockSecs) : null],
              ["Pre-signers", data ? String(data.venue.presigners.length) : null],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-sand/70 p-3">
                <div className="text-xs text-ink-3">{k}</div>
                <div className="tabular mt-1 text-xl font-medium">{v ?? <Skeleton className="h-6 w-14" />}</div>
              </div>
            ))}
          </div>
          <ul className="mt-5 space-y-2 text-sm text-ink-2">
            {(data?.reasons ?? []).map((r) => (
              <li key={r} className="flex gap-2"><BellGlyph className="mt-0.5 size-4 shrink-0" tint="#e9c22e" />{r}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

const FAQ = [
  ["Does Pexiz stop a hack?", "It buys time. Pexiz reads the admin setup and moves vault funds out while a delay still stands between an approved change and your money."],
  ["Who updates the flag?", "Anyone. The program recomputes every signal from the accounts passed in, so a red flag always carries its proof."],
  ["What counts as a warning?", "A timelock below the minimum, a lowered threshold, a third of signers replaced in a week, a moved upgrade authority, or a signer holding a pre-signing account."],
  ["Why cap the vault at $10M?", "Exit capacity. Above that, selling the LP token costs real slippage, and in a real alarm everyone sells at once."],
] as const

export function Faq() {
  return (
    <section className="mx-auto grid max-w-[1240px] gap-12 px-5 pb-24 md:px-8 lg:grid-cols-[1fr_1.4fr]">
      <Display top="Questions," bottom="answered." className="text-5xl md:text-6xl" />
      <div className="divide-y divide-line border-y border-line">
        {FAQ.map(([q, a]) => (
          <details key={q} className="group py-5">
            <summary className="flex list-none items-center justify-between text-lg font-medium">
              {q}
              <span className="ml-4 grid size-8 shrink-0 place-items-center rounded-full border border-line-2 transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 max-w-xl leading-relaxed text-ink-2">{a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

export function Footer() {
  return (
    <footer className="grain relative overflow-hidden" style={{ background: "radial-gradient(100% 120% at 80% 0%, #f6bd96 0%, transparent 55%), radial-gradient(90% 100% at 0% 100%, #f6e39a 0%, transparent 60%), #f6efe3" }}>
      <div className="mx-auto max-w-[1240px] px-5 py-24 md:px-8">
        <Display top="Stay in the room." bottom="Keep the door in sight." className="text-5xl md:text-7xl" />
        <div className="mt-10 flex flex-wrap gap-3">
          <LinkButton href="/app">Open the board <Arrow /></LinkButton>
          <LinkButton href="/app/replay" variant="line">Watch the replay</LinkButton>
        </div>
        <div className="mt-20 flex flex-wrap items-center justify-between gap-4 border-t border-ink/10 pt-6 text-sm text-ink-2">
          <span>Pexiz · built on Solana</span>
          <span>Numbers measured {MEASURED_ON}</span>
        </div>
      </div>
    </footer>
  )
}
