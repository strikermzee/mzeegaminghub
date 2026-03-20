# 🎮 MZEE GAMING ZONE

A modern, viral-worthy gaming website with thousands of free online games. Features user authentication, admin dashboard with analytics, and easy game management.

![MZEE Gaming Zone](https://img.shields.io/badge/MZEE-Gaming%20Zone-00f0ff?style=for-the-badge&logo=gamepad)

## ✨ Features

- 🎨 **Stunning Cyberpunk Design** - Neon colors, animations, and modern UI
- 👤 **User System** - Register, login, save favorites
- 👑 **Admin Dashboard** - Traffic analytics, game management
- 🎮 **Game Management** - Add/edit/delete games via URL
- 📱 **Responsive** - Works on all devices
- ⚡ **Fast & Lightweight** - No heavy frameworks

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (v14 or higher)
- npm (comes with Node.js)

### Run Locally

1. **Download and extract the project files**

2. **Open terminal/command prompt in the project folder**

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Start the server:**
   ```bash
   npm start
   ```

5. **Open your browser:**
   ```
   http://localhost:3000
   ```

### Demo Accounts
| Type  | Email | Password |
|-------|-------|----------|
| User  | user@mzee.com | user123 |
| Admin | admin@mzee.com | admin123 |

---

## 🌐 Deploy to Internet (FREE Options)

### Option 1: Render (Recommended - Like your Business Tycoon!)

1. Go to [render.com](https://render.com) and sign up
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub/GitLab or upload directly
4. Settings:
   - **Name:** mzee-gaming-zone
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Click **"Create Web Service"**
6. Your site will be live at: `https://mzee-gaming-zone.onrender.com`

### Option 2: Vercel (Fastest)

1. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. In project folder, run:
   ```bash
   vercel
   ```

3. Follow the prompts
4. Your site will be live instantly!

### Option 3: Netlify (Static Version)

1. Go to [netlify.com](https://netlify.com) and sign up
2. Drag & drop the `public` folder
3. Your site is live!

*Note: Static version won't have the backend API*

### Option 4: Railway

1. Go to [railway.app](https://railway.app) and sign up
2. Click **"New Project"** → **"Deploy from GitHub"**
3. Select your repository
4. Railway auto-detects Node.js and deploys!

### Option 5: Heroku

1. Install [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli)

2. Login and create app:
   ```bash
   heroku login
   heroku create mzee-gaming-zone
   ```

3. Deploy:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git push heroku main
   ```

### Option 6: GitHub Pages (Static Only)

1. Create a GitHub repository
2. Upload contents of `public` folder
3. Go to Settings → Pages → Enable
4. Live at: `https://yourusername.github.io/mzee-gaming-zone`

---

## 📁 Project Structure

```
mzee-gaming-zone/
├── public/
│   └── index.html      # Main website file
├── server.js           # Express server (API + static files)
├── package.json        # Node.js dependencies
├── vercel.json         # Vercel configuration
├── netlify.toml        # Netlify configuration
├── render.yaml         # Render configuration
├── Procfile            # Heroku/Railway configuration
└── README.md           # This file
```

---

## 🎮 How to Add Games (Admin)

1. Login as Admin (`admin@mzee.com` / `admin123`)
2. Click **"Add New Game"** button
3. Fill in:
   - **Game Title**: Name of the game
   - **Game URL**: The embed URL (like your Business Tycoon URL)
   - **Thumbnail URL**: Image for the game card
   - **Category**: Select appropriate category
4. Click **"Add Game"**

### Your Business Tycoon is Pre-Added!
URL: `https://business-tycoon.onrender.com/`

---

## 🛠️ Customization

### Change Colors
Edit CSS variables in `public/index.html`:
```css
:root {
    --primary: #00f0ff;      /* Cyan */
    --secondary: #ff00e5;    /* Pink */
    --accent: #39ff14;       /* Green */
    --warning: #ffae00;      /* Orange */
}
```

### Add More Categories
Find the `categories` array in the JavaScript section and add:
```javascript
{ name: 'Your Category', icon: '🎯', count: 0, color: '#hexcolor' }
```

---

## 📊 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/games` | Get all games |
| POST | `/api/games` | Add new game |
| PUT | `/api/games/:id` | Update game |
| DELETE | `/api/games/:id` | Delete game |
| POST | `/api/login` | User login |
| POST | `/api/register` | User registration |
| GET | `/api/analytics` | Get analytics (admin) |

---

## 🔒 Security Notes

For production, consider:
- Using a real database (MongoDB, PostgreSQL)
- Implementing JWT authentication
- Adding rate limiting
- Using HTTPS
- Hashing passwords with bcrypt

---

## 📝 License

MIT License - Feel free to use and modify!

---

## 🙋 Support

Having issues? 
1. Make sure Node.js is installed: `node --version`
2. Delete `node_modules` and run `npm install` again
3. Check if port 3000 is available

---

Made with ❤️ by MZEE Gaming Zone
