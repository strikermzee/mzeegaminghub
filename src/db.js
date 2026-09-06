// src/db.js — single SQLite database for the whole hub (sql.js: pure JS, no native build).
// Exposes a better-sqlite3-style API so game modules can share it unchanged.
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'hub.db');

let db = null;
let saveTimer = null;
let dirty = false;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  is_guest INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_login TEXT
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '🎮',
  color TEXT DEFAULT '#00f0ff',
  description TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE,
  title TEXT NOT NULL,
  category_id INTEGER,              -- NULL => shown under "Uncategorized"
  thumbnail TEXT DEFAULT '',
  url TEXT NOT NULL,
  description TEXT DEFAULT '',
  plays INTEGER DEFAULT 0,
  badges TEXT DEFAULT '[]',         -- JSON array
  featured INTEGER DEFAULT 0,
  is_local INTEGER DEFAULT 0,       -- 1 = hosted inside this site
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS analytics_daily (
  date TEXT PRIMARY KEY,
  visitors INTEGER DEFAULT 0,
  plays INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS visitor_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  date TEXT NOT NULL,
  ts TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS play_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER,
  user_id TEXT,
  ts TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id TEXT NOT NULL,
  game_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, game_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Business Tycoon leaderboard (kept in the same file: one server, one database)
CREATE TABLE IF NOT EXISTS game_results (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  won INTEGER DEFAULT 0,
  final_balance INTEGER DEFAULT 0,
  played_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_games_category ON games(category_id);
CREATE INDEX IF NOT EXISTS idx_play_log_game ON play_log(game_id);
CREATE INDEX IF NOT EXISTS idx_visitor_log_date ON visitor_log(date);
`;

function flush() {
  if (!db || !dirty) return;
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  dirty = false;
}

// Batch writes: many statements in one tick cost one file write, not N.
function scheduleSave() {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; flush(); }, 120);
}

const initPromise = (async () => {
  const SQL = await initSqlJs();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = fs.existsSync(DB_PATH) ? new SQL.Database(fs.readFileSync(DB_PATH)) : new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  db.run(SCHEMA);
  dirty = true;
  flush();
  console.log('✅ Hub database ready →', DB_PATH);
  return api;
})();

const api = {
  prepare(sql) {
    return {
      run(...params) {
        db.run(sql, params.length ? params : undefined);
        scheduleSave();
        return { changes: db.getRowsModified() };
      },
      get(...params) {
        const stmt = db.prepare(sql);
        try {
          if (params.length) stmt.bind(params);
          return stmt.step() ? stmt.getAsObject() : undefined;
        } finally { stmt.free(); }
      },
      all(...params) {
        const stmt = db.prepare(sql);
        const rows = [];
        try {
          if (params.length) stmt.bind(params);
          while (stmt.step()) rows.push(stmt.getAsObject());
        } finally { stmt.free(); }
        return rows;
      }
    };
  },
  exec(sql) { db.run(sql); scheduleSave(); },
  transaction(fn) {
    return (...args) => {
      db.run('BEGIN');
      try { const r = fn(...args); db.run('COMMIT'); scheduleSave(); return r; }
      catch (e) { db.run('ROLLBACK'); throw e; }
    };
  },
  flush,
  ready: initPromise
};

// Never lose the last writes on shutdown.
for (const sig of ['exit', 'SIGINT', 'SIGTERM']) {
  process.on(sig, () => { try { flush(); } catch {} if (sig !== 'exit') process.exit(0); });
}

module.exports = api;
