import { useState } from "react"
import { useWallet } from "@solana/wallet-adapter-react"
import { cn } from "@/lib/cn"
import { usd } from "@/lib/format"
import { useSend } from "@/lib/solana"
import { AUM_CAP, buildDeposit, buildReenter, buildUnvote, buildVote, buildWithdraw, useVault, type VaultView } from "@/data/vault"
import { Button, FlagPill, Skeleton } from "@/components/ui/kit"
import { Faucet, WalletButton } from "./chrome"

type Tab = "deposit" | "withdraw" | "reenter"

const fmt = (n: number, d = 2) => n.toLocaleString("en-US", { maximumFractionDigits: d })

/** Deposit, withdraw and re-entry for the canary vault. */
export function ActionPanel() {
  const { data } = useVault()
  const exited = data?.vault.exited ?? false
  const [tab, setTab] = useState<Tab>("deposit")
  const tabs: [Tab, string][] = exited ? [["withdraw", "Withdraw"], ["reenter", "Re-entry vote"]] : [["deposit", "Deposit"], ["withdraw", "Withdraw"]]
  const active = tabs.some(([t]) => t === tab) ? tab : tabs[0][0]

  return (
    <div className="card overflow-hidden p-0">
      <Position />
      <div className="px-5 pt-4">
        <div className="grid grid-cols-2 rounded-xl bg-sand p-1 text-sm font-medium">
          {tabs.map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} className={cn("rounded-lg py-2 transition-colors", active === t ? "bg-paper text-ink shadow-sm" : "text-ink-2 hover:text-ink")}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-5">
        {!data ? <Skeleton className="h-48 w-full" /> : active === "deposit" ? <Deposit v={data} /> : active === "withdraw" ? <Withdraw v={data} /> : <Reentry v={data} />}
      </div>
    </div>
  )
}

function Position() {
  const { publicKey } = useWallet()
  const { data } = useVault()
  const h = data?.holder
  const value = h && data ? h.shares * data.pricePerShare : 0
  return (
    <div className="border-b border-line bg-sand/50 px-5 py-5">
      <div className="text-xs uppercase tracking-[0.08em] text-ink-3">Your position</div>
      {!publicKey ? (
        <div className="mt-2 text-sm text-ink-2">Connect a wallet to see your shares.</div>
      ) : !h ? (
        <Skeleton className="mt-2 h-9 w-32" />
      ) : (
        <>
          <div className="tabular tracking-display mt-1 text-4xl font-medium">{usd(value, 2)}</div>
          <div className="mt-1 text-sm text-ink-2">
            {fmt(h.shares)} shares{h.voted > 0 && ` · ${fmt(h.voted)} in re-entry vote`}
          </div>
        </>
      )}
    </div>
  )
}

function AmountInput({ value, onChange, max, unit, hint }: { value: string; onChange: (v: string) => void; max: number; unit: string; hint: string }) {
  return (
    <div className="rounded-xl border border-line bg-paper p-4 focus-within:border-ink">
      <div className="flex items-center gap-3">
        <input
          inputMode="decimal"
          placeholder="0"
          value={value}
          onChange={(e) => { const v = e.target.value.replace(",", "."); if (/^\d*\.?\d{0,6}$/.test(v)) onChange(v) }}
          className="tabular tracking-display min-w-0 flex-1 bg-transparent text-3xl font-medium outline-none placeholder:text-ink-3"
          aria-label={`Amount in ${unit}`}
        />
        <span className="rounded-full bg-sand px-3 py-1 text-sm font-semibold">{unit}</span>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-ink-3">
        <span>{hint}</span>
        <button onClick={() => onChange(String(Math.floor(max * 1e6) / 1e6))} disabled={max <= 0} className="font-semibold text-ink-2 hover:text-ink disabled:opacity-40">Max</button>
      </div>
    </div>
  )
}

function Line({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between text-sm"><span className="text-ink-2">{k}</span><span className="tabular font-medium">{v}</span></div>
}

function Blocked({ title, body, flag }: { title: string; body: string; flag?: VaultView["venue"]["flag"] }) {
  return (
    <div className="rounded-xl bg-sand/70 p-4">
      <div className="flex items-center gap-2 font-semibold">{flag && <FlagPill flag={flag} />}{title}</div>
      <p className="mt-1.5 text-sm text-ink-2">{body}</p>
    </div>
  )
}

function Deposit({ v }: { v: VaultView }) {
  const { publicKey } = useWallet()
  const { refresh } = useVault()
  const send = useSend()
  const [amt, setAmt] = useState("")
  const [busy, setBusy] = useState(false)
  const n = Number(amt) || 0
  const h = v.holder
  const room = Math.max(0, AUM_CAP - v.nav)
  const shares = v.supply > 0 && v.nav > 0 ? (n * v.supply) / v.nav : n

  if (v.venue.flag !== "green") {
    return <Blocked flag={v.venue.flag} title="Deposits paused" body="New deposits open only while the venue reads Safe. Withdrawals stay open in every state." />
  }
  const problem = !publicKey ? null : !h ? "Loading balances…" : n <= 0 ? "Enter an amount" : n > h.usdc ? "Not enough test USDC" : n > room ? "Above the vault cap" : h.sol < 0.001 ? "Need SOL for the fee" : null

  const go = async () => {
    if (!publicKey) return
    setBusy(true)
    const sig = await send(`Deposit ${fmt(n)} USDC`, await buildDeposit(publicKey, n))
    setBusy(false)
    if (sig) { setAmt(""); refresh() }
  }

  return (
    <div className="space-y-4">
      <AmountInput value={amt} onChange={setAmt} max={Math.min(h?.usdc ?? 0, room)} unit="USDC" hint={h ? `Wallet: ${fmt(h.usdc)} USDC` : "Wallet: —"} />
      <div className="space-y-2">
        <Line k="You receive" v={`${fmt(shares)} shares`} />
        <Line k="Vault buys" v={`${fmt(n)} Canary LP`} />
        <Line k="Exits to USDC" v="When the flag turns red" />
      </div>
      {!publicKey ? (
        <WalletButton className="h-12 w-full justify-center" label="Connect to deposit" />
      ) : (
        <Button className="h-12 w-full justify-center" disabled={!!problem || busy} onClick={go}>{busy ? "Depositing…" : problem ?? "Deposit"}</Button>
      )}
      {publicKey && h && h.usdc < 1 && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-lemon/15 p-3 text-sm">
          <span>No test USDC yet.</span>
          <Faucet owner={publicKey.toBase58()} variant="button" />
        </div>
      )}
    </div>
  )
}

