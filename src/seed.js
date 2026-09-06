// src/seed.js — first-run migration.
// Pulls the live Firebase export (data/firebase-export.json) into SQLite, rewrites the two
// games that used to be hosted elsewhere so they now point inside this site, and registers
// the games that ship in public/games. Runs once; safe to re-run (it no-ops when seeded).
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const EXPORT_PATH = path.join(__dirname, '..', 'data', 'firebase-export.json');

// Self-contained thumbnails — no external image host, so the hub works offline.
function thumb(title, emoji, from, to) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="375" viewBox="0 0 500 375">
<defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
<stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/></linearGradient>
<radialGradient id="v" cx="50%" cy="40%" r="70%">
<stop offset="0%" stop-color="#ffffff" stop-opacity="0.18"/><stop offset="100%" stop-color="#000000" stop-opacity="0.35"/></radialGradient></defs>
<rect width="500" height="375" fill="url(#g)"/><rect width="500" height="375" fill="url(#v)"/>
<text x="250" y="180" font-size="110" text-anchor="middle" dominant-baseline="middle">${emoji}</text>
<text x="250" y="285" font-family="Segoe UI,Arial,sans-serif" font-size="30" font-weight="700"
 fill="#ffffff" text-anchor="middle" letter-spacing="1">${title}</text></svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64');
}

// Games that live inside this site. `legacyTitle` links a row that came from Firebase
// so it is re-pointed rather than duplicated.
const LOCAL_GAMES = [
  {
    slug: 'business-tycoon', title: 'Business Tycoon', legacyTitle: 'Business Tycoon',
    url: '/games/business-tycoon/', category: 'Simulation',
    description: 'Multiplayer property-trading board game. Build an empire, bankrupt your friends.',
    thumb: thumb('Business Tycoon', '🏙️', '#0d1b2a', '#6b2d7b'), badges: ['hot', 'featured'], featured: true
  },
  {
    slug: 'tambola', title: 'Tambola Queen', legacyTitle: 'Tambola Queen',
    url: '/games/tambola/', category: 'Board & Cards',
    description: 'Housie / Bingo with private rooms, live number calling and prize claims.',
    thumb: thumb('Tambola Queen', '🎱', '#3a0ca3', '#f72585'), badges: ['multiplayer'], featured: true
  },
  {
    slug: 'super-mario', title: 'Super Mario', url: '/games/super-mario/', category: 'Adventure',
    description: 'Classic side-scrolling platformer. Run, jump and stomp your way to the flag.',
    thumb: thumb('Super Mario', '🍄', '#1e6091', '#48cae4'), badges: ['classic'], featured: true
  },
  {
    slug: 'stickman-count-master', title: 'Stickman Count Master', url: '/games/stickman-count-master/',
    category: 'Puzzle', description: 'Grow your stickman crowd through the right gates and storm the tower.',
    thumb: thumb('Count Master', '🏃', '#2b2d42', '#ef233c'), badges: [], featured: false
  },
  {
    slug: 'block-blast', title: 'Block Blast', url: '/games/block-blast/', category: 'Puzzle',
    description: 'Drop blocks, clear lines, chain combos. Easy to start, hard to stop.',
    thumb: thumb('Block Blast', '🧱', '#432818', '#ff9f1c'), badges: ['new'], featured: false
  },
  {
    slug: 'survive-tiles', title: 'Survive Tiles', url: '/games/survive-tiles/', category: 'Arcade',
    description: 'Keep to the safe tiles as the floor disappears beneath you.',
    thumb: thumb('Survive Tiles', '🟦', '#132a13', '#31c48d'), badges: ['new'], featured: false
  },
  {
    slug: 'subway-runner', title: 'Subway Runner', url: '/games/subway-runner/', category: 'Arcade',
    description: 'Endless runner — dodge the trains, grab the coins, beat your best distance.',
    thumb: thumb('Subway Runner', '🚇', '#03071e', '#f48c06'), badges: ['hot'], featured: true
  }
];

