import { Nav } from "@/components/landing/Nav"
import { Display, FlagPill } from "@/components/ui/kit"
import { ASSUMED_EXIT_SECS, DEVNET, MEASURED_ON, explorer } from "@/data/facts"
import { duration, short } from "@/lib/format"

const RULES = [
  ["red", "Changes no longer wait long enough, fewer approvals are needed, more than a third of signers were swapped in a week, someone else now controls upgrades, or a Watch was left open for 48 hours. The vault moves to USDC."],
  ["amber", "A signer holds an account that keeps a signature ready to use later, or an approved upgrade is queued. Deposits pause; the vault stays in."],
  ["green", "Every check has passed for 7 days in a row. A queued upgrade that lands or is dropped returns to Safe at once."],
] as const

const SECTIONS = [
  {
    id: "time-to-exit",
    title: "Time to exit",
    body: `How long an approved change must wait before it takes effect, minus the ${duration(ASSUMED_EXIT_SECS)} you need to notice and withdraw. If it is zero or less, a change can land before you are out.`,
  },
  {
    id: "proofs",
    title: "Every status comes with proof",
    body: "Pexiz does not take anyone's word for it. Each update hands the program the protocol's multisig, its code account and any risky accounts it found; the program checks them itself and sets the status. A risk that has been proven stays on record until someone proves it is gone, so leaving evidence out changes nothing.",
  },
  {
    id: "vault",
    title: "The vault",
    body: "You deposit USDC and the vault holds the protocol's LP token for you. When the status turns to Get out, the same transaction that changes it also moves the vault to USDC. You can withdraw in every state. Going back in needs a Safe status and a yes vote from half of all shares.",
  },
  {
    id: "upgrades",
    title: "Queued upgrades",
    body: "Pexiz reads the protocol's approved proposals. If one would replace the code or hand over control, the status turns to Watch until it lands or is dropped. The vault does not leave on an upgrade alone: Pexiz cannot judge new code, only show that it is coming and when it can land.",
  },
  {
    id: "steps",
    title: "Leaving in steps",
    body: "If the pool cannot take the whole position at once, the vault leaves in steps. The first step closes deposits. Each step must get at least the pool's own price less 1%, enforced by the program, so nobody can force a fire sale. Inside the vault there is no queue: everyone owns their exact share.",
  },
  {
    id: "limits",
    title: "What Pexiz does not do",
    body: "It is not insurance and pays no compensation. A false alarm costs yield and swap fees, a step can lose up to 1%, and an attack that leaves the admin setup untouched is invisible to it. Each vault is capped at $10M so it can always get out quickly.",
  },
]

const ADDRESSES = [
  ["Oracle program", DEVNET.oracle],
  ["Vault program", DEVNET.vault],
  ["Test protocol", DEVNET.canary],
  ["Its multisig", DEVNET.multisig],
  ["Test vault", DEVNET.escapeVault],
] as const

export function Docs() {
  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto grid max-w-[1180px] gap-14 px-5 pb-28 pt-14 md:px-8 lg:grid-cols-[220px_1fr]">
        <aside className="hidden lg:block">
          <nav className="sticky top-24 space-y-2 text-sm text-ink-2">
            {[...SECTIONS.map((s) => [s.id, s.title]), ["status", "Status rules"], ["addresses", "Addresses"]].map(([id, t]) => (
              <a key={id} href={`#${id}`} className="block hover:text-ink">{t}</a>
            ))}
          </nav>
        </aside>
        <div className="min-w-0 max-w-2xl">
          <Display as="h1" top="How Pexiz" bottom="reads a protocol." className="text-5xl md:text-6xl" />
          {SECTIONS.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-24 border-b border-line py-10">
              <h2 className="text-2xl font-semibold tracking-tight">{s.title}</h2>
              <p className="mt-3 leading-relaxed text-ink-2">{s.body}</p>
            </section>
          ))}
          <section id="status" className="scroll-mt-24 border-b border-line py-10">
            <h2 className="text-2xl font-semibold tracking-tight">Status rules</h2>
            <div className="mt-5 space-y-3">
              {RULES.map(([f, t]) => (
                <div key={f} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-4">
                  <FlagPill flag={f} className="w-fit sm:mt-0.5" />
                  <span className="text-ink-2">{t}</span>
                </div>
              ))}
            </div>
          </section>
          <section id="addresses" className="scroll-mt-24 py-10">
            <h2 className="text-2xl font-semibold tracking-tight">Addresses</h2>
            <p className="mt-2 text-sm text-ink-2">The test deployment on Solana devnet.</p>
            <dl className="mt-5 divide-y divide-line text-sm">
              {ADDRESSES.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-3">
                  <dt className="text-ink-2">{k}</dt>
                  <dd><a className="font-mono text-xs underline decoration-line-2 underline-offset-4" target="_blank" rel="noreferrer" href={explorer(v, "devnet")} title={v}>{short(v, 8)}</a></dd>
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
