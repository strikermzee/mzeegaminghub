// src/content.js — games, categories, analytics and site settings, served from SQLite.
// The "Uncategorized" bucket is virtual: any game whose category_id is NULL (or points at
// a category that was deleted) falls into it. It is never a row, so it can't be edited away.
const express = require('express');
const db = require('./db');
const { requireAuth, requireAdmin } = require('./auth');

const UNCATEGORIZED = {
  id: null,
  name: 'Uncategorized',
  icon: '📦',
  color: '#8b95a5',
  description: 'Games that have not been filed under a category yet',
  virtual: true
};

const today = () => new Date().toISOString().slice(0, 10);

function parseBadges(raw) {
  try {
    const v = JSON.parse(raw || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

const rowToGame = (r) => ({
  id: r.id,
  slug: r.slug,
  title: r.title,
  categoryId: r.category_id === null || r.category_id === undefined ? null : r.category_id,
  thumbnail: r.thumbnail || '',
  url: r.url,
  description: r.description || '',
  plays: r.plays || 0,
  badges: parseBadges(r.badges),
  featured: !!r.featured,
  isLocal: !!r.is_local,
  enabled: !!r.enabled
});

const rowToCategory = (r) => ({
  id: r.id,
  name: r.name,
  icon: r.icon,
  color: r.color,
  description: r.description || '',
  sortOrder: r.sort_order || 0
});

function listCategories() {
  return db.prepare('SELECT * FROM categories ORDER BY sort_order, id').all().map(rowToCategory);
}

function listGames() {
  return db.prepare('SELECT * FROM games ORDER BY featured DESC, plays DESC, id').all().map(rowToGame);
}

// Normalises a game's category to a real, existing category id — or null.
function resolveCategoryId(value) {
  if (value === null || value === undefined || value === '' || value === 'null') return null;
  const id = parseInt(value, 10);
  if (!Number.isInteger(id)) return null;
  const exists = db.prepare('SELECT id FROM categories WHERE id = ?').get(id);
  return exists ? id : null;
}

const router = express.Router();

// ─── CATEGORIES ───────────────────────────────────────────────────────────────

// Every category plus the virtual Uncategorized bucket, each with a live game count.
router.get('/categories', (req, res) => {
  const games = listGames();
  const cats = listCategories().map((c) => ({
    ...c,
    gameCount: games.filter((g) => g.categoryId === c.id).length
  }));
  const orphans = games.filter((g) => g.categoryId === null).length;
  // Only surface the bucket when something actually lives in it.
  if (orphans > 0 || req.query.always === '1') {
    cats.push({ ...UNCATEGORIZED, gameCount: orphans });
  }
  res.json(cats);
});

router.post('/categories', requireAuth, requireAdmin, (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Category name is required.' });
  const max = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM categories').get();
  db.prepare(
    'INSERT INTO categories (name, icon, color, description, sort_order) VALUES (?,?,?,?,?)'
  ).run(name, req.body.icon || '🎮', req.body.color || '#00f0ff', req.body.description || '', (max.m || 0) + 1);
  const row = db.prepare('SELECT * FROM categories ORDER BY id DESC LIMIT 1').get();
  res.status(201).json(rowToCategory(row));
});

router.put('/categories/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const cur = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!cur) return res.status(404).json({ error: 'Category not found.' });
  db.prepare(
    'UPDATE categories SET name = ?, icon = ?, color = ?, description = ? WHERE id = ?'
  ).run(
    String(req.body.name || cur.name).trim(),
    req.body.icon || cur.icon,
    req.body.color || cur.color,
    req.body.description !== undefined ? req.body.description : cur.description,
    id
  );
  res.json(rowToCategory(db.prepare('SELECT * FROM categories WHERE id = ?').get(id)));
});

// Deleting a category does NOT delete its games — they drop into Uncategorized.
router.delete('/categories/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!db.prepare('SELECT id FROM categories WHERE id = ?').get(id))
    return res.status(404).json({ error: 'Category not found.' });
  const moved = db.prepare('SELECT COUNT(*) AS c FROM games WHERE category_id = ?').get(id).c;
  db.prepare('UPDATE games SET category_id = NULL WHERE category_id = ?').run(id);
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  res.json({ ok: true, movedToUncategorized: moved });
});

// ─── GAMES ────────────────────────────────────────────────────────────────────

router.get('/games', (req, res) => {
  let games = listGames();
  if (req.query.category === 'none' || req.query.category === 'uncategorized') {
    games = games.filter((g) => g.categoryId === null);
  } else if (req.query.category) {
    const id = parseInt(req.query.category, 10);
    games = games.filter((g) => g.categoryId === id);
  }
  if (req.query.q) {
    const q = String(req.query.q).toLowerCase();
    games = games.filter((g) => g.title.toLowerCase().includes(q) || (g.description || '').toLowerCase().includes(q));
  }
  res.json(games);
});

router.post('/games', requireAuth, requireAdmin, (req, res) => {
  const title = String(req.body.title || '').trim();
  const url = String(req.body.url || '').trim();
  if (!title) return res.status(400).json({ error: 'Game title is required.' });
  if (!url) return res.status(400).json({ error: 'Game URL is required.' });
  db.prepare(
    'INSERT INTO games (slug, title, category_id, thumbnail, url, description, plays, badges, featured, is_local, enabled, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
  ).run(
    req.body.slug || null,
    title,
    resolveCategoryId(req.body.categoryId),
    req.body.thumbnail || '',
    url,
    req.body.description || '',
    0,
    JSON.stringify(Array.isArray(req.body.badges) ? req.body.badges : []),
    req.body.featured ? 1 : 0,
    url.startsWith('/') ? 1 : 0,
    1,
    new Date().toISOString()
  );
  res.status(201).json(rowToGame(db.prepare('SELECT * FROM games ORDER BY id DESC LIMIT 1').get()));
});

router.put('/games/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const cur = db.prepare('SELECT * FROM games WHERE id = ?').get(id);
  if (!cur) return res.status(404).json({ error: 'Game not found.' });
  const url = req.body.url !== undefined ? String(req.body.url).trim() : cur.url;
  db.prepare(
    'UPDATE games SET title = ?, category_id = ?, thumbnail = ?, url = ?, description = ?, badges = ?, featured = ?, is_local = ?, enabled = ? WHERE id = ?'
  ).run(
    req.body.title !== undefined ? String(req.body.title).trim() : cur.title,
    // An explicit null clears the category and drops the game into Uncategorized.
    'categoryId' in req.body ? resolveCategoryId(req.body.categoryId) : cur.category_id,
    req.body.thumbnail !== undefined ? req.body.thumbnail : cur.thumbnail,
    url,
    req.body.description !== undefined ? req.body.description : cur.description,
    JSON.stringify(Array.isArray(req.body.badges) ? req.body.badges : parseBadges(cur.badges)),
    req.body.featured !== undefined ? (req.body.featured ? 1 : 0) : cur.featured,
    url.startsWith('/') ? 1 : 0,
    req.body.enabled !== undefined ? (req.body.enabled ? 1 : 0) : cur.enabled,
    id
  );
  res.json(rowToGame(db.prepare('SELECT * FROM games WHERE id = ?').get(id)));
});

