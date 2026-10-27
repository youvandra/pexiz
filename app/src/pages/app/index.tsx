import { Redirect, Route, Switch } from "wouter"
import { AppShell } from "./Shell"
import { Vaults } from "./Vaults"
import { VaultDetail } from "./VaultDetail"
import { Monitor } from "./Monitor"
import { MonitorVenue } from "./MonitorVenue"
import { Portfolio } from "./Portfolio"
import { Activity } from "./Activity"
import { Check } from "./Check"

/** Everything under /app; loaded on demand so the landing page stays light. */
export default function AppRoutes() {
  return (
    <AppShell>
      <Switch>
        <Route path="/" component={Vaults} />
        <Route path="/vault/:id" component={VaultDetail} />
        <Route path="/monitor" component={Monitor} />
        <Route path="/monitor/:id" component={MonitorVenue} />
        <Route path="/portfolio" component={Portfolio} />
        <Route path="/activity" component={Activity} />
        <Route path="/check" component={Check} />
        <Route path="/check/:program" component={Check} />
        {/* Older links. */}
        <Route path="/vault"><Redirect to="/vault/canary" replace /></Route>
        <Route path="/replay"><Redirect to="~/replay" replace /></Route>
        <Route path="/venue/:id">{(p) => <Redirect to={`/monitor/${p.id}`} replace />}</Route>
        <Route><Redirect to="/" replace /></Route>
      </Switch>
    </AppShell>
  )
}
