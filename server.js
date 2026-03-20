const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Parse JSON bodies
app.use(express.json());

// In-memory data storage (replace with database in production)
let games = [
    {
        id: 1,
        title: 'Business Tycoon',
        category: 'simulation',
        thumbnail: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=400&h=300&fit=crop',
        url: 'https://business-tycoon.onrender.com/',
        plays: 15234,
        rating: 4.8,
        badges: ['featured', 'hot'],
        featured: true
    }
];

let users = [
    { id: 1, email: 'user@mzee.com', password: 'user123', name: 'Player One', type: 'user' },
    { id: 2, email: 'admin@mzee.com', password: 'admin123', name: 'Admin', type: 'admin' }
];

let analytics = {
    totalVisitors: 12543,
    totalPlays: 45892,
    dailyVisitors: []
};

// API Routes

// Get all games
app.get('/api/games', (req, res) => {
    res.json(games);
});

// Add new game
app.post('/api/games', (req, res) => {
    const newGame = {
        id: games.length + 1,
        ...req.body,
        plays: 0,
        rating: 0
    };
    games.push(newGame);
    res.status(201).json(newGame);
});

// Update game
app.put('/api/games/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const index = games.findIndex(g => g.id === id);
    if (index !== -1) {
        games[index] = { ...games[index], ...req.body };
        res.json(games[index]);
    } else {
        res.status(404).json({ error: 'Game not found' });
    }
});

// Delete game
app.delete('/api/games/:id', (req, res) => {
    const id = parseInt(req.params.id);
    games = games.filter(g => g.id !== id);
    res.json({ success: true });
});

// Increment play count
app.post('/api/games/:id/play', (req, res) => {
    const id = parseInt(req.params.id);
    const game = games.find(g => g.id === id);
    if (game) {
        game.plays++;
        analytics.totalPlays++;
        res.json({ plays: game.plays });
    } else {
        res.status(404).json({ error: 'Game not found' });
    }
});

// Login
app.post('/api/login', (req, res) => {
    const { email, password, type } = req.body;
    const user = users.find(u => u.email === email && u.password === password && u.type === type);
    if (user) {
        res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, type: user.type } });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// Register
app.post('/api/register', (req, res) => {
    const { email, password, name } = req.body;
    if (users.find(u => u.email === email)) {
        return res.status(400).json({ error: 'Email already exists' });
    }
    const newUser = {
        id: users.length + 1,
        email,
        password,
        name,
        type: 'user'
    };
    users.push(newUser);
    res.status(201).json({ success: true, user: { id: newUser.id, name: newUser.name, email: newUser.email, type: newUser.type } });
});

// Get analytics (admin only)
app.get('/api/analytics', (req, res) => {
    res.json({
        totalVisitors: analytics.totalVisitors,
        totalUsers: users.filter(u => u.type === 'user').length,
        totalGames: games.length,
        totalPlays: analytics.totalPlays,
        topGames: [...games].sort((a, b) => b.plays - a.plays).slice(0, 5)
    });
});

// Track visitor
app.post('/api/analytics/visit', (req, res) => {
    analytics.totalVisitors++;
    res.json({ success: true });
});

// Serve index.html for all other routes (SPA support)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🎮 MZeeGamingHub SERVER STARTED! 🎮                    ║
║                                                           ║
║   Local:   http://localhost:${PORT}                        ║
║                                                           ║
║   Demo Accounts:                                          ║
║   • User:  user@mzee.com / user123                       ║
║   • Admin: admin@mzee.com / admin123                     ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
});