function Withdraw({ v }: { v: VaultView }) {
  const { publicKey } = useWallet()
  const { refresh } = useVault()
  const send = useSend()
  const [amt, setAmt] = useState("")
  const [busy, setBusy] = useState(false)
  const h = v.holder
  const n = Number(amt) || 0
  const part = v.supply > 0 ? n / v.supply : 0
  const usdcOut = part * v.usdc
  const lpOut = part * v.lp
  const problem = !publicKey ? null : !h ? "Loading balances…" : n <= 0 ? "Enter shares" : n > h.shares ? "More than you hold" : h.sol < 0.001 ? "Need SOL for the fee" : null

  const go = async () => {
    if (!publicKey) return
    setBusy(true)
    const sig = await send(`Withdraw ${fmt(n)} shares`, await buildWithdraw(publicKey, n))
    setBusy(false)
    if (sig) { setAmt(""); refresh() }
  }

  return (
    <div className="space-y-4">
      <AmountInput value={amt} onChange={setAmt} max={h?.shares ?? 0} unit="Shares" hint={h ? `Available: ${fmt(h.shares)} shares` : "Available: —"} />
      <div className="space-y-2">
        {lpOut > 0 && <Line k="You receive" v={`${fmt(lpOut)} Canary LP`} />}
        {usdcOut > 0 && <Line k={lpOut > 0 ? "and" : "You receive"} v={`${fmt(usdcOut)} USDC`} />}
        {n === 0 && <Line k="You receive" v={v.vault.exited ? "USDC" : "Canary LP"} />}
        <Line k="Open while" v="Always, in every flag state" />
      </div>
      {!publicKey ? (
        <WalletButton className="h-12 w-full justify-center" label="Connect to withdraw" />
      ) : (
        <Button className="h-12 w-full justify-center" disabled={!!problem || busy} onClick={go}>{busy ? "Withdrawing…" : problem ?? "Withdraw"}</Button>
      )}
      {h && h.voted > 0 && <p className="text-xs text-ink-3">{fmt(h.voted)} shares sit in the re-entry vote. Take them back from the Re-entry tab to withdraw them.</p>}
    </div>
  )
}

function Reentry({ v }: { v: VaultView }) {
  const { publicKey } = useWallet()
  const { refresh } = useVault()
  const send = useSend()
  const [busy, setBusy] = useState(false)
  const h = v.holder
  const votes = Number(v.vault.reentryVotes) / 1e6
  const pct = v.supply > 0 ? Math.min(100, (votes / v.supply) * 100) : 0
  const majority = pct >= 50
  const green = v.venue.flag === "green"

  const run = async (label: string, build: () => Promise<Parameters<typeof send>[1]>) => {
    setBusy(true)
    const sig = await send(label, await build())
    setBusy(false)
    if (sig) refresh()
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">The vault is in USDC. It buys back in only when the venue reads Safe again and holders of half of all shares vote for it.</p>
      <div>
        <div className="flex justify-between text-sm"><span className="font-medium">Votes to re-enter</span><span className="tabular">{pct.toFixed(1)}% of 50%</span></div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-sand">
          <div className="h-full rounded-full bg-ink transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className={cn("rounded-full px-2.5 py-1 font-semibold", green ? "bg-safe-soft text-safe" : "bg-sand text-ink-2")}>{green ? "✓" : "○"} Venue reads Safe</span>
          <span className={cn("rounded-full px-2.5 py-1 font-semibold", majority ? "bg-safe-soft text-safe" : "bg-sand text-ink-2")}>{majority ? "✓" : "○"} Majority voted</span>
        </div>
      </div>
      {!publicKey ? (
        <WalletButton className="h-12 w-full justify-center" label="Connect to vote" />
      ) : green && majority ? (
        <Button className="h-12 w-full justify-center" disabled={busy} onClick={() => run("Re-enter the venue", buildReenter)}>{busy ? "Sending…" : "Re-enter now"}</Button>
      ) : h && h.voted > 0 ? (
        <Button variant="line" className="h-12 w-full justify-center" disabled={busy} onClick={() => run("Take back your vote", () => buildUnvote(publicKey))}>{busy ? "Sending…" : `Take back ${fmt(h.voted)} shares`}</Button>
      ) : (
        <Button className="h-12 w-full justify-center" disabled={busy || !h || h.shares <= 0} onClick={() => run("Vote to re-enter", () => buildVote(publicKey, h!.shares))}>
          {busy ? "Sending…" : h && h.shares > 0 ? `Vote with ${fmt(h.shares)} shares` : "No shares to vote with"}
        </Button>
      )}
      <p className="text-xs text-ink-3">Voting holds your shares in escrow. Take them back any time.</p>
    </div>
  )
}
