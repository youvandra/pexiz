import { Suspense, lazy, useLayoutEffect } from "react"
import { Route, Switch, useLocation } from "wouter"
import { Landing } from "@/pages/Landing"
import { Replay } from "@/pages/Replay"
import { Docs } from "@/pages/Docs"

const AppRoutes = lazy(() => import("@/pages/app"))

function ScrollTop() {
  const [loc] = useLocation()
  useLayoutEffect(() => {
    // A link to a section lands on it; anything else starts at the top.
    const target = window.location.hash && document.getElementById(window.location.hash.slice(1))
    if (target) target.scrollIntoView()
    else window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior })
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
        <Route path="/replay" component={Replay} />
        <Route path="/app" nest>
          <Suspense fallback={<div className="min-h-screen" />}>
            <AppRoutes />
          </Suspense>
        </Route>
        <Route>
          <div className="grid min-h-screen place-items-center text-ink-2">Page not found.</div>
        </Route>
      </Switch>
    </>
  )
}
