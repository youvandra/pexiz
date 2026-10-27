import { Link } from "wouter"
import type { ReactNode } from "react"
import { Dur } from "@/components/ui/meter"
import { useWallet } from "@solana/wallet-adapter-react"
import { amount, duration, money } from "@/lib/format"
import { VAULTS } from "@/data/facts"
import { useVault, AUM_CAP } from "@/data/vault"
import { useBoard } from "@/data/chain"
import { FlagPill, LinkButton, Skeleton, VenueLogo, flagLabel } from "@/components/ui/kit"
import { DoorGlyph } from "@/components/ui/glyphs"
import { Faucet, Icon, PageHead, Svg, WalletButton } from "@/components/app/chrome"
import { cn } from "@/lib/cn"
import { StatTile } from "@/components/app/bits"

export function Vaults() {
  const { publicKey } = useWallet()
  const { data } = useVault()
  const { rows } = useBoard()
  const h = data?.holder
  const jlp = rows?.find((r) => r.venue.id === "jupiter-perps")

  return (
    <div>
      <PageHead title="Vaults" sub="Deposit once. Your vault moves to USDC by itself if the protocol's admin keys get weaker." />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Your deposits"
          value={!publicKey ? "—" : h && data ? money(h.shares * data.pricePerShare) : null}
          sub={!publicKey ? "Connect a wallet to see yours" : h ? `${amount(h.shares)} shares` : "Reading…"}
        />
        <StatTile label="Total deposited" value={data ? money(data.nav, 0) : null} sub="By everyone, in all vaults" />
        <StatTile label="Watching" value={rows ? rows.length : null} unit="protocols" />
      </div>

      <GetStarted />

      <h2 className="mt-12 text-lg font-semibold">All vaults</h2>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {VAULTS.map((v) => {
          const live = v.status === "live"
          const flag = live ? data?.venue.flag : jlp?.assessment
          return (
            <Link key={v.id} href={`/vault/${v.id}`} className="card group relative flex flex-col overflow-hidden p-6 transition-transform">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  {v.logo ? <VenueLogo src={v.logo} name={v.name} className="size-12 rounded-2xl" /> : <span className="grid size-12 place-items-center rounded-2xl border border-line bg-paper"><DoorGlyph className="size-8" /></span>}
                  <div>
                    <div className="text-lg font-semibold">{v.name}</div>
                    <div className="text-sm text-ink-3">Holds {v.holds}</div>
                  </div>
                </div>
                {live ? (flag ? <FlagPill flag={flag} /> : <Skeleton className="h-6 w-20 rounded-md" />) : <span className="rounded-md border border-line-2 px-2 py-1 text-xs font-semibold text-ink-2">Planned</span>}
              </div>
              <p className="mt-5 text-sm text-ink-2">{v.blurb}</p>
              <div className="mt-6 grid grid-cols-3 gap-4 border-t border-line pt-5">
                {live ? (
                  <>
                    <Metric k="Total deposited" v={data ? money(data.nav, 0) : null} />
                    <Metric k="Now holding" v={data ? (data.vault.exited ? "USDC" : "Canary LP") : null} />
                    <Metric k="Space left" v={data ? money(AUM_CAP - data.nav, 0) : null} />
                  </>
                ) : (
                  <>
                    <Metric k="Status" v={jlp ? flagLabel(jlp.assessment) : null} />
                    <Metric k="Time to exit" v={jlp?.exitWindowSecs !== undefined ? <Dur text={duration(jlp.exitWindowSecs)} /> : jlp ? "—" : null} />
                    <Metric k="Deposit cap" v="$10M" />
                  </>
                )}
              </div>
              <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold">
                {live ? "Open vault" : "See the protocol"}<Svg>{Icon.arrow}</Svg>
              </span>
            </Link>
          )
        })}
      </div>

    </div>
  )
}

function Metric({ k, v }: { k: string; v: ReactNode | null }) {
  return (
    <div>
      <div className="text-xs text-ink-3">{k}</div>
      <div className="tabular mt-1 font-semibold">{v ?? <Skeleton className="h-5 w-14" />}</div>
    </div>
  )
}

/** First-run checklist; it goes away once the wallet holds vault shares. */
function GetStarted() {
  const { publicKey } = useWallet()
  const { data, refresh } = useVault()
  const h = data?.holder
  if (h && h.shares + h.voted > 0) return null
  const open = data?.venue.flag === "green" && !data.vault.exited
  const steps = [
    { title: "Connect a wallet", body: "Phantom, Solflare or Backpack, on devnet.", done: !!publicKey, action: <WalletButton className="h-9 px-3 text-xs" /> },
    { title: "Get test USDC", body: "Free from the faucet, once every 12 hours.", done: !!h && h.usdc > 0, action: publicKey ? <Faucet owner={publicKey.toBase58()} onDone={refresh} variant="button" /> : null },
    { title: "Deposit into a vault", body: open ? "The canary vault is open for deposits." : "Opens when the vault reads Safe.", done: false, action: <LinkButton href="/vault/canary" variant="line" className="h-9 px-3 text-xs"><Svg>{Icon.vault}</Svg>Open vault</LinkButton> },
  ]
  const next = steps.findIndex((s) => !s.done)
  return (
    <section className="card mt-6 p-0">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="font-semibold">Get started</h2>
        <span className="text-sm text-ink-3">{steps.filter((s) => s.done).length} of 3 done</span>
      </div>
      <ol className="grid divide-y divide-line md:grid-cols-3 md:divide-x md:divide-y-0">
        {steps.map((s, i) => (
          <li key={s.title} className={cn("flex flex-col gap-3 p-5", i !== next && !s.done && "opacity-60")}>
            <div className="flex items-center gap-3">
              <span className={cn("grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold", s.done ? "bg-safe-soft text-safe" : i === next ? "bg-ink text-cream" : "bg-sand text-ink-2")}>{s.done ? "✓" : i + 1}</span>
              <span className="font-semibold">{s.title}</span>
            </div>
            <p className="text-sm text-ink-2">{s.body}</p>
            {!s.done && i === next && s.action && <div>{s.action}</div>}
          </li>
        ))}
      </ol>
    </section>
  )
}
