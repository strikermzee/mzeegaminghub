# 🎮 MZeeGamingHub

One website, one login, every game. All eight games now run **inside this site** — no
separate deployments, no separate accounts, no external links to click.

```bash
npm run setup    # install dependencies + build the React games
npm start        # http://localhost:3000
```

Demo accounts: `admin` / `welcome123` (admin) · `player1` / `user123` (player).
**Change the admin password before putting this online** — Admin → Update Credentials,
or set `ADMIN_PASSWORD` before the first run.

---

## What's inside

| Game | URL | Kind |
|---|---|---|
| Business Tycoon | `/games/business-tycoon/` | Multiplayer — Socket.IO |
| Tambola Queen | `/games/tambola/` | Multiplayer — React + WebSocket |
| Ludo Champion | `/games/ludo-champion/` | Multiplayer — React + Socket.IO |
| Super Mario | `/games/super-mario/` | Static |
| Stickman Count Master | `/games/stickman-count-master/` | Static |
| Block Blast | `/games/block-blast/` | Static |
| Survive Tiles | `/games/survive-tiles/` | Static |
| Subway Runner | `/games/subway-runner/` | Static |

External games (links to elsewhere) still work too — the admin panel takes any URL.

## One login for everything

`/login.html` is the only sign-in page on the site. Every page under `/` and `/games/*`
is gated: a signed-out visitor is redirected there and returned to where they were
heading afterwards.

The session is a bcrypt-backed account in SQLite, carried in an httpOnly JWT cookie.
The games do **not** have their own sign-in any more:

- **Business Tycoon** is issued a token from `/api/auth/game-token`. It is signed with the
  same secret and the same claims (`id`, `username`, `isGuest`) that its own auth already
  verified, so it accepts the hub session unchanged.
- **Tambola** and **Ludo Champion** resolve the player from `/api/auth/me` before their
  first render and open straight on the menu, their own login screens skipped entirely.

"Log out" inside any game returns you to the hub — the account belongs to the site.

## Categories, and the Uncategorized bucket

Games are filed under categories, managed in Admin → Manage Categories.

**Uncategorized** is where a game sits when it has no category. It is not a row in the
database — it is derived from `games.category_id IS NULL`, which means:

- it cannot be renamed, edited or deleted;
- it appears on the site only while at least one game is unfiled, and disappears again once
  they are all filed;
- picking **📦 Uncategorized** in the Add/Edit Game form leaves a game deliberately unfiled;
- **deleting a category never deletes its games** — they drop into Uncategorized, and the
  confirmation tells you how many will move.

## Architecture

One HTTP server hosts all of it:

```
/                        the hub (gated)
/login.html              the only login page
/api/auth/*              accounts, session, game tokens
/api/*                   games, categories, analytics, settings
/games/business-tycoon   Express router + Socket.IO  (path: …/socket.io)
/games/tambola           built React app + WebSocket (path: …/ws)
/games/ludo-champion     built React app + Socket.IO (path: …/socket.io)
/games/<slug>/           static games
```

**All three realtime games share one server.** That needs care: `ws` created with
`{server, path}` aborts every upgrade whose path doesn't match — it would kill Socket.IO's
handshakes — and Socket.IO's engine destroys upgrades *it* doesn't recognise. So Tambola's
server is created with `noServer: true`, `server.js` owns the single `upgrade` listener and
routes by path, and Socket.IO is attached with `destroyUpgrade: false`. `npm test` covers
this directly, including all three connected at once.

### Layout

```
server.js                    wiring: API, mounted games, upgrade routing, page gate
src/db.js                    SQLite (sql.js) — one file for the whole site
src/auth.js                  the shared login
src/content.js               games, categories, analytics, settings
src/seed.js                  first-run migration + defaults
games/business-tycoon/       server only: router + detached Socket.IO, no static files
games/tambola/               source; vite builds into public/games/tambola
games/ludo-champion/         source; CRA builds into public/games/ludo-champion
public/                      hub, login page, and every game's browser files
public/games/<slug>/         all 8 games live here — one folder each
scripts/                     build + test scripts (see below)
data/hub.db                  everything: accounts, games, categories, analytics
```

`games/` holds only the three games that run server code; nothing in it reaches the browser.
Everything a browser downloads — all 8 games, Business Tycoon included — is
under `public/games/<slug>/`, served by the hub's own static middleware.

To change a game: static games and Business Tycoon's screens are edited directly in
`public/games/<slug>/`; Tambola is edited in `games/tambola/src/` and rebuilt with
`npm run build:tambola` (its `public/games/tambola/` output is generated, never edited).

### Data

Everything lives in `data/hub.db`. Firebase is gone; the site makes no third-party
requests. Your existing content was migrated on first run from `data/firebase-export.json`
(6 categories, 3 games with their play counts, 12 days of analytics, help and contact
details) — that file is kept as a record and is not read again once the database exists.

Business Tycoon's `users` and `game_results` tables are in the same file; its `db.js` is a
one-line shim onto `src/db.js`.

## Scripts

`npm test` runs 34 end-to-end checks against a running server (start it first).

| Script | Purpose |
|---|---|
| `build-tambola.js` | installs Tambola's deps and builds it into `public/games/tambola` |
| `build-tambola-mount.js` | regenerates `games/tambola/mount.cjs` from `server.js` |
| `build-ludo.js` | installs Ludo's deps and builds it into `public/games/ludo-champion` |
| `test-hub.js` | the end-to-end suite |

`npm run build` runs both React game builds.

The hub's own front-end lives inline in `public/index.html` — edit it directly.

After editing `games/tambola/src/**` run `npm run build:tambola`; after
`games/ludo-champion/src/**` run `npm run build:ludo`.

## Deploying

Needs a real Node host that keeps one process alive (Render, Railway, Fly, a VPS).
Static hosting and serverless platforms cannot run it — the WebSocket connections are
long-lived and the SQLite file must persist, so the old `netlify.toml` and `vercel.json`
were removed. `render.yaml` is set up correctly, including a persistent disk for `data/`.

Copy `.env.example` to `.env` and set `JWT_SECRET` to a long random string. It signs both
the session cookie and the tokens the games trust; changing it signs everyone out.
