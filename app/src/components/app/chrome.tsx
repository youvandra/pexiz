import { useEffect, useRef, useState, type ReactNode } from "react"
import { Link, useLocation } from "wouter"
import { useWallet } from "@solana/wallet-adapter-react"
import { WalletReadyState } from "@solana/wallet-adapter-base"
import { cn } from "@/lib/cn"
import { amount, short } from "@/lib/format"
import { explorer } from "@/data/facts"
import { useToasts, explain } from "@/lib/solana"
import { useVault } from "@/data/vault"
import { Button, Logo } from "@/components/ui/kit"
import { Icon, Svg } from "@/components/ui/icons"

export { Icon, Svg }

const NAV = [
  { href: "/", label: "Vaults", icon: Icon.vault, match: (l: string) => l === "/" || l.startsWith("/vault") },
  { href: "/monitor", label: "Monitor", icon: Icon.monitor, match: (l: string) => l.startsWith("/monitor") },
  { href: "/check", label: "Check", icon: Icon.search, match: (l: string) => l.startsWith("/check") },
  { href: "/portfolio", label: "Portfolio", icon: Icon.portfolio, match: (l: string) => l.startsWith("/portfolio") },
  { href: "/activity", label: "Activity", icon: Icon.activity, match: (l: string) => l.startsWith("/activity") },
]

function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const on = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close() }
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close() }
    document.addEventListener("mousedown", on)
    document.addEventListener("keydown", esc)
    return () => { document.removeEventListener("mousedown", on); document.removeEventListener("keydown", esc) }
  }, [open, close])
  return ref
}

/** Desktop navigation: a fixed column on the left. */
export function Sidebar() {
  const [loc] = useLocation()
  return (
    <aside className="sticky top-0 hidden h-screen flex-col border-r border-line bg-paper px-4 py-5 md:flex">
      <Link href="~/" aria-label="Pexiz home" className="px-2"><Logo /></Link>
      <nav className="mt-8 flex flex-col gap-1">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              n.match(loc) ? "bg-ink text-cream" : "text-ink-2 hover:bg-sand hover:text-ink",
            )}
          >
            <Svg>{n.icon}</Svg>
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto">
        <div className="flex flex-col gap-0.5 px-1 text-sm">
          <Link href="~/docs" className="rounded-lg px-2 py-1.5 text-ink-2 hover:bg-sand hover:text-ink">Docs</Link>
          <Link href="~/" className="rounded-lg px-2 py-1.5 text-ink-2 hover:bg-sand hover:text-ink">Back to site</Link>
        </div>
      </div>
    </aside>
  )
}

/** Wallet and network on the right; the logo stands in for the sidebar on phones. */
export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-cream/90 backdrop-blur-md">
      <div className="flex h-16 items-center gap-3 px-4 md:px-8">
        <Link href="~/" aria-label="Pexiz home" className="md:hidden"><Logo /></Link>
        <div className="ml-auto flex items-center gap-2">
          <NetworkChip />
          <WalletButton />
        </div>
      </div>
    </header>
  )
}

/** Bottom tab bar on phones. */
export function MobileTabs() {
  const [loc] = useLocation()
  return (
    <nav style={{ gridTemplateColumns: `repeat(${NAV.length}, minmax(0, 1fr))` }} className="fixed inset-x-0 bottom-0 z-40 grid border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} className={cn("flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium", n.match(loc) ? "text-ink" : "text-ink-3")}>
          <Svg className="size-5">{n.icon}</Svg>
          {n.label}
        </Link>
      ))}
    </nav>
  )
}

function NetworkChip() {
  const [open, setOpen] = useState(false)
  const ref = useOutside(open, () => setOpen(false))
  return (
    <div ref={ref} className="relative hidden sm:block">
      <button onClick={() => setOpen((o) => !o)} className="flex h-10 items-center gap-2 rounded-full border border-line bg-paper px-3.5 text-sm font-medium">
        <span className="live-dot text-warn" />
        Devnet
      </button>
      {open && (
        <div className="card absolute right-0 top-12 w-72 p-4 text-sm">
          <div className="font-semibold">Where Pexiz runs today</div>
          <ul className="mt-3 space-y-2.5 text-ink-2">
            <li className="flex gap-2.5"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warn" />Vault, oracle and your funds: Solana devnet, test USDC.</li>
            <li className="flex gap-2.5"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-safe" />Monitor: read live from Solana mainnet.</li>
          </ul>
        </div>
      )}
    </div>
  )
}

