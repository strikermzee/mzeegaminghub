// End-to-end check of the whole hub against a running server (npm start, then npm test).
// Covers the login gate, the shared session, single sign-on into the games, the
// Uncategorized bucket, and both realtime transports sharing one HTTP server.
const http = require('http');
const WebSocket = require('ws');
const { io } = require('socket.io-client');

const HOST = 'localhost';
const PORT = process.env.PORT || 3000;
const BASE = `http://${HOST}:${PORT}`;

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? '  — ' + detail : ''}`);
}
const section = (t) => console.log(`\n${t}`);

function request(method, path, body, cookie) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const headers = {};
    if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data); }
    if (cookie) headers.Cookie = cookie;
    const req = http.request({ host: HOST, port: PORT, path, method, headers }, (res) => {
      let out = '';
      res.on('data', (c) => (out += c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(out); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, body: out, json });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const timeout = (p, ms, label) => Promise.race([
  p, new Promise((_, rej) => setTimeout(() => rej(new Error(label + ' timed out')), ms))
]);

function tambolaWs() {
  return new Promise((resolve, reject) => {
    const code = 'T' + Math.floor(100000 + Math.random() * 899999);
    const ws = new WebSocket(`ws://${HOST}:${PORT}/games/tambola/ws`);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'create_room', code, playerName: 'Probe', maxPlayers: 2 })));
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      if (msg.type === 'room_update') { ws.close(); resolve((msg.players || []).some((p) => p.name === 'Probe')); }
    });
    ws.on('error', reject);
  });
}

function tycoonSocket(token) {
  return new Promise((resolve, reject) => {
    const s = io(BASE, { path: '/games/business-tycoon/socket.io', auth: { token }, transports: ['websocket'], reconnection: false });
    const finish = (v) => { s.close(); resolve(v); };
    s.on('connect', () => s.emit('createRoom', { tok: '🔵', color: '#222' }));
    s.on('authError', (m) => { s.close(); reject(new Error('authError: ' + m)); });
    s.on('connect_error', (e) => { s.close(); reject(new Error('connect_error: ' + e.message)); });
    s.on('roomCreated', finish); s.on('gameState', finish); s.on('roomUpdate', finish);
    setTimeout(() => { if (s.connected) finish(true); }, 3000); // connected + authenticated is the assertion
  });
}

// Ludo creates its room purely over Socket.IO, so a returned room code proves both the
// namespaced transport and the game loop are alive.
function ludoSocket() {
  return new Promise((resolve, reject) => {
    const s = io(BASE, { path: '/games/ludo-champion/socket.io', transports: ['websocket'], reconnection: false });
    s.on('connect', () => s.emit('createRoom', { username: 'Probe', pawn: 'red', isGuest: false, allowLateJoining: true }));
    s.on('roomCreated', ({ code }) => { s.close(); resolve(code); });
    s.on('connect_error', (e) => { s.close(); reject(new Error('connect_error: ' + e.message)); });
  });
}

