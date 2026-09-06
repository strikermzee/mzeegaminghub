// MZeeGamingHub — one site, one login, every game.
//
// A single HTTP server hosts:
//   /                       the hub (browse by category, play, admin)
//   /login.html             the ONE login page for everything below
//   /api/auth/*             shared accounts (bcrypt + JWT session cookie)
//   /api/*                  games, categories, analytics, settings
//   /games/business-tycoon  mounted Express router + Socket.IO (namespaced path)
//   /games/tambola          built React app + WebSocket server (namespaced path)
//   /games/<slug>/          self-contained static games
//
// Both realtime games share this server. Socket.IO is attached with destroyUpgrade:false and
// Tambola's ws runs with noServer:true, so one explicit upgrade router below decides which
// one gets each handshake — neither can abort the other's.
require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');

const db = require('./src/db');
const seed = require('./src/seed');
const auth = require('./src/auth');
const content = require('./src/content');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const app = express();
const server = http.createServer(app);

app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' })); // thumbnails arrive as data URIs
app.use(cookieParser());
app.use(auth.attachUser);

// ─── SHARED API ───────────────────────────────────────────────────────────────
app.use('/api/auth', auth.router);
app.use('/api', content.router);

// ─── MOUNTED GAMES ────────────────────────────────────────────────────────────
// Loaded defensively: a game that fails to load must not take the hub down with it.
const mounted = [];

function mountGame(label, loader) {
  try {
    const mod = loader();
    mounted.push({ label, mod });
    return mod;
  } catch (e) {
    console.error(`⚠  Could not mount ${label}: ${e.message}`);
    console.error(`   ${label} will be unavailable; the rest of the site is unaffected.`);
    return null;
  }
}

const businessTycoon = mountGame('Business Tycoon', () => require('./games/business-tycoon/server'));
const tambola = mountGame('Tambola', () => require('./games/tambola/mount.cjs'));
const ludo = mountGame('Ludo Champion', () => require('./games/ludo-champion/server'));

// Every /games/* page sits behind the common login, so a signed-out visitor who deep-links
// into a game lands on the login page and is returned here afterwards.
app.use('/games', (req, res, next) => {
  if (req.user) return next();
  if (req.accepts('html') && req.method === 'GET') {
    return res.redirect('/login.html?next=' + encodeURIComponent('/games' + req.url));
  }
  return res.status(401).json({ error: 'Sign in to play.' });
});

// Handles /api and Socket.IO only — its screens are static files, served just below.
if (businessTycoon) app.use(businessTycoon.base, businessTycoon.router);

// One static root for every game: public/games/<slug>/. Registered after the routers so
// a game's API always wins, and anything they don't claim falls through to a file here.
app.use('/games', express.static(path.join(PUBLIC_DIR, 'games')));

// Ludo is a single-page app: its router only catches deep links that matched no file above.
if (ludo) {
  const built = fs.existsSync(path.join(PUBLIC_DIR, 'games', 'ludo-champion', 'index.html'));
  if (built) {
    app.use(ludo.base, ludo.router);
  } else {
    console.warn('⚠  Ludo Champion has not been built yet — run: npm run build:ludo');
    app.get(ludo.base + '*', (req, res) =>
      res.status(503).type('html').send(
        '<body style="font-family:system-ui;background:#080a12;color:#e9edf5;display:grid;place-items:center;height:100vh;margin:0;text-align:center">' +
        '<div><h1>Ludo Champion isn\'t built yet</h1>' +
        '<p style="color:#8b95a5">Run <code style="color:#00f0ff">npm run build:ludo</code> and reload.</p>' +
        '<p><a style="color:#00f0ff" href="/">Back to MZeeGamingHub</a></p></div></body>'
      )
    );
  }
}

if (tambola) {
  const built = fs.existsSync(path.join(PUBLIC_DIR, 'games', 'tambola', 'index.html'));
  if (built) {
    app.use(tambola.base, tambola.router);
  } else {
    console.warn('⚠  Tambola has not been built yet — run: npm run build:tambola');
    app.get(tambola.base + '*', (req, res) =>
      res.status(503).type('html').send(
        '<body style="font-family:system-ui;background:#080a12;color:#e9edf5;display:grid;place-items:center;height:100vh;margin:0;text-align:center">' +
        '<div><h1>Tambola isn\'t built yet</h1>' +
        '<p style="color:#8b95a5">Run <code style="color:#00f0ff">npm run build:tambola</code> and reload.</p>' +
        '<p><a style="color:#00f0ff" href="/">Back to MZeeGamingHub</a></p></div></body>'
      )
    );
  }
}

// ─── REALTIME UPGRADE ROUTER ──────────────────────────────────────────────────
// Registered before Socket.IO attaches, and Socket.IO is told not to destroy upgrades it
// does not recognise, so the two realtime games coexist deterministically.
if (tambola) {
  server.on('upgrade', (req, socket, head) => {
    let pathname;
    try { pathname = new URL(req.url, 'http://localhost').pathname; }
    catch { return; }
    if (pathname === tambola.wsPath) tambola.handleUpgrade(req, socket, head);
    // Anything else is left for Socket.IO's own listener.
  });
}

if (businessTycoon) businessTycoon.attach(server, { destroyUpgrade: false });
if (ludo) ludo.attach(server, { destroyUpgrade: false });

// ─── HUB PAGES ────────────────────────────────────────────────────────────────
// The login page must stay reachable while signed out; everything else is gated.
app.use(express.static(PUBLIC_DIR, { index: false }));

const GATED_PAGES = ['/', '/index.html'];
app.get(GATED_PAGES, auth.gatePage, (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

app.get('/health', (req, res) =>
  res.json({
    ok: true,
    games: mounted.map((m) => m.label),
    uptime: Math.round(process.uptime())
  })
);

// Unknown paths: send signed-in users to the hub, everyone else to the login page.
app.use((req, res) => {
  if (req.accepts('html')) return res.redirect(req.user ? '/' : '/login.html');
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Something went wrong on our side.' });
});

// ─── START ────────────────────────────────────────────────────────────────────
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use — MZeeGamingHub is probably running already.`);
    console.error(`   Stop the other process, or start this one on another port:  PORT=3001 npm start\n`);
    process.exit(1);
  }
  throw err;
});

db.ready
  .then(() => {
    seed.run();
    server.listen(PORT, () => {
      const games = content.listGames();
      const cats = content.listCategories();
      const orphans = games.filter((g) => g.categoryId === null).length;
      console.log(`
╔════════════════════════════════════════════════════════════╗
║   🎮  MZeeGamingHub — one site, every game                 ║
╠════════════════════════════════════════════════════════════╣
║   Local:      http://localhost:${String(PORT).padEnd(28)}║
║   Games:      ${String(games.length + ' (' + games.filter((g) => g.isLocal).length + ' hosted here)').padEnd(45)}║
║   Categories: ${String(cats.length + (orphans ? ` + Uncategorized (${orphans})` : '')).padEnd(45)}║
║   Mounted:    ${String(mounted.map((m) => m.label).join(', ') || 'none').padEnd(45)}║
╚════════════════════════════════════════════════════════════╝
`);
    });
  })
  .catch((err) => {
    console.error('Failed to start: database did not initialise.', err);
    process.exit(1);
  });
