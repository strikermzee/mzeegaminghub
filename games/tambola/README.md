# 🎱 Tambola – The Ultimate Housie Experience

A beautiful, fully-featured Tambola (Housie/Bingo) game built with React + Vite.

## Features
- 🤖 **Play vs Computer** – Battle 2 AI bots (Bot Alex & Bot Maya)
- 🔐 **Private Room** – Create a room with a 6-digit code to invite friends
- 🎯 **5 Win Types** – Early 5, Top Line, Middle Line, Bottom Line, Full House
- 🎲 **Auto Draw** – Adjustable speed (Slow → Fast)
- 📊 **Live Number Board** – Visual 1–90 grid with highlights
- 🏆 **Win Claims** – Click CLAIM before the bots do!
- ✨ **Beautiful UI** – Dark starfield theme with animations

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** v18 or higher → https://nodejs.org
- **npm** (comes with Node.js)

### Run Locally

```bash
# 1. Open terminal in this folder
cd tambola

# 2. Install dependencies (first time only, ~30 seconds)
npm install

# 3. Start the game
npm run dev

# 4. Open your browser at:
#    http://localhost:3000
```

The browser should open automatically. If not, navigate to `http://localhost:3000`.

---

## 📁 Project Structure

```
tambola/
├── index.html              # Entry HTML
├── package.json            # Dependencies
├── vite.config.js          # Vite configuration
├── public/
│   └── favicon.svg         # Browser tab icon
└── src/
    ├── main.jsx            # React root mount
    ├── App.jsx             # Root component
    └── TambolaGame.jsx     # Complete game logic + UI
```

---

## 🎮 How to Play

1. Enter your name (optional)
2. Choose **Play vs Computer** or **Create/Join Private Room**
3. Click **Draw Number** or hit **Auto Play** to start calling numbers
4. Numbers appear on your ticket – they auto-highlight when called
5. When you complete a pattern, **click CLAIM** immediately!

### Win Patterns
| Pattern | Description |
|---------|-------------|
| ⚡ Early 5 | First 5 numbers marked on your ticket |
| 🔝 Top Line | All 5 numbers in the top row marked |
| ➡️ Middle Line | All 5 numbers in the middle row marked |
| ⬇️ Bottom Line | All 5 numbers in the bottom row marked |
| 🏆 Full House | All 15 numbers on your ticket marked |

---

## 🏗️ Build for Production

```bash
npm run build
# Output goes to: dist/ folder
# Host this folder on any web server (Netlify, Vercel, etc.)
```

---

## 🗺️ Roadmap (Next Steps)
- [ ] Real multiplayer via Socket.io backend
- [ ] Electron wrapper for Windows/macOS desktop app
- [ ] Sound effects and music
- [ ] Multiple tickets per player
- [ ] Leaderboard / score history

---

Made with ♥ using React + Vite
