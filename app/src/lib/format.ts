export function duration(secs: number): string {
  if (secs <= 0) return "0s"
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (d >= 2) return h ? `${d}d ${h}h` : `${d}d`
  const hh = d * 24 + h
  if (hh) return m ? `${hh}h ${m}m` : `${hh}h`
  if (m) return `${m}m`
  return `${secs}s`
}

export const short = (s: string, n = 4) => (s.length > 2 * n + 1 ? `${s.slice(0, n)}…${s.slice(-n)}` : s)

export function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

export const usd = (n: number, digits = 0) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits })
