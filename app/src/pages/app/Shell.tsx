import type { ReactNode } from "react"
import { SolanaProvider } from "@/lib/solana"
import { VaultProvider } from "@/data/vault"
import { MobileTabs, Toasts, TopBar } from "@/components/app/chrome"

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SolanaProvider>
      <VaultProvider>
        <div className="min-h-screen pb-20 md:pb-0">
          <TopBar />
          <main className="mx-auto min-w-0 max-w-[1240px] px-4 pb-20 pt-8 md:px-8 md:pt-12">{children}</main>
          <MobileTabs />
          <Toasts />
        </div>
      </VaultProvider>
    </SolanaProvider>
  )
}
