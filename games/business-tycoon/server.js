// Business Tycoon — mounted inside MZeeGamingHub at BASE; no longer its own server.
// Socket.IO is constructed detached and bound to the hub's shared HTTP server by attach().
const express = require('express');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const { buildCells, CHANCE_CARDS, COMM_CARDS, GROUPS } = require('./gameData');

const BASE = '/games/business-tycoon';

const app = express.Router();
// Namespaced path keeps this clear of any other realtime transport on the same server.
const io = new Server({ path: BASE + '/socket.io', cors: { origin: '*' } });

// Same secret as the hub, so a hub session token verifies here unchanged — one login, every game.
const JWT_SECRET = process.env.JWT_SECRET || 'mzee-hub-dev-secret-change-me';

app.use(express.json());
// Browser files live with every other game's, in public/games/business-tycoon,
// served by the hub's own static middleware. This router handles only /api and Socket.IO.

// ─── AUTH ROUTES ───────────────────────────────────────────────────────────────

app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || username.length < 3)
    return res.status(400).json({ error: 'Username (min 3 chars) and password required.' });
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username))
    return res.status(400).json({ error: 'Username already taken.' });
  const id = uuidv4();
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?,?,?)').run(id, username, hash);
  const token = jwt.sign({ id, username, isGuest: false }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username, id });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Invalid username or password.' });
  const token = jwt.sign({ id: user.id, username: user.username, isGuest: false }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username: user.username, id: user.id });
});

app.post('/api/guest', (req, res) => {
  const name = (req.body.name || '').trim() || 'Guest' + Math.floor(Math.random() * 9999);
  const id = 'guest_' + uuidv4();
  const token = jwt.sign({ id, username: name, isGuest: true }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, username: name, id });
});

app.get('/api/leaderboard', (req, res) => {
  const rows = db.prepare(`
    SELECT username,
           COUNT(*) as games,
           SUM(won) as wins,
           MAX(final_balance) as best
    FROM game_results
    GROUP BY username
    ORDER BY wins DESC, best DESC
    LIMIT 20
  `).all();
  res.json(rows);
});

// ─── IN-MEMORY ROOMS ──────────────────────────────────────────────────────────

const rooms = {};

function genCode() {
  let c;
  do { c = String(Math.floor(1000000 + Math.random() * 9000000)); } while (rooms[c]);
  return c;
}

function makePlayer(user, socketId, tok, color) {
  return {
    id: user.id, socketId, name: user.username, isGuest: user.isGuest,
    tok: tok || '🔵', color: color || '#222222',
    money: 50000, pos: 0, bk: false, jailed: false, jailTurns: 0,
    loan: 0, lnR: 0, htl: 0, props: [], skip: 0, connected: true,
    loanTaken: false, // Track if player has EVER taken a loan this game (only one loan allowed)
  };
}

function broadcastRoom(code) {
  const room = rooms[code];
  if (!room) return;
  const takenColors = room.players.map(p => p.color);
  const safe = {
    ...room,
    players: room.players.map(p => ({ ...p, socketId: undefined })),
    takenColors: takenColors,
  };
  io.to(code).emit('gameState', safe);
}

function addLog(room, msg) {
  room.log.unshift(msg);
  if (room.log.length > 50) room.log.pop();
}

function getRoom(socket) { return rooms[socket.roomCode]; }

function isCurrentPlayer(room, user) {
  return room.phase === 'playing' && room.players[room.cur]?.id === user.id;
}

// ─── GAME LOGIC ───────────────────────────────────────────────────────────────

function ownsFullGroup(cells, playerId, group) {
  const members = GROUPS[group] || [];
  return members.length > 0 && members.every(id => cells[id].owner === playerId);
}

function calcRent(room, cell, diceTotal) {
  if (cell.mtg) return 0;
  if (cell.t === 'prop') {
    const full = ownsFullGroup(room.cells, cell.owner, cell.g);
    // If has hotel, use rent[4] (highest rent)
    if (cell.hotel) return cell.rent[4] || cell.rent[3];
    // If has houses, use rent based on house count
    if (cell.hc > 0) return cell.rent[cell.hc];
    // No buildings - double rent if owns full color group
    return full ? cell.rent[0] * 2 : cell.rent[0];
  }
  if (cell.t === 'util') {
    // Utility rent is fixed at 50% of price (stored in rent[0])
    if (cell.rent && cell.rent[0]) {
      return cell.rent[0];
    }
    // Fallback: calculate 50% of price
    return Math.floor(cell.price * 0.5);
  }
  return 0;
}

function sendToJail(room, player) {
  player.pos = 9; // PRISON is at position 9
  player.jailed = true;
  player.jailTurns = 0;
  addLog(room, `🔒 ${player.name} was sent to Prison!`);
}

function sendToRestHouse(room, player) {
  player.pos = 27; // REST HOUSE is at position 27
  player.skip = 1;
  addLog(room, `🏡 ${player.name} sent to Rest House — skip next turn.`);
}

function checkBust(room, player) {
  if (player.money < 0) {
    player.bk = true;
    player.money = 0;
    addLog(room, `💥 ${player.name} is BANKRUPT!`);
    room.cells.forEach(c => {
      if (c.owner === player.id) { c.owner = null; c.hc = 0; c.hotel = 0; c.mtg = false; }
    });
    checkWin(room);
  }
}

function checkWin(room) {
  const active = room.players.filter(p => !p.bk);
  if (active.length === 1) {
    // Check if the winner has an outstanding loan - trigger repayment phase
    const winner = active[0];
    if (winner.loan > 0) {
      room.phase = 'loanRepayment';
      room.loanRepaymentPlayer = winner.id;
      addLog(room, `🏦 ${winner.name} must repay their loan before winning!`);
      return;
    }
    
    room.phase = 'ended';
    room.winner = active[0].id;
    addLog(room, `🏆 ${active[0].name} WINS the game!`);
    room.players.forEach(p => {
      if (p.isGuest) return;
      try {
        db.prepare('INSERT INTO game_results (id,user_id,username,won,final_balance) VALUES (?,?,?,?,?)')
          .run(uuidv4(), p.id, p.name, p.id === active[0].id ? 1 : 0, p.money);
      } catch(e) {}
    });
  }
}

// Finalize game after loan repayment
function finalizeGameEnd(room) {
  const active = room.players.filter(p => !p.bk);
  if (active.length === 1) {
    room.phase = 'ended';
    room.winner = active[0].id;
    room.loanRepaymentPlayer = null;
    addLog(room, `🏆 ${active[0].name} WINS the game!`);
    room.players.forEach(p => {
      if (p.isGuest) return;
      try {
        db.prepare('INSERT INTO game_results (id,user_id,username,won,final_balance) VALUES (?,?,?,?,?)')
          .run(uuidv4(), p.id, p.name, p.id === active[0].id ? 1 : 0, p.money);
      } catch(e) {}
    });
  }
}

// End game by net worth (used when host-initiated vote passes)
function endGameByNetWorth(room) {
  const activePlayers = room.players.filter(p => !p.bk);
  
  // Calculate net worth for each player
  const playerNetWorths = activePlayers.map(p => {
    // Property values (non-mortgaged)
    const ownedProps = room.cells.filter(c => c.owner === p.id && !c.mtg);
    const mortgagedProps = room.cells.filter(c => c.owner === p.id && c.mtg);
    
    const propertyValue = ownedProps.reduce((sum, c) => sum + (c.price || 0), 0);
    const mortgagedValue = mortgagedProps.reduce((sum, c) => sum + Math.floor((c.price || 0) * 0.5), 0); // Mortgaged = 50% value
    
    // Building values (houses + hotels)
    const houseValue = ownedProps.reduce((sum, c) => sum + ((c.hc || 0) * Math.floor((c.price || 0) * 0.5)), 0);
    const hotelValue = ownedProps.reduce((sum, c) => sum + ((c.hotel || 0) * Math.floor((c.price || 0) * 0.5)), 0);
    const buildingsValue = houseValue + hotelValue;
    
    // Net worth = cash + properties + buildings - loans
    const netWorth = p.money + propertyValue + mortgagedValue + buildingsValue - (p.loan || 0);
    
    return { player: p, netWorth };
  });
  
  // Sort by net worth descending
  playerNetWorths.sort((a, b) => b.netWorth - a.netWorth);
  
  // Winner is the one with highest net worth
  const winner = playerNetWorths[0]?.player;
  
  if (winner) {
    room.phase = 'ended';
    room.winner = winner.id;
    room.endGameVote = null;
    
    // Build rankings for log
    const rankings = playerNetWorths.map((pw, i) => 
      `${i+1}. ${pw.player.name}: Rs.${pw.netWorth.toLocaleString()}`
    ).join(' | ');
    
    addLog(room, `🏆 ${winner.name} WINS by NET WORTH!`);
    addLog(room, `📊 Final Rankings: ${rankings}`);
    
    // Save results to database
    room.players.forEach(p => {
      if (p.isGuest) return;
      const pw = playerNetWorths.find(x => x.player.id === p.id);
      try {
        db.prepare('INSERT INTO game_results (id,user_id,username,won,final_balance) VALUES (?,?,?,?,?)')
          .run(uuidv4(), p.id, p.name, p.id === winner.id ? 1 : 0, pw?.netWorth || p.money);
      } catch(e) {}
    });
  }
}

