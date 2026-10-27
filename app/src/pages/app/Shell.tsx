import type { ReactNode } from "react"
import { SolanaProvider } from "@/lib/solana"
import { VaultProvider } from "@/data/vault"
import { Header, MobileTabs, Sidebar, Toasts } from "@/components/app/chrome"

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SolanaProvider>
      <VaultProvider>
        <div className="min-h-screen pb-20 md:grid md:grid-cols-[240px_1fr] md:pb-0">
          <Sidebar />
          <div className="min-w-0">
            <Header />
            <main className="mx-auto max-w-[1180px] px-4 pb-20 pt-8 md:px-8 md:pt-10">{children}</main>
          </div>
          <MobileTabs />
          <Toasts />
        </div>
      </VaultProvider>
    </SolanaProvider>
  )
}
