// Ludo Champion — mounted inside MZeeGamingHub at BASE; no longer its own server.
// Socket.IO is constructed detached and bound to the hub's shared HTTP server by attach().
const express = require('express');
const path = require('path');
const { Server } = require('socket.io');

const BASE = '/games/ludo-champion';

const app = express.Router();
// Namespaced path keeps this clear of Business Tycoon's Socket.IO and Tambola's
// WebSocket, which live on the same HTTP server.
const io = new Server({ path: BASE + '/socket.io', cors: { origin: '*' } });

// Browser files are built into public/games/ludo-champion and served by the hub's
// static middleware. This router handles only Socket.IO and the SPA fallback.

const rooms = {};

// Start positions for each color (where pawn enters the board)
const START_POSITIONS = { red: 48, blue: 9, green: 35, yellow: 22 };

// Safe zones - cannot be captured here (arrow cells + safe hex cells)
const SAFE_ZONES = [4, 9, 17, 22, 30, 35, 43, 48];

// Home entry points (last cell before entering home stretch)
const HOME_ENTRY = { red: 47, blue: 8, green: 34, yellow: 21 };

// Board has 52 cells (1-52), then each color has 6 home stretch cells

function genCode() {
  let c;
  do { c = String(Math.floor(1000000 + Math.random() * 9000000)); } while (rooms[c]);
  return c;
}

function broadcastRoom(code) {
  const room = rooms[code];
  if (!room) return;
  io.to(code).emit('roomUpdate', {
    code: room.code,
    players: room.players,
    takenPawns: room.players.map(p => p.pawn),
    hostId: room.hostId
  });
}

function broadcastGameState(code) {
  const room = rooms[code];
  if (!room || !room.gameState) return;
  io.to(code).emit('gameStateUpdate', {
    ...room.gameState,
    roomCode: room.code,
    hostId: room.hostId,
    endGameVote: room.endGameVote,
    allowLateJoining: room.allowLateJoining,
    blockedPlayers: room.blockedPlayers || []
  });
}

// Calculate new position after moving steps
function calculateNewPosition(currentPos, steps, color) {
  // If in home stretch (positions 100-104 for each color, 5 cells)
  if (currentPos >= 100) {
    const homePos = currentPos - 100;
    const newHomePos = homePos + steps;
    if (newHomePos === 5) {
      return -1; // Reached center home (exact roll needed)
    } else if (newHomePos > 5) {
      return null; // Overshoot - invalid move, need exact roll
    }
    return 100 + newHomePos;
  }
  
  // Moving on main board
  const homeEntry = HOME_ENTRY[color];
  let newPos = currentPos;
  
  for (let i = 0; i < steps; i++) {
    if (newPos === homeEntry) {
      // Enter home stretch
      const remainingSteps = steps - i - 1;
      if (remainingSteps > 5) return null; // Overshoot
      if (remainingSteps === 5) return -1; // Exactly reaches center home
      return 100 + remainingSteps; // Enter home stretch at this position
    }
    newPos = newPos === 52 ? 1 : newPos + 1;
  }
  
  return newPos;
}

// Check if position is a safe zone
function isSafeZone(pos) {
  return SAFE_ZONES.includes(pos) || pos >= 100;
}

// Get all pawns at a position (for capturing check)
function getPawnsAtPosition(gs, pos, excludeUsername) {
  const pawns = [];
  Object.entries(gs.pawnPositions).forEach(([username, positions]) => {
    if (username === excludeUsername) return;
    positions.forEach((p, idx) => {
      if (p === pos && pos > 0 && pos < 100) {
        pawns.push({ username, idx });
      }
    });
  });
  return pawns;
}

// Check if player has any valid moves
function hasValidMoves(gs, username, color, total) {
  const positions = gs.pawnPositions[username];
  const pawnsOutCount = gs.pawnsOut[username] || 0;
  
  // Check if can move any pawn out (need total of 6 or 12)
  if (pawnsOutCount < 4 && (total === 6 || total === 12)) {
    return true;
  }
  
  // Check if any pawn on board can move
  for (let i = 0; i < 4; i++) {
    const pos = positions[i];
    if (pos !== null && pos !== -1) {
      const newPos = calculateNewPosition(pos, total, color);
      if (newPos !== null) return true;
    }
  }
  
  return false;
}

// Get list of movable pawns with their valid new positions
function getMovablePawns(gs, username, color, total) {
  const positions = gs.pawnPositions[username];
  const movable = [];
  
  for (let i = 0; i < 4; i++) {
    const pos = positions[i];
    if (pos !== null && pos !== -1) {
      const newPos = calculateNewPosition(pos, total, color);
      if (newPos !== null) {
        movable.push({ idx: i, currentPos: pos, newPos });
      }
    }
  }
  
  return movable;
}