// ─── ROBOT AI TURN PROCESSING ───────────────────────────────────────────────
function processRobotTurn(roomCode) {
  const room = rooms[roomCode];
  if (!room || room.phase !== 'playing') return;
  
  const robot = room.players[room.cur];
  if (!robot || !robot.isRobot || robot.bk) return;
  
  // Step 1: Roll dice
  setTimeout(() => {
    if (!rooms[roomCode] || rooms[roomCode].phase !== 'playing') return;
    
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    room.dice = [d1, d2];
    room.rolled = true;
    
    const total = d1 + d2;
    const isDoubles = d1 === d2;
    
    addLog(room, `🎲 ${robot.name} rolled ${d1} + ${d2} = ${total}${isDoubles ? ' (Doubles!)' : ''}`);
    
    // Handle jail
    if (robot.jailed) {
      if (isDoubles) {
        robot.jailed = false;
        robot.jailTurns = 0;
        addLog(room, `🔓 ${robot.name} rolled doubles and escaped Prison!`);
      } else {
        robot.jailTurns++;
        if (robot.jailTurns >= 3) {
          robot.money -= 500;
          robot.jailed = false;
          robot.jailTurns = 0;
          addLog(room, `💸 ${robot.name} paid Rs.500 to leave Prison after 3 failed attempts.`);
          checkBust(room, robot);
        } else {
          addLog(room, `🔒 ${robot.name} is still in Prison (Attempt ${robot.jailTurns}/3).`);
          broadcastRoom(roomCode);
          setTimeout(() => endRobotTurn(roomCode), 1500);
          return;
        }
      }
    }
    
    // Move robot
    const oldPos = robot.pos;
    robot.pos = (robot.pos + total) % 36;
    
    // Passed START bonus
    if (robot.pos < oldPos && oldPos !== 0) {
      robot.money += 2000;
      addLog(room, `💵 ${robot.name} passed START and collected Rs.2,000!`);
    }
    
    const cell = room.cells[robot.pos];
    addLog(room, `📍 ${robot.name} landed on ${cell.name}.`);
    
    broadcastRoom(roomCode);
    
    // Step 2: Handle landing
    setTimeout(() => {
      handleRobotLanding(roomCode, robot, cell);
    }, 1000);
    
  }, 1000);
}

function handleRobotLanding(roomCode, robot, cell) {
  const room = rooms[roomCode];
  if (!room) return;
  
  // Handle different cell types
  if (cell.t === 'corner') {
    if (cell.sub === 'club') {
      // Pay club fee
      const otherPlayers = room.players.filter(p => !p.bk && p.id !== robot.id);
      const totalPay = (otherPlayers.length * 100) + 100;
      robot.money -= totalPay;
      otherPlayers.forEach(p => p.money += 100);
      addLog(room, `🎰 ${robot.name} paid Rs.${totalPay} at CLUB.`);
      checkBust(room, robot);
    } else if (cell.sub === 'rhouse') {
      // Rest house
      const otherPlayers = room.players.filter(p => !p.bk && p.id !== robot.id);
      const totalCollect = (otherPlayers.length * 100) + 100;
      robot.money += totalCollect;
      otherPlayers.forEach(p => {
        p.money -= 100;
        checkBust(room, p);
      });
      robot.skip = 1;
      addLog(room, `🏡 ${robot.name} collected Rs.${totalCollect} at REST HOUSE (skip next turn).`);
    } else if (cell.sub === 'prison') {
      sendToJail(room, robot);
    }
    broadcastRoom(roomCode);
    setTimeout(() => endRobotTurn(roomCode), 1500);
    
  } else if (cell.t === 'prop' || cell.t === 'util') {
    if (!cell.owner) {
      // Buy if can afford
      if (robot.money >= cell.price) {
        robot.money -= cell.price;
        cell.owner = robot.id;
        robot.props.push(cell.id);
        addLog(room, `🏠 ${robot.name} bought ${cell.name} for Rs.${cell.price.toLocaleString()}.`);
      } else {
        addLog(room, `❌ ${robot.name} cannot afford ${cell.name}.`);
      }
    } else if (cell.owner !== robot.id && !cell.mtg) {
      // Pay rent
      const rent = calcRent(room, cell, room.dice[0] + room.dice[1]);
      robot.money -= rent;
      const owner = room.players.find(p => p.id === cell.owner);
      if (owner) owner.money += rent;
      addLog(room, `💰 ${robot.name} paid Rs.${rent.toLocaleString()} rent to ${owner?.name || 'owner'}.`);
      checkBust(room, robot);
    }
    broadcastRoom(roomCode);
    setTimeout(() => endRobotTurn(roomCode), 1500);
    
  } else if (cell.t === 'chance') {
    const card = getCardByDiceTotal(room, 'chance');
    applyCard(room, robot, card, 'chance');
    broadcastRoom(roomCode);
    setTimeout(() => endRobotTurn(roomCode), 2000);
    
  } else if (cell.t === 'comm') {
    const card = getCardByDiceTotal(room, 'comm');
    applyCard(room, robot, card, 'comm');
    broadcastRoom(roomCode);
    setTimeout(() => endRobotTurn(roomCode), 2000);
    
  } else if (cell.t === 'tax') {
    const taxAmount = cell.amount === -1 ? Math.min(2000, Math.floor(robot.money * 0.1)) : cell.amount;
    robot.money -= taxAmount;
    addLog(room, `💸 ${robot.name} paid Rs.${taxAmount} tax.`);
    checkBust(room, robot);
    broadcastRoom(roomCode);
    setTimeout(() => endRobotTurn(roomCode), 1500);
    
  } else {
    broadcastRoom(roomCode);
    setTimeout(() => endRobotTurn(roomCode), 1500);
  }
}

function endRobotTurn(roomCode) {
  const room = rooms[roomCode];
  if (!room || room.phase !== 'playing') return;
  
  const robot = room.players[room.cur];
  if (!robot) return;
  
  room.rolled = false;
  room.doubles = 0;
  
  let next = (room.cur + 1) % room.players.length;
  let tries = 0;
  while (room.players[next].bk && tries < room.players.length) { 
    next = (next + 1) % room.players.length; 
    tries++; 
  }
  room.cur = next;
  
  addLog(room, `▶ ${room.players[room.cur].name}'s turn.`);
  checkWin(room);
  broadcastRoom(roomCode);
  
  // If next player is also a robot, continue
  if (room.isRobotGame && room.players[room.cur].isRobot && room.phase === 'playing') {
    setTimeout(() => processRobotTurn(roomCode), 2000);
  }
}

function getCardByDiceTotal(room, cardType) {
  const diceTotal = room.dice[0] + room.dice[1];
  const cards = cardType === 'chance' ? CHANCE_CARDS : COMM_CARDS;
  const card = cards.find(c => c.no === diceTotal);
  return card || cards[0]; // fallback to first card if not found
}

