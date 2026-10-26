// Retry with exponential backoff on rate limits and transient RPC errors.
export async function withBackoff<T>(f: () => Promise<T>, opts: { tries?: number; baseMs?: number; log?: (m: string) => void } = {}): Promise<T> {
  const tries = opts.tries ?? 6;
  let delay = opts.baseMs ?? 500;
  for (let i = 1; ; i++) {
    try {
      return await f();
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      const retryable = /429|Too Many Requests|rate limit|ECONNRESET|ETIMEDOUT|fetch failed|503|502/i.test(msg);
      if (!retryable || i >= tries) throw e;
      opts.log?.(`rpc backoff ${delay}ms after: ${msg.slice(0, 80)}`);
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
}