// Auto-move pawn (for force move when only one option)
function autoMovePawn(room, pawnIndex) {
  const gs = room.gameState;
  const currentPlayer = room.players[gs.currentTurn];
  const username = currentPlayer.username;
  const color = currentPlayer.pawn;
  const positions = gs.pawnPositions[username];
  const currentPos = positions[pawnIndex];
  const total = gs.diceValues[0] + gs.diceValues[1];
  
  const newPos = calculateNewPosition(currentPos, total, color);
  if (newPos === null) return false;
  
  // Check for capture
  if (newPos > 0 && newPos < 100 && !isSafeZone(newPos)) {
    const enemyPawns = getPawnsAtPosition(gs, newPos, username);
    if (enemyPawns.length > 0) {
      enemyPawns.forEach(ep => {
        gs.pawnPositions[ep.username][ep.idx] = null;
        gs.pawnsOut[ep.username]--;
        gs.gameLog.unshift(`⚔️ ${username} captured ${ep.username}'s pawn!`);
      });
      gs.rolledSix = true;
    }
  }
  
  // Move pawn
  positions[pawnIndex] = newPos;
  
  if (newPos === -1) {
    gs.pawnsHome[username] = (gs.pawnsHome[username] || 0) + 1;
    gs.gameLog.unshift(`🏠 ${username}'s pawn reached home!`);
    
    if (gs.pawnsHome[username] === 4) {
      gs.winner = username;
      gs.gameLog.unshift(`🏆 ${username} WINS THE GAME!`);
      return true;
    }
    gs.rolledSix = true;
  } else if (newPos >= 100) {
    gs.gameLog.unshift(`🏃 ${username} moved pawn to home stretch!`);
  } else {
    gs.gameLog.unshift(`🏃 ${username} moved pawn to cell ${newPos}`);
  }
  
  gs.hasMoved = true;
  return true;
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('createRoom', ({ username, pawn, isGuest, allowLateJoining = true }) => {
    const code = genCode();
    const player = { id: socket.id, username, pawn, isHost: true, isGuest };
    
    rooms[code] = {
      code,
      hostId: socket.id,
      players: [player],
      gameState: null,
      allowLateJoining,
      endGameVote: null,
      blockedPlayers: [], // List of blocked usernames
      pendingLateJoin: null
    };
    
    socket.join(code);
    socket.roomCode = code;
    socket.playerData = player;
    
    socket.emit('roomCreated', { code });
    broadcastRoom(code);
    console.log(`Room ${code} created by ${username} (lateJoin: ${allowLateJoining})`);
  });

  socket.on('checkRoom', ({ code, username }, callback) => {
    const room = rooms[code];
    if (!room) {
      callback({ exists: false, error: 'Room not found' });
      return;
    }
    const host = room.players.find(p => p.isHost);
    
    // Check if same name player is host
    const sameNamePlayer = room.players.find(p => p.username === username);
    const sameNameIsHost = sameNamePlayer ? sameNamePlayer.isHost : false;
    
    // Check if player is blocked
    const isBlocked = room.blockedPlayers && room.blockedPlayers.includes(username);
    
    callback({
      exists: true,
      playerCount: room.players.length,
      isFull: room.players.length >= 4,
      takenPawns: room.players.map(p => p.pawn),
      playerNames: room.players.map(p => p.username),
      hostName: host ? host.username : 'Unknown',
      gameStarted: !!room.gameState,
      allowLateJoining: room.allowLateJoining,
      sameNameIsHost,
      isBlocked
    });
  });

  socket.on('joinRoom', ({ code, username, pawn, isGuest, switchDevice }) => {
    const room = rooms[code];
    
    if (!room) {
      socket.emit('joinError', 'Room not found. Check the code.');
      return;
    }
    
    // Check if player is blocked
    if (room.blockedPlayers && room.blockedPlayers.includes(username)) {
      socket.emit('joinError', 'You have been blocked from this room.');
      return;
    }
    
    if (room.players.length >= 4) {
      socket.emit('joinError', 'Room Full! Maximum 4 players allowed.');
      return;
    }
    if (room.players.map(p => p.pawn).includes(pawn)) {
      socket.emit('joinError', 'Pawn already taken! Please choose a different color.');
      return;
    }
    // Check late joining if game has started
    if (room.gameState && !room.allowLateJoining) {
      socket.emit('joinError', 'Game has started. Late joining is not allowed.');
      return;
    }
    
    // Handle same name - switch device (sends to LOGIN page)
    const existingPlayer = room.players.find(p => p.username === username);
    if (existingPlayer && switchDevice) {
      // Kick existing player back to LOGIN page
      io.to(existingPlayer.id).emit('kickedToLogin', { reason: 'Another device switched to your account.' });
      room.players = room.players.filter(p => p.id !== existingPlayer.id);
    }
    
    // If game already started, require host approval
    if (room.gameState) {
      // Store pending join request
      room.pendingLateJoin = {
        socketId: socket.id,
        username,
        pawn,
        isGuest
      };
      
      // Notify host for approval
      io.to(room.hostId).emit('lateJoinRequest', {
        username,
        pawn
      });
      
      // Notify the joining player to wait
      socket.emit('waitingForApproval', { message: 'Waiting for host to approve...' });
      socket.roomCode = code; // Store for later use
      socket.playerData = { username, pawn, isGuest };
      return;
    }
    
    // Normal join (game not started)
    const player = { id: socket.id, username, pawn, isHost: false, isGuest };
    room.players.push(player);
    socket.join(code);
    socket.roomCode = code;
    socket.playerData = player;
    
    io.to(code).emit('notification', `${username} joined the room!`);
    broadcastRoom(code);
    console.log(`${username} joined room ${code}`);
  });

  // Host approves/denies/blocks late join
  socket.on('approveLateJoin', ({ action }) => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    
    const room = rooms[code];
    if (room.hostId !== socket.id) return; // Only host can approve
    if (!room.pendingLateJoin) return;
    
    const pending = room.pendingLateJoin;
    const joiningSocket = io.sockets.sockets.get(pending.socketId);
    
    if (action === 'admit' && joiningSocket) {
      const player = { 
        id: pending.socketId, 
        username: pending.username, 
        pawn: pending.pawn, 
        isHost: false, 
        isGuest: pending.isGuest 
      };
      room.players.push(player);
      joiningSocket.join(code);
      joiningSocket.roomCode = code;
      joiningSocket.playerData = player;
      
      // Initialize player's game state
      const gs = room.gameState;
      gs.pawnsOut[pending.username] = 0;
      gs.pawnPositions[pending.username] = [null, null, null, null];
      gs.pawnsHome[pending.username] = 0;
      gs.gameLog.unshift(`🎮 ${pending.username} joined the game!`);
      
      joiningSocket.emit('lateJoinApproved');
      io.to(code).emit('notification', `${pending.username} joined the game!`);
      broadcastRoom(code);
      broadcastGameState(code);
    } else if (action === 'block' && joiningSocket) {
      // Block the player
      if (!room.blockedPlayers) room.blockedPlayers = [];
      room.blockedPlayers.push(pending.username);
      joiningSocket.emit('lateJoinDenied', { message: 'You have been blocked from this room.' });
      // Notify host of updated blocked list
      io.to(room.hostId).emit('blockedListUpdate', { blockedPlayers: room.blockedPlayers });
    } else if (joiningSocket) {
      // Deny
      joiningSocket.emit('lateJoinDenied', { message: 'Host did not approve your request.' });
    }
    
    room.pendingLateJoin = null;
  });

  // Host toggles late joining setting
  socket.on('toggleLateJoining', ({ allow }) => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    
    const room = rooms[code];
    if (room.hostId !== socket.id) return; // Only host
    
    room.allowLateJoining = allow;
    io.to(code).emit('lateJoiningUpdated', { allowLateJoining: allow });
    broadcastGameState(code);
  });

  // Host unblocks a player
  socket.on('unblockPlayer', ({ username }) => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    
    const room = rooms[code];
    if (room.hostId !== socket.id) return; // Only host
    
    if (room.blockedPlayers) {
      room.blockedPlayers = room.blockedPlayers.filter(u => u !== username);
      io.to(room.hostId).emit('blockedListUpdate', { blockedPlayers: room.blockedPlayers });
    }
  });

  socket.on('leaveRoom', () => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    
    const room = rooms[code];
    const playerName = socket.playerData?.username || 'A player';
    const leavingPlayerId = socket.id;
    const leavingPlayerIndex = room.players.findIndex(p => p.id === socket.id);
    
    room.players = room.players.filter(p => p.id !== socket.id);
    socket.leave(code);
    
    if (room.players.length === 0) {
      delete rooms[code];
      console.log(`Room ${code} deleted (empty)`);
    } else {
      // Transfer host if needed
      if (room.hostId === socket.id && room.players.length > 0) {
        room.hostId = room.players[0].id;
        room.players[0].isHost = true;
      }
      
      // Handle end game vote if in progress
      if (room.endGameVote) {
        // Remove leaving player's vote requirement
        delete room.endGameVote.votes[leavingPlayerId];
        
        // Check if all remaining players have voted
        const totalVoters = room.players.length;
        const votes = Object.values(room.endGameVote.votes);
        
        if (votes.length >= totalVoters) {
          // All remaining players have voted
          const allYes = votes.every(v => v === true);
          if (allYes) {
            // All agreed to end - DRAW
            const gs = room.gameState;
            gs.winner = 'DRAW';
            gs.gameEnded = true;
            gs.gameLog.unshift(`🤝 All players agreed to end the game in a DRAW!`);
            room.endGameVote = null;
            broadcastGameState(code);
            io.to(code).emit('notification', `${playerName} left the room.`);
            broadcastRoom(code);
            socket.roomCode = null;
            socket.playerData = null;
            return;
          } else {
            // Vote failed
            room.endGameVote = null;
            room.gameState.gameLog.unshift(`🗳️ End game vote failed.`);
          }
        }
      }
      
      // Handle game state if game is running
      if (room.gameState) {
        const gs = room.gameState;
        
        // If game was already decided as DRAW, don't change it
        if (gs.winner === 'DRAW') {
          io.to(code).emit('notification', `${playerName} left the room.`);
          broadcastRoom(code);
          socket.roomCode = null;
          socket.playerData = null;
          return;
        }
        
        // Remove player from game state
        delete gs.pawnsOut[playerName];
        delete gs.pawnPositions[playerName];
        delete gs.pawnsHome[playerName];
        
        gs.gameLog.unshift(`🚪 ${playerName} left the game by resignation.`);
        
        // If it was leaving player's turn, move to next
        if (gs.currentTurn >= room.players.length) {
          gs.currentTurn = 0;
        } else if (leavingPlayerIndex !== -1 && leavingPlayerIndex <= gs.currentTurn) {
          gs.currentTurn = gs.currentTurn > 0 ? gs.currentTurn - 1 : 0;
        }
        
        // Check if less than 2 players - game ends by resignation
        if (room.players.length < 2) {
          const winner = room.players[0];
          gs.winner = winner.username;
          gs.resignationWin = true;
          gs.gameLog.unshift(`🏆 Congratulations! All players left by resignation. ${winner.username} has won!`);
          io.to(code).emit('resignationWin', { winner: winner.username });
        } else {
          // Reset turn state for new current player
          gs.hasRolled = false;
          gs.hasMoved = false;
          gs.showPawnSelect = false;
          gs.turnStartTime = Date.now();
          gs.gameLog.unshift(`▶ ${room.players[gs.currentTurn].username}'s turn`);
        }
        
        broadcastGameState(code);
      }
      
      io.to(code).emit('notification', `${playerName} left the room.`);
      broadcastRoom(code);
    }
    
    socket.roomCode = null;
    socket.playerData = null;
  });

  socket.on('startGame', () => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    
    const room = rooms[code];
    if (room.hostId !== socket.id) return;
    if (room.players.length < 2) return;
    
    const pawnsOut = {};
    const pawnPositions = {};
    const pawnsHome = {};
    
    room.players.forEach(p => {
      pawnsOut[p.username] = 0;
      pawnPositions[p.username] = [null, null, null, null];
      pawnsHome[p.username] = 0;
    });
    
    room.gameState = {
      currentTurn: 0,
      diceValues: [1, 1],
      hasRolled: false,
      hasMoved: false,
      rolledSix: false,
      consecutiveSixes: 0,
      showPawnSelect: false,
      pawnsOut,
      pawnPositions,
      pawnsHome,
      gameLog: ['🎮 Game started! ' + room.players[0].username + ' goes first.'],
      winner: null,
      placements: [], // Track finishing order: [{username, place}]
      gameEnded: false,
      turnStartTime: Date.now(),
      turnTimeLimit: 60000
    };
    
    room.pendingLateJoin = null; // For late join approval
    
    io.to(code).emit('gameStarted');
    broadcastGameState(code);
    console.log(`Game started in room ${code}`);
  });

  // Roll Dice
  socket.on('rollDice', () => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    
    const room = rooms[code];
    const gs = room.gameState;
    if (!gs || gs.winner) return;
    
    const currentPlayer = room.players[gs.currentTurn];
    if (currentPlayer.id !== socket.id) return;
    if (gs.hasRolled) return;
    
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const total = d1 + d2;
    
    // Only 6 or 12 total allows bringing pawn out and getting extra turn
    const canBringOut = total === 6 || total === 12;
    
    gs.diceValues = [d1, d2];
    gs.hasRolled = true;
    
    gs.gameLog.unshift(`🎲 ${currentPlayer.username} rolled ${d1} + ${d2} = ${total}`);
    
    // Check for 3 consecutive 6s or 12s
    if (canBringOut) {
      gs.consecutiveSixes++;
      if (gs.consecutiveSixes >= 3) {
        gs.gameLog.unshift(`⚠️ 3 consecutive 6/12s! ${currentPlayer.username}'s turn skipped.`);
        gs.consecutiveSixes = 0;
        gs.currentTurn = (gs.currentTurn + 1) % room.players.length;
        gs.hasRolled = false;
        gs.rolledSix = false;
        gs.showPawnSelect = false;
        gs.gameLog.unshift(`▶ ${room.players[gs.currentTurn].username}'s turn`);
        broadcastGameState(code);
        return;
      }
      
      gs.rolledSix = true;
      if (total === 12) {
        gs.gameLog.unshift(`🎉 Rolled 12! Extra turn!`);
      } else {
        gs.gameLog.unshift(`⭐ Rolled 6! Extra turn!`);
      }
      
      // Show pawn select if has pawns in home (can bring out with 6 or 12)
      if ((gs.pawnsOut[currentPlayer.username] || 0) < 4) {
        gs.showPawnSelect = true;
      }
    } else {
      gs.rolledSix = false;
      gs.consecutiveSixes = 0;
    }
    
    // Check if player has any valid moves
    if (!hasValidMoves(gs, currentPlayer.username, currentPlayer.pawn, total)) {
      gs.gameLog.unshift(`❌ No valid moves. Turn passes.`);
      gs.currentTurn = (gs.currentTurn + 1) % room.players.length;
      gs.hasRolled = false;
      gs.rolledSix = false;
      gs.showPawnSelect = false;
      gs.consecutiveSixes = 0;
      gs.turnStartTime = Date.now();
      gs.gameLog.unshift(`▶ ${room.players[gs.currentTurn].username}'s turn`);
      gs.gameLog = gs.gameLog.slice(0, 50);
      broadcastGameState(code);
      return;
    }
    
    // Force move logic: if only one pawn can move, auto-move it
    const movablePawns = getMovablePawns(gs, currentPlayer.username, currentPlayer.pawn, total);
    const canBringPawnOut = canBringOut && (gs.pawnsOut[currentPlayer.username] || 0) < 4;
    
    // If no pawns can be brought out and only one pawn can move, force move
    if (!canBringPawnOut && movablePawns.length === 1) {
      gs.gameLog.unshift(`⚡ Auto-moving only available pawn!`);
      autoMovePawn(room, movablePawns[0].idx);
      gs.gameLog = gs.gameLog.slice(0, 50);
      broadcastGameState(code);
      return;
    }
    
    // If all pawns are out and only one can move, force move
    if ((gs.pawnsOut[currentPlayer.username] || 0) === 4 && movablePawns.length === 1) {
      gs.gameLog.unshift(`⚡ Auto-moving only available pawn!`);
      autoMovePawn(room, movablePawns[0].idx);
      gs.gameLog = gs.gameLog.slice(0, 50);
      broadcastGameState(code);
      return;
    }
    
    gs.gameLog = gs.gameLog.slice(0, 50);
    broadcastGameState(code);
  });

  // Move Pawn Out of Home
  socket.on('movePawnOut', () => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    
    const room = rooms[code];
    const gs = room.gameState;
    if (!gs || gs.winner) return;
    
    const currentPlayer = room.players[gs.currentTurn];
    if (currentPlayer.id !== socket.id) return;
    if (gs.hasMoved) return; // Already moved a pawn this turn
    
    const username = currentPlayer.username;
    const color = currentPlayer.pawn;
    const startPos = START_POSITIONS[color];
    
    const positions = gs.pawnPositions[username];
    const pawnIndex = positions.findIndex(p => p === null);
    
    if (pawnIndex !== -1) {
      // Check for capture at start position
      const enemyPawns = getPawnsAtPosition(gs, startPos, username);
      if (enemyPawns.length > 0 && !isSafeZone(startPos)) {
        // Capture!
        enemyPawns.forEach(ep => {
          gs.pawnPositions[ep.username][ep.idx] = null;
          gs.pawnsOut[ep.username]--;
          gs.gameLog.unshift(`⚔️ ${username} captured ${ep.username}'s pawn!`);
        });
        // Bonus turn for capture
        gs.rolledSix = true;
      }
      
      positions[pawnIndex] = startPos;
      gs.pawnsOut[username] = (gs.pawnsOut[username] || 0) + 1;
      gs.gameLog.unshift(`🚀 ${username} moved a pawn out to cell ${startPos}!`);
      
      // Mark as moved - pawn cannot move again this turn, must roll again next turn
      gs.hasMoved = true;
    }
    
    gs.showPawnSelect = false;
    gs.gameLog = gs.gameLog.slice(0, 50);
    broadcastGameState(code);
  });

  // Skip Moving Pawn Out
  socket.on('skipPawnOut', () => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    
    const room = rooms[code];
    const gs = room.gameState;
    if (!gs) return;
    
    gs.showPawnSelect = false;
    broadcastGameState(code);
  });

  // Move a specific pawn on the board
  socket.on('movePawn', ({ pawnIndex }) => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    
    const room = rooms[code];
    const gs = room.gameState;
    if (!gs || gs.winner) return;
    
    const currentPlayer = room.players[gs.currentTurn];
    if (currentPlayer.id !== socket.id) return;
    if (!gs.hasRolled) return;
    if (gs.hasMoved) return; // Already moved a pawn this turn
    
    const username = currentPlayer.username;
    const color = currentPlayer.pawn;
    const positions = gs.pawnPositions[username];
    const currentPos = positions[pawnIndex];
    const total = gs.diceValues[0] + gs.diceValues[1];
    
    // Cannot move pawn that is in center home (-1) or still in base (null)
    if (currentPos === null || currentPos === -1) return;
    
    const newPos = calculateNewPosition(currentPos, total, color);
    if (newPos === null) {
      gs.gameLog.unshift(`❌ Cannot move - would overshoot home.`);
      broadcastGameState(code);
      return;
    }
    
    // Check for capture
    if (newPos > 0 && newPos < 100 && !isSafeZone(newPos)) {
      const enemyPawns = getPawnsAtPosition(gs, newPos, username);
      if (enemyPawns.length > 0) {
        enemyPawns.forEach(ep => {
          gs.pawnPositions[ep.username][ep.idx] = null;
          gs.pawnsOut[ep.username]--;
          gs.gameLog.unshift(`⚔️ ${username} captured ${ep.username}'s pawn!`);
        });
        // Bonus turn for capture
        gs.rolledSix = true;
      }
    }
    
    // Move pawn
    positions[pawnIndex] = newPos;
    
    if (newPos === -1) {
      // Reached home!
      gs.pawnsHome[username] = (gs.pawnsHome[username] || 0) + 1;
      gs.gameLog.unshift(`🏠 ${username}'s pawn reached home!`);
      
      // Check if player finished (all 4 pawns home)
      if (gs.pawnsHome[username] === 4) {
        // Check if already in placements
        const alreadyPlaced = gs.placements.find(p => p.username === username);
        if (!alreadyPlaced) {
          const place = gs.placements.length + 1;
          gs.placements.push({ username, place });
          
          const placeText = place === 1 ? '1st' : place === 2 ? '2nd' : '3rd';
          gs.gameLog.unshift(`🏆 ${username} finished in ${placeText} place!`);
          
          // Check if game should end based on player count
          const totalPlayers = room.players.length;
          const finishedPlayers = gs.placements.length;
          
          // 2 players: game ends when 1st finishes
          // 3 players: game ends when 2nd finishes
          // 4 players: game ends when 3rd finishes
          const requiredFinishers = totalPlayers === 2 ? 1 : totalPlayers - 1;
          
          if (finishedPlayers >= requiredFinishers) {
            gs.gameEnded = true;
            gs.winner = gs.placements[0].username; // True champion is 1st place
            gs.gameLog.unshift(`🎮 GAME OVER! True Champion: ${gs.winner}`);
            broadcastGameState(code);
            return;
          }
        }
      }
      
      // Bonus turn for reaching home
      gs.rolledSix = true;
    } else if (newPos >= 100) {
      gs.gameLog.unshift(`🏃 ${username} moved pawn to home stretch!`);
    } else {
      gs.gameLog.unshift(`🏃 ${username} moved pawn to cell ${newPos}`);
    }
    
    // Mark that player has moved - can only move once per turn
    gs.hasMoved = true;
    
    gs.gameLog = gs.gameLog.slice(0, 50);
    broadcastGameState(code);
  });

  // End Turn
  socket.on('endTurn', () => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    
    const room = rooms[code];
    const gs = room.gameState;
    if (!gs || gs.winner) return;
    
    const currentPlayer = room.players[gs.currentTurn];
    if (currentPlayer.id !== socket.id) return;
    if (!gs.hasRolled) return;
    
    // Check if player can still move a pawn
    const total = gs.diceValues[0] + gs.diceValues[1];
    const movablePawns = getMovablePawns(gs, currentPlayer.username, currentPlayer.pawn, total);
    
    // If player hasn't moved and has movable pawns, they must move first
    if (!gs.hasMoved && movablePawns.length > 0) {
      gs.gameLog.unshift(`❌ You must move a pawn before ending turn!`);
      broadcastGameState(code);
      return;
    }
    
    gs.showPawnSelect = false;
    
    if (gs.rolledSix && !gs.hasMoved) {
      // Extra turn only if they rolled 6/12 AND moved
      gs.hasRolled = false;
      gs.hasMoved = false;
      gs.rolledSix = false;
      gs.turnStartTime = Date.now();
      gs.gameLog.unshift(`▶ ${currentPlayer.username} takes extra turn!`);
    } else if (gs.rolledSix && gs.hasMoved) {
      // Extra turn after moving
      gs.hasRolled = false;
      gs.hasMoved = false;
      gs.rolledSix = false;
      gs.turnStartTime = Date.now();
      gs.gameLog.unshift(`▶ ${currentPlayer.username} takes extra turn!`);
    } else {
      gs.currentTurn = (gs.currentTurn + 1) % room.players.length;
      gs.hasRolled = false;
      gs.hasMoved = false;
      gs.rolledSix = false;
      gs.consecutiveSixes = 0;
      gs.turnStartTime = Date.now();
      gs.gameLog.unshift(`▶ ${room.players[gs.currentTurn].username}'s turn`);
    }
    
    gs.gameLog = gs.gameLog.slice(0, 50);
    broadcastGameState(code);
  });

  // Force End Turn (timer expired)
  socket.on('forceEndTurn', () => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    
    const room = rooms[code];
    const gs = room.gameState;
    if (!gs || gs.winner) return;
    
    const currentPlayer = room.players[gs.currentTurn];
    if (currentPlayer.id !== socket.id) return;
    
    gs.gameLog.unshift(`⏱️ Time's up! ${currentPlayer.username}'s turn ended.`);
    gs.showPawnSelect = false;
    gs.currentTurn = (gs.currentTurn + 1) % room.players.length;
    gs.hasRolled = false;
    gs.hasMoved = false;
    gs.rolledSix = false;
    gs.consecutiveSixes = 0;
    gs.turnStartTime = Date.now();
    gs.gameLog.unshift(`▶ ${room.players[gs.currentTurn].username}'s turn`);
    
    gs.gameLog = gs.gameLog.slice(0, 50);
    broadcastGameState(code);
  });

  // Start End Game Vote (host only)
  socket.on('startEndGameVote', () => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    
    const room = rooms[code];
    if (room.hostId !== socket.id) return; // Only host can start vote
    if (!room.gameState) return;
    
    // Initialize vote
    room.endGameVote = {
      active: true,
      votes: {},
      startedBy: socket.playerData?.username
    };
    
    // Host automatically votes yes
    room.endGameVote.votes[socket.id] = true;
    
    room.gameState.gameLog.unshift(`🗳️ ${socket.playerData?.username} started a vote to end the game!`);
    broadcastGameState(code);
  });

  // Vote on End Game
  socket.on('voteEndGame', ({ vote }) => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    
    const room = rooms[code];
    if (!room.endGameVote || !room.endGameVote.active) return;
    
    room.endGameVote.votes[socket.id] = vote;
    
    const playerName = socket.playerData?.username || 'Unknown';
    room.gameState.gameLog.unshift(`🗳️ ${playerName} voted ${vote ? 'YES' : 'NO'}`);
    
    // Check if everyone voted
    const totalPlayers = room.players.length;
    const votedPlayers = Object.keys(room.endGameVote.votes).length;
    
    if (votedPlayers === totalPlayers) {
      // All voted - check result
      const yesVotes = Object.values(room.endGameVote.votes).filter(v => v).length;
      
      if (yesVotes === totalPlayers) {
        // All agreed - game ends in draw
        room.gameState.winner = 'DRAW';
        room.gameState.gameLog.unshift(`🤝 All players agreed! Game ends in a DRAW!`);
        room.endGameVote = null;
      } else {
        // Someone refused - vote failed
        room.gameState.gameLog.unshift(`❌ Vote failed! Not all players agreed.`);
        room.endGameVote = null;
      }
    }
    
    broadcastGameState(code);
  });

  // Cancel End Game Vote
  socket.on('cancelEndGameVote', () => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    
    const room = rooms[code];
    if (!room.endGameVote) return;
    
    room.endGameVote = null;
    room.gameState.gameLog.unshift(`🗳️ End game vote cancelled.`);
    broadcastGameState(code);
  });

  // Chat message
  socket.on('sendChat', ({ message }) => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    if (!message || message.trim() === '') return;
    
    const room = rooms[code];
    const playerName = socket.playerData?.username || 'Unknown';
    const player = room.players.find(p => p.id === socket.id);
    const pawnColor = player ? player.pawn : 'white';
    
    const chatMessage = {
      id: Date.now(),
      username: playerName,
      message: message.trim().substring(0, 200), // Limit to 200 chars
      color: pawnColor,
      timestamp: new Date().toISOString()
    };
    
    // Initialize chat array if not exists
    if (!room.chatMessages) {
      room.chatMessages = [];
    }
    
    // Add message and keep last 50 messages
    room.chatMessages.push(chatMessage);
    if (room.chatMessages.length > 50) {
      room.chatMessages = room.chatMessages.slice(-50);
    }
    
    // Broadcast to all in room
    io.to(code).emit('chatMessage', chatMessage);
  });

  socket.on('disconnect', () => {
    const code = socket.roomCode;
    if (code && rooms[code]) {
      const room = rooms[code];
      const playerName = socket.playerData?.username || 'A player';
      const leavingPlayerId = socket.id;
      const leavingPlayerIndex = room.players.findIndex(p => p.id === socket.id);
      
      room.players = room.players.filter(p => p.id !== socket.id);
      
      if (room.players.length === 0) {
        delete rooms[code];
      } else {
        // Transfer host if needed
        if (room.hostId === socket.id) {
          room.hostId = room.players[0].id;
          room.players[0].isHost = true;
        }
        
        // Handle end game vote if in progress
        if (room.endGameVote) {
          // Remove leaving player's vote requirement
          delete room.endGameVote.votes[leavingPlayerId];
          
          // Check if all remaining players have voted
          const totalVoters = room.players.length;
          const votes = Object.values(room.endGameVote.votes);
          
          if (votes.length >= totalVoters) {
            // All remaining players have voted
            const allYes = votes.every(v => v === true);
            if (allYes && room.gameState) {
              // All agreed to end - DRAW
              room.gameState.winner = 'DRAW';
              room.gameState.gameEnded = true;
              room.gameState.gameLog.unshift(`🤝 All players agreed to end the game in a DRAW!`);
              room.endGameVote = null;
              broadcastGameState(code);
              io.to(code).emit('notification', `${playerName} disconnected.`);
              broadcastRoom(code);
              return;
            } else {
              // Vote failed
              room.endGameVote = null;
              if (room.gameState) {
                room.gameState.gameLog.unshift(`🗳️ End game vote failed.`);
              }
            }
          }
        }
        
        // Handle game state if game is running
        if (room.gameState) {
          const gs = room.gameState;
          
          // If game was already decided as DRAW, don't change it
          if (gs.winner === 'DRAW') {
            io.to(code).emit('notification', `${playerName} disconnected.`);
            broadcastRoom(code);
            return;
          }
          
          // Remove player from game state
          delete gs.pawnsOut[playerName];
          delete gs.pawnPositions[playerName];
          delete gs.pawnsHome[playerName];
          
          gs.gameLog.unshift(`🚪 ${playerName} disconnected (resignation).`);
          
          // If it was leaving player's turn, move to next
          if (gs.currentTurn >= room.players.length) {
            gs.currentTurn = 0;
          } else if (leavingPlayerIndex !== -1 && leavingPlayerIndex <= gs.currentTurn) {
            gs.currentTurn = gs.currentTurn > 0 ? gs.currentTurn - 1 : 0;
          }
          
          // Check if less than 2 players - game ends by resignation
          if (room.players.length < 2) {
            const winner = room.players[0];
            gs.winner = winner.username;
            gs.resignationWin = true;
            gs.gameLog.unshift(`🏆 Congratulations! All players left by resignation. ${winner.username} has won!`);
            io.to(code).emit('resignationWin', { winner: winner.username });
          } else {
            // Reset turn state for new current player
            gs.hasRolled = false;
            gs.hasMoved = false;
            gs.showPawnSelect = false;
            gs.turnStartTime = Date.now();
            gs.gameLog.unshift(`▶ ${room.players[gs.currentTurn].username}'s turn`);
          }
          
          broadcastGameState(code);
        }
        
        io.to(code).emit('notification', `${playerName} disconnected.`);
        broadcastRoom(code);
      }
    }
    console.log('Player disconnected:', socket.id);
  });
});

// Client-side routing: any deep link that isn't a real file falls back to the app shell.
const BUILD_DIR = path.join(__dirname, '..', '..', 'public', 'games', 'ludo-champion');
app.get('*', (req, res) => {
  res.sendFile(path.join(BUILD_DIR, 'index.html'));
});

module.exports = {
  base: BASE,
  router: app,
  io,
  // Bind to the hub's HTTP server. destroyUpgrade:false lets upgrades this path doesn't
  // own fall through to the other realtime games instead of being killed.
  attach(httpServer, opts = {}) {
    io.attach(httpServer, { destroyUpgrade: false, ...opts });
  }
};