function applyCard(room, player, card, cardType) {
  const diceTotal = room.dice[0] + room.dice[1];
  addLog(room, `📋 ${player.name} rolled ${diceTotal} — Card #${card.no}: "${card.text}"`);
  
  // Emit card to all players
  const targetSocket = room.players.find(pl => pl.id === player.id);
  if (targetSocket?.socketId) {
    io.to(targetSocket.socketId).emit('showCard', { type: cardType, text: `#${card.no}: ${card.text}`, no: card.no });
  }
  
  switch (card.action) {
    case 'pay': 
      player.money -= card.value; 
      addLog(room, `💸 ${player.name} paid Rs.${card.value}.`); 
      checkBust(room, player); 
      break;
    case 'collect': 
      player.money += card.value; 
      addLog(room, `💰 ${player.name} collected Rs.${card.value}!`); 
      break;
    case 'collectAll':
      room.players.filter(p => !p.bk && p.id !== player.id).forEach(p => {
        player.money += card.value; 
        p.money -= card.value; 
        checkBust(room, p);
      });
      const totalCollected = card.value * room.players.filter(p => !p.bk && p.id !== player.id).length;
      addLog(room, `🎂 ${player.name} collected Rs.${card.value} from each player (Total: Rs.${totalCollected})!`);
      break;
    case 'jail':
      sendToJail(room, player);
      break;
  }
}

function landOn(room, player, cell) {
  if (cell.t === 'corner') {
    // START (0) — nothing special when landing on it
    // PRISON (9) — player goes to prison!
    // CLUB (18) — pay Rs.100 to each player + Rs.100 to bank
    // REST HOUSE (27) — collect Rs.100 from each player + Rs.100 from bank, skip next turn
    if (cell.sub === 'prison') {
      // Only jail them if they're not already jailed (prevents re-jailing when already in prison)
      if (!player.jailed) {
        player.jailed = true;
        player.jailTurns = 0;
        addLog(room, `🔒 ${player.name} landed on PRISON and is now locked up!`);
      }
    }
    if (cell.sub === 'club') {
      const otherPlayers = room.players.filter(p => !p.bk && p.id !== player.id);
      const payToPlayers = otherPlayers.length * 100;
      const payToBank = 100;
      const totalPay = payToPlayers + payToBank;
      
      // Check if player can afford it
      if (player.money >= totalPay) {
        // Can pay - deduct immediately
        player.money -= totalPay;
        otherPlayers.forEach(p => {
          p.money += 100;
        });
        addLog(room, `🎰 ${player.name} landed on CLUB — paid Rs.100 to each player (${otherPlayers.length} players) + Rs.100 to bank = Rs.${totalPay} total!`);
        
        // Emit club paid notification to ALL players
        io.to(room.code).emit('clubPaid', {
          payerName: player.name,
          payerTok: player.tok,
          totalAmount: totalPay,
          playerCount: otherPlayers.length,
          bankAmount: 100
        });
      } else {
        // Cannot pay - set pending debt
        room.clubDebt = {
          playerId: player.id,
          totalAmount: totalPay,
          toPlayers: otherPlayers.map(p => p.id),
          toBank: 100
        };
        addLog(room, `🎰 ${player.name} landed on CLUB — owes Rs.${totalPay} but only has Rs.${player.money}! Must mortgage or take loan to pay.`);
        // Emit notification to player
        const targetSocket = room.players.find(pl => pl.id === player.id);
        if (targetSocket?.socketId) {
          io.to(targetSocket.socketId).emit('clubDebtWarning', { amount: totalPay, has: player.money });
        }
      }
      checkBust(room, player);
    }
    if (cell.sub === 'rhouse') {
      const otherPlayers = room.players.filter(p => !p.bk && p.id !== player.id);
      
      // Collect Rs.100 from bank
      player.money += 100;
      
      // Collect Rs.100 from each player
      otherPlayers.forEach(p => {
        if (p.money >= 100) {
          p.money -= 100;
          player.money += 100;
        } else {
          // Player can't afford - set pending debt for them
          if (!room.restHouseDebts) room.restHouseDebts = [];
          room.restHouseDebts.push({
            debtorId: p.id,
            creditorId: player.id,
            amount: 100
          });
          addLog(room, `⚠️ ${p.name} cannot pay Rs.100 to ${player.name} — must mortgage or take loan!`);
          // Emit notification to debtor
          const debtorSocket = room.players.find(pl => pl.id === p.id);
          if (debtorSocket?.socketId) {
            io.to(debtorSocket.socketId).emit('restHouseDebtWarning', { amount: 100, to: player.name });
          }
        }
      });
      
      player.skip = 1;
      const paidCount = otherPlayers.filter(p => p.money >= 0).length;
      const totalCollected = 100 + (paidCount * 100);
      addLog(room, `🏡 ${player.name} landed on Rest House — collected Rs.100 from bank + Rs.100 from each player. Skips next turn.`);
      
      // Emit rest house paid notification to ALL players
      io.to(room.code).emit('restHousePaid', {
        receiverName: player.name,
        receiverTok: player.tok,
        totalAmount: totalCollected,
        playerCount: paidCount,
        bankAmount: 100
      });
    }
    return;
  }
  if (cell.t === 'tax') {
    const taxAmount = 100; // Both taxes are Rs.100
    player.money -= taxAmount;
    addLog(room, `💰 ${player.name} paid ${cell.name} Rs.${taxAmount}.`);
    
    // Emit tax paid notification to ALL players
    io.to(room.code).emit('taxPaid', {
      payerName: player.name,
      payerTok: player.tok,
      taxType: cell.name,
      amount: taxAmount
    });
    
    checkBust(room, player);
    return;
  }
  if (cell.t === 'chance') { applyCard(room, player, getCardByDiceTotal(room, 'chance'), 'chance'); return; }
  if (cell.t === 'comm')   { applyCard(room, player, getCardByDiceTotal(room, 'comm'), 'comm'); return; }
  if ((cell.t === 'prop' || cell.t === 'util') && cell.owner !== null && cell.owner !== player.id && !cell.mtg) {
    const diceTotal = room.dice[0] + room.dice[1];
    const rent = calcRent(room, cell, diceTotal);
    const owner = room.players.find(p => p.id === cell.owner);
    if (owner && !owner.bk) {
      // Check if player can afford rent
      if (player.money >= rent) {
        // Can pay - deduct immediately
        player.money -= rent;
        owner.money += rent;
        addLog(room, `🏠 ${player.name} paid Rs.${rent} rent to ${owner.name} for ${cell.name}.`);
        
        // Emit rent paid notification to ALL players
        io.to(room.code).emit('rentPaid', {
          payerName: player.name,
          payerTok: player.tok,
          ownerName: owner.name,
          ownerTok: owner.tok,
          propertyName: cell.name,
          propertyId: cell.id,
          amount: rent,
          hotels: cell.hc || 0,
          group: cell.g || null
        });
        
        checkBust(room, player);
      } else {
        // Cannot afford - set pending rent debt
        room.rentDebt = {
          playerId: player.id,
          ownerId: owner.id,
          cellId: cell.id,
          cellName: cell.name,
          amount: rent,
          hotels: cell.hc || 0,
          group: cell.g || null
        };
        addLog(room, `⚠️ ${player.name} owes Rs.${rent} rent to ${owner.name} for ${cell.name} but only has Rs.${player.money}!`);
        
        // Emit notification to player
        const targetSocket = room.players.find(pl => pl.id === player.id);
        if (targetSocket?.socketId) {
          io.to(targetSocket.socketId).emit('rentDebtWarning', { 
            amount: rent, 
            has: player.money,
            ownerName: owner.name,
            propertyName: cell.name
          });
        }
      }
    }
  }
}