export function WalletButton({ className, label = "Connect wallet" }: { className?: string; label?: string }) {
  const { publicKey, connecting } = useWallet()
  const [picker, setPicker] = useState(false)
  if (publicKey) return <AccountMenu />
  return (
    <>
      <Button className={cn("h-10 px-4 text-sm", className)} onClick={() => setPicker(true)} disabled={connecting}>
        <Svg>{Icon.wallet}</Svg>
        {connecting ? "Connecting…" : label}
      </Button>
      {picker && <WalletPicker onClose={() => setPicker(false)} />}
    </>
  )
}

const SUGGESTED = [
  { name: "Phantom", url: "https://phantom.com/download" },
  { name: "Solflare", url: "https://solflare.com/download" },
  { name: "Backpack", url: "https://backpack.app/download" },
]

function WalletPicker({ onClose }: { onClose: () => void }) {
  const { wallets, select, connect, wallet } = useWallet()
  const { push } = useToasts()
  const installed = wallets.filter((w) => w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable)
  const [chosen, setChosen] = useState<string | null>(null)

  // Connect once the chosen adapter is the selected one.
  useEffect(() => {
    if (!chosen || wallet?.adapter.name !== chosen) return
    connect()
      .then(onClose)
      .catch((e) => { push({ kind: "error", title: "Wallet not connected", body: explain(e) }); setChosen(null) })
  }, [chosen, wallet, connect, onClose, push])

  return (
    <Modal title="Connect a wallet" onClose={onClose}>
      {installed.length ? (
        <div className="space-y-2">
          {installed.map((w) => (
            <button
              key={w.adapter.name}
              onClick={() => { setChosen(w.adapter.name); select(w.adapter.name) }}
              className="flex w-full items-center gap-3 rounded-xl border border-line bg-paper px-4 py-3 text-left font-medium transition-colors hover:border-line-2 hover:bg-sand/50"
            >
              <img src={w.adapter.icon} alt="" className="size-8 rounded-lg" />
              {w.adapter.name}
              <span className="ml-auto text-xs text-ink-3">{chosen === w.adapter.name ? "Check your wallet…" : "Detected"}</span>
            </button>
          ))}
        </div>
      ) : (
        <div>
          <p className="text-sm text-ink-2">No Solana wallet found in this browser. Install one, switch it to devnet, then come back.</p>
          <div className="mt-4 space-y-2">
            {SUGGESTED.map((s) => (
              <a key={s.name} href={s.url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl border border-line px-4 py-3 font-medium hover:bg-sand/50">
                {s.name}
                <Svg className="text-ink-3">{Icon.ext}</Svg>
              </a>
            ))}
          </div>
        </div>
      )}
      <p className="mt-5 text-xs text-ink-3">Your wallet only signs. Pexiz never holds your keys.</p>
    </Modal>
  )
}

function AccountMenu() {
  const { publicKey, disconnect, wallet } = useWallet()
  const [open, setOpen] = useState(false)
  const ref = useOutside(open, () => setOpen(false))
  const { data, refresh } = useVault()
  const h = data?.holder
  const addr = publicKey!.toBase58()
  const { push } = useToasts()
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex h-10 items-center gap-2 rounded-full border border-line bg-paper pl-1.5 pr-3 text-sm font-medium hover:border-line-2">
        {wallet && <img src={wallet.adapter.icon} alt="" className="size-7 rounded-full" />}
        <span className="font-mono text-[0.82rem]">{short(addr, 4)}</span>
        <Svg className="text-ink-3">{Icon.chevron}</Svg>
      </button>
      {open && (
        <div className="card absolute right-0 top-12 w-80 p-2">
          <div className="rounded-xl bg-sand/60 p-4">
            <div className="text-xs text-ink-3">Connected</div>
            <div className="mt-1 font-mono text-sm">{short(addr, 8)}</div>
            <dl className="mt-4 space-y-1.5 text-sm">
              {[["Wallet balance", h ? `${amount(h.usdc)} USDC` : undefined], ["Vault shares", h ? amount(h.shares) : undefined], ["Balance for fees", h ? `${amount(h.sol, 3)} SOL` : undefined]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-ink-2">{k}</dt>
                  <dd className="tabular truncate font-semibold">{v ?? "…"}</dd>
                </div>
              ))}
            </dl>
          </div>
          <Faucet owner={addr} onDone={refresh} />
          <MenuItem icon={Icon.copy} onClick={() => { navigator.clipboard?.writeText(addr); push({ kind: "info", title: "Address copied" }); setOpen(false) }}>Copy address</MenuItem>
          <MenuItem icon={Icon.ext} href={explorer(addr, "devnet")}>View on explorer</MenuItem>
          <MenuItem icon={Icon.out} onClick={() => { disconnect(); setOpen(false) }}>Disconnect</MenuItem>
        </div>
      )}
    </div>
  )
}

