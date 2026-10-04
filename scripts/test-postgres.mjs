import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { NetlifyDB } from "@netlify/database-dev";

// Exercise our real postgres driver against Netlify's isolated local PostgreSQL server.
const require = createRequire(import.meta.url);
const compile = path => ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const dataURL = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const source = compile("lib/database.ts")
  .replace('from "postgres"', `from "${pathToFileURL(require.resolve("postgres"))}"`)
  .replace('from "./drive"', `from "${dataURL(compile("lib/drive.ts"))}"`);
const server = new NetlifyDB({ logger: () => {} });
let closeDatabase;
try {
  process.env.NETLIFY_DB_URL = await server.start();
  await server.applyMigrations("netlify/database/migrations");
  const module = await import(dataURL(source)); closeDatabase = module.closeDatabase;
  const db = module.database();
  await db.batch([
    db.prepare("INSERT INTO rooms (id,title,host_name,host_hash,drive_id,video_name,updated_at,expires_at) VALUES (?,?,?,?,?,?,?,?)").bind("postgres-test", "Movie night", "Host", "hash", "drive-file", "video.mp4", 1800000000000, 1800086400000),
    db.prepare("INSERT INTO members (token_hash,room_id,name,is_host,last_seen) VALUES (?,?,?,?,?)").bind("member", "postgres-test", "Host", 1, 1800000000000),
  ]);
  const room = await db.prepare("SELECT * FROM rooms WHERE id = ?").bind("postgres-test").first();
  assert.equal(room.updated_at, 1800000000000); assert.equal(typeof room.expires_at, "number");
  await db.batch([
    db.prepare("INSERT INTO subtitles (room_id,name,revision,cues_json) VALUES (?, ?,(SELECT version+1 FROM rooms WHERE id=?),?) ON CONFLICT(room_id) DO UPDATE SET name=excluded.name,revision=excluded.revision,cues_json=excluded.cues_json").bind("postgres-test", "movie.srt", "postgres-test", '[{"start":0,"end":2,"text":"Hi"}]'),
    db.prepare("UPDATE rooms SET version = version + 1 WHERE id = ?").bind("postgres-test"),
  ]);
  assert.equal((await db.prepare("SELECT revision FROM subtitles WHERE room_id = ?").bind("postgres-test").first()).revision, 1);
  await assert.rejects(() => db.batch([
    db.prepare("UPDATE rooms SET title = ? WHERE id = ?").bind("Should roll back", "postgres-test"),
    db.prepare("INSERT INTO members (token_hash,room_id,name,is_host,last_seen) VALUES (?,?,?,?,?)").bind("bad-member", "missing-room", "Guest", 0, 1),
  ]));
  assert.equal((await db.prepare("SELECT title FROM rooms WHERE id = ?").bind("postgres-test").first()).title, "Movie night");
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM members WHERE room_id = ?").bind("postgres-test").first()).n, 1);
  assert.equal((await db.prepare("SELECT name FROM members WHERE room_id = ?").bind("postgres-test").all()).results.length, 1);
  await db.prepare("DELETE FROM rooms WHERE id = ?").bind("postgres-test").run();
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM subtitles").first()).n, 0);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM members").first()).n, 0);
  console.log("PostgreSQL checks passed: migrations, actual driver, bound parameters, timestamps, subtitle persistence, atomic rollback, and cascade cleanup.");
} finally {
  if (closeDatabase) await closeDatabase();
  await server.stop();
  delete process.env.NETLIFY_DB_URL;
}
