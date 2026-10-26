import { Link } from "wouter"
import { ago, duration } from "@/lib/format"
import { MEASURED_ON } from "@/data/facts"
import { useBoard, useCanary, type BoardRow } from "@/data/chain"
import { FlagPill, Skeleton } from "@/components/ui/kit"
import { EyeGlyph } from "@/components/ui/glyphs"
import { PageHead } from "./Shell"

function windowText(r: BoardRow) {
  if (r.exitWindowSecs === undefined) return "—"
  return r.exitWindowSecs <= 0 ? "None" : duration(r.exitWindowSecs)
}

export function Board() {
  const { rows, readAt } = useBoard()
  const { data: canary } = useCanary()
  const counts = { green: 0, amber: 0, red: 0, unrated: 0 }
  rows?.forEach((r) => counts[r.assessment]++)

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHead
        title="Venue board"
        right={<span className="text-sm text-ink-3">{readAt ? `Read from mainnet ${ago(readAt)}` : "Reading mainnet…"}</span>}
      />

      <div className="grid gap-3 sm:grid-cols-4">
        {(["green", "amber", "red", "unrated"] as const).map((f) => (
          <div key={f} className="card p-4">
            <FlagPill flag={f} />
            <div className="tabular tracking-display mt-3 text-4xl font-medium">{rows ? counts[f] : <Skeleton className="h-9 w-10" />}</div>
          </div>
        ))}
      </div>

      <div className="card mt-6 flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <EyeGlyph className="size-11" />
          <div>
            <div className="font-semibold">Canary venue · on-chain flag</div>
            <div className="text-sm text-ink-3">Read from pexiz-oracle on devnet</div>
          </div>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <span className="text-ink-2">{canary ? `${canary.venue.threshold} of ${canary.venue.members.length} · ${duration(canary.venue.timeLockSecs)} delay` : <Skeleton className="h-4 w-36" />}</span>
          {canary ? <FlagPill flag={canary.venue.flag} live /> : <Skeleton className="h-6 w-20 rounded-full" />}
          <Link href="/vault" className="font-medium underline decoration-line-2 underline-offset-4 hover:decoration-ink">Vault</Link>
        </div>
      </div>

      <div className="card mt-6 overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.08em] text-ink-3">
            <tr className="border-b border-line">
              <th className="px-5 py-3.5 font-medium">Venue</th>
              <th className="px-5 py-3.5 font-medium">Admin</th>
              <th className="px-5 py-3.5 font-medium">Delay</th>
              <th className="px-5 py-3.5 font-medium">Exit window</th>
              <th className="px-5 py-3.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(rows ?? Array.from({ length: 5 }).map(() => null)).map((r, k) =>
              r ? (
                <tr key={r.venue.id} className="transition-colors hover:bg-sand/50">
                  <td className="px-5 py-4">
                    <Link href={`/venue/${r.venue.id}`} className="block">
                      <div className="font-semibold">{r.venue.name}</div>
                      <div className="text-ink-3">{r.venue.kind}</div>
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-ink-2">{r.threshold ? `${r.threshold} of ${r.members} signers` : r.venue.note}</td>
                  <td className="tabular px-5 py-4">{r.timeLockSecs !== undefined ? duration(r.timeLockSecs) : r.venue.admin === "squads-v3" ? "None" : "—"}</td>
                  <td className="tabular px-5 py-4 text-lg font-medium">{windowText(r)}</td>
                  <td className="px-5 py-4">
                    <div className="flex flex-col items-start gap-1">
                      <FlagPill flag={r.assessment} live={r.live} />
                      <span className="text-xs text-ink-3">{r.why}</span>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={k}><td colSpan={5} className="px-5 py-5"><Skeleton className="h-8 w-full" /></td></tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-ink-3">Exit window = delay − 30 min to notice and withdraw (assumption). Multisig venues are read live; others use the {MEASURED_ON} snapshot.</p>
    </div>
  )
}
