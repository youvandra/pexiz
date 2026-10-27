import { Nav } from "@/components/landing/Nav"
import { Display } from "@/components/ui/kit"
import { ASSUMED_EXIT_SECS, DEVNET, MEASURED_ON, explorer } from "@/data/facts"
import { duration } from "@/lib/format"

const RULES = [
  ["Red", "Timelock below the venue minimum, a lowered threshold, more than a third of signers replaced within 7 days, the upgrade authority moved, or a pre-signing warning left for 48 hours."],
  ["Amber", "A multisig member controls a live pre-signing account (a durable nonce), or an approved proposal will upgrade the program once its timelock ends. Deposits pause."],
  ["Green", "Every condition clear for 7 days. A lowered threshold that holds for a full week becomes the new baseline, then needs another clear week."],
] as const

const SECTIONS = [
  { id: "exit-window", title: "Exit window", body: `Admin delay minus the time a user needs to leave. The board assumes ${duration(ASSUMED_EXIT_SECS)} to notice and withdraw. Zero or less means an approved change can land before you are out.` },
  { id: "proofs", title: "Proof-carrying flags", body: "The oracle never trusts a reporter. Each update passes the multisig, the program data and any pre-signing accounts; the program recomputes the flag from them. A pre-signing account that proves itself is remembered until it is shown closed or out of member control, so leaving proofs out changes nothing." },
  { id: "vault", title: "Escape vault", body: "LPs deposit USDC; the vault holds the venue's LP token. When the flag turns red, anyone may call exit, and the crank sends it in the same transaction as the update. Withdrawals stay open in every state. Re-entry needs a green flag and a depositor vote." },
  { id: "upgrades", title: "Pending upgrades", body: "The oracle reads approved Squads proposals. If one would upgrade, re-authorise or close the program, the flag turns amber until it executes or is dropped, then returns to green at once. It never exits on an upgrade alone: it cannot judge new code, only show that it is coming and when it can land." },
  { id: "tranches", title: "Exits in tranches", body: "When the pool cannot absorb the whole position, the vault leaves in tranches. The first marks it exited and closes deposits; each tranche must return at least the pool's own value per LP token less 1%, checked by the program, so no caller can force a fire sale. Inside the vault there is no queue: everyone owns a pro-rata share." },
  { id: "limits", title: "What it cannot do", body: "Pexiz is not insurance and pays no compensation. A false alarm costs yield and swap fees; an exit can lose up to 1% per tranche; an attack that leaves the admin setup untouched is invisible to it. Exit capacity is finite, so each vault caps at $10M." },
]

export function Docs() {
  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto grid max-w-[1240px] gap-14 px-5 pb-28 pt-14 md:px-8 lg:grid-cols-[220px_1fr]">
        <aside className="hidden lg:block">
          <nav className="sticky top-24 space-y-2 text-sm text-ink-2">
            {[...SECTIONS.map((s) => [s.id, s.title]), ["rules", "Flag rules"], ["devnet", "Devnet"]].map(([id, t]) => (
              <a key={id} href={`#${id}`} className="block hover:text-ink">{t}</a>
            ))}
          </nav>
        </aside>
        <div className="max-w-2xl">
          <Display as="h1" top="How Pexiz" bottom="reads a venue." className="text-5xl md:text-6xl" />
          {SECTIONS.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-24 border-b border-line py-10">
              <h2 className="text-2xl font-semibold tracking-tight">{s.title}</h2>
              <p className="mt-3 leading-relaxed text-ink-2">{s.body}</p>
            </section>
          ))}
          <section id="rules" className="scroll-mt-24 border-b border-line py-10">
            <h2 className="text-2xl font-semibold tracking-tight">Flag rules</h2>
            <div className="mt-5 space-y-3">
              {RULES.map(([f, t]) => (
                <div key={f} className="card flex gap-4 p-4">
                  <span className={f === "Red" ? "w-16 shrink-0 font-semibold text-danger" : f === "Amber" ? "w-16 shrink-0 font-semibold text-warn" : "w-16 shrink-0 font-semibold text-safe"}>{f}</span>
                  <span className="text-ink-2">{t}</span>
                </div>
              ))}
            </div>
          </section>
          <section id="devnet" className="scroll-mt-24 py-10">
            <h2 className="text-2xl font-semibold tracking-tight">Devnet</h2>
            <dl className="mt-5 divide-y divide-line text-sm">
              {([["Oracle program", DEVNET.oracle], ["Vault program", DEVNET.vault], ["Canary venue program", DEVNET.canary], ["Squads multisig", DEVNET.multisig], ["Escape vault", DEVNET.escapeVault]] as const).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-3">
                  <dt className="text-ink-2">{k}</dt>
                  <dd><a className="font-mono text-xs underline decoration-line-2 underline-offset-4" target="_blank" rel="noreferrer" href={explorer(v, "devnet")}>{v}</a></dd>
                </div>
              ))}
            </dl>
            <p className="mt-6 text-xs text-ink-3">Mainnet figures measured {MEASURED_ON}.</p>
          </section>
        </div>
      </main>
    </div>
  )
}
