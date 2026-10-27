// The Telegram side: a bot people subscribe to per protocol, and the alerts
// it sends them. Long polling, so no public webhook is needed.
//
//   /start              what the bot does, and the protocols it watches
//   /start <protocol>   the deep link from a protocol page: subscribe to it
//   /watch <protocol>   subscribe; "all" for every protocol
//   /stop <protocol>    unsubscribe; "all" for everything
//   /list               your subscriptions
//   /status             every protocol's status right now
import { VENUES } from "../../src/data/facts"
import { flagLabel } from "./labels"
import type { Store } from "./store"
import type { WatchEvent } from "./types"

export interface Bot {
  username: string | null
  /** Sends an alert for these events to everyone watching their protocol. */
  alert(events: WatchEvent[]): Promise<void>
  /** Runs the command loop until the process ends. */
  listen(): Promise<void>
}

const NAMES = new Map(VENUES.map((v) => [v.id, v.name]))
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

export function alertText(venue: string, events: WatchEvent[], appUrl: string): string {
  const name = NAMES.get(venue) ?? venue
  const bad = events.some((e) => e.tone === "bad")
  const lines = [
    `${bad ? "⚠️" : "ℹ️"} <b>${esc(name)}</b>`,
    ...events.map((e) => `• ${esc(e.title)}${e.detail ? `\n  <i>${esc(e.detail)}</i>` : ""}`),
    "",
    `<a href="${appUrl}/app/monitor/${venue}">See it on Pexiz</a>`,
  ]
  return lines.join("\n")
}

/** Matches a typed name or id, loosely: "jupiter", "Jupiter Perps", "jupiter-perps". */
export function findVenue(arg: string): string | "all" | null {
  const a = arg.trim().toLowerCase().replace(/\s+/g, "-")
  if (!a) return null
  if (a === "all") return "all"
  return VENUES.find((v) => v.id === a || v.name.toLowerCase().replace(/\s+/g, "-") === a || v.id.startsWith(a))?.id ?? null
}

/** Replies to one command. Pure apart from the store, so it can be tested. */
export function reply(store: Store, chat: number, text: string): string {
  const [cmd, ...rest] = text.trim().split(/\s+/)
  const arg = rest.join(" ")
  const list = VENUES.map((v) => `• ${v.name}: <code>/watch ${v.id}</code>`).join("\n")
  switch (cmd.split("@")[0]) {
    case "/start": {
      if (arg) return reply(store, chat, `/watch ${arg}`)
      return [
        "<b>Pexiz</b> watches who can change the Solana protocols you provide liquidity to, and tells you when their admin setup gets weaker.",
        "",
        "Pick one to follow:",
        list,
        "",
        "Or <code>/watch all</code>. <code>/status</code> shows every protocol now.",
      ].join("\n")
    }
    case "/watch": {
      const id = findVenue(arg)
      if (!id) return `Which protocol? Try one of these:\n${list}`
      const ids = id === "all" ? VENUES.map((v) => v.id) : [id]
      ids.forEach((v) => store.subscribe(chat, v))
      const names = ids.map((v) => NAMES.get(v)).join(", ")
      return `Watching <b>${esc(names)}</b>. You will hear from me when an admin key, a signer, the change delay or the status changes.`
    }
    case "/stop": {
      const id = findVenue(arg || "all")
      if (!id) return "Which one? <code>/list</code> shows what you follow."
      store.unsubscribe(chat, id)
      return id === "all" ? "Stopped all alerts." : `Stopped alerts for <b>${esc(NAMES.get(id) ?? id)}</b>.`
    }
    case "/list": {
      const subs = store.subscriptions(chat)
      return subs.length ? `You follow:\n${subs.map((v) => `• ${esc(NAMES.get(v) ?? v)}`).join("\n")}` : "You follow nothing yet. <code>/start</code> shows the list."
    }
    case "/status": {
      const states = new Map(store.states().map((s) => [s.venue, s]))
      return VENUES.map((v) => {
        const s = states.get(v.id)
        return `<b>${esc(v.name)}</b>: ${s ? `${flagLabel(s.assessment)}. ${esc(s.why)}` : "not read yet"}`
      }).join("\n\n")
    }
    default:
      return "I know /watch, /stop, /list and /status."
  }
}

export async function telegramBot(token: string, store: Store, appUrl: string): Promise<Bot> {
  const api = async (method: string, body: Record<string, unknown> = {}) => {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    const json = (await res.json()) as { ok: boolean; result?: unknown; description?: string }
    if (!json.ok) throw new Error(`telegram ${method}: ${json.description}`)
    return json.result
  }
  const send = (chat: number, text: string) => api("sendMessage", { chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true })
  const me = (await api("getMe")) as { username: string }
  await api("setMyCommands", {
    commands: [
      { command: "watch", description: "Follow a protocol" },
      { command: "stop", description: "Stop following one, or all" },
      { command: "list", description: "What you follow" },
      { command: "status", description: "Every protocol's status now" },
    ],
  })

  return {
    username: me.username,
    async alert(events) {
      const byVenue = Map.groupBy(events, (e) => e.venue)
      for (const [venue, list] of byVenue) {
        const text = alertText(venue, list, appUrl)
        for (const chat of store.watchersOf(venue)) {
          // A chat that blocked the bot must not stop the others.
          await send(chat, text).catch((e) => console.warn(`alert to ${chat}: ${e.message}`))
        }
      }
    },
    async listen() {
      let offset = Number(store.meta("telegram_offset") ?? 0)
      for (;;) {
        try {
          const updates = (await api("getUpdates", { offset, timeout: 50, allowed_updates: ["message"] })) as {
            update_id: number
            message?: { chat: { id: number }; text?: string }
          }[]
          for (const u of updates) {
            offset = u.update_id + 1
            store.setMeta("telegram_offset", String(offset))
            const m = u.message
            if (m?.text?.startsWith("/")) await send(m.chat.id, reply(store, m.chat.id, m.text)).catch((e) => console.warn(`reply: ${e.message}`))
          }
        } catch (e) {
          console.warn(`telegram poll: ${(e as Error).message}`)
          await new Promise((r) => setTimeout(r, 5_000))
        }
      }
    },
  }
}

/** Without a token: alerts go to the log, commands are not served. */
export function logBot(appUrl: string): Bot {
  return {
    username: null,
    async alert(events) {
      for (const [venue, list] of Map.groupBy(events, (e) => e.venue)) console.log(`[alert]\n${alertText(venue, list, appUrl)}\n`)
    },
    async listen() {},
  }
}
