import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import { ConnectionProvider, WalletProvider, useConnection, useWallet } from "@solana/wallet-adapter-react"
import { Transaction, type TransactionInstruction } from "@solana/web3.js"
import { explorer } from "@/data/facts"
import { devnet } from "@/data/chain"

export function SolanaProvider({ children }: { children: ReactNode }) {
  // Wallet Standard wallets (Phantom, Solflare, Backpack…) register themselves.
  const wallets = useMemo(() => [], [])
  return (
    <ConnectionProvider endpoint={devnet.rpcEndpoint} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={wallets} autoConnect localStorageKey="pexiz.wallet">
        <ToastProvider>{children}</ToastProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}

export type ToastKind = "pending" | "success" | "error" | "info"
export interface Toast {
  id: number
  kind: ToastKind
  title: string
  body?: string
  href?: string
}

const ToastCtx = createContext<{
  toasts: Toast[]
  push: (t: Omit<Toast, "id">) => number
  update: (id: number, t: Partial<Toast>) => void
  dismiss: (id: number) => void
} | null>(null)

function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), [])
  const later = useCallback((id: number, kind?: ToastKind) => {
    if (kind && kind !== "pending") setTimeout(() => dismiss(id), kind === "error" ? 9000 : 6000)
  }, [dismiss])
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random()
    setToasts((ts) => [...ts.slice(-3), { ...t, id }])
    later(id, t.kind)
    return id
  }, [later])
  const update = useCallback((id: number, t: Partial<Toast>) => {
    setToasts((ts) => ts.map((x) => (x.id === id ? { ...x, ...t } : x)))
    later(id, t.kind)
  }, [later])
  return <ToastCtx.Provider value={{ toasts, push, update, dismiss }}>{children}</ToastCtx.Provider>
}

export function useToasts() {
  const c = useContext(ToastCtx)
  if (!c) throw new Error("ToastProvider missing")
  return c
}

const VAULT_ERRORS: Record<number, string> = {
  6000: "Deposits are open only while the protocol reads Safe.",
  6001: "The vault exits only when the protocol reads Get out.",
  6002: "This deposit would take the vault over its $10M cap.",
  6003: "The vault has already exited to USDC.",
  6004: "Re-entry needs a Safe flag and votes from half of all shares.",
  6005: "The vault has not exited, so there is nothing to vote on.",
  6006: "Enter an amount above zero.",
  6007: "The price moved past your limit. Try again.",
}

/** Turns wallet and program errors into a sentence a user can act on. */
export function explain(e: unknown): string {
  const msg = String((e as Error)?.message ?? e)
  if (/reject|denied|cancel/i.test(msg)) return "You declined the request in your wallet."
  const hex = msg.match(/custom program error: 0x([0-9a-f]+)/i)
  const dec = msg.match(/Error Number: (\d+)/)
  const code = hex ? parseInt(hex[1], 16) : dec ? Number(dec[1]) : null
  if (code !== null && VAULT_ERRORS[code]) return VAULT_ERRORS[code]
  if (/insufficient (funds|lamports)|debit an account/i.test(msg)) return "Not enough SOL for the network fee. Get test SOL from the faucet."
  if (/blockhash|expired/i.test(msg)) return "The network was slow and the request expired. Try again."
  return msg.length > 140 ? `${msg.slice(0, 140)}…` : msg
}

/** Signs, sends and confirms a set of instructions, with toasts for each stage. */
export function useSend() {
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()
  const { push, update } = useToasts()
  return useCallback(
    async (label: string, ixs: TransactionInstruction[]): Promise<string | null> => {
      if (!publicKey) return null
      const id = push({ kind: "pending", title: label, body: "Confirm in your wallet" })
      try {
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
        const tx = new Transaction({ feePayer: publicKey, blockhash, lastValidBlockHeight }).add(...ixs)
        const sim = await connection.simulateTransaction(tx)
        if (sim.value.err) throw new Error((sim.value.logs ?? []).find((l) => /error/i.test(l)) ?? JSON.stringify(sim.value.err))
        const sig = await sendTransaction(tx, connection)
        update(id, { body: "Waiting for the network…", href: explorer(sig, "devnet", "tx") })
        const res = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed")
        if (res.value.err) throw new Error(JSON.stringify(res.value.err))
        update(id, { kind: "success", body: "Confirmed on devnet", href: explorer(sig, "devnet", "tx") })
        return sig
      } catch (e) {
        update(id, { kind: "error", body: explain(e) })
        return null
      }
    },
    [connection, publicKey, sendTransaction, push, update],
  )
}
