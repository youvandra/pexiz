import { PageHead, Shell } from "@/components/landing/Shell"
import { FlagPill } from "@/components/ui/kit"
import { ASSUMED_EXIT_SECS, DEVNET, MEASURED_ON, explorer } from "@/data/facts"
import { duration, short } from "@/lib/format"

const RULES = [
  ["red", "Changes no longer wait long enough, fewer approvals are needed, more than a third of signers were swapped in a week, someone else now controls upgrades, or a Watch was left open for 48 hours. The vault moves to USDC."],
  ["exposed", "The protocol is set up so approved changes land at once, or sooner than you could withdraw. Nothing new has happened, but there would be no warning. A vault never enters such a protocol."],
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

const TOC = [...SECTIONS.map((s) => [s.id, s.title]), ["status", "Status rules"], ["api", "Feed API"], ["addresses", "Addresses"]]

const ENDPOINTS = [
  ["GET /api/v1/venues", "Every watched protocol: status, reason, time to exit, change delay, approvals, upgrade key, queued upgrades, signers able to sign in advance. Read from mainnet every five minutes."],
  ["GET /api/v1/venues/{id}", "One protocol, with its admin history from the multisig's own record."],
  ["GET /api/v1/tokens", "Collateral tokens (LP, staked SOL, bridged, stablecoins, tokenized stocks): every key that can mint, freeze, move or pause each one, who holds it and how long a change through it waits. Read hourly."],
  ["GET /api/v1/tokens/{id}", "One token, with every change to those keys since Pexiz started watching."],
  ["GET /api/v1/check/{address}", "Any program or token mint, read on request. For a token: every key that can mint, freeze, move or pause it, and who holds each one. A first read can take a minute: 202 means still reading, ask again after retryAfterSecs."],
] as const

const EXAMPLE = `{
  "id": "drift",
  "status": "amber",
  "statusLabel": "Watch",
  "reason": "Under 12 hours to notice and get out.",
  "exitWindowSecs": 1800,
  "changeDelaySecs": 3600,
  "approvalsNeeded": 4,
  "signers": 7,
  "authorityAsRecorded": true,
  "pendingUpgrades": [],
  "presigningSigners": 0,
  "readAt": 1793129737,
  "stale": false
}`

const VERIFY = `import { createPublicKey, verify } from "node:crypto"
import { PublicKey } from "@solana/web3.js"

const res = await fetch("https://<pexiz>/api/v1/venues")
const body = await res.text()
const signer = res.headers.get("x-pexiz-signer")!
const sig = Buffer.from(res.headers.get("x-pexiz-signature")!, "hex")
const der = Buffer.concat([
  Buffer.from("302a300506032b6570032100", "hex"),
  new PublicKey(signer).toBuffer(),
])
const key = createPublicKey({ key: der, format: "der", type: "spki" })
console.log(verify(null, Buffer.from(body), key, sig)) // true`

function Code({ children }: { children: string }) {
  return <pre className="mt-4 overflow-x-auto rounded-xl border border-line bg-paper p-4 font-mono text-xs leading-relaxed text-ink-2">{children}</pre>
}

function H2({ children }: { children: string }) {
  return <h2 className="text-2xl font-semibold tracking-tight md:text-[1.75rem]">{children}</h2>
}

export function Docs() {
  return (
    <Shell>
      <div className="page px-5 pb-24 pt-12 md:px-8 md:pb-32 md:pt-20">
        <PageHead
          kicker="Docs"
          title="How Pexiz reads a protocol."
          body="The rules the oracle follows, what the vault does with them, and where the test deployment lives."
        />
        <div className="mt-12 grid gap-14 border-t border-line pt-4 md:mt-16 lg:grid-cols-[13rem_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <nav className="sticky top-24 pt-6">
              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">On this page</div>
              <div className="mt-4 space-y-2.5 text-sm text-ink-2">
                {TOC.map(([id, t]) => (
                  <a key={id} href={`#${id}`} className="block transition-colors hover:text-ink">{t}</a>
                ))}
              </div>
            </nav>
          </aside>
          <div className="min-w-0 max-w-3xl">
            {SECTIONS.map((s) => (
              <section key={s.id} id={s.id} className="scroll-mt-24 border-b border-line py-10">
                <H2>{s.title}</H2>
                <p className="mt-4 leading-relaxed text-ink-2 md:text-lg">{s.body}</p>
              </section>
            ))}
            <section id="status" className="scroll-mt-24 border-b border-line py-10">
              <H2>Status rules</H2>
              <div className="mt-6 space-y-3">
                {RULES.map(([f, t]) => (
                  <div key={f} className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:gap-5">
                    <FlagPill flag={f} className="w-fit sm:mt-0.5" />
                    <span className="leading-relaxed text-ink-2">{t}</span>
                  </div>
                ))}
              </div>
            </section>
            <section id="api" className="scroll-mt-24 border-b border-line py-10">
              <H2>Feed API</H2>
              <p className="mt-4 leading-relaxed text-ink-2 md:text-lg">
                For lending markets, vault curators and keepers: the same reading the monitor shows, in a stable shape a program or a risk desk can act on. Free to read, open to any origin.
              </p>
              <dl className="card mt-6 divide-y divide-line p-0 text-sm">
                {ENDPOINTS.map(([k, v]) => (
                  <div key={k} className="px-5 py-4">
                    <dt className="font-mono text-xs font-semibold">{k}</dt>
                    <dd className="mt-1.5 leading-relaxed text-ink-2">{v}</dd>
                  </div>
                ))}
              </dl>
              <h3 className="mt-8 font-semibold">One protocol in the feed</h3>
              <Code>{EXAMPLE}</Code>
              <p className="mt-4 text-sm leading-relaxed text-ink-2">
                <span className="font-semibold text-ink">exitWindowSecs</span> is the change delay minus the 30 minutes a holder needs to leave; zero or less means no time. <span className="font-semibold text-ink">stale</span> turns true when the last read is older than three passes: treat the status as unknown, never as Safe.
              </p>
              <h3 className="mt-8 font-semibold">Every response is signed</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">
                <span className="font-mono text-xs">x-pexiz-signature</span> is an Ed25519 signature, in hex, over the exact bytes of the body; <span className="font-mono text-xs">x-pexiz-signer</span> is the key, as a Solana address. A keeper can relay body and signature to Solana's Ed25519 program in the same transaction as a lending instruction, so the program acts only on a reading Pexiz signed.
              </p>
              <Code>{VERIFY}</Code>
              <h3 className="mt-8 font-semibold">Webhooks</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">
                A receiver can be sent every change as it is found: a JSON body with the new events and the affected protocols and tokens, signed the same way.
              </p>
            </section>
            <section id="addresses" className="scroll-mt-24 py-10">
              <H2>Addresses</H2>
              <p className="mt-3 text-ink-2">The test deployment on Solana devnet.</p>
              <dl className="card mt-6 divide-y divide-line p-0 text-sm">
                {ADDRESSES.map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-4 px-5 py-3.5">
                    <dt className="text-ink-2">{k}</dt>
                    <dd><a className="font-mono text-xs underline decoration-line-2 underline-offset-4 hover:decoration-ink" target="_blank" rel="noreferrer" href={explorer(v, "devnet")} title={v}>{short(v, 8)}</a></dd>
                  </div>
                ))}
              </dl>
              <p className="mt-6 text-xs text-ink-3">Mainnet figures measured {MEASURED_ON}.</p>
            </section>
          </div>
        </div>
      </div>
    </Shell>
  )
}
