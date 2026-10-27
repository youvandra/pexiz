import { useState } from "react"
import { cn } from "@/lib/cn"
import { Skeleton } from "@/components/ui/kit"
import type { WatchEvent } from "@/data/watch"

const TONE: Record<WatchEvent["tone"], string> = { bad: "bg-danger", good: "bg-safe", info: "bg-line-2" }
const day = (unix: number) => new Date(unix * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
const SHOWN = 8

/** A protocol's admin history, newest first: signers, approvals, delay, upgrades. */
export function ChangeList({ events, note, className }: { events: WatchEvent[] | null; note?: string; className?: string }) {
  const [all, setAll] = useState(false)
  const list = events && (all ? events : events.slice(0, SHOWN))
  return (
    <section className={cn("card p-0", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-4">
        <h2 className="font-semibold">What changed</h2>
        <span className="text-xs text-ink-3">Signers, approvals, delay and upgrades, read from chain</span>
      </div>
      {!list ? (
        <div className="p-5"><Skeleton className="h-24 w-full" /></div>
      ) : list.length === 0 ? (
        <p className="px-5 py-6 text-sm text-ink-2">Nothing recorded on chain.</p>
      ) : (
        <ol className="divide-y divide-line text-sm">
          {list.map((e) => (
            <li key={e.key} className="grid grid-cols-[6.5rem_1fr] gap-x-4 px-5 py-3.5 sm:grid-cols-[7.5rem_1fr]">
              <span className="tabular text-ink-3">{day(e.at)}</span>
              <div className="flex min-w-0 items-start gap-2.5">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${TONE[e.tone]}`} aria-hidden />
                <div className="min-w-0 break-words">
                  <div className={e.tone === "bad" ? "font-semibold text-danger" : "font-medium"}>{e.title}</div>
                  {e.detail && <div className="mt-0.5 text-ink-3">{e.detail}</div>}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      {(events && events.length > SHOWN) || note ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
          {events && events.length > SHOWN ? <button onClick={() => setAll((a) => !a)} className="text-sm font-semibold">{all ? "Show fewer" : `Show all ${events.length}`}</button> : <span />}
          {note && <span className="text-xs text-ink-3">{note}</span>}
        </div>
      ) : null}
    </section>
  )
}
