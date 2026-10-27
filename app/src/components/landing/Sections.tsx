import { Link } from "wouter"
import { Area, AreaChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { duration } from "@/lib/format"
import { ATTACK, HEADLINE, JLP_SUPPLY } from "@/data/facts"
import { useCanary } from "@/data/chain"
import { FlagPill, LinkButton, Logo, Skeleton } from "@/components/ui/kit"
import { DoorGlyph, EyeGlyph, ProofGlyph } from "@/components/ui/glyphs"
import { Icon, Svg } from "@/components/ui/icons"
import { ExitTrack } from "@/components/ui/track"
import { Reveal } from "@/components/ui/reveal"

function SectionHead({ kicker, title, body, id }: { kicker: string; title: string; body?: string; id?: string }) {
  return (
    <Reveal again className="max-w-3xl">
      <div id={id} className="scroll-mt-24">
        <div className="text-sm font-semibold text-ink-3">{kicker}</div>
        <h2 className="tracking-display mt-3 text-[clamp(2.2rem,4.4vw,3.6rem)] font-medium leading-[1.04]">{title}</h2>
        {body && <p className="mt-5 text-lg leading-relaxed text-ink-2 md:text-xl">{body}</p>}
      </div>
    </Reveal>
  )
}

export function Problem() {
  return (
    <section className="band page px-5 py-20 md:px-8">
      <SectionHead
        kicker="Why this exists"
        title="In April 2026, a Solana pool lost $285M in 12 minutes."
        body="The attackers prepared for nine days, in public, on chain. Liquidity providers had no way to see it, so almost nobody left in time."
      />

      <div className="mt-14 grid gap-4 sm:grid-cols-3">
        {[
          [`$${HEADLINE.drained}M`, `taken in ${HEADLINE.minutes} minutes`],
          [`${HEADLINE.warningDays} days`, "of visible warning signs first"],
          [`${HEADLINE.lpReaction}%`, "of LP money left during the warning"],
        ].map(([v, l], i) => (
          <Reveal key={l} delay={90 * i} className="card p-7 md:p-10">
            <div className="tabular tracking-display text-5xl font-medium md:text-[4rem] md:leading-[1]">{v}</div>
            <div className="mt-3 text-ink-2 md:text-lg">{l}</div>
          </Reveal>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Reveal className="card p-5 md:p-7">
          <div className="text-lg font-semibold">Money in the pool stayed put while the warning was live</div>
          <div className="mt-1 text-ink-3">JLP supply in millions, March to April 2026</div>
          <div className="mt-6 h-[300px] md:h-[360px]">
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
        </Reveal>

        <Reveal delay={120} className="card p-0">
          <div className="border-b border-line px-6 py-5 text-lg font-semibold">What happened</div>
          <ol className="divide-y divide-line">
            {ATTACK.map((a) => (
              <li key={a.date} className="flex gap-4 px-6 py-5">
                <span className="tabular w-20 shrink-0 text-sm text-ink-3">{a.date}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 font-medium">
                    {a.title}
                    {a.pexiz && <span className="rounded-full bg-safe-soft px-2 py-0.5 text-[11px] font-semibold text-safe">Pexiz would exit here</span>}
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-ink-2">{a.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="border-t border-line px-5 py-4">
            <Link href="/replay" className="inline-flex items-center gap-1.5 text-sm font-semibold">Step through the timeline<Svg>{Icon.arrow}</Svg></Link>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

const STEPS = [
  {
    glyph: <EyeGlyph className="size-14" />,
    title: "We watch the admin keys",
    body: "Every protocol has people who can change its code. Pexiz reads, from chain, how many of them must agree and how long a change must wait.",
  },
  {
    glyph: <ProofGlyph className="size-14" />,
    title: "We set a status, with proof",
    body: "If the wait gets shorter, signers change, or someone signs approvals in advance, the status turns to Watch or Get out. Anyone can check why.",
  },
  {
    glyph: <DoorGlyph className="size-14" />,
    title: "Your vault leaves on its own",
    body: "When the status turns to Get out, your vault swaps to USDC in that same moment. No alerts to catch, no button to press.",
  },
]

export function How() {
  return (
    <section className="border-y border-line bg-paper">
      <div className="band page px-5 py-20 md:px-8">
        <SectionHead id="how" kicker="How it works" title="Three steps, all on chain." />
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={90 * i} className="flex flex-col rounded-[var(--radius-card)] border border-line bg-cream p-7 md:min-h-[22rem] md:p-9">
              <div className="flex items-center justify-between">
                {s.glyph}
                <span className="tabular text-sm font-semibold text-ink-3">Step {i + 1}</span>
              </div>
              <h3 className="mt-auto pt-10 text-2xl font-semibold tracking-tight md:text-[1.75rem]">{s.title}</h3>
              <p className="mt-3 leading-relaxed text-ink-2 md:text-lg">{s.body}</p>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-10 text-center text-sm text-ink-2">
          Every status, and what each one does to your vault, is on the{" "}
          <Link href="/app/monitor" className="font-semibold text-ink underline decoration-line-2 underline-offset-4 hover:decoration-ink">protocol monitor</Link>.
        </Reveal>
      </div>
    </section>
  )
}

const EXAMPLES = [
  { title: "Changes wait a day", note: "The usual setup: an approved change sits for 24 hours.", delay: 24 * 3600, flag: "green" },
  { title: "Changes land at once", note: "No delay at all, which is how April 2026 started.", delay: 0, flag: "exposed" },
] as const

/** Time to exit, explained on two made-up protocols; real ones are in the app. */
export function Venues() {
  return (
    <section className="band page px-5 py-20 md:px-8">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <SectionHead id="venues" kicker="The one number" title="Would you have time to leave?" body="Every protocol can be changed by the people who hold its keys. What matters is whether an approved change has to wait longer than you need to get out." />
        <LinkButton href="/app/monitor" className="shrink-0"><Svg>{Icon.monitor}</Svg>Check a real protocol</LinkButton>
      </div>
      <div className="mt-14 grid gap-5 lg:grid-cols-2">
        {EXAMPLES.map((e, i) => (
          <Reveal key={e.title} delay={110 * i} className="card p-7 md:p-10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xl font-semibold md:text-2xl">{e.title}</div>
                <p className="mt-2 text-ink-2 md:text-lg">{e.note}</p>
              </div>
              <span className="shrink-0 rounded-md border border-line-2 px-2 py-0.5 text-xs font-semibold text-ink-3">Example</span>
            </div>
            <ExitTrack delaySecs={e.delay} flag={e.flag} className="mt-10" />
          </Reveal>
        ))}
      </div>
    </section>
  )
}

export function TryIt() {
  const { data } = useCanary(30_000)
  return (
    <section className="band page px-5 py-20 md:px-8">
      <Reveal className="card grid gap-12 p-7 md:p-14 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div>
          <div className="text-sm font-semibold text-ink-3">Try it now</div>
          <h2 className="tracking-display mt-3 text-[clamp(2.2rem,4.4vw,3.6rem)] font-medium leading-[1.04]">A live test vault, with free test funds.</h2>
          <p className="mt-5 text-lg text-ink-2 md:text-xl">Connect any Solana wallet, get test USDC from the built-in faucet, and watch the vault react to a real multisig.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <LinkButton href="/app/vault/canary" className="h-12 px-5"><Svg>{Icon.vault}</Svg>Open the test vault</LinkButton>
            <LinkButton href="/docs" variant="line" className="h-12 px-5"><Svg>{Icon.book}</Svg>Read the docs</LinkButton>
          </div>
        </div>
        <div className="rounded-[var(--radius-card)] border border-line bg-cream p-6 md:p-7">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DoorGlyph className="size-12" />
              <div>
                <div className="text-lg font-semibold">Canary Pool</div>
                <div className="text-sm text-ink-3">Test vault</div>
              </div>
            </div>
            {data ? <FlagPill flag={data.venue.flag} /> : <Skeleton className="h-6 w-20 rounded-md" />}
          </div>
          <div className="mt-6 grid grid-cols-3 gap-2.5">
            {[
              ["Approvals", data ? `${data.venue.threshold} of ${data.venue.members.length}` : null],
              ["Change delay", data ? duration(data.venue.timeLockSecs) : null],
              ["Deposited", data ? `$${(data.vaultUsdc + data.vaultLp).toLocaleString("en-US")}` : null],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-paper p-4">
                <div className="text-xs text-ink-3">{k}</div>
                <div className="tabular mt-1.5 text-lg font-semibold">{v ?? <Skeleton className="h-5 w-12" />}</div>
              </div>
            ))}
          </div>
          {data?.reasons[0] && <p className="mt-4 text-sm text-ink-2">Right now: {data.reasons[0]}.</p>}
        </div>
      </Reveal>
    </section>
  )
}

const FAQ = [
  ["What is Pexiz?", "A vault for liquidity providers on Solana. It holds your LP token while the protocol is safe, and swaps it to USDC by itself when the protocol's admin keys get weaker."],
  ["What is an admin takeover?", "Most protocols can be upgraded by a group of key holders. If attackers gain control of enough of those keys, they can change the code and take the pool's money. Pexiz watches for the signs that come first."],
  ["Does Pexiz hold my funds?", "Your deposit sits in an on-chain vault program, not with a company. You can withdraw any time, in every state, with your own wallet."],
  ["What happens when the status turns to Get out?", "The same transaction that changes the status also sells the vault's LP token for USDC. You keep your share of that USDC and can withdraw it or vote to go back in later."],
  ["Can Pexiz stop a hack?", "No. It cannot change what the attackers do. It gets your money out while there is still time, before an approved change can take effect."],
  ["Does Pexiz pay for losses?", "No. Pexiz is not insurance. A false alarm can cost you yield and swap fees, and an exit can lose up to 1% to slippage. It lowers the chance of being caught; it does not cover what it misses."],
  ["What if everyone tries to leave at once?", "The vault leaves in the same transaction as the warning, before people can react. If the pool cannot take it all at once, it leaves in steps, each at no worse than 1% below the pool's own price. Inside the vault there is no queue: everyone gets their exact share."],
  ["Is it on mainnet?", "Not yet. The vault and oracle run on Solana devnet with test funds. The protocol board reads real mainnet data today, for perps and prediction markets."],
  ["Why is each vault capped at $10M?", "Selling more than about $10M of JLP at once moves the price sharply. The cap keeps an exit fast and fair for everyone in the vault."],
] as const

export function Faq() {
  return (
    <section className="band page px-5 py-20 md:px-8">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.5fr]">
      <SectionHead id="faq" kicker="FAQ" title="Common questions" />
      <Reveal className="divide-y divide-line border-y border-line">
        {FAQ.map(([q, a]) => (
          <details key={q} className="group py-6">
            <summary className="flex list-none items-center justify-between gap-4 text-lg font-medium md:text-xl">
              {q}
              <span className="grid size-8 shrink-0 place-items-center rounded-full border border-line-2 text-ink-2 group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 max-w-2xl leading-relaxed text-ink-2 md:text-lg">{a}</p>
          </details>
        ))}
      </Reveal>
      </div>
    </section>
  )
}

export function Footer() {
  return (
    <footer className="border-t border-line bg-paper">
      <div className="page grid gap-10 px-5 py-14 md:grid-cols-[1.5fr_1fr_1fr] md:px-8">
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
        <div className="page flex flex-wrap justify-between gap-3 px-5 py-5 text-xs text-ink-3 md:px-8">
          <span>© 2026 Pexiz · Built on Solana</span>
          <span>Devnet beta</span>
        </div>
      </div>
    </footer>
  )
}
