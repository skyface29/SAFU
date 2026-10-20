// Хранилище бота: один файл SQLite (встроенный node:sqlite, без нативных модулей).
// Всё, что записала группа, остаётся: удалённые ДЗ лежат в корзине, каждая правка — в журнале.
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

type Value = null | number | bigint | string | Uint8Array

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  username TEXT NOT NULL DEFAULT '',
  role TEXT,
  group_id TEXT,
  lecturer_id TEXT,
  lecturer_name TEXT NOT NULL DEFAULT '',
  verified INTEGER NOT NULL DEFAULT 0,
  notify_new INTEGER NOT NULL DEFAULT 1,
  notify_evening INTEGER NOT NULL DEFAULT 1,
  notify_shift INTEGER NOT NULL DEFAULT 1,
  evening_hour INTEGER NOT NULL DEFAULT 20,
  last_evening TEXT NOT NULL DEFAULT '',
  blocked INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL,
  seen INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS users_group ON users(group_id);
CREATE INDEX IF NOT EXISTS users_lecturer ON users(lecturer_id);

CREATE TABLE IF NOT EXISTS institutions (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  course INTEGER,
  institution INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS groups_number ON groups(number);

CREATE TABLE IF NOT EXISTS lecturers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  surname TEXT NOT NULL,
  updated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS lecturers_surname ON lecturers(surname);

CREATE TABLE IF NOT EXISTS schedules (
  owner TEXT PRIMARY KEY,
  events TEXT NOT NULL,
  fetched INTEGER NOT NULL,
  tried INTEGER NOT NULL DEFAULT 0,
  error TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS homework (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  text TEXT NOT NULL,
  due INTEGER NOT NULL,
  rule TEXT NOT NULL DEFAULT 'date',
  anchor INTEGER NOT NULL,
  skip INTEGER NOT NULL DEFAULT 0,
  match_kind TEXT NOT NULL DEFAULT '',
  due_kind TEXT NOT NULL DEFAULT '',
  due_room TEXT NOT NULL DEFAULT '',
  due_estimated INTEGER NOT NULL DEFAULT 0,
  shift_note TEXT NOT NULL DEFAULT '',
  important INTEGER NOT NULL DEFAULT 0,
  photos TEXT NOT NULL DEFAULT '[]',
  author_id INTEGER NOT NULL,
  author_teacher INTEGER NOT NULL DEFAULT 0,
  edited_by INTEGER,
  batch TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS homework_group ON homework(group_id, deleted, due);
CREATE INDEX IF NOT EXISTS homework_batch ON homework(batch);
CREATE INDEX IF NOT EXISTS homework_author ON homework(author_id);

CREATE TABLE IF NOT EXISTS done (
  user_id INTEGER NOT NULL,
  hw_id INTEGER NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, hw_id)
);
CREATE INDEX IF NOT EXISTS done_hw ON done(hw_id);

CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hw_id INTEGER NOT NULL,
  user_id INTEGER,
  action TEXT NOT NULL,
  at INTEGER NOT NULL,
  before TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS history_hw ON history(hw_id);

CREATE TABLE IF NOT EXISTS chats (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  group_id TEXT,
  added_by INTEGER,
  post_new INTEGER NOT NULL DEFAULT 1,
  evening INTEGER NOT NULL DEFAULT 1,
  last_evening TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS chats_group ON chats(group_id);

CREATE TABLE IF NOT EXISTS posts (
  hw_id INTEGER NOT NULL,
  chat_id INTEGER NOT NULL,
  message_id INTEGER NOT NULL,
  PRIMARY KEY (hw_id, chat_id)
);

CREATE TABLE IF NOT EXISTS moderators (
  group_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  added_by INTEGER,
  at INTEGER NOT NULL,
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

export class DB {
  readonly raw: DatabaseSync
  private cache = new Map<string, StatementSync>()

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.raw = new DatabaseSync(path)
    this.raw.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;')
    this.raw.exec(SCHEMA)
  }

  private stmt(sql: string) {
    let s = this.cache.get(sql)
    if (!s) { s = this.raw.prepare(sql); this.cache.set(sql, s) }
    return s
  }

  all<T>(sql: string, ...args: Value[]): T[] { return this.stmt(sql).all(...args) as T[] }
  get<T>(sql: string, ...args: Value[]): T | undefined { return this.stmt(sql).get(...args) as T | undefined }
  run(sql: string, ...args: Value[]) { return this.stmt(sql).run(...args) }

  tx<T>(fn: () => T): T {
    this.raw.exec('BEGIN')
    try { const r = fn(); this.raw.exec('COMMIT'); return r } catch (e) { this.raw.exec('ROLLBACK'); throw e }
  }

  kvGet<T>(key: string, fallback: T): T {
    const r = this.get<{ value: string }>('SELECT value FROM kv WHERE key = ?', key)
    if (!r) return fallback
    try { return JSON.parse(r.value) as T } catch { return fallback }
  }

  kvSet(key: string, value: unknown) {
    this.run('INSERT INTO kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value))
  }

  close() { this.raw.close() }
}

// ---------- строки таблиц ----------

export type UserRow = {
  id: number
  first_name: string
  last_name: string
  username: string
  role: 'student' | 'teacher' | null
  group_id: string | null
  lecturer_id: string | null
  lecturer_name: string
  verified: number
  notify_new: number
  notify_evening: number
  notify_shift: number
  evening_hour: number
  last_evening: string
  blocked: number
  created: number
  seen: number
}

export type GroupRow = { id: string; number: string; title: string; course: number | null; institution: number; updated: number }

export type HomeworkRow = {
  id: number
  group_id: string
  subject: string
  text: string
  due: number
  rule: 'pair' | 'date'
  anchor: number
  skip: number
  match_kind: string
  due_kind: string
  due_room: string
  due_estimated: number
  shift_note: string
  important: number
  photos: string
  author_id: number
  author_teacher: number
  edited_by: number | null
  batch: string
  created: number
  updated: number
  deleted: number
}

export type ChatRow = {
  id: number
  title: string
  group_id: string | null
  added_by: number | null
  post_new: number
  evening: number
  last_evening: string
  active: number
  created: number
}