// Added on top of the six categories that already exist in Firebase.
const EXTRA_CATEGORIES = [
  { name: 'Board & Cards', icon: '🎲', color: '#b388ff', description: 'Turn-based board and card games' },
  { name: 'Arcade', icon: '👾', color: '#ffd166', description: 'Quick-fire high-score classics' }
];

const catIdByName = (name) => {
  const r = db.prepare('SELECT id FROM categories WHERE lower(name) = lower(?)').get(name);
  return r ? r.id : null;
};

function seedCategories(exported) {
  if (db.prepare('SELECT COUNT(*) AS c FROM categories').get().c > 0) return;
  const cats = (exported && exported.categories) || [];
  for (const c of cats) {
    db.prepare('INSERT INTO categories (id, name, icon, color, description, sort_order) VALUES (?,?,?,?,?,?)')
      .run(c.id, c.name, c.icon || '🎮', c.color || '#00f0ff', c.description || '', c.id);
  }
  for (const c of EXTRA_CATEGORIES) {
    if (catIdByName(c.name)) continue;
    const max = db.prepare('SELECT COALESCE(MAX(sort_order),0) AS m FROM categories').get().m;
    db.prepare('INSERT INTO categories (name, icon, color, description, sort_order) VALUES (?,?,?,?,?)')
      .run(c.name, c.icon, c.color, c.description, max + 1);
  }
  console.log('   • categories seeded:', db.prepare('SELECT COUNT(*) AS c FROM categories').get().c);
}

function seedGames(exported) {
  if (db.prepare('SELECT COUNT(*) AS c FROM games').get().c > 0) return;

  const exportedGames = (exported && exported.games) || [];
  const localByLegacy = new Map(LOCAL_GAMES.filter((g) => g.legacyTitle).map((g) => [g.legacyTitle.toLowerCase(), g]));
  const used = new Set();

  // 1. Everything that was already on the site, with play counts preserved.
  for (const g of exportedGames) {
    const local = localByLegacy.get(String(g.title || '').toLowerCase());
    if (local) used.add(local.slug);
    const url = local ? local.url : g.url;
    db.prepare(
      'INSERT INTO games (slug, title, category_id, thumbnail, url, description, plays, badges, featured, is_local, enabled, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
    ).run(
      local ? local.slug : null,
      g.title,
      local && local.category ? catIdByName(local.category) : (g.categoryId ?? null),
      g.thumbnail || (local ? local.thumb : ''),
      url,
      g.description || (local ? local.description : ''),
      g.plays || 0,
      JSON.stringify(local ? local.badges : (g.badges || [])),
      (local ? local.featured : g.featured) ? 1 : 0,
      url.startsWith('/') ? 1 : 0,
      1,
      new Date().toISOString()
    );
  }

  // 2. The games that are new to the hub.
  for (const g of LOCAL_GAMES) {
    if (used.has(g.slug)) continue;
    db.prepare(
      'INSERT INTO games (slug, title, category_id, thumbnail, url, description, plays, badges, featured, is_local, enabled, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
    ).run(g.slug, g.title, catIdByName(g.category), g.thumb, g.url, g.description, 0,
      JSON.stringify(g.badges), g.featured ? 1 : 0, 1, 1, new Date().toISOString());
  }
  console.log('   • games seeded:', db.prepare('SELECT COUNT(*) AS c FROM games').get().c);
}

function seedAnalytics(exported) {
  if (db.prepare('SELECT COUNT(*) AS c FROM analytics_daily').get().c > 0) return;
  for (const d of (exported && exported.analytics && exported.analytics.dailyData) || []) {
    if (!d.date) continue;
    db.prepare('INSERT INTO analytics_daily (date, visitors, plays) VALUES (?,?,?) ON CONFLICT(date) DO NOTHING')
      .run(d.date, d.visitors || 0, d.plays || 0);
  }
  console.log('   • analytics days migrated:', db.prepare('SELECT COUNT(*) AS c FROM analytics_daily').get().c);
}

