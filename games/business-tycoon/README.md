# 💼 Business Tycoon — Multiplayer Online

A full multiplayer Business Tycoon (Monopoly-style) game with real-time play, private rooms, login/guest accounts, in-game chat, and a leaderboard.

---

## Features

- 🔑 **Private rooms** — 6-character invite codes to share with friends
- 👤 **User accounts** + guest play (no signup needed)
- 🎲 **Real-time multiplayer** — all moves sync instantly via WebSockets
- 💬 **In-game chat** for all players
- 🏆 **Leaderboard** tracking wins and best balance
- 🏦 Bank loans, mortgages, hotels, auctions, and trading
- Up to 6 players per room

---

## Deploy on Railway (FREE — Beginner Friendly)

### Step 1 — Get the code on GitHub

1. Download this folder as a ZIP
2. Go to [github.com](https://github.com) and create a free account
3. Click **New Repository** → name it `business-tycoon` → click **Create**
4. Drag and drop all the files into the repo using GitHub's web uploader

### Step 2 — Deploy on Railway

1. Go to [railway.app](https://railway.app) and sign up with your GitHub account
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your `business-tycoon` repository
4. Railway will auto-detect it as a Node.js app — click **Deploy**

### Step 3 — Set environment variables

In your Railway project dashboard:
1. Click on your service → **Variables** tab
2. Add these variables:
   ```
   JWT_SECRET = some-long-random-string-change-this-abc123xyz
   NODE_ENV   = production
   ```
3. Click **Deploy** again to apply

### Step 4 — Get your URL

1. Go to **Settings** → **Domains** → click **Generate Domain**
2. You'll get a URL like `https://business-tycoon-production.up.railway.app`
3. Share this URL with friends!

---

## Run Locally (for testing)

```bash
# 1. Install dependencies
npm install

# 2. Copy and edit the env file
cp .env.example .env
# Edit .env and set JWT_SECRET to any random string

# 3. Start the server
npm start

# OR with auto-restart on file changes:
npm run dev

# 4. Open http://localhost:3000 in your browser
```

---

## How to Play

1. **Register** an account or play as a **Guest**
2. One player **creates a room** — share the 6-character code
3. Friends **join with the code** (up to 6 players)
4. The host clicks **Start Game**
5. Take turns rolling dice, buying properties, paying rent
6. **Build hotels** to increase rent
7. Use the **Bank Loan** if you run low on cash
8. **Trade** properties with other players
9. Last player standing wins!

### Game Rules Summary

| Event | Effect |
|-------|--------|
| Pass START | Collect Rs.1,500 |
| Land on unowned property | Buy it or trigger auction |
| Land on owned property | Pay rent to owner |
| Jail | Pay Rs.500 fine or roll doubles (3 tries) |
| Chance/Community Chest | Draw a card |
| Income Tax | Pay Rs.200 |
| Bank Loan | Borrow up to Rs.5,000 (10% interest every 5 turns) |
| Hotels | Multiply rent up to 6× |
| Mortgage | Get 50% of property value; pay 60% to unmortgage |

---

## Project Structure

```
business-tycoon/
├── server.js        ← Main server (Express + Socket.io + game logic)
├── db.js            ← SQLite database setup
├── gameData.js      ← Board cells, Chance/Community cards
├── package.json
├── .env.example
└── public/
    ├── index.html   ← Login / Register / Guest page
    ├── lobby.html   ← Create room, join room, leaderboard
    └── game.html    ← Full multiplayer game board
```

---

## Tech Stack

- **Backend**: Node.js, Express, Socket.io
- **Database**: SQLite (via better-sqlite3)
- **Auth**: JWT tokens + bcrypt password hashing
- **Frontend**: Vanilla HTML/CSS/JS (no framework needed)
- **Hosting**: Railway (free tier)

---

## Troubleshooting

**"Room not found"** — The room may have expired if the host disconnected. Create a new room.

**Game won't start** — Need at least 2 players in the lobby.

**Database resets on redeploy** — Railway's filesystem resets on each deploy. To persist the leaderboard permanently, upgrade to Railway's Postgres plugin (free plan available).

**Port issues locally** — Make sure nothing else is running on port 3000, or change `PORT` in `.env`.
