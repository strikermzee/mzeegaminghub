# Ludo Champion 🎲

A multiplayer Ludo board game with the following features:

## Features

### Authentication
- Login/Register with username and password
- Play as Guest option

### Game Modes
1. **Play with Robot** - Practice against AI opponents (1-3 robots)
2. **Play with Friends** - Create or join private rooms

### Multiplayer Features
- **Create Room**: Generate a 7-digit numeric room code
- **Join Room**: Enter code to join a friend's room
- **Pawn Selection**: Choose from 6 different colored pawns
- **Real-time Updates**: See when pawns are taken by other players
- **Host Controls**: Only the host can start the game (requires 2+ players)

### UI Features
- Fullscreen mode
- Beautiful gradient backgrounds
- Animated pawn selection
- Error notifications
- Responsive design

## Getting Started

### Prerequisites
- Node.js 14+ installed
- npm or yarn

### Installation

1. Extract the zip file
2. Navigate to the project directory:
   ```bash
   cd ludo-champion
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Start the development server:
   ```bash
   npm start
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

### Building for Production

```bash
npm run build
```

This creates an optimized production build in the `build` folder.

## Project Structure

```
ludo-champion/
├── public/
│   └── index.html
├── src/
│   ├── components/
│   │   ├── Header.js
│   │   ├── Lobby.js
│   │   ├── Login.js
│   │   ├── ModeSelect.js
│   │   ├── PawnSelector.js
│   │   ├── PrivateRoom.js
│   │   └── RobotSetup.js
│   ├── context/
│   │   └── GameContext.js
│   ├── styles/
│   │   └── App.css
│   ├── App.js
│   └── index.js
├── package.json
└── README.md
```

## How to Play

1. **Login or Register** (or play as guest)
2. **Choose Game Mode**:
   - **Robot**: Select number of AI opponents, choose your pawn, start game
   - **Friends**: Create a room or join with a code
3. **In Private Room**: Wait for players to join, then host starts the game
4. **Play Ludo!** (Game board implementation not included in this demo)

## Technologies Used

- React 18
- CSS3 with CSS Variables
- Google Fonts (Fredoka, Poppins)

## Notes

- This is a frontend demo - actual multiplayer would require a backend server
- The "Simulate Player Join" button demonstrates the real-time pawn selection feature
- Room codes are 7-digit numbers only (no letters)

## License

MIT License
