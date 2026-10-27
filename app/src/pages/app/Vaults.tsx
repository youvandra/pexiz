import { Link } from "wouter"
import { useWallet } from "@solana/wallet-adapter-react"
import { duration, usd } from "@/lib/format"
import { VAULTS } from "@/data/facts"
import { useVault, AUM_CAP } from "@/data/vault"
import { useBoard } from "@/data/chain"
import { FlagPill, Skeleton, flagLabel } from "@/components/ui/kit"
import { DoorGlyph, EyeGlyph, BellGlyph } from "@/components/ui/glyphs"
import { PageHead } from "@/components/app/chrome"
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
      <PageHead title="Vaults" sub="Hold an LP position that leaves on its own the moment a venue's admin can move faster than you." />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Your deposits"
          value={!publicKey ? "—" : h && data ? usd(h.shares * data.pricePerShare, 2) : null}
          sub={!publicKey ? "Connect a wallet to see yours" : h ? `${h.shares.toLocaleString("en-US", { maximumFractionDigits: 2 })} shares` : "Reading…"}
        />
        <StatTile label="Protected in vaults" value={data ? usd(data.nav) : null} sub="Test USDC on devnet" />
        <StatTile label="Venues watched" value={rows ? rows.length + 1 : null} sub="5 on mainnet, 1 on-chain oracle" />
      </div>

      <h2 className="mt-12 text-lg font-semibold">All vaults</h2>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {VAULTS.map((v) => {
          const live = v.status === "live"
          const flag = live ? data?.venue.flag : jlp?.assessment
          return (
            <Link key={v.id} href={`/vault/${v.id}`} className="card group relative flex flex-col overflow-hidden p-6 transition-transform hover:-translate-y-0.5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  {live ? <DoorGlyph className="size-12" /> : <EyeGlyph className="size-12" tint="#E9C22E" />}
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
                    <Metric k="Venue reads" v={jlp ? flagLabel(jlp.assessment) : null} />
                    <Metric k="Exit window" v={jlp?.exitWindowSecs !== undefined ? duration(jlp.exitWindowSecs) : jlp ? "—" : null} />
                    <Metric k="Cap" v="$10M" />
                  </>
                )}
              </div>
              <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold">
                {live ? "Open vault" : "See the venue"} <Arrow className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          )
        })}
      </div>

      <h2 className="mt-14 text-lg font-semibold">How a vault protects you</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {[
          { g: <EyeGlyph className="size-11" />, t: "It watches the admin", b: "Every update re-reads the venue's multisig, timelock and signers from chain." },
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
