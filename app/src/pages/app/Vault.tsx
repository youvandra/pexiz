import { ago, duration, short } from "@/lib/format"
import { DEVNET, explorer } from "@/data/facts"
import { useCanary } from "@/data/chain"
import { FlagPill, Skeleton } from "@/components/ui/kit"
import { DoorGlyph } from "@/components/ui/glyphs"
import { PageHead } from "./Shell"

export function VaultPage() {
  const { data, error } = useCanary()
  const v = data?.venue
  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHead title="Escape vault" right={<span className="text-sm text-ink-3">{data ? `Devnet · read ${ago(data.readAt)}` : error ? "Devnet unreachable" : "Reading devnet…"}</span>} />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="card relative overflow-hidden p-6 md:p-8">
          <DoorGlyph className="absolute -right-4 -top-4 size-36 opacity-90" />
          <div className="text-sm text-ink-2">Canary venue vault</div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {data ? <FlagPill flag={v!.flag} live className="text-sm" /> : <Skeleton className="h-7 w-24 rounded-full" />}
            <span className="text-sm font-medium">{data ? (data.vault.exited ? "Exited to USDC" : "Holding the LP token") : ""}</span>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-6">
            <div>
              <div className="text-xs uppercase tracking-[0.08em] text-ink-3">LP held</div>
              <div className="tabular tracking-display mt-1 text-5xl font-medium">{data ? data.vaultLp.toLocaleString("en-US") : <Skeleton className="h-12 w-28" />}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.08em] text-ink-3">USDC held</div>
              <div className="tabular tracking-display mt-1 text-5xl font-medium">{data ? data.vaultUsdc.toLocaleString("en-US") : <Skeleton className="h-12 w-28" />}</div>
            </div>
          </div>
          <div className="mt-8 rounded-xl bg-sand/70 p-4 text-sm text-ink-2">
            Exit fires when the oracle flag turns red. The crank sends <span className="font-mono text-ink">oracle.update</span> and <span className="font-mono text-ink">vault.exit</span> in one transaction.
          </div>
        </div>

        <div className="card p-6">
          <div className="font-semibold">Venue under watch</div>
          <dl className="mt-4 space-y-3 text-sm">
            {[
              ["Signers", v ? `${v.threshold} of ${v.members.length}` : null],
              ["Delay", v ? duration(v.timeLockSecs) : null],
              ["Pre-signing accounts", v ? String(v.presigners.length) : null],
              ["Times exited", data ? String(data.vault.exits) : null],
            ].map(([k, val]) => (
              <div key={k} className="flex justify-between">
                <dt className="text-ink-2">{k}</dt>
                <dd className="tabular font-medium">{val ?? <Skeleton className="h-4 w-12" />}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-6 border-t border-line pt-4">
            <div className="text-xs uppercase tracking-[0.08em] text-ink-3">Why the flag is {v?.flag ?? "…"}</div>
            <ul className="mt-2 space-y-2 text-sm text-ink-2">
              {data?.reasons.length ? data.reasons.map((r) => <li key={r}>{r}</li>) : <li>{data ? "No condition holds." : <Skeleton className="h-4 w-full" />}</li>}
            </ul>
          </div>
        </div>
      </div>

      <div className="card mt-4 p-0">
        <div className="border-b border-line px-5 py-3.5 text-sm font-semibold">On-chain accounts</div>
        <dl className="divide-y divide-line text-sm">
          {([["Oracle venue", DEVNET.venue], ["Escape vault", DEVNET.escapeVault], ["Squads multisig", DEVNET.multisig], ["Signer nonce (demo)", DEVNET.nonce]] as const).map(([k, a]) => (
            <div key={k} className="flex justify-between gap-4 px-5 py-3.5">
              <dt className="text-ink-2">{k}</dt>
              <dd><a href={explorer(a, "devnet")} target="_blank" rel="noreferrer" className="font-mono text-xs underline decoration-line-2 underline-offset-4">{short(a, 6)}</a></dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
