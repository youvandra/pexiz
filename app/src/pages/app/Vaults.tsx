import { Link } from "wouter"
import { useWallet } from "@solana/wallet-adapter-react"
import { duration, usd } from "@/lib/format"
import { VAULTS } from "@/data/facts"
import { useVault, AUM_CAP } from "@/data/vault"
import { useBoard } from "@/data/chain"
import { FlagPill, Skeleton, VenueLogo, flagLabel } from "@/components/ui/kit"
import { DoorGlyph, EyeGlyph, BellGlyph } from "@/components/ui/glyphs"
import { Faucet, PageHead, WalletButton } from "@/components/app/chrome"
import { cn } from "@/lib/cn"
import { StatTile } from "@/components/app/bits"
import { Arrow } from "@/components/landing/Hero"

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
          value={!publicKey ? "—" : h && data ? usd(h.shares * data.pricePerShare, 2) : null}
          sub={!publicKey ? "Connect a wallet to see yours" : h ? `${h.shares.toLocaleString("en-US", { maximumFractionDigits: 2 })} shares` : "Reading…"}
        />
        <StatTile label="Protected in vaults" value={data ? usd(data.nav) : null} sub="Test USDC on devnet" />
        <StatTile label="Protocols watched" value={rows ? rows.length : null} sub="Read live from Solana mainnet" />
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
                    <div className="text-sm text-ink-3">{v.network === "devnet" ? "Solana devnet" : "Solana mainnet"} · holds {v.holds}</div>
                  </div>
                </div>
                {live ? (flag ? <FlagPill flag={flag} live /> : <Skeleton className="h-6 w-20 rounded-full" />) : <span className="rounded-full bg-sand px-2.5 py-1 text-xs font-semibold text-ink-2">Planned</span>}
              </div>
              <p className="mt-5 text-sm text-ink-2">{v.blurb}</p>
              <div className="mt-6 grid grid-cols-3 gap-4 border-t border-line pt-5">
                {live ? (
                  <>
                    <Metric k="TVL" v={data ? usd(data.nav) : null} />
                    <Metric k="State" v={data ? (data.vault.exited ? "In USDC" : "In LP") : null} />
                    <Metric k="Cap used" v={data ? `${((data.nav / AUM_CAP) * 100).toFixed(data.nav / AUM_CAP < 0.01 ? 3 : 1)}%` : null} />
                  </>
                ) : (
                  <>
                    <Metric k="Protocol reads" v={jlp ? flagLabel(jlp.assessment) : null} />
                    <Metric k="Exit window" v={jlp?.exitWindowSecs !== undefined ? duration(jlp.exitWindowSecs) : jlp ? "—" : null} />
                    <Metric k="Cap" v="$10M" />
                  </>
                )}
              </div>
              <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold">
                {live ? "Open vault" : "See the protocol"} <Arrow className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          )
        })}
      </div>

      <h2 className="mt-14 text-lg font-semibold">How a vault protects you</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {[
          { g: <EyeGlyph className="size-11" />, t: "It watches the admin", b: "Every update re-reads the protocol's signers and change delay from chain." },
          { g: <DoorGlyph className="size-11" />, t: "It leaves on red", b: "The exit lands in the same transaction as the flag. No one has to be awake." },
          { g: <BellGlyph className="size-11" tint="#C564C4" />, t: "You decide the way back", b: "Withdraw any time. Re-entry needs a Safe flag and half the shares voting yes." },
        ].map((x) => (
          <div key={x.t} className="card flex gap-4 p-5">
            {x.g}
            <div>
              <div className="font-semibold">{x.t}</div>
              <p className="mt-1 text-sm text-ink-2">{x.b}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Metric({ k, v }: { k: string; v: string | null }) {
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
    { title: "Connect a wallet", body: "Phantom, Solflare or Backpack, set to devnet.", done: !!publicKey, action: <WalletButton className="h-9 px-3 text-xs" /> },
    { title: "Get test USDC", body: "Free from the faucet, once every 12 hours.", done: !!h && h.usdc > 0, action: publicKey ? <Faucet owner={publicKey.toBase58()} onDone={refresh} variant="button" /> : null },
    { title: "Deposit into a vault", body: open ? "The canary vault is open for deposits." : "Opens while the vault reads Safe to stay.", done: false, action: <Link href="/vault/canary" className="text-sm font-semibold underline decoration-line-2 underline-offset-4">Open vault</Link> },
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
