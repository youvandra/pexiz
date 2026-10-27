// The hero's picture of the product: the monitor as it stands, drawn at the
// size it is used rather than shrunk into a card.
//
// The numbers are the snapshot in `data/facts`: what each protocol's admin
// setup was when it was last measured from mainnet. It is a still, marked as
// an example, because a live read can move a status after this page is built.
// No wallet, no RPC, nothing to click; the live board is in the app.
//
// It lays itself out by its own width, through container queries, rather
// than the window's: a list in a phone-sized box, a table from 30rem, the
// change-delay column from 40rem, and the app's sidebar from 52rem.
import { cn } from "@/lib/cn"
import { duration } from "@/lib/format"
import { ASSUMED_EXIT_SECS, VENUES } from "@/data/facts"
import { assess } from "@/data/assess"
import { FlagPill, VenueLogo, flagLabel } from "@/components/ui/kit"
import { Dur } from "@/components/ui/meter"
import { Icon, Svg } from "@/components/ui/icons"
import type { Assessment } from "@/data/assess"

const NAV: [string, keyof typeof Icon, boolean][] = [
  ["Vaults", "vault", false],
  ["Monitor", "monitor", true],
  ["Portfolio", "portfolio", false],
  ["Activity", "activity", false],
]

interface Row {
  name: string
  kind: string
  logo: string
  delay: string
  exit: string
  exitSecs?: number
  delaySecs?: number
  flag: Assessment
}

/** The canary first, then the protocols, exactly as the monitor orders them. */
const ROWS: Row[] = [
  { name: "Canary Pool", kind: "Test protocol", logo: "", delay: "0s", exit: "No time", delaySecs: 0, flag: "red" },
  ...VENUES.map((v): Row => {
    const { assessment } = assess(v, v.snapshot.timeLockSecs)
    const secs = v.snapshot.timeLockSecs
    const window = secs === undefined ? undefined : secs - ASSUMED_EXIT_SECS
    return {
      name: v.name,
      kind: v.kind,
      logo: v.logo,
      delay: secs === undefined ? "None" : duration(secs),
      exit: window === undefined ? "—" : window > 0 ? duration(window) : "No time",
      exitSecs: window,
      delaySecs: secs,
      flag: assessment,
    }
  }),
]

/** The first few rows only, so the board fits the first screen. */
const SHOWN = 5

const MORE = `And ${ROWS.length - SHOWN} more in the app`

const FILTERS: (Assessment | "all")[] = ["all", "green", "amber", "exposed", "red"]

