import { Link } from "wouter"
import { Area, AreaChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { duration } from "@/lib/format"
import { ATTACK, HEADLINE, JLP_SUPPLY, MEASURED_ON } from "@/data/facts"
import { SNAPSHOT_BOARD, useBoard, useCanary } from "@/data/chain"
import { FlagPill, LinkButton, Logo, Skeleton, VenueLogo } from "@/components/ui/kit"
import { DoorGlyph, EyeGlyph, ProofGlyph } from "@/components/ui/glyphs"
import { Icon, Svg } from "@/components/ui/icons"

function SectionHead({ kicker, title, body, id }: { kicker: string; title: string; body?: string; id?: string }) {
  return (
    <div id={id} className="max-w-2xl scroll-mt-24">
      <div className="text-sm font-semibold text-ink-3">{kicker}</div>
      <h2 className="tracking-display mt-3 text-4xl font-medium leading-[1.05] md:text-5xl">{title}</h2>
      {body && <p className="mt-4 text-lg leading-relaxed text-ink-2">{body}</p>}
    </div>
  )
}

export function Problem() {
  return (
    <section className="mx-auto max-w-[1180px] px-5 py-24 md:px-8 md:py-28">
      <SectionHead
        kicker="Why this exists"
        title="In April 2026, a Solana pool lost $285M in 12 minutes."
        body="The attackers prepared for nine days, in public, on chain. Liquidity providers had no way to see it, so almost nobody left in time."
      />

      <div className="mt-12 grid gap-3 sm:grid-cols-3">
        {[
          [`$${HEADLINE.drained}M`, `taken in ${HEADLINE.minutes} minutes`],
          [`${HEADLINE.warningDays} days`, "of visible warning signs first"],
          [`${HEADLINE.lpReaction}%`, "of LP money left during the warning"],
        ].map(([v, l]) => (
          <div key={l} className="card p-6">
            <div className="tabular tracking-display text-4xl font-medium md:text-5xl">{v}</div>
            <div className="mt-2 text-ink-2">{l}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="card p-5 md:p-7">
          <div className="font-semibold">Money in the pool stayed put while the warning was live</div>
          <div className="mt-1 text-sm text-ink-3">JLP supply in millions, March to April 2026</div>
          <div className="mt-5 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={JLP_SUPPLY} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="sup" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#0d0d0c" stopOpacity=".12" />
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
                <Area type="monotone" dataKey="v" stroke="#0d0d0c" strokeWidth={2} fill="url(#sup)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap gap-5 text-xs text-ink-2">
            <span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-sm bg-lemon/50" />Warning signs visible</span>
            <span className="inline-flex items-center gap-2"><span className="h-0.5 w-4 bg-danger" />Pool drained</span>
          </div>
        </div>

        <div className="card p-0">
          <div className="border-b border-line px-5 py-4 font-semibold">What happened</div>
          <ol className="divide-y divide-line">
            {ATTACK.map((a) => (
              <li key={a.date} className="flex gap-4 px-5 py-4">
                <span className="tabular w-20 shrink-0 text-sm text-ink-3">{a.date}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 font-medium">
                    {a.title}
                    {a.pexiz && <span className="rounded-full bg-safe-soft px-2 py-0.5 text-[11px] font-semibold text-safe">Pexiz would exit here</span>}
                  </div>
                  <p className="mt-0.5 text-sm text-ink-2">{a.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="border-t border-line px-5 py-4">
            <Link href="/replay" className="inline-flex items-center gap-1.5 text-sm font-semibold">Step through the timeline<Svg>{Icon.arrow}</Svg></Link>
          </div>
        </div>
      </div>
    </section>
  )
}

const STEPS = [
  {
    glyph: <EyeGlyph className="size-12" />,
    title: "We watch the admin keys",
    body: "Every protocol has people who can change its code. Pexiz reads, from chain, how many of them must agree and how long a change must wait.",
  },
  {
    glyph: <ProofGlyph className="size-12" />,
    title: "We raise a flag, with proof",
    body: "If the wait gets shorter, signers change, or someone pre-signs approvals, the flag turns to Watch or Get out. Anyone can check why.",
  },
  {
    glyph: <DoorGlyph className="size-12" />,
    title: "Your vault leaves on its own",
    body: "When the flag turns to Get out, your vault swaps to USDC in that same moment. No alerts to catch, no button to press.",
  },
]

export function How() {
  return (
    <section className="border-y border-line bg-paper">
      <div className="mx-auto max-w-[1180px] px-5 py-24 md:px-8 md:py-28">
        <SectionHead id="how" kicker="How it works" title="Three steps, all on chain." />
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="rounded-[var(--radius-card)] border border-line bg-cream p-6">
              <div className="flex items-center justify-between">
                {s.glyph}
                <span className="tabular text-sm font-semibold text-ink-3">Step {i + 1}</span>
              </div>
              <h3 className="mt-6 text-xl font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-2 leading-relaxed text-ink-2">{s.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {([
            ["green", "Safe", "Every check passes. Deposits are open and your vault holds the LP token."],
            ["amber", "Watch", "A warning sign appeared. Deposits pause. If it is still there after 48 hours, it becomes Get out."],
            ["red", "Get out", "The vault swaps to USDC. You can withdraw any time, and vote to go back once it is safe."],
          ] as const).map(([f, t, b]) => (
            <div key={f} className="flex gap-4">
              <FlagPill flag={f} label={t} className="mt-0.5" />
              <p className="text-sm text-ink-2">{b}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function Venues() {
  const { rows } = useBoard()
  const list = rows ?? SNAPSHOT_BOARD
  return (
    <section className="mx-auto max-w-[1180px] px-5 py-24 md:px-8 md:py-28">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <SectionHead id="venues" kicker="Protocols we watch" title="Would you have time to leave?" body="The exit window is how long you have between an admin change being approved and it taking effect, minus the time you need to withdraw." />
        <LinkButton href="/app/monitor" variant="line" className="shrink-0">Open the monitor<Svg>{Icon.arrow}</Svg></LinkButton>
      </div>
      <div className="card mt-12 divide-y divide-line p-0">
        {list.map((r) => (
          <Link key={r.venue.id} href={`/app/monitor/${r.venue.id}`} className="flex flex-wrap items-center gap-4 px-5 py-4 transition-colors hover:bg-sand/50 md:flex-nowrap">
            <VenueLogo src={r.venue.logo} name={r.venue.name} />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{r.venue.name}</div>
              <div className="text-sm text-ink-3">{r.venue.kind}</div>
            </div>
            <div className="w-32 text-sm">
              <div className="text-xs text-ink-3">Exit window</div>
              <div className="tabular font-semibold">
                {rows === null ? <Skeleton className="h-5 w-16" /> : r.exitWindowSecs === undefined ? "Not rated" : r.exitWindowSecs <= 0 ? "None" : duration(r.exitWindowSecs)}
              </div>
            </div>
            <div className="flex w-28 justify-end"><FlagPill flag={r.assessment} /></div>
          </Link>
        ))}
      </div>
      <p className="mt-4 text-xs text-ink-3">Assumes 30 minutes to notice and withdraw. Read live from Solana mainnet where possible, otherwise from the {MEASURED_ON} snapshot.</p>
    </section>
  )
}

export function TryIt() {
  const { data } = useCanary(30_000)
  return (
    <section className="mx-auto max-w-[1180px] px-5 md:px-8">
      <div className="card grid gap-10 p-6 md:p-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div>
          <div className="text-sm font-semibold text-ink-3">Try it now</div>
          <h2 className="tracking-display mt-3 text-4xl font-medium leading-[1.05] md:text-5xl">A live test vault, with free test funds.</h2>
          <p className="mt-4 text-lg text-ink-2">Connect any Solana wallet, get test USDC from the built-in faucet, and watch the vault react to a real multisig.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <LinkButton href="/app/vault/canary" className="h-12 px-5"><Svg>{Icon.vault}</Svg>Open the test vault</LinkButton>
            <LinkButton href="/docs" variant="line" className="h-12 px-5"><Svg>{Icon.book}</Svg>Read the docs</LinkButton>
          </div>
        </div>
        <div className="rounded-[var(--radius-card)] border border-line bg-cream p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DoorGlyph className="size-10" />
              <div>
                <div className="font-semibold">Canary Pool</div>
                <div className="text-sm text-ink-3">Test vault</div>
              </div>
            </div>
            {data ? <FlagPill flag={data.venue.flag} /> : <Skeleton className="h-6 w-20 rounded-md" />}
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2">
            {[
              ["Signers", data ? `${data.venue.threshold} of ${data.venue.members.length}` : null],
              ["Admin delay", data ? duration(data.venue.timeLockSecs) : null],
              ["Vault holds", data ? `$${(data.vaultUsdc + data.vaultLp).toLocaleString("en-US")}` : null],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-paper p-3">
                <div className="text-xs text-ink-3">{k}</div>
                <div className="tabular mt-1 font-semibold">{v ?? <Skeleton className="h-5 w-12" />}</div>
              </div>
            ))}
          </div>
          {data?.reasons[0] && <p className="mt-4 text-sm text-ink-2">Right now: {data.reasons[0]}.</p>}
        </div>
      </div>
    </section>
  )
}

const FAQ = [
  ["What is Pexiz?", "A vault for liquidity providers on Solana. It holds your LP token while the protocol is safe, and swaps it to USDC by itself when the protocol's admin keys get weaker."],
  ["What is an admin takeover?", "Most protocols can be upgraded by a group of key holders. If attackers gain control of enough of those keys, they can change the code and take the pool's money. Pexiz watches for the signs that come first."],
  ["Does Pexiz hold my funds?", "Your deposit sits in an on-chain vault program, not with a company. You can withdraw any time, in every state, with your own wallet."],
  ["What happens when the flag turns red?", "The same transaction that turns the flag red also sells the vault's LP token for USDC. You keep your share of that USDC and can withdraw it or vote to go back in later."],
  ["Can Pexiz stop a hack?", "No. It cannot change what the attackers do. It gets your money out while there is still time, before an approved change can take effect."],
  ["Does Pexiz pay for losses?", "No. Pexiz is not insurance. A false alarm can cost you yield and swap fees, and an exit can lose up to 1% to slippage. It lowers the chance of being caught; it does not cover what it misses."],
  ["What if everyone tries to leave at once?", "The vault leaves in the same transaction as the warning, before people can react. If the pool cannot take it all at once, it leaves in steps, each at no worse than 1% below the pool's own price. Inside the vault there is no queue: everyone gets their exact share."],
  ["Is it on mainnet?", "Not yet. The vault and oracle run on Solana devnet with test funds. The protocol board reads real mainnet data today, for perps and prediction markets."],
  ["Why is each vault capped at $10M?", "Selling more than about $10M of JLP at once moves the price sharply. The cap keeps an exit fast and fair for everyone in the vault."],
] as const

export function Faq() {
  return (
    <section className="mx-auto grid max-w-[1180px] gap-12 px-5 py-24 md:px-8 md:py-28 lg:grid-cols-[1fr_1.5fr]">
      <SectionHead id="faq" kicker="FAQ" title="Common questions" />
      <div className="divide-y divide-line border-y border-line">
        {FAQ.map(([q, a]) => (
          <details key={q} className="group py-5">
            <summary className="flex list-none items-center justify-between gap-4 text-lg font-medium">
              {q}
              <span className="grid size-8 shrink-0 place-items-center rounded-full border border-line-2 text-ink-2 group-open:rotate-45">+</span>
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
    <footer className="border-t border-line bg-paper">
      <div className="mx-auto grid max-w-[1180px] gap-10 px-5 py-14 md:grid-cols-[1.5fr_1fr_1fr] md:px-8">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-ink-2">Protection for Solana liquidity providers against admin takeovers.</p>
        </div>
        <div className="space-y-2.5 text-sm">
          <div className="font-semibold">Product</div>
          <Link href="/app" className="block text-ink-2 hover:text-ink">Open app</Link>
          <Link href="/app/monitor" className="block text-ink-2 hover:text-ink">Protocol monitor</Link>
          <Link href="/replay" className="block text-ink-2 hover:text-ink">April 2026 timeline</Link>
        </div>
        <div className="space-y-2.5 text-sm">
          <div className="font-semibold">Learn</div>
          <Link href="/docs" className="block text-ink-2 hover:text-ink">Docs</Link>
          <a href="/#how" className="block text-ink-2 hover:text-ink">How it works</a>
          <a href="/#faq" className="block text-ink-2 hover:text-ink">FAQ</a>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-[1180px] flex-wrap justify-between gap-3 px-5 py-5 text-xs text-ink-3 md:px-8">
          <span>© 2026 Pexiz · Built on Solana</span>
          <span>Devnet beta. Not financial advice.</span>
        </div>
      </div>
    </footer>
  )
}