router.delete('/games/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!db.prepare('SELECT id FROM games WHERE id = ?').get(id))
    return res.status(404).json({ error: 'Game not found.' });
  db.prepare('DELETE FROM games WHERE id = ?').run(id);
  db.prepare('DELETE FROM favorites WHERE game_id = ?').run(id);
  res.json({ ok: true });
});

// Counts a play. Requires a session — the whole site is behind the common login.
router.post('/games/:id/play', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(id);
  if (!game) return res.status(404).json({ error: 'Game not found.' });
  const d = today();
  db.prepare('UPDATE games SET plays = plays + 1 WHERE id = ?').run(id);
  db.prepare('INSERT INTO play_log (game_id, user_id, ts) VALUES (?,?,?)').run(id, req.user.id, new Date().toISOString());
  db.prepare('INSERT INTO analytics_daily (date, visitors, plays) VALUES (?,0,0) ON CONFLICT(date) DO NOTHING').run(d);
  db.prepare('UPDATE analytics_daily SET plays = plays + 1 WHERE date = ?').run(d);
  res.json({ plays: (game.plays || 0) + 1 });
});

// ─── FAVOURITES ───────────────────────────────────────────────────────────────

router.get('/favorites', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT game_id FROM favorites WHERE user_id = ?').all(req.user.id).map((r) => r.game_id));
});

