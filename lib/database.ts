import postgres from "postgres";
import { AppError } from "./drive";

type Value = string | number | null;
type Query = { text: string; values: Value[] };
type Backend = {
  close: () => Promise<void>;
  execute: (query: Query) => Promise<Record<string, unknown>[]>;
  batch: (queries: Query[]) => Promise<void>;
};
const state = globalThis as typeof globalThis & { watchDatabase?: Promise<Backend> };

async function connect(): Promise<Backend> {
  const url = process.env.NETLIFY_DB_URL || process.env.DATABASE_URL;
  if (url) {
    const sql = postgres(url, {
      max: 3, idle_timeout: 20, connect_timeout: 15, prepare: false,
      types: { bigint: { to: 20, from: [20], serialize: String, parse: Number } },
    });
    const parameters = (query: string) => { let n = 0; return query.replace(/\?/g, () => `$${++n}`); };
    return {
      close: async () => { await sql.end({ timeout: 5 }); },
      execute: async query => Array.from(await sql.unsafe(parameters(query.text), query.values)),
      batch: async queries => {
        // Retrying a transaction preserves shared revisions under concurrent requests.
        for (let attempt = 0; ; attempt++) {
          try {
            await sql.begin("isolation level serializable", async transaction => {
              for (const query of queries) await transaction.unsafe(parameters(query.text), query.values);
            });
            return;
          } catch (e) { if ((e as { code?: string }).code !== "40001" || attempt >= 2) throw e; }
        }
      },
    };
  }
  if (process.env.NETLIFY || process.env.NODE_ENV === "production") {
    throw new AppError("The room database isn’t connected yet. Please try again shortly.", 503);
  }
  // A durable, local-only database makes previews usable before account sign-in.
  const [{ DatabaseSync }, { mkdirSync, readFileSync }, { dirname, resolve }] = await Promise.all([
    import("node:sqlite"), import("node:fs"), import("node:path"),
  ]);
  const path = resolve(process.env.LOCAL_DATABASE_PATH || ".watch2gether/rooms.sqlite");
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  db.exec(readFileSync(resolve("netlify/database/migrations/0001_watch_rooms.sql"), "utf8"));
  const run = (query: Query) => {
    const statement = db.prepare(query.text);
    if (/^\s*SELECT\b/i.test(query.text)) return statement.all(...query.values);
    statement.run(...query.values); return [];
  };
  return {
    close: async () => { db.close(); },
    execute: async query => run(query),
    batch: async queries => {
      db.exec("BEGIN IMMEDIATE");
      try { for (const query of queries) run(query); db.exec("COMMIT"); }
      catch (e) { db.exec("ROLLBACK"); throw e; }
    },
  };
}

function backend() {
  state.watchDatabase ??= connect().catch(error => { state.watchDatabase = undefined; throw error; });
  return state.watchDatabase;
}
class Statement {
  constructor(readonly text: string, readonly values: Value[] = []) {}
  bind(...values: Value[]) { return new Statement(this.text, values); }
  async first<T = Record<string, unknown>>() { return (await (await backend()).execute(this))[0] as T | undefined ?? null; }
  async all<T = Record<string, unknown>>() { return { results: await (await backend()).execute(this) as T[] }; }
  async run() { await (await backend()).execute(this); }
}
export function database() {
  return { prepare: (text: string) => new Statement(text), batch: async (queries: Statement[]) => (await backend()).batch(queries) };
}
export async function closeDatabase() {
  const connection = state.watchDatabase; state.watchDatabase = undefined;
  if (connection) await (await connection).close();
}