function MenuItem({ icon, children, onClick, href }: { icon: ReactNode; children: ReactNode; onClick?: () => void; href?: string }) {
  const cls = "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-ink-2 hover:bg-sand hover:text-ink"
  if (href) return <a href={href} target="_blank" rel="noreferrer" className={cls}><Svg>{icon}</Svg>{children}</a>
  return <button onClick={onClick} className={cls}><Svg>{icon}</Svg>{children}</button>
}

export function Faucet({ owner, onDone, variant = "menu" }: { owner: string; onDone?: () => void; variant?: "menu" | "button" }) {
  const [busy, setBusy] = useState(false)
  const { push, update } = useToasts()
  const claim = async () => {
    setBusy(true)
    const id = push({ kind: "pending", title: "Getting test funds", body: "Minting 1,000 test USDC" })
    try {
      const r = await fetch("/api/faucet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet: owner }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? "Faucet unavailable")
      update(id, { kind: "success", body: `${j.usdc.toLocaleString("en-US")} test USDC${j.sol ? ` and ${j.sol} SOL` : ""} sent`, href: explorer(j.signature, "devnet", "tx") })
      onDone?.()
    } catch (e) {
      update(id, { kind: "error", body: explain(e) })
    } finally {
      setBusy(false)
    }
  }
  if (variant === "button") {
    return <Button variant="line" className="h-10 text-sm" onClick={claim} disabled={busy}><Svg>{Icon.drop}</Svg>{busy ? "Sending…" : "Get test USDC"}</Button>
  }
  return <MenuItem icon={Icon.drop} onClick={busy ? undefined : claim}>{busy ? "Sending test funds…" : "Get test USDC and SOL"}</MenuItem>
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", esc)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = prev }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-ink/30 backdrop-blur-[2px] sm:place-items-center" onMouseDown={onClose}>
      <div role="dialog" aria-modal aria-label={title} className="card w-full max-w-md rounded-b-none p-6 sm:rounded-b-[var(--radius-card)]" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-sand hover:text-ink"><Svg>{Icon.x}</Svg></button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Toasts() {
  const { toasts, dismiss } = useToasts()
  return (
    <div className="pointer-events-none fixed bottom-20 right-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2 md:bottom-6">
      {toasts.map((t) => (
        <div key={t.id} className="card pointer-events-auto flex gap-3 p-4">
          <span className={cn(
            "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
            t.kind === "success" ? "bg-safe-soft text-safe" : t.kind === "error" ? "bg-danger-soft text-danger" : "bg-sand text-ink-2",
          )}>
            {t.kind === "pending" ? <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Svg className="size-3.5">{t.kind === "error" ? Icon.x : Icon.check}</Svg>}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{t.title}</div>
            {t.body && <div className="mt-0.5 text-sm text-ink-2">{t.body}</div>}
            {t.href && <a href={t.href} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium underline decoration-line-2 underline-offset-4">View transaction <Svg className="size-3">{Icon.ext}</Svg></a>}
          </div>
          <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="self-start text-ink-3 hover:text-ink"><Svg className="size-3.5">{Icon.x}</Svg></button>
        </div>
      ))}
    </div>
  )
}

export function PageHead({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="tracking-display text-[2.4rem] font-medium leading-none md:text-5xl">{title}</h1>
        {sub && <p className="mt-3 max-w-xl text-ink-2">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

/** A full-width notice for empty, error and wallet-gated states. */
export function EmptyState({ glyph, title, body, action }: { glyph?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card dot-grid flex flex-col items-center px-6 py-14 text-center">
      {glyph}
      <div className="mt-4 text-lg font-semibold">{title}</div>
      {body && <p className="mt-1.5 max-w-sm text-sm text-ink-2">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
