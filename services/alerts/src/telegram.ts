export interface Sink {
  send(text: string): Promise<void>;
}

/** Prints messages instead of posting them. */
export const dryRunSink = (print: (s: string) => void = console.log): Sink => ({
  async send(text) {
    print(`--- alert (dry run) ---\n${text}\n`);
  },
});

export function telegramSink(token: string, chatId: string): Sink {
  return {
    async send(text) {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      });
      if (!r.ok) throw new Error(`telegram ${r.status}: ${(await r.text()).slice(0, 200)}`);
    },
  };
}