(async () => {
  console.log('\n═══ MZeeGamingHub end-to-end ═══');

  const health = await request('GET', '/health');
  if (health.status !== 200) {
    console.error('\n❌ Server is not running on ' + BASE + ' — start it with `npm start` first.\n');
    process.exit(1);
  }

  section('Login gate');
  const rootOut = await request('GET', '/');
  check('signed-out hub root redirects to login', rootOut.status === 302 && /\/login\.html/.test(rootOut.headers.location || ''));
  const gameOut = await request('GET', '/games/super-mario/');
  check('signed-out game deep link redirects to login', gameOut.status === 302 && /next=/.test(gameOut.headers.location || ''));
  check('login page is reachable while signed out', (await request('GET', '/login.html')).status === 200);
  check('protected API rejects anonymous writes', (await request('POST', '/api/games', { title: 'x', url: '/x' })).status === 401);

  section('Shared account');
  check('wrong password is rejected', (await request('POST', '/api/auth/login', { identifier: 'admin', password: 'nope' })).status === 401);
  const login = await request('POST', '/api/auth/login', { identifier: 'admin', password: process.env.ADMIN_PASSWORD || 'welcome123' });
  const cookie = (login.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
  check('admin can sign in', login.status === 200 && !!cookie);
  check('session cookie is httpOnly', /HttpOnly/i.test((login.headers['set-cookie'] || []).join(';')));
  check('signed-in hub root serves the page', (await request('GET', '/', undefined, cookie)).status === 200);

  const guest = await request('POST', '/api/auth/guest', { name: 'Wanderer' });
  check('guest sign-in works', guest.status === 200 && guest.json.user.isGuest === true);

  section('Games are hosted inside the site');
  const games = (await request('GET', '/api/games', undefined, cookie)).json;
  const local = games.filter((g) => g.isLocal);
  check(`${local.length} games served from this origin`, local.length >= 7);
  for (const g of local) {
    const r = await request('GET', g.url, undefined, cookie);
    check(`  ${g.title} → ${g.url}`, r.status === 200, r.status === 200 ? undefined : 'HTTP ' + r.status);
  }

  section('Categories & the Uncategorized bucket');
  const cats = (await request('GET', '/api/categories', undefined, cookie)).json;
  check('categories load with game counts', cats.length > 0 && cats.every((c) => typeof c.gameCount === 'number'));
  check('no Uncategorized bucket while every game is filed', !cats.some((c) => c.virtual));

  const made = await request('POST', '/api/games', { title: '__probe__', url: 'https://example.com/p', categoryId: null }, cookie);
  check('a game can be added with no category', made.status === 201 && made.json.categoryId === null);
  const cats2 = (await request('GET', '/api/categories', undefined, cookie)).json;
  const bucket = cats2.find((c) => c.virtual);
  check('Uncategorized appears once a game is unfiled', !!bucket && bucket.gameCount >= 1);
  const noneList = (await request('GET', '/api/games?category=none', undefined, cookie)).json;
  check('unfiled games are listable', noneList.some((g) => g.title === '__probe__'));

  const tmpCat = await request('POST', '/api/categories', { name: '__probecat__', icon: '🧪' }, cookie);
  await request('PUT', '/api/games/' + made.json.id, { categoryId: tmpCat.json.id }, cookie);
  const del = await request('DELETE', '/api/categories/' + tmpCat.json.id, undefined, cookie);
  check('deleting a category moves its games to Uncategorized (never deletes them)', del.json.movedToUncategorized === 1);
  const after = (await request('GET', '/api/games/', undefined, cookie)).json || [];
  check('the game survived its category being deleted', after.some((g) => g.title === '__probe__'));
  await request('DELETE', '/api/games/' + made.json.id, undefined, cookie);
  check('cleanup: probe game removed', !((await request('GET', '/api/games', undefined, cookie)).json.some((g) => g.title === '__probe__')));

  section('Single sign-on into the games');
  const tok = await request('GET', '/api/auth/game-token', undefined, cookie);
  check('hub issues a game token', tok.status === 200 && !!tok.json.token);
  check('game token is refused without a session', (await request('GET', '/api/auth/game-token')).status === 401);

  section('Realtime: three games, one server');
  try { check('Tambola WebSocket', await timeout(tambolaWs(), 8000, 'tambola')); }
  catch (e) { check('Tambola WebSocket', false, e.message); }
  try { await timeout(tycoonSocket(tok.json.token), 8000, 'tycoon'); check('Business Tycoon Socket.IO accepts the hub token', true); }
  catch (e) { check('Business Tycoon Socket.IO accepts the hub token', false, e.message); }
  try {
    const code = await timeout(ludoSocket(), 8000, 'ludo');
    check('Ludo Champion Socket.IO creates a room', /^\d{7}$/.test(String(code)), 'got ' + code);
  } catch (e) { check('Ludo Champion Socket.IO creates a room', false, e.message); }
  try {
    // The real risk of sharing one HTTP server: three transports on three paths.
    const [a, b, c] = await timeout(Promise.all([tambolaWs(), tycoonSocket(tok.json.token), ludoSocket()]), 15000, 'all three');
    check('all three connected simultaneously', !!a && !!b && !!c);
  } catch (e) { check('all three connected simultaneously', false, e.message); }
  try {
    await timeout(new Promise((res) => {
      const ws = new WebSocket(`ws://${HOST}:${PORT}/stray`);
      ws.on('open', () => { ws.close(); res(1); }); ws.on('error', () => res(1)); ws.on('close', () => res(1));
    }), 6000, 'stray');
    check('server survives a stray upgrade', (await request('GET', '/health')).status === 200);
  } catch (e) { check('server survives a stray upgrade', false, e.message); }

  section('Play tracking');
  const target = games.find((g) => g.isLocal);
  const before = target.plays;
  const played = await request('POST', `/api/games/${target.id}/play`, {}, cookie);
  check('play count increments and persists', played.json.plays === before + 1);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n═══ ${results.length - failed.length}/${results.length} passed ═══\n`);
  if (failed.length) { failed.forEach((f) => console.log('  failed: ' + f.name)); console.log(); }
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('\nTest run crashed:', e); process.exit(1); });
