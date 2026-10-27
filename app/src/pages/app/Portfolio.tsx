import { Link } from "wouter"
import { useWallet } from "@solana/wallet-adapter-react"
import { usd } from "@/lib/format"
import { useVault } from "@/data/vault"
import { mine, useActivity } from "@/data/activity"
import { FlagPill, LinkButton, Skeleton } from "@/components/ui/kit"
import { DoorGlyph, KeysGlyph } from "@/components/ui/glyphs"
import { EmptyState, Faucet, PageHead, WalletButton } from "@/components/app/chrome"
import { EventList, StatTile } from "@/components/app/bits"

const fmt = (n: number, d = 2) => n.toLocaleString("en-US", { maximumFractionDigits: d })

export function Portfolio() {
  const { publicKey } = useWallet()
  const { data, refresh } = useVault()
  const { events } = useActivity()
  if (!publicKey) {
    return (
      <div>
        <PageHead title="Portfolio" />
        <EmptyState glyph={<KeysGlyph className="size-16" />} title="Connect a wallet" body="See your vault shares, what they are worth, and every deposit and withdrawal you made." action={<WalletButton className="h-11" />} />
      </div>
    )
  }
  const h = data?.holder
  const value = h && data ? (h.shares + h.voted) * data.pricePerShare : null
  const history = mine(events, publicKey)

  return (
    <div>
      <PageHead title="Portfolio" right={<Faucet owner={publicKey.toBase58()} onDone={refresh} variant="button" />} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="In vaults" value={value === null ? null : usd(value, 2)} sub={h ? `${fmt(h.shares + h.voted)} shares` : undefined} />
        <StatTile label="Test USDC" value={h ? fmt(h.usdc) : null} sub="In your wallet" />
        <StatTile label="Canary LP" value={h ? fmt(h.lp) : null} sub="Withdrawn before an exit" />
        <StatTile label="SOL" value={h ? fmt(h.sol, 3) : null} sub="For network fees" />
      </div>

      <h2 className="mt-12 text-lg font-semibold">Positions</h2>
      <div className="mt-4">
        {!data || !h ? (
          <Skeleton className="h-24 w-full rounded-[var(--radius-card)]" />
        ) : h.shares + h.voted > 0 ? (
          <Link href="/vault/canary" className="card flex w-full items-center gap-4 p-5 transition-colors hover:bg-sand/40">
            <DoorGlyph className="size-11" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">Canary Pool</div>
              <div className="text-sm text-ink-2">{data.vault.exited ? "Exited to USDC" : "Holding Canary LP"}{h.voted > 0 && ` · ${fmt(h.voted)} shares voting to re-enter`}</div>
            </div>
            <FlagPill flag={data.venue.flag} live />
            <div className="tabular text-right font-semibold">{usd(value!, 2)}</div>
          </Link>
        ) : (
          <EmptyState glyph={<DoorGlyph className="size-14" />} title="No positions yet" body="Deposit test USDC into the canary vault to see it leave on its own when the flag turns red." action={<LinkButton href="/vault/canary">Open the canary vault</LinkButton>} />
        )}
      </div>

      <h2 className="mt-12 text-lg font-semibold">Your history</h2>
      <div className="card mt-4 p-0">
        <EventList events={history} empty="Nothing yet. Your deposits and withdrawals show up here." />
      </div>
    </div>
  )
}
