// Two ways to read FlagChanged events: a logs subscription (websocket) and
// polling signatures of the oracle program (for RPCs without websockets).
import { Connection, type Finality } from "@solana/web3.js";
import { ORACLE_PROGRAM_ID, parseFlagChanged, withBackoff, type FlagChanged } from "@pexiz/sdk";

export type Handler = (e: FlagChanged, signature: string) => Promise<void> | void;

export function subscribe(conn: Connection, onEvent: Handler): () => void {
  const id = conn.onLogs(ORACLE_PROGRAM_ID, async (l) => {
    if (l.err) return;
    for (const e of parseFlagChanged(l.logs)) await onEvent(e, l.signature);
  }, "confirmed");
  return () => void conn.removeOnLogsListener(id);
}

/** Polls new oracle transactions every `intervalMs`, oldest first. */
export async function poll(conn: Connection, onEvent: Handler, intervalMs: number, signal?: AbortSignal) {
  const commitment: Finality = "confirmed";
  let until = (await withBackoff(() => conn.getSignaturesForAddress(ORACLE_PROGRAM_ID, { limit: 1 }, commitment)))[0]?.signature;
  while (!signal?.aborted) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const sigs = await withBackoff(() => conn.getSignaturesForAddress(ORACLE_PROGRAM_ID, { until, limit: 1000 }, commitment));
    if (!sigs.length) continue;
    until = sigs[0].signature;
    for (const s of sigs.reverse()) {
      if (s.err) continue;
      const tx = await withBackoff(() => conn.getTransaction(s.signature, { commitment, maxSupportedTransactionVersion: 0 }));
      for (const e of parseFlagChanged(tx?.meta?.logMessages ?? [])) await onEvent(e, s.signature);
    }
  }
}
