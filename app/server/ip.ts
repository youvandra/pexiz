// Which address a request came from. nginx on the same box sets X-Real-IP;
// anyone else can set it too, so it is believed only from a loopback peer.

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"])

export function clientIp(header: string | null, peer: string | undefined): string {
  if (peer && LOOPBACK.has(peer) && header) return header.trim()
  return peer ?? "?"
}
