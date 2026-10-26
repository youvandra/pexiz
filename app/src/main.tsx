import "./polyfill"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./styles.css"
import { App } from "./App"

// Motion decorates content that is already visible. Hidden tabs and reduced
// motion get the final state straight away.
if (document.visibilityState !== "visible" || matchMedia("(prefers-reduced-motion: reduce)").matches) {
  document.documentElement.classList.add("motion-off")
}
history.scrollRestoration = "manual"
// Failsafe: whatever frames did or did not run, everything is visible by now.
setTimeout(() => document.documentElement.classList.add("motion-off"), 1600)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