router.post('/favorites/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const has = db.prepare('SELECT 1 AS x FROM favorites WHERE user_id = ? AND game_id = ?').get(req.user.id, id);
  if (has) db.prepare('DELETE FROM favorites WHERE user_id = ? AND game_id = ?').run(req.user.id, id);
  else db.prepare('INSERT INTO favorites (user_id, game_id) VALUES (?,?)').run(req.user.id, id);
  res.json({ favorited: !has });
});

// ─── ANALYTICS ────────────────────────────────────────────────────────────────

// One visit per user per day.
router.post('/analytics/visit', (req, res) => {
  const d = today();
  const uid = req.user ? req.user.id : null;
  if (uid) {
    const seen = db.prepare('SELECT 1 AS x FROM visitor_log WHERE user_id = ? AND date = ?').get(uid, d);
    if (seen) return res.json({ counted: false });
  }
  db.prepare('INSERT INTO visitor_log (user_id, date, ts) VALUES (?,?,?)').run(uid, d, new Date().toISOString());
  db.prepare('INSERT INTO analytics_daily (date, visitors, plays) VALUES (?,0,0) ON CONFLICT(date) DO NOTHING').run(d);
  db.prepare('UPDATE analytics_daily SET visitors = visitors + 1 WHERE date = ?').run(d);
  res.json({ counted: true });
});

router.get('/analytics', requireAuth, requireAdmin, (req, res) => {
  const totals = db.prepare('SELECT COALESCE(SUM(visitors),0) AS v, COALESCE(SUM(plays),0) AS p FROM analytics_daily').get();
  res.json({
    totalVisitors: totals.v,
    totalPlays: totals.p,
    totalGames: db.prepare('SELECT COUNT(*) AS c FROM games').get().c,
    totalCategories: db.prepare('SELECT COUNT(*) AS c FROM categories').get().c,
    registeredUsers: db.prepare("SELECT COUNT(*) AS c FROM users WHERE is_guest = 0 AND role = 'user'").get().c,
    uncategorizedGames: db.prepare('SELECT COUNT(*) AS c FROM games WHERE category_id IS NULL').get().c,
    dailyData: db.prepare('SELECT date, visitors, plays FROM analytics_daily ORDER BY date DESC LIMIT 30').all().reverse(),
    topGames: listGames().slice().sort((a, b) => b.plays - a.plays).slice(0, 5)
      .map((g) => ({ id: g.id, title: g.title, plays: g.plays }))
  });
});

router.get('/users', requireAuth, requireAdmin, (req, res) => {
  res.json(db.prepare(
    'SELECT id, username, email, display_name, role, is_guest, created_at, last_login FROM users ORDER BY created_at DESC LIMIT 200'
  ).all().map((u) => ({
    id: u.id, username: u.username, email: u.email, name: u.display_name,
    role: u.role, isGuest: !!u.is_guest, createdAt: u.created_at, lastLogin: u.last_login
  })));
});

// ─── SETTINGS (help / contact) ────────────────────────────────────────────────

function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return fallback; }
}

function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value));
}

router.get('/settings/:key', (req, res) => res.json(getSetting(req.params.key, {})));

router.put('/settings/:key', requireAuth, requireAdmin, (req, res) => {
  setSetting(req.params.key, req.body);
  res.json(getSetting(req.params.key, {}));
});

module.exports = { router, getSetting, setSetting, listGames, listCategories, UNCATEGORIZED };
