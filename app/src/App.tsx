import { useLayoutEffect } from "react"
import { Route, Switch, useLocation } from "wouter"
import { Landing } from "@/pages/Landing"
import { AppShell } from "@/pages/app/Shell"
import { Board } from "@/pages/app/Board"
import { Replay } from "@/pages/app/Replay"
import { VaultPage } from "@/pages/app/Vault"
import { VenuePage } from "@/pages/app/Venue"
import { Docs } from "@/pages/Docs"

function ScrollTop() {
  const [loc] = useLocation()
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior })
  }, [loc])
  return null
}

export function App() {
  return (
    <>
      <ScrollTop />
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/docs" component={Docs} />
        <Route path="/app" nest>
          <AppShell>
            <Switch>
              <Route path="/" component={Board} />
              <Route path="/replay" component={Replay} />
              <Route path="/vault" component={VaultPage} />
              <Route path="/venue/:id" component={VenuePage} />
            </Switch>
          </AppShell>
        </Route>
        <Route>
          <div className="grid min-h-screen place-items-center text-ink-2">Page not found.</div>
        </Route>
      </Switch>
    </>
  )
}