export function Console({ className }: { className?: string }) {
  return (
    <div className={cn("@container card overflow-hidden p-0", className)} aria-hidden>
      <div className="flex">
        {/* The app's own left column. */}
        <div className="hidden w-[12rem] shrink-0 flex-col border-r border-line bg-paper px-3.5 py-4 @min-[52rem]:flex">
          <div className="flex items-center gap-2 px-2 text-[0.95rem] font-semibold tracking-tight">
            <svg viewBox="0 0 1624 2077" className="size-[0.95rem]" aria-hidden>
              <path fill="currentColor" fillRule="evenodd" d="M880 42h636a28 28 0 0 1 28 28v1399a28 28 0 0 1-28 28H779L130 2016a28 28 0 0 1-66-20V310a28 28 0 0 1 12-23L866 47a28 28 0 0 1 14-5ZM1477 90h-177c-320 0-549 90-549 480v830a26 26 0 0 0 26 26h674a26 26 0 0 0 26-26V90Z" />
            </svg>
            pexiz
          </div>
          <div className="mt-7 flex flex-col gap-1">
            {NAV.map(([label, icon, here]) => (
              <div key={label} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium", here ? "bg-ink text-cream" : "text-ink-2")}>
                <Svg>{Icon[icon]}</Svg>
                {label}
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          {/* The app's own top bar. */}
          <div className="flex items-center justify-end gap-3 border-b border-line px-4 py-2.5 @min-[30rem]:px-5 @min-[30rem]:py-3">
            <span className="flex items-center gap-2 text-sm text-ink-2"><span className="live-dot text-warn" />Devnet</span>
            <span className="btn btn-ink h-9 rounded-xl px-3.5 text-sm"><Svg className="size-4">{Icon.wallet}</Svg>Connect wallet</span>
          </div>

          <div className="p-4 @min-[30rem]:p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="tracking-display text-xl font-medium @min-[30rem]:text-2xl">Monitor</h3>
                <p className="mt-1 max-w-sm text-sm text-ink-2">Who controls each protocol, and whether you would have time to leave if they changed it.</p>
              </div>
              <span className="shrink-0 rounded-md border border-line-2 px-2 py-0.5 text-xs font-semibold text-ink-3">Example</span>
            </div>

            {/* One line of filters; on a narrow board the last ones run off the
                edge rather than wrapping into a block. */}
            <div className="-mx-4 mt-4 flex gap-1.5 overflow-hidden px-4 @min-[30rem]:mx-0 @min-[30rem]:mt-5 @min-[30rem]:flex-wrap @min-[30rem]:px-0">
              {FILTERS.map((f) => (
                <span
                  key={f}
                  className={cn(
                    "flex h-8 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium",
                    f === "all" ? "border-ink bg-ink text-cream" : "border-line bg-paper text-ink-2",
                  )}
                >
                  {f === "all" ? "All" : flagLabel(f)}
                  <span className={cn("tabular text-xs", f === "all" ? "text-cream/70" : "text-ink-3")}>
                    {f === "all" ? ROWS.length : ROWS.filter((r) => r.flag === f).length}
                  </span>
                </span>
              ))}
            </div>

            <div className="mt-4 overflow-hidden rounded-[var(--radius-card)] border border-line bg-paper">
              {/* Narrow: one row per protocol, the status at the end. */}
              <ul className="divide-y divide-line @min-[30rem]:hidden">
                {ROWS.slice(0, SHOWN).map((r) => (
                  <li key={r.name} className="flex items-center gap-3 px-3.5 py-3">
                    <RowLogo r={r} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{r.name}</div>
                      <div className="truncate text-xs text-ink-3">Time to exit <span className="font-semibold text-ink-2">{r.exit}</span></div>
                    </div>
                    <FlagPill flag={r.flag} />
                  </li>
                ))}
                <li className="px-3.5 py-3 text-xs font-medium text-ink-3">{MORE}</li>
              </ul>

              <table className="hidden w-full text-left text-sm @min-[30rem]:table">
                <thead className="text-xs uppercase tracking-[0.08em] text-ink-3">
                  <tr className="border-b border-line">
                    <th className="px-3.5 py-3 font-medium">Protocol</th>
                    <th className="hidden whitespace-nowrap px-3.5 py-3 font-medium @min-[40rem]:table-cell">Change delay</th>
                    <th className="whitespace-nowrap px-3.5 py-3 font-medium">Time to exit</th>
                    <th className="whitespace-nowrap px-3.5 py-3 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {ROWS.slice(0, SHOWN).map((r) => (
                    <tr key={r.name}>
                      <td className="w-full max-w-0 px-3.5 py-2.5">
                        <div className="flex items-center gap-3">
                          <RowLogo r={r} />
                          <div className="min-w-0">
                            <div className="truncate font-semibold">{r.name}</div>
                            <div className="truncate text-ink-3">{r.kind}</div>
                          </div>
                        </div>
                      </td>
                      <td className="hidden whitespace-nowrap px-3.5 py-2.5 text-ink-2 @min-[40rem]:table-cell"><Dur text={r.delay} /></td>
                      <td className="px-3.5 py-2.5"><Dur text={r.exit} className="whitespace-nowrap font-semibold" /></td>
                      <td className="px-3.5 py-2.5"><div className="flex justify-end"><FlagPill flag={r.flag} /></div></td>
                    </tr>
                  ))}
                  <tr><td colSpan={4} className="px-3.5 py-3 text-xs font-medium text-ink-3">{MORE}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function RowLogo({ r }: { r: Row }) {
  return r.logo
    ? <VenueLogo src={r.logo} name={r.name} />
    : <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-cream text-ink-3"><Svg className="size-4">{Icon.vault}</Svg></span>
}