// ─── SOCKET HANDLERS ─────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  let user;
  try { user = jwt.verify(socket.handshake.auth.token, JWT_SECRET); }
  catch { socket.emit('authError', 'Invalid session. Please log in again.'); socket.disconnect(); return; }
  socket.user = user;

  // ── Create Room ──
  socket.on('createRoom', ({ tok, color, duration }) => {
    const code = genCode();
    rooms[code] = {
      code, phase: 'lobby', hostId: user.id,
      players: [], cells: null,
      cur: 0, rolled: false, dice: [1,1], doubles: 0,
      log: [], chat: [], auc: null,
      gameDuration: duration || 1, // Hours
      gameEndTime: null, // Will be set when game starts
      gameTimerExpired: false,
    };
    socket.join(code);
    socket.roomCode = code;
    rooms[code].players.push(makePlayer(user, socket.id, tok, color));
    socket.emit('roomCreated', code);
    broadcastRoom(code);
  });

  // ── Create Robot Game ──
  socket.on('createRobotGame', ({ tok, color, duration, robotCount }) => {
    const code = genCode();
    const numRobots = Math.min(5, Math.max(1, parseInt(robotCount) || 1));
    
    // Robot colors (excluding player's color)
    const allColors = ['#ffffff', '#2196f3', '#4caf50', '#ff9800', '#9c27b0', '#f44336'];
    const availableColors = allColors.filter(c => c !== color);
    
    // Robot names
    const robotNames = ['🤖 Bot Alpha', '🤖 Bot Beta', '🤖 Bot Gamma', '🤖 Bot Delta', '🤖 Bot Epsilon'];
    
    rooms[code] = {
      code, phase: 'lobby', hostId: user.id,
      players: [], cells: null,
      cur: 0, rolled: false, dice: [1,1], doubles: 0,
      log: [], chat: [], auc: null,
      gameDuration: duration || 1,
      gameEndTime: null,
      gameTimerExpired: false,
      isRobotGame: true,
    };
    
    socket.join(code);
    socket.roomCode = code;
    
    // Add human player first
    rooms[code].players.push(makePlayer(user, socket.id, tok, color));
    
    // Add robot players
    for (let i = 0; i < numRobots; i++) {
      const robotPlayer = {
        id: `robot_${i}_${Date.now()}`,
        name: robotNames[i],
        socketId: null,
        tok: 'pawn',
        color: availableColors[i % availableColors.length],
        pos: 0,
        money: 50000,
        loan: 0, lnR: 0, htl: 0, props: [], skip: 0, connected: true,
        loanTaken: false,
        jailed: false, jailTurns: 0,
        bk: false,
        isRobot: true,
        isGuest: true, // Treat robots as guests for leaderboard
      };
      rooms[code].players.push(robotPlayer);
    }
    
    socket.emit('roomCreated', code);
    addLog(rooms[code], `🤖 Robot game created with ${numRobots} bot(s)!`);
    
    // Auto-start robot games immediately
    setTimeout(() => {
      const room = rooms[code];
      if (room && room.phase === 'lobby') {
        room.phase = 'playing';
        room.cells = buildCells();
        
        const durationMs = (room.gameDuration || 1) * 60 * 60 * 1000;
        room.gameEndTime = Date.now() + durationMs;
        room.gameTimerExpired = false;
        
        addLog(room, `🎲 Game started! ${room.players[0].name} goes first.`);
        addLog(room, `⏱️ Game duration: ${room.gameDuration} hour(s)`);
        
        startGameTimerCheck(room.code);
        broadcastRoom(room.code);
      }
    }, 500);
    
    broadcastRoom(code);
  });

  // ── Check Taken Colors (before joining) ──
  socket.on('checkTakenColors', ({ code }, callback) => {
    const room = rooms[code];
    if (!room) { 
      callback({ error: 'Room not found' }); 
      return; 
    }
    const takenColors = room.players.map(p => p.color);
    callback({ takenColors });
  });

  // ── Join Room ──
  socket.on('joinRoom', ({ code, tok, color }) => {
    const room = rooms[code];
    if (!room) { socket.emit('joinError', 'Room not found. Check the code.'); return; }
    if (room.phase !== 'lobby') { socket.emit('joinError', 'Game already in progress.'); return; }
    if (room.players.length >= 6) { socket.emit('joinError', 'ERROR: Room Full (maximum 6 players)'); return; }
    const already = room.players.find(p => p.id === user.id);
    if (already) { socket.emit('joinError', 'You are already in this room.'); return; }
    
    // Check if color is already taken
    const takenColors = room.players.map(p => p.color);
    if (takenColors.includes(color)) {
      socket.emit('joinError', 'Pawn already taken! Please choose a different color.');
      return;
    }
    
    socket.join(code);
    socket.roomCode = code;
    room.players.push(makePlayer(user, socket.id, tok, color));
    addLog(room, `${user.username} joined the room.`);
    io.to(code).emit('notification', `${user.username} joined!`);
    broadcastRoom(code);
  });

  // ── Reconnect to room ──
  socket.on('reconnectRoom', ({ code }) => {
    const room = rooms[code];
    if (!room) { socket.emit('joinError', 'Room expired.'); return; }
    const player = room.players.find(p => p.id === user.id);
    if (!player) { socket.emit('joinError', 'You are not in this room.'); return; }
    player.socketId = socket.id;
    player.connected = true;
    socket.join(code);
    socket.roomCode = code;
    broadcastRoom(code);
  });

  // ── Start Game ──
  socket.on('startGame', () => {
    const room = getRoom(socket);
    if (!room || room.hostId !== user.id) return;
    if (room.players.length < 2) { socket.emit('notification', 'Need at least 2 players to start.'); return; }
    room.phase = 'playing';
    room.cells = buildCells();
    
    // Set game end time based on duration
    const durationMs = (room.gameDuration || 1) * 60 * 60 * 1000; // Convert hours to ms
    room.gameEndTime = Date.now() + durationMs;
    room.gameTimerExpired = false;
    
    addLog(room, `🎲 Game started! ${room.players[0].name} goes first.`);
    addLog(room, `⏱️ Game duration: ${room.gameDuration} hour(s)`);
    
    // Start game timer check
    startGameTimerCheck(room.code);
    
    broadcastRoom(room.code);
  });

  // ── Roll Dice ──
  socket.on('rollDice', () => {
    const room = getRoom(socket);
    if (!room || !isCurrentPlayer(room, user) || room.rolled) return;
    const p = room.players[room.cur];
    
    // Check if player should skip turn
    if (p.skip > 0) {
      p.skip--;
      addLog(room, `${p.name} skips this turn.`);
      room.rolled = true;
      broadcastRoom(room.code);
      return;
    }
    
    const d1 = Math.ceil(Math.random() * 6);
    const d2 = Math.ceil(Math.random() * 6);
    room.dice = [d1, d2];
    const total = d1 + d2;
    const doubles = d1 === d2;

    if (p.jailed) {
      // Check if player already used 3 attempts - auto-release WITHOUT paying
      if (p.jailTurns >= 3) {
        p.jailed = false;
        p.jailTurns = 0;
        addLog(room, `🔓 ${p.name} served their time — automatically released from Prison!`);
        // Continue to move normally below
      } else if (doubles) {
        p.jailed = false;
        p.jailTurns = 0;
        addLog(room, `🔓 ${p.name} rolled doubles (${d1}+${d2}) — ESCAPED PRISON! Moving ${total} spaces.`);
        // Continue to move the player below
      } else {
        p.jailTurns++;
        addLog(room, `🔒 ${p.name} rolled ${d1}+${d2} (not doubles) — STILL IN PRISON! (Attempt ${p.jailTurns}/3)`);
        room.rolled = true;
        broadcastRoom(room.code);
        return;
      }
    }

    const oldPos = p.pos;
    p.pos = (p.pos + total) % 36;
    if (p.pos < oldPos && !p.jailed) {
      p.money += 2000;
      addLog(room, `${p.name} passed START! Collected Rs.2000.`);
    }
    addLog(room, `🎲 ${p.name} rolled ${d1}+${d2}=${total} → ${room.cells[p.pos].name}`);
    landOn(room, p, room.cells[p.pos]);

    room.rolled = true;
    broadcastRoom(room.code);
  });

  // ── Pay Jail Fine ──
  socket.on('payJailFine', () => {
    const room = getRoom(socket);
    if (!room || !isCurrentPlayer(room, user)) return;
    const p = room.players[room.cur];
    if (!p.jailed) return;
    if (p.money < 500) { socket.emit('notification', 'Not enough money to pay the fine!'); return; }
    p.money -= 500; p.jailed = false; p.jailTurns = 0;
    addLog(room, `🔓 ${p.name} paid Rs.500 fine — released from Prison! Now roll to move.`);
    checkBust(room, p);
    broadcastRoom(room.code);
  });

  // ── Buy Property ──
  socket.on('buyProp', (cellId) => {
    const room = getRoom(socket);
    if (!room || !isCurrentPlayer(room, user) || !room.rolled) return;
    const p = room.players[room.cur];
    const cell = room.cells[cellId];
    if (!cell || cell.owner !== null || p.pos !== cellId) return;
    if (cell.t !== 'prop' && cell.t !== 'util') return;
    if (p.money < cell.price) { socket.emit('notification', 'Not enough money!'); return; }
    p.money -= cell.price;
    cell.owner = p.id;
    p.props.push(cellId);
    addLog(room, `🏠 ${p.name} bought ${cell.name} for Rs.${cell.price}.`);
    broadcastRoom(room.code);
  });

  // ── Pass Buy (trigger auction) ──
  socket.on('passBuy', (cellId) => {
    const room = getRoom(socket);
    if (!room || !isCurrentPlayer(room, user)) return;
    const cell = room.cells[cellId];
    if (!cell || cell.owner !== null) return;
    startAuction(room, cell);
    broadcastRoom(room.code);
  });

  // ── Auction Bid ──
  socket.on('aucBid', (amount) => {
    const room = getRoom(socket);
    if (!room || !room.auc) return;
    const auc = room.auc;
    const remaining = auc.order.filter(id => !auc.passed.includes(id));
    if (remaining[auc.turn % remaining.length] !== user.id) return;
    const bidder = room.players.find(p => p.id === user.id);
    if (!bidder || bidder.money < amount || amount <= auc.hi) return;
    auc.hi = amount;
    auc.hId = user.id;
    auc.turn++;
    addLog(room, `🔨 ${bidder.name} bids Rs.${amount} for ${auc.cell.name}.`);
    advanceAuction(room);
    broadcastRoom(room.code);
  });

  // ── Auction Pass ──
  socket.on('aucPass', () => {
    const room = getRoom(socket);
    if (!room || !room.auc) return;
    const auc = room.auc;
    const remaining = auc.order.filter(id => !auc.passed.includes(id));
    if (remaining[auc.turn % remaining.length] !== user.id) return;
    auc.passed.push(user.id);
    auc.turn++;
    addLog(room, `${user.username} passed the auction.`);
    advanceAuction(room);
    broadcastRoom(room.code);
  });

  // ── Build House ──
  socket.on('buildHouse', (cellId) => {
    const room = getRoom(socket);
    if (!room || !isCurrentPlayer(room, user) || !room.rolled) return;
    const p = room.players[room.cur];
    const cell = room.cells[cellId];
    if (!cell || cell.owner !== p.id || cell.t !== 'prop') return;
    
    // Check if player owns all properties in this color group
    if (!ownsFullGroup(room.cells, p.id, cell.g)) {
      socket.emit('notification', `You must own ALL cities in the ${cell.g.toUpperCase()} color group to build!`);
      return;
    }
    
    // Check if property has a hotel - cannot build houses if hotel exists
    if (cell.hotel > 0) {
      socket.emit('notification', 'Cannot build houses - this property has a hotel!');
      return;
    }
    
    // Check max 3 houses
    if (cell.hc >= 3) {
      socket.emit('notification', 'Maximum 3 houses per city!');
      return;
    }
    
    // Check if mortgaged
    if (cell.mtg) {
      socket.emit('notification', 'Cannot build on mortgaged property!');
      return;
    }
    
    const cost = Math.floor(cell.price * 0.5);
    if (p.money < cost) { socket.emit('notification', 'Not enough money!'); return; }
    p.money -= cost; 
    cell.hc++;
    addLog(room, `🏠 ${p.name} built a HOUSE on ${cell.name} (${cell.hc}/3 houses). Cost Rs.${cost}.`);
    broadcastRoom(room.code);
  });

  // ── Build Hotel ──
  socket.on('buildHotel', (cellId) => {
    const room = getRoom(socket);
    if (!room || !isCurrentPlayer(room, user) || !room.rolled) return;
    const p = room.players[room.cur];
    const cell = room.cells[cellId];
    if (!cell || cell.owner !== p.id || cell.t !== 'prop') return;
    
    // Check if player owns all properties in this color group
    if (!ownsFullGroup(room.cells, p.id, cell.g)) {
      socket.emit('notification', `You must own ALL cities in the ${cell.g.toUpperCase()} color group to build!`);
      return;
    }
    
    // Check if property has houses - cannot build hotel if houses exist
    if (cell.hc > 0) {
      socket.emit('notification', 'Cannot build hotel - this property has houses!');
      return;
    }
    
    // Check max 1 hotel
    if (cell.hotel >= 1) {
      socket.emit('notification', 'Maximum 1 hotel per city!');
      return;
    }
    
    // Check if mortgaged
    if (cell.mtg) {
      socket.emit('notification', 'Cannot build on mortgaged property!');
      return;
    }
    
    const cost = Math.floor(cell.price * 0.5);
    if (p.money < cost) { socket.emit('notification', 'Not enough money!'); return; }
    p.money -= cost; 
    cell.hotel = 1;
    p.htl = (p.htl || 0) + 1;
    addLog(room, `🏨 ${p.name} built a HOTEL on ${cell.name}! Cost Rs.${cost}.`);
    broadcastRoom(room.code);
  });

  // ── Mortgage ──
  socket.on('mortgage', (cellId) => {
    const room = getRoom(socket);
    if (!room || !isCurrentPlayer(room, user)) return;
    const p = room.players[room.cur];
    const cell = room.cells[cellId];
    if (!cell || cell.owner !== p.id || cell.mtg) return;
    
    const baseVal = Math.floor(cell.price * 0.5);
    let totalVal = baseVal;
    let buildingsMsg = '';
    
    // Refund for houses (50% of build cost)
    if (cell.hc > 0) {
      const houseRefund = Math.floor(cell.hc * cell.price * 0.5 * 0.5);
      totalVal += houseRefund;
      buildingsMsg += `${cell.hc} house(s)`;
      cell.hc = 0;
    }
    
    // Refund for hotel (50% of build cost)
    if (cell.hotel > 0) {
      const hotelRefund = Math.floor(cell.hotel * cell.price * 0.5 * 0.5);
      totalVal += hotelRefund;
      buildingsMsg += buildingsMsg ? ' + 1 hotel' : '1 hotel';
      cell.hotel = 0;
    }
    
    cell.mtg = true;
    p.money += totalVal;
    
    if (buildingsMsg) {
      addLog(room, `${p.name} mortgaged ${cell.name} (${buildingsMsg} demolished) for Rs.${totalVal.toLocaleString()}.`);
    } else {
      addLog(room, `${p.name} mortgaged ${cell.name} for Rs.${totalVal.toLocaleString()}.`);
    }
    broadcastRoom(room.code);
  });

  // ── Unmortgage ──
  socket.on('unmortgage', (cellId) => {
    const room = getRoom(socket);
    if (!room || !isCurrentPlayer(room, user)) return;
    const p = room.players[room.cur];
    const cell = room.cells[cellId];
    if (!cell || cell.owner !== p.id || !cell.mtg) return;
    const cost = Math.floor(cell.price * 0.6);
    if (p.money < cost) { socket.emit('notification', 'Not enough money!'); return; }
    cell.mtg = false;
    p.money -= cost;
    addLog(room, `${p.name} unmortgaged ${cell.name} for Rs.${cost}.`);
    broadcastRoom(room.code);
  });

  // ── Take Loan ──
  socket.on('takeLoan', (amt) => {
    const room = getRoom(socket);
    if (!room || !isCurrentPlayer(room, user)) return;
    const p = room.players[room.cur];
    const maxLoan = 20000;
    const requestedAmount = parseInt(amt) || 0;
    
    // Check if player has already taken a loan this game (only one loan allowed per game)
    if (p.loanTaken) { 
      socket.emit('warning', 'You can only take ONE loan per game! You have already used your loan.'); 
      return; 
    }
    if (p.loan > 0) { 
      socket.emit('warning', 'You already have an active loan!'); 
      return; 
    }
    if (requestedAmount < 100) {
      socket.emit('warning', 'Minimum loan amount is Rs.100.');
      return;
    }
    if (requestedAmount > maxLoan) {
      socket.emit('warning', `Maximum loan amount is Rs.${maxLoan.toLocaleString()}. You requested Rs.${requestedAmount.toLocaleString()}.`);
      return;
    }
    
    p.loan = requestedAmount; 
    p.money += requestedAmount; 
    p.lnR = 0;
    p.loanTaken = true; // Mark that player has taken their one-time loan
    addLog(room, `🏦 ${p.name} took a loan of Rs.${requestedAmount.toLocaleString()}. Repay Rs.${requestedAmount.toLocaleString()} (No interest!). (ONE-TIME LOAN USED)`);
    broadcastRoom(room.code);
  });

  // ── Repay Loan ──
  socket.on('repayLoan', (amt) => {
    const room = getRoom(socket);
    if (!room || !isCurrentPlayer(room, user)) return;
    const p = room.players[room.cur];
    if (p.loan <= 0) {
      socket.emit('warning', 'You don\'t have any active loan to repay.');
      return;
    }
    
    const totalDue = p.loan; // No interest
    const repayAmount = parseInt(amt) || totalDue;
    
    if (repayAmount > p.money) {
      socket.emit('warning', `You only have Rs.${p.money.toLocaleString()} but trying to pay Rs.${repayAmount.toLocaleString()}.`);
      return;
    }
    if (repayAmount > totalDue) {
      socket.emit('warning', `Your total loan due is Rs.${totalDue.toLocaleString()}. You cannot pay more than that.`);
      return;
    }
    if (repayAmount < 100 && repayAmount < totalDue) {
      socket.emit('warning', 'Minimum repayment is Rs.100 or full amount if less.');
      return;
    }
    
    p.money -= repayAmount;
    
    if (repayAmount >= totalDue) {
      // Full repayment
      p.loan = 0; 
      p.lnR = 0;
      addLog(room, `✅ ${p.name} fully repaid loan of Rs.${repayAmount.toLocaleString()}.`);
    } else {
      // Partial repayment
      p.loan = Math.max(0, p.loan - repayAmount);
      addLog(room, `💰 ${p.name} partially repaid Rs.${repayAmount.toLocaleString()}. Remaining loan: Rs.${p.loan.toLocaleString()}.`);
    }
    broadcastRoom(room.code);
  });

  // ── End Game Loan Repayment ──
  socket.on('endGameRepayLoan', () => {
    const room = getRoom(socket);
    if (!room || room.phase !== 'loanRepayment') return;
    const p = room.players.find(pl => pl.id === user.id);
    if (!p || p.id !== room.loanRepaymentPlayer) return;
    
    if (p.loan <= 0) {
      // Loan already paid, finalize game
      finalizeGameEnd(room);
      broadcastRoom(room.code);
      return;
    }
    
    const totalDue = p.loan; // No interest
    
    if (p.money >= totalDue) {
      // Can fully repay
      p.money -= totalDue;
      addLog(room, `✅ ${p.name} repaid their full loan of Rs.${totalDue.toLocaleString()} at game end.`);
      p.loan = 0;
      p.lnR = 0;
      finalizeGameEnd(room);
    } else {
      // Cannot repay - must mortgage first
      socket.emit('notification', `You need Rs.${totalDue.toLocaleString()} but only have Rs.${p.money.toLocaleString()}. Mortgage properties first!`);
    }
    broadcastRoom(room.code);
  });

  // ── End Game Mortgage for Loan Repayment ──
  socket.on('endGameMortgageForLoan', (cellId) => {
    const room = getRoom(socket);
    if (!room || room.phase !== 'loanRepayment') return;
    const p = room.players.find(pl => pl.id === user.id);
    if (!p || p.id !== room.loanRepaymentPlayer) return;
    
    const cell = room.cells[cellId];
    if (!cell || cell.owner !== p.id || cell.mtg) {
      socket.emit('warning', 'Cannot mortgage this property.');
      return;
    }
    
    // Calculate mortgage value (50% of property price)
    const mortgageValue = Math.floor(cell.price * 0.5);
    let buildingRefund = 0;
    let buildingsMsg = '';
    
    // If property has houses, refund them (50% of build cost)
    if (cell.hc > 0) {
      const houseRefund = Math.floor(cell.hc * cell.price * 0.5 * 0.5);
      buildingRefund += houseRefund;
      buildingsMsg += `${cell.hc} house(s)`;
      cell.hc = 0;
    }
    
    // If property has hotel, refund it (50% of build cost)
    if (cell.hotel > 0) {
      const hotelRefund = Math.floor(cell.hotel * cell.price * 0.5 * 0.5);
      buildingRefund += hotelRefund;
      buildingsMsg += buildingsMsg ? ' + 1 hotel' : '1 hotel';
      cell.hotel = 0;
    }
    
    cell.mtg = true;
    const totalMortgageValue = mortgageValue + buildingRefund;
    p.money += totalMortgageValue;
    
    if (buildingsMsg) {
      addLog(room, `🏦 ${p.name} mortgaged ${cell.name} (${buildingsMsg} demolished) for Rs.${totalMortgageValue.toLocaleString()} to repay loan.`);
    } else {
      addLog(room, `🏦 ${p.name} mortgaged ${cell.name} for Rs.${totalMortgageValue.toLocaleString()} to repay loan.`);
    }
    
    broadcastRoom(room.code);
  });

  // ── Skip Loan Repayment (forfeit) ──
  socket.on('endGameSkipLoanRepayment', () => {
    const room = getRoom(socket);
    if (!room || room.phase !== 'loanRepayment') return;
    const p = room.players.find(pl => pl.id === user.id);
    if (!p || p.id !== room.loanRepaymentPlayer) return;
    
    // Player forfeits remaining loan - game ends with their current money
    addLog(room, `⚠️ ${p.name} could not fully repay their loan. Remaining debt: Rs.${p.loan.toLocaleString()}`);
    p.loan = 0; // Clear loan
    finalizeGameEnd(room);
    broadcastRoom(room.code);
  });

  // ── Propose Trade ──
  socket.on('proposeTrade', (tradeData) => {
    const room = getRoom(socket);
    if (!room || !isCurrentPlayer(room, user)) return;
    if (room.pendingTrade) return;
    const { targetId, giveCash, giveCell, getCash, getCell } = tradeData;
    const p = room.players[room.cur];
    const target = room.players.find(p => p.id === targetId);
    if (!target || target.bk) { socket.emit('notification', 'Invalid trade target.'); return; }
    // Must offer something (cash or property)
    if ((!giveCash || giveCash <= 0) && (giveCell === null || giveCell === '')) {
      socket.emit('notification', 'You must offer something! Add cash or a property.');
      return;
    }
    if (giveCash > p.money) { socket.emit('notification', 'Not enough cash to offer.'); return; }
    // Validate getCash doesn't exceed target's money
    if (getCash > target.money) { socket.emit('notification', `Cannot request more than ${target.name} has (Rs.${target.money}).`); return; }
    room.pendingTrade = { from: user.id, fromName: p.name, to: targetId, toName: target.name, giveCash: giveCash||0, giveCell: giveCell||null, getCash: getCash||0, getCell: getCell||null };
    addLog(room, `${p.name} proposed a trade to ${target.name}.`);
    const targetSocket = room.players.find(pl => pl.id === targetId);
    if (targetSocket?.socketId) io.to(targetSocket.socketId).emit('tradeProposal', room.pendingTrade);
    broadcastRoom(room.code);
  });

  // ── Accept Trade ──
  socket.on('acceptTrade', () => {
    const room = getRoom(socket);
    if (!room || !room.pendingTrade || room.pendingTrade.to !== user.id) return;
    const t = room.pendingTrade;
    const from = room.players.find(p => p.id === t.from);
    const to   = room.players.find(p => p.id === t.to);
    if (t.giveCash) { from.money -= t.giveCash; to.money += t.giveCash; }
    if (t.getCash)  { to.money -= t.getCash;    from.money += t.getCash; }
    if (t.giveCell !== null) {
      const c = room.cells[t.giveCell];
      c.owner = t.to; from.props = from.props.filter(x => x !== t.giveCell); to.props.push(t.giveCell);
    }
    if (t.getCell !== null) {
      const c = room.cells[t.getCell];
      c.owner = t.from; to.props = to.props.filter(x => x !== t.getCell); from.props.push(t.getCell);
    }
    addLog(room, `🤝 ${from.name} and ${to.name} completed a trade!`);
    room.pendingTrade = null;
    broadcastRoom(room.code);
  });

  // ── Reject Trade ──
  socket.on('rejectTrade', () => {
    const room = getRoom(socket);
    if (!room || !room.pendingTrade || room.pendingTrade.to !== user.id) return;
    addLog(room, `${user.username} rejected the trade.`);
    room.pendingTrade = null;
    broadcastRoom(room.code);
  });

  // ── Chat ──
  socket.on('chat', (msg) => {
    const room = getRoom(socket);
    if (!room || !msg) return;
    const clean = String(msg).slice(0, 200).replace(/</g, '&lt;');
    room.chat.unshift({ from: user.username, msg: clean, ts: Date.now() });
    if (room.chat.length > 100) room.chat.pop();
    broadcastRoom(room.code);
  });

  // ── Pay Club Debt ──
  socket.on('payClubDebt', () => {
    const room = getRoom(socket);
    if (!room || !room.clubDebt || room.clubDebt.playerId !== user.id) return;
    const p = room.players.find(pl => pl.id === user.id);
    if (!p) return;
    
    const debt = room.clubDebt;
    if (p.money < debt.totalAmount) {
      socket.emit('notification', `You need Rs.${debt.totalAmount} but only have Rs.${p.money}. Mortgage or take loan first!`);
      return;
    }
    
    // Pay the debt
    p.money -= debt.totalAmount;
    debt.toPlayers.forEach(playerId => {
      const recipient = room.players.find(pl => pl.id === playerId);
      if (recipient) recipient.money += 100;
    });
    
    addLog(room, `✅ ${p.name} paid CLUB debt of Rs.${debt.totalAmount}!`);
    
    // Emit club paid notification to ALL players
    io.to(room.code).emit('clubPaid', {
      payerName: p.name,
      payerTok: p.tok,
      totalAmount: debt.totalAmount,
      playerCount: debt.toPlayers.length,
      bankAmount: 100
    });
    
    room.clubDebt = null;
    checkBust(room, p);
    broadcastRoom(room.code);
  });

  // ── Pay Rest House Debt ──
  socket.on('payRestHouseDebt', () => {
    const room = getRoom(socket);
    if (!room || !room.restHouseDebts) return;
    
    const myDebt = room.restHouseDebts.find(d => d.debtorId === user.id);
    if (!myDebt) return;
    
    const p = room.players.find(pl => pl.id === user.id);
    if (!p) return;
    
    if (p.money < myDebt.amount) {
      socket.emit('notification', `You need Rs.${myDebt.amount} but only have Rs.${p.money}. Mortgage or take loan first!`);
      return;
    }
    
    // Pay the debt
    p.money -= myDebt.amount;
    const creditor = room.players.find(pl => pl.id === myDebt.creditorId);
    if (creditor) creditor.money += myDebt.amount;
    
    addLog(room, `✅ ${p.name} paid Rs.${myDebt.amount} debt to ${creditor?.name || 'player'}!`);
    room.restHouseDebts = room.restHouseDebts.filter(d => d.debtorId !== user.id);
    if (room.restHouseDebts.length === 0) room.restHouseDebts = null;
    checkBust(room, p);
    broadcastRoom(room.code);
  });

  // ── Pay Rent Debt ──
  socket.on('payRentDebt', () => {
    const room = getRoom(socket);
    if (!room || !room.rentDebt || room.rentDebt.playerId !== user.id) return;
    
    const p = room.players.find(pl => pl.id === user.id);
    if (!p) return;
    
    const debt = room.rentDebt;
    if (p.money < debt.amount) {
      socket.emit('notification', `You need Rs.${debt.amount} but only have Rs.${p.money}. Mortgage or take loan first!`);
      return;
    }
    
    // Pay the rent
    const owner = room.players.find(pl => pl.id === debt.ownerId);
    p.money -= debt.amount;
    if (owner) owner.money += debt.amount;
    
    addLog(room, `🏠 ${p.name} paid Rs.${debt.amount} rent to ${owner?.name || 'owner'} for ${debt.cellName}!`);
    
    // Emit rent paid notification to ALL players
    io.to(room.code).emit('rentPaid', {
      payerName: p.name,
      payerTok: p.tok,
      ownerName: owner?.name || 'Owner',
      ownerTok: owner?.tok || '🏠',
      propertyName: debt.cellName,
      propertyId: debt.cellId,
      amount: debt.amount,
      hotels: debt.hotels || 0,
      group: debt.group || null
    });
    
    room.rentDebt = null;
    checkBust(room, p);
    broadcastRoom(room.code);
  });

  // ── End Turn ──
  socket.on('endTurn', () => {
    const room = getRoom(socket);
    if (!room || !isCurrentPlayer(room, user) || !room.rolled) return;
    const p = room.players[room.cur];
    
    // Check for unpaid club debt
    if (room.clubDebt && room.clubDebt.playerId === p.id) {
      socket.emit('notification', '⚠️ You must pay your CLUB debt first! Mortgage or take loan if needed.');
      return;
    }
    
    // Check for unpaid rent debt
    if (room.rentDebt && room.rentDebt.playerId === p.id) {
      socket.emit('notification', '⚠️ You must pay your RENT first! Mortgage or take loan if needed.');
      return;
    }
    
    // Loan tracking (no interest growth anymore)
    if (p.loan > 0) {
      p.lnR++;
    }
    room.rolled = false;
    room.doubles = 0;
    let next = (room.cur + 1) % room.players.length;
    let tries = 0;
    while (room.players[next].bk && tries < room.players.length) { next = (next+1) % room.players.length; tries++; }
    room.cur = next;
    addLog(room, `▶ ${room.players[room.cur].name}'s turn.`);
    checkWin(room);
    broadcastRoom(room.code);
    
    // Trigger robot turn if next player is a robot
    if (room.isRobotGame && room.players[room.cur].isRobot && room.phase === 'playing') {
      setTimeout(() => processRobotTurn(room.code), 1500);
    }
  });

  // ── Force End Turn (timer expired) ──
  socket.on('forceEndTurn', () => {
    const room = getRoom(socket);
    if (!room || !isCurrentPlayer(room, user)) return;
    const p = room.players[room.cur];
    
    // If player has club debt and timer expired, force pay (go negative if needed)
    if (room.clubDebt && room.clubDebt.playerId === p.id) {
      const debt = room.clubDebt;
      p.money -= debt.totalAmount;
      debt.toPlayers.forEach(playerId => {
        const recipient = room.players.find(pl => pl.id === playerId);
        if (recipient) recipient.money += 100;
      });
      addLog(room, `⏱️ ${p.name}'s CLUB debt of Rs.${debt.totalAmount} was force-paid (timer expired).`);
      room.clubDebt = null;
      checkBust(room, p);
    }
    
    // If player has rent debt and timer expired, force pay (go negative if needed)
    if (room.rentDebt && room.rentDebt.playerId === p.id) {
      const debt = room.rentDebt;
      const owner = room.players.find(pl => pl.id === debt.ownerId);
      p.money -= debt.amount;
      if (owner) owner.money += debt.amount;
      addLog(room, `⏱️ ${p.name}'s RENT debt of Rs.${debt.amount} was force-paid (timer expired).`);
      
      // Emit rent paid notification
      io.to(room.code).emit('rentPaid', {
        payerName: p.name,
        payerTok: p.tok,
        ownerName: owner?.name || 'Owner',
        ownerTok: owner?.tok || '🏠',
        propertyName: debt.cellName,
        propertyId: debt.cellId,
        amount: debt.amount,
        hotels: debt.hotels || 0,
        group: debt.group || null
      });
      
      room.rentDebt = null;
      checkBust(room, p);
    }
    
    addLog(room, `⏱️ ${p.name}'s turn ended (time expired).`);
    
    // Loan tracking (no interest growth anymore)
    if (p.loan > 0) {
      p.lnR++;
    }
    room.rolled = false;
    room.doubles = 0;
    let next = (room.cur + 1) % room.players.length;
    let tries = 0;
    while (room.players[next].bk && tries < room.players.length) { next = (next+1) % room.players.length; tries++; }
    room.cur = next;
    addLog(room, `▶ ${room.players[room.cur].name}'s turn.`);
    checkWin(room);
    broadcastRoom(room.code);
    
    // Trigger robot turn if next player is a robot
    if (room.isRobotGame && room.players[room.cur].isRobot && room.phase === 'playing') {
      setTimeout(() => processRobotTurn(room.code), 1500);
    }
  });

  // ── Host Initiate End Game Vote ──
  socket.on('initiateEndGameVote', () => {
    const room = getRoom(socket);
    if (!room || room.phase !== 'playing') return;
    if (room.hostId !== user.id) {
      socket.emit('notification', 'Only the host can initiate end game vote!');
      return;
    }
    if (room.endGameVote) {
      socket.emit('notification', 'A vote is already in progress!');
      return;
    }
    
    const activePlayers = room.players.filter(p => !p.bk);
    room.endGameVote = {
      initiatorId: user.id,
      yesVotes: 0,
      noVotes: 0,
      voted: [],
      totalPlayers: activePlayers.length
    };
    
    addLog(room, `🗳️ ${room.players.find(p => p.id === user.id)?.name || 'Host'} initiated an END GAME vote!`);
    
    // Notify all players
    io.to(room.code).emit('endGameVoteStarted', room.endGameVote);
    broadcastRoom(room.code);
  });

  // ── Player End Game Vote ──
  socket.on('endGameVote', (vote) => {
    const room = getRoom(socket);
    if (!room || !room.endGameVote) return;
    
    const player = room.players.find(p => p.id === user.id);
    if (!player || player.bk) return;
    
    // Check if already voted
    if (room.endGameVote.voted.includes(user.id)) {
      socket.emit('notification', 'You have already voted!');
      return;
    }
    
    // Record vote
    room.endGameVote.voted.push(user.id);
    if (vote === 'yes') {
      room.endGameVote.yesVotes++;
    } else {
      room.endGameVote.noVotes++;
    }
    
    addLog(room, `🗳️ ${player.name} voted ${vote === 'yes' ? '✅ YES' : '❌ NO'}`);
    
    // Check if all players have voted
    const activePlayers = room.players.filter(p => !p.bk);
    const allVoted = room.endGameVote.voted.length >= activePlayers.length;
    const majorityReached = room.endGameVote.yesVotes > activePlayers.length / 2;
    const majorityNo = room.endGameVote.noVotes >= activePlayers.length / 2;
    
    if (allVoted || majorityReached || majorityNo) {
      if (majorityReached || (allVoted && room.endGameVote.yesVotes > room.endGameVote.noVotes)) {
        // Vote passed - end the game by net worth
        addLog(room, `✅ END GAME VOTE PASSED! (${room.endGameVote.yesVotes} Yes / ${room.endGameVote.noVotes} No)`);
        io.to(room.code).emit('endGameVotePassed');
        endGameByNetWorth(room);
      } else {
        // Vote failed
        addLog(room, `❌ END GAME VOTE FAILED! (${room.endGameVote.yesVotes} Yes / ${room.endGameVote.noVotes} No)`);
        io.to(room.code).emit('endGameVoteFailed');
        room.endGameVote = null;
      }
    } else {
      // Update all players with vote status
      io.to(room.code).emit('endGameVoteUpdate', room.endGameVote);
    }
    
    broadcastRoom(room.code);
  });

  // ── Extend Game Time (Host Only) ──
  socket.on('extendGameTime', (hours) => {
    const room = getRoom(socket);
    if (!room || room.hostId !== user.id) return;
    if (room.phase !== 'playing') return;
    
    const extensionMs = (hours || 1) * 60 * 60 * 1000;
    room.gameEndTime = Date.now() + extensionMs;
    room.gameTimerExpired = false;
    room.gameDuration = hours || 1; // Update for progress bar calculation
    
    addLog(room, `⏱️ Host extended game time by ${hours} hour(s)!`);
    
    io.to(room.code).emit('gameTimeExtended', { hours });
    broadcastRoom(room.code);
  });

  // ── End Game By Time (Host Only) ──
  socket.on('endGameByTime', () => {
    const room = getRoom(socket);
    if (!room || room.hostId !== user.id) return;
    if (room.phase !== 'playing') return;
    
    addLog(room, `🏁 Host ended the game (time expired)!`);
    stopGameTimerCheck(room.code);
    endGameByNetWorth(room);
    broadcastRoom(room.code);
  });

  // ── End Game Immediately (Robot Games - No Vote) ──
  socket.on('endGameByNetWorthImmediate', () => {
    const room = getRoom(socket);
    if (!room || room.hostId !== user.id) return;
    if (room.phase !== 'playing') return;
    
    addLog(room, `🏁 Host ended the game!`);
    stopGameTimerCheck(room.code);
    endGameByNetWorth(room);
    broadcastRoom(room.code);
  });

  // ── Leave Room (for lobby) ──
  socket.on('leaveRoom', () => {
    const room = getRoom(socket);
    if (!room) return;
    
    // Only allow leaving in lobby phase
    if (room.phase === 'lobby') {
      const playerIndex = room.players.findIndex(p => p.id === user.id);
      if (playerIndex !== -1) {
        const player = room.players[playerIndex];
        room.players.splice(playerIndex, 1);
        addLog(room, `${player.name} left the room.`);
        io.to(room.code).emit('notification', `${player.name} left!`);
        socket.leave(room.code);
        socket.roomCode = null;
        
        // If room is empty, delete it
        if (room.players.length === 0) {
          delete rooms[room.code];
        } else {
          // If host left, assign new host
          if (room.hostId === user.id && room.players.length > 0) {
            room.hostId = room.players[0].id;
            addLog(room, `${room.players[0].name} is now the host.`);
          }
          broadcastRoom(room.code);
        }
      }
    }
  });

  // ── Disconnect ──
  socket.on('disconnect', () => {
    const room = getRoom(socket);
    if (!room) return;
    const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
    
    if (playerIndex !== -1) {
      const player = room.players[playerIndex];
      
      // In lobby phase, remove the player completely
      if (room.phase === 'lobby') {
        room.players.splice(playerIndex, 1);
        addLog(room, `${player.name} left the room.`);
        io.to(room.code).emit('notification', `${player.name} left!`);
        
        // If room is empty, delete it
        if (room.players.length === 0) {
          delete rooms[room.code];
        } else {
          // If host left, assign new host
          if (room.hostId === player.id && room.players.length > 0) {
            room.hostId = room.players[0].id;
            addLog(room, `${room.players[0].name} is now the host.`);
          }
          broadcastRoom(room.code);
        }
      } else {
        // In game phase, just mark as disconnected
        player.connected = false;
        player.socketId = null;
        broadcastRoom(room.code);
      }
    }
  });
});