function seedSettings(exported) {
  const put = (k, v) => db.prepare(
    'INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO NOTHING'
  ).run(k, JSON.stringify(v));

  const help = (exported && exported.helpData) || {};
  put('help', {
    title: help.title || 'Help & Support',
    content: help.content || 'Welcome to MZeeGamingHub! We provide the best gaming experience.',
    // The old copy predates the common login — bring it in line with how the site works now.
    faqs: [
      { q: 'How do I play games?', a: 'Sign in once, then click any game card. Every game runs inside the site — you never need a second account.' },
      { q: 'Do I need to register?', a: 'Yes — one free MZee account unlocks every game. You can also enter as a guest if you just want a quick play.' },
      { q: 'What does "Uncategorized" mean?', a: 'It is where a game sits until an admin files it under a category. It appears automatically whenever at least one game is unfiled.' },
      { q: 'How can I contact support?', a: 'Use the Contact page or email us directly.' }
    ]
  });

  const contact = (exported && exported.contactData) || {};
  put('contact', {
    email: contact.email || 'mohamedzohaib.aseef@gmail.com',
    phone: contact.phone || '',
    address: (contact.address || '').trim(),
    hours: contact.hours || '24/7 Support Available',
    social: contact.social || { facebook: '', twitter: '', discord: '' }
  });
}

function seedAccounts() {
  const mk = (username, email, password, name, role) => {
    if (db.prepare('SELECT id FROM users WHERE lower(username) = lower(?)').get(username)) return false;
    db.prepare(
      'INSERT INTO users (id, username, email, password_hash, display_name, role, is_guest, created_at) VALUES (?,?,?,?,?,?,0,?)'
    ).run(uuidv4(), username, email, bcrypt.hashSync(password, 10), name, role, new Date().toISOString());
    return true;
  };

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@mzee.com';
  const adminPass = process.env.ADMIN_PASSWORD || 'welcome123';
  const madeAdmin = mk('admin', adminEmail, adminPass, 'Admin', 'admin');
  mk('player1', 'user@mzee.com', 'user123', 'Player One', 'user');

  if (madeAdmin && !process.env.ADMIN_PASSWORD) {
    console.log('   ⚠  Admin seeded with the default password "welcome123" —');
    console.log('      change it from Admin → Update Credentials, or set ADMIN_PASSWORD before first run.');
  }
}

// Guest accounts are disposable. Logging out removes them, but a closed tab leaves one
// behind, so sweep anything older than a day on start-up.
function sweepStaleGuests() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const stale = db.prepare('SELECT COUNT(*) AS c FROM users WHERE is_guest = 1 AND created_at < ?').get(cutoff).c;
  if (!stale) return;
  db.prepare('DELETE FROM favorites WHERE user_id IN (SELECT id FROM users WHERE is_guest = 1 AND created_at < ?)').run(cutoff);
  db.prepare('DELETE FROM users WHERE is_guest = 1 AND created_at < ?').run(cutoff);
  console.log('   • cleared ' + stale + ' expired guest session(s)');
}

function run() {
  const already = db.prepare('SELECT COUNT(*) AS c FROM games').get().c > 0;
  let exported = null;
  if (fs.existsSync(EXPORT_PATH)) {
    try { exported = JSON.parse(fs.readFileSync(EXPORT_PATH, 'utf8')); }
    catch (e) { console.warn('   ! Could not read firebase-export.json:', e.message); }
  }
  if (!already) console.log('🌱 Seeding hub database' + (exported ? ' (migrating Firebase export)' : '') + '…');
  seedCategories(exported);
  seedGames(exported);
  seedAnalytics(exported);
  seedSettings(exported);
  seedAccounts();
  sweepStaleGuests();
  db.flush();
  if (!already) console.log('   • done');
}

module.exports = { run, LOCAL_GAMES };
