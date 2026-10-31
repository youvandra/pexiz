import { resolve, sep } from "node:path"

/**
 * The file under `root` a request path names, or null when it names nothing
 * there. The path is decoded before it is resolved, so an encoded slash
 * (`%2e%2e%2f`) is a step up like any other and is refused the same way.
 */
export function underRoot(root: string, pathname: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  if (decoded.includes("\0")) return null
  const base = resolve(root)
  const full = resolve(base, `.${decoded.startsWith("/") ? "" : "/"}${decoded}`)
  return full === base || full.startsWith(base + sep) ? full : null
}
