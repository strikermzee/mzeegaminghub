// src/auth.js — the ONE login for the whole site.
// Issues a JWT whose claims ({ id, username, isGuest }) are understood as-is by the
// mounted game servers, so signing in here signs you in everywhere. No second login.
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'mzee-hub-dev-secret-change-me';
const COOKIE = 'mzee_session';
const SESSION_DAYS = 7;

const cookieOpts = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000
};

const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  email: u.email || null,
  name: u.display_name || u.username,
  role: u.role,
  isGuest: !!u.is_guest
});

function sign(u, expiresIn = SESSION_DAYS + 'd') {
  // Claim shape is deliberately the one Business Tycoon already verifies.
  return jwt.sign(
    { id: u.id, username: u.username, isGuest: !!u.is_guest, role: u.role },
    JWT_SECRET,
    { expiresIn }
  );
}

function readToken(req) {
  if (req.cookies && req.cookies[COOKIE]) return req.cookies[COOKIE];
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) return h.slice(7);
  return null;
}

// Attaches req.user when a valid session exists. Never throws.
function attachUser(req, _res, next) {
  const token = readToken(req);
  if (token) {
    try {
      const claims = jwt.verify(token, JWT_SECRET);
      const row = db.prepare('SELECT * FROM users WHERE id = ?').get(claims.id);
      req.user = row
        ? publicUser(row)
        : { id: claims.id, username: claims.username, name: claims.username, role: claims.role || 'user', isGuest: !!claims.isGuest };
      req.token = token;
    } catch { /* expired or tampered — treated as signed out */ }
  }
  next();
}

const requireAuth = (req, res, next) =>
  req.user ? next() : res.status(401).json({ error: 'Sign in to continue.' });

const requireAdmin = (req, res, next) =>
  req.user && req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admin access required.' });

// For page (not API) requests: bounce signed-out visitors to the common login page.
function gatePage(req, res, next) {
  if (req.user) return next();
  const back = encodeURIComponent(req.originalUrl || '/');
  res.redirect('/login.html?next=' + back);
}

function findByLogin(idf) {
  return db.prepare(
    'SELECT * FROM users WHERE lower(username) = lower(?) OR lower(email) = lower(?)'
  ).get(idf, idf);
}

function issue(res, user) {
  const token = sign(user);
  res.cookie(COOKIE, token, cookieOpts);
  db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(new Date().toISOString(), user.id);
  return token;
}

const router = express.Router();

router.post('/register', (req, res) => {
  const username = String(req.body.username || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const displayName = String(req.body.name || '').trim() || username;

  if (username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (db.prepare('SELECT id FROM users WHERE lower(username) = lower(?)').get(username))
    return res.status(409).json({ error: 'That username is taken.' });
  if (email && db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').get(email))
    return res.status(409).json({ error: 'That email is already registered.' });

  const user = {
    id: uuidv4(),
    username,
    email: email || null,
    password_hash: bcrypt.hashSync(password, 10),
    display_name: displayName,
    role: 'user',
    is_guest: 0
  };
  db.prepare(
    'INSERT INTO users (id, username, email, password_hash, display_name, role, is_guest, created_at) VALUES (?,?,?,?,?,?,?,?)'
  ).run(user.id, user.username, user.email, user.password_hash, user.display_name, user.role, 0, new Date().toISOString());

  issue(res, user);
  res.status(201).json({ user: publicUser(user) });
});

router.post('/login', (req, res) => {
  const idf = String(req.body.identifier || req.body.email || req.body.username || '').trim();
  const password = String(req.body.password || '');
  const user = findByLogin(idf);
  // Same message either way — don't reveal which accounts exist.
  if (!user || !user.password_hash || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Incorrect username/email or password.' });
  issue(res, user);
  res.json({ user: publicUser(user) });
});

router.post('/guest', (req, res) => {
  const name = String(req.body.name || '').trim() || 'Guest' + Math.floor(1000 + Math.random() * 9000);
  const user = {
    id: 'guest_' + uuidv4(),
    username: name + '#' + Math.floor(1000 + Math.random() * 9000),
    email: null,
    password_hash: null,
    display_name: name,
    role: 'user',
    is_guest: 1
  };
  db.prepare(
    'INSERT INTO users (id, username, email, password_hash, display_name, role, is_guest, created_at) VALUES (?,?,?,?,?,?,?,?)'
  ).run(user.id, user.username, null, null, user.display_name, 'user', 1, new Date().toISOString());
  issue(res, user);
  res.json({ user: publicUser(user) });
});

router.post('/logout', (req, res) => {
  // Guests exist only for their session — don't leave rows behind.
  if (req.user && req.user.isGuest) {
    try { db.prepare('DELETE FROM users WHERE id = ? AND is_guest = 1').run(req.user.id); } catch {}
  }
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in.' });
  res.json({ user: req.user });
});

// Hands the signed-in identity to a mounted game (Business Tycoon reads this).
router.get('/game-token', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const u = row || {
    id: req.user.id,
    username: req.user.username,
    is_guest: req.user.isGuest ? 1 : 0,
    role: req.user.role
  };
  res.json({ token: sign(u, '12h'), user: req.user });
});

router.post('/change-password', requireAuth, (req, res) => {
  const current = String(req.body.currentPassword || '');
  const next = String(req.body.newPassword || '');
  if (next.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!row || !row.password_hash) return res.status(400).json({ error: 'Guest accounts have no password.' });
  if (!bcrypt.compareSync(current, row.password_hash)) return res.status(401).json({ error: 'Current password is incorrect.' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(next, 10), req.user.id);
  res.json({ ok: true });
});

// Admins can change their own sign-in email/password (replaces the old localStorage hack).
router.post('/update-credentials', requireAuth, requireAdmin, (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (email) {
    const clash = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?) AND id != ?').get(email, req.user.id);
    if (clash) return res.status(409).json({ error: 'That email is already in use.' });
    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email, req.user.id);
  }
  if (password) {
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), req.user.id);
  }
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: publicUser(row) });
});

module.exports = {
  router, attachUser, requireAuth, requireAdmin, gatePage,
  publicUser, sign, JWT_SECRET, COOKIE
};
