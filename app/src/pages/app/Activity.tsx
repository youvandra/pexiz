import { useState } from "react"
import { cn } from "@/lib/cn"
import { useActivity, type EventKind } from "@/data/activity"
import { PageHead } from "@/components/app/chrome"
import { EventList } from "@/components/app/bits"

const FILTERS: { id: string; label: string; kinds: EventKind[] | null }[] = [
  { id: "all", label: "All", kinds: null },
  { id: "flag", label: "Flag changes", kinds: ["flag", "exit", "reenter"] },
  { id: "money", label: "Deposits & withdrawals", kinds: ["deposit", "withdraw"] },
  { id: "votes", label: "Votes", kinds: ["vote", "unvote"] },
  { id: "checks", label: "Oracle checks", kinds: ["check"] },
]

export function Activity() {
  const { events, error } = useActivity()
  const [f, setF] = useState("all")
  const kinds = FILTERS.find((x) => x.id === f)!.kinds
  const shown = events && (kinds ? events.filter((e) => kinds.includes(e.kind)) : events)
  return (
    <div>
      <PageHead title="Activity" sub="Every oracle update, exit and deposit on the canary vault, read from devnet." />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((x) => (
          <button key={x.id} onClick={() => setF(x.id)} className={cn("h-9 rounded-full border px-3.5 text-sm font-medium transition-colors", f === x.id ? "border-ink bg-ink text-cream" : "border-line bg-paper text-ink-2 hover:text-ink")}>
            {x.label}
          </button>
        ))}
      </div>
      <div className="card p-0">
        {error && !events ? (
          <div className="px-5 py-10 text-center text-sm text-ink-2">Devnet did not answer. Retrying every 30 seconds.</div>
        ) : (
          <EventList events={shown} empty="Nothing in this view yet." />
        )}
      </div>
    </div>
  )
}