// ─── AUCTION HELPERS ─────────────────────────────────────────────────────────

function startAuction(room, cell) {
  const active = room.players.filter(p => !p.bk);
  room.auc = { cell, hi: Math.floor(cell.price * 0.1), hId: null, passed: [], order: active.map(p => p.id), turn: 0 };
  addLog(room, `🔨 Auction started for ${cell.name}! Opening bid Rs.${room.auc.hi}.`);
}

function advanceAuction(room) {
  const auc = room.auc;
  if (!auc) return;
  const remaining = auc.order.filter(id => !auc.passed.includes(id));
  if (remaining.length <= 1) {
    if (auc.hId) {
      const w = room.players.find(p => p.id === auc.hId);
      w.money -= auc.hi;
      auc.cell.owner = w.id;
      w.props.push(auc.cell.id);
      addLog(room, `🔨 ${w.name} won ${auc.cell.name} at Rs.${auc.hi}!`);
      checkBust(room, w);
    } else {
      addLog(room, `No bids — ${auc.cell.name} stays unowned.`);
    }
    room.auc = null;
  }
}

// ─── GAME TIMER SYSTEM ────────────────────────────────────────────────────────

const gameTimers = {}; // Store timer intervals by room code

function startGameTimerCheck(code) {
  // Clear any existing timer for this room
  if (gameTimers[code]) {
    clearInterval(gameTimers[code]);
  }
  
  // Check every 5 seconds
  gameTimers[code] = setInterval(() => {
    const room = rooms[code];
    if (!room) {
      clearInterval(gameTimers[code]);
      delete gameTimers[code];
      return;
    }
    
    if (room.phase !== 'playing' || room.gameTimerExpired) {
      return;
    }
    
    const now = Date.now();
    if (room.gameEndTime && now >= room.gameEndTime) {
      room.gameTimerExpired = true;
      addLog(room, `⏰ Game time has expired!`);
      
      // Notify all players
      io.to(room.code).emit('gameTimeExpired');
      broadcastRoom(room.code);
    }
  }, 5000);
}

function stopGameTimerCheck(code) {
  if (gameTimers[code]) {
    clearInterval(gameTimers[code]);
    delete gameTimers[code];
  }
}

// Mounted by the hub: it hands us the shared HTTP server and we bind Socket.IO to it.
module.exports = {
  base: BASE,
  router: app,
  io,
  ready: db.ready,
  attach(httpServer) { io.attach(httpServer); return io; }
};
