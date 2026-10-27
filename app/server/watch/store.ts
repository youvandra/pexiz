// The watcher's memory: the last read of each protocol, every event, and who
// asked to be told. One SQLite file, written only by the watcher process.
import { Database } from "bun:sqlite"
import type { TokenState, VenueState, WatchEvent } from "./types"

export type Store = ReturnType<typeof openStore>

export function openStore(path: string) {
  const db = new Database(path, { create: true })
  db.exec("PRAGMA journal_mode = WAL")
  db.exec(`
    CREATE TABLE IF NOT EXISTS states (venue TEXT PRIMARY KEY, at INTEGER NOT NULL, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events (
      key TEXT PRIMARY KEY, venue TEXT NOT NULL, at INTEGER NOT NULL,
      kind TEXT NOT NULL, title TEXT NOT NULL, detail TEXT, tone TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS events_by_venue ON events (venue, at DESC);
    CREATE TABLE IF NOT EXISTS subs (chat_id INTEGER NOT NULL, venue TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (chat_id, venue));
    CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS token_states (id TEXT PRIMARY KEY, at INTEGER NOT NULL, json TEXT NOT NULL);
  `)

  const putState = db.prepare("INSERT INTO states (venue, at, json) VALUES (?, ?, ?) ON CONFLICT (venue) DO UPDATE SET at = excluded.at, json = excluded.json")
  const getState = db.prepare<{ json: string }, [string]>("SELECT json FROM states WHERE venue = ?")
  const allStates = db.prepare<{ json: string }, []>("SELECT json FROM states")
  const putEvent = db.prepare("INSERT OR IGNORE INTO events (key, venue, at, kind, title, detail, tone) VALUES (?, ?, ?, ?, ?, ?, ?)")
  const venueEvents = db.prepare<WatchEvent, [string, number]>("SELECT key, venue, at, kind, title, detail, tone FROM events WHERE venue = ? ORDER BY at DESC, key DESC LIMIT ?")
  const putToken = db.prepare("INSERT INTO token_states (id, at, json) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET at = excluded.at, json = excluded.json")
  const getToken = db.prepare<{ json: string }, [string]>("SELECT json FROM token_states WHERE id = ?")
  const allTokens = db.prepare<{ json: string }, []>("SELECT json FROM token_states")
  const getMeta = db.prepare<{ v: string }, [string]>("SELECT v FROM meta WHERE k = ?")
  const putMeta = db.prepare("INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v")
  const addSub = db.prepare("INSERT OR IGNORE INTO subs (chat_id, venue, at) VALUES (?, ?, ?)")
  const dropSub = db.prepare("DELETE FROM subs WHERE chat_id = ? AND venue = ?")
  const dropAll = db.prepare("DELETE FROM subs WHERE chat_id = ?")
  const subsOf = db.prepare<{ venue: string }, [number]>("SELECT venue FROM subs WHERE chat_id = ? ORDER BY venue")
  const watchers = db.prepare<{ chat_id: number }, [string]>("SELECT chat_id FROM subs WHERE venue = ?")
  const subCount = db.prepare<{ venue: string; n: number }, []>("SELECT venue, COUNT(*) AS n FROM subs GROUP BY venue")

  return {
    db,
    state: (venue: string): VenueState | null => {
      const row = getState.get(venue)
      return row ? JSON.parse(row.json) : null
    },
    states: (): VenueState[] => allStates.all().map((r) => JSON.parse(r.json)),
    saveState: (s: VenueState) => putState.run(s.venue, s.readAt, JSON.stringify(s)),
    /** Stores what is new and returns only those. */
    addEvents: (events: WatchEvent[]): WatchEvent[] =>
      db.transaction((list: WatchEvent[]) => list.filter((e) => putEvent.run(e.key, e.venue, e.at, e.kind, e.title, e.detail ?? null, e.tone).changes > 0))(events),
    events: (venue: string, limit = 50): WatchEvent[] => venueEvents.all(venue, limit).map((e) => ({ ...e, detail: e.detail ?? undefined })),
    token: (id: string): TokenState | null => {
      const row = getToken.get(id)
      return row ? JSON.parse(row.json) : null
    },
    tokens: (): TokenState[] => allTokens.all().map((r) => JSON.parse(r.json)),
    saveToken: (t: TokenState) => putToken.run(t.id, t.readAt, JSON.stringify(t)),
    meta: (k: string) => getMeta.get(k)?.v,
    setMeta: (k: string, v: string) => putMeta.run(k, v),
    subscribe: (chat: number, venue: string) => addSub.run(chat, venue, Math.floor(Date.now() / 1000)).changes > 0,
    unsubscribe: (chat: number, venue: string | "all") => (venue === "all" ? dropAll.run(chat) : dropSub.run(chat, venue)).changes > 0,
    subscriptions: (chat: number) => subsOf.all(chat).map((r) => r.venue),
    watchersOf: (venue: string) => watchers.all(venue).map((r) => r.chat_id),
    subscriberCounts: () => Object.fromEntries(subCount.all().map((r) => [r.venue, r.n])) as Record<string, number>,
  }
}
