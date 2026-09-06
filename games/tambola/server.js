import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'dist/index.html')));

// Points formula:
// Full House: rank n → (totalPlayers - (n-1)) * 10
// All others: rank n → (totalPlayers - (n-1)) * 5
function getPoints(rank, totalPlayers, winType) {
  const multiplier = winType === 'Full House' ? 10 : 5;
  const pts = (totalPlayers - (rank - 1)) * multiplier;
  return Math.max(pts, multiplier); // minimum = 1 multiplier
}

const rooms = {};

function broadcast(code, msg) {
  if (!rooms[code]) return;
  const str = JSON.stringify(msg);
  rooms[code].clients.forEach(ws => { if (ws.readyState === 1) ws.send(str); });
}

function broadcastRoomUpdate(code) {
  if (!rooms[code]) return;
  const r = rooms[code];
  broadcast(code, {
    type: 'room_update',
    players: r.players,
    started: r.started,
    maxPlayers: r.maxPlayers,
    currentTurnPlayer: r.players[r.currentTurnIndex]?.name || null,
    tickets: r.tickets,
    claimDetails: r.claimDetails,
    claimedWins: r.claimedWins,
    endPoll: r.endPoll,
    gameEnded: r.gameEnded,
    finalResults: r.finalResults,
  });
}

function computePlayerPoints(room) {
  const WIN_ORDER = ['Early 5','Top Line','Middle Line','Bottom Line','Full House'];
  const pp = {};
  WIN_ORDER.forEach(w => {
    (room.claimedWins[w] || []).forEach(c => {
      pp[c.name] = (pp[c.name] || 0) + c.points;
    });
  });
  return pp;
}

function computeFinalResults(room) {
  const WIN_ORDER = ['Early 5','Top Line','Middle Line','Bottom Line','Full House'];
  const { players, claimDetails, claimedWins, drawCount } = room;
  const playerPoints = computePlayerPoints(room);

  const playerStats = players.map(p => {
    const winDetails = [];
    WIN_ORDER.forEach(w => {
      (claimedWins[w] || []).forEach(c => {
        if (c.name === p.name) winDetails.push({
          winType: w,
          round: claimDetails[`${w}_${c.rank}`]?.drawIndex,
          points: c.points, rank: c.rank,
        });
      });
    });
    return {
      name: p.name, isHost: p.isHost,
      wins: winDetails.map(d => d.winType),
      winDetails,
      points: playerPoints[p.name] || 0,
    };
  });

  const prizes = {};
  const fh = (claimedWins['Full House'] || [])[0];
  if (fh) prizes[fh.name] = (prizes[fh.name]||[]).concat('🥇 1st Prize');
  const lineFirst = ['Top Line','Middle Line','Bottom Line']
    .map(w => ({ w, d: claimDetails[`${w}_1`]?.drawIndex ?? 999 }))
    .filter(x => (claimedWins[x.w]||[]).length > 0)
    .sort((a,b) => a.d - b.d)[0];
  if (lineFirst) {
    const w2 = (claimedWins[lineFirst.w]||[])[0]?.name;
    if (w2 && w2 !== fh?.name) prizes[w2] = (prizes[w2]||[]).concat('🥈 2nd Prize');
  }
  const e5 = (claimedWins['Early 5']||[])[0]?.name;
  if (e5 && !prizes[e5]) prizes[e5] = (prizes[e5]||[]).concat('🥉 3rd Prize');

  playerStats.sort((a,b) => b.points - a.points || b.wins.length - a.wins.length);
  return { playerStats, prizes, totalDraws: drawCount, claimedWins, claimDetails, playerPoints };
}

function makeRoom(hostName, hostWs, maxPlayers) {
  return {
    players: hostName ? [{ name: hostName, isHost: true, online: true }] : [],
    started: false, maxPlayers: maxPlayers || 6,
    claimedWins: {}, claimDetails: {}, winClaimCount: {},
    currentTurnIndex: 0, drawCount: 0,
    numberPool: shuffle(Array.from({ length: 90 }, (_, i) => i + 1)),
    tickets: {},
    endPoll: null, pollTimer: null,
    gameEnded: false, finalResults: null,
    clients: hostWs ? new Set([hostWs]) : new Set(),
    playerWsMap: new Map(),
    lobbyTimer: null,
  };
}

function startEndPoll(code, initiator) {
  const room = rooms[code];
  if (!room || room.endPoll) return;
  room.endPoll = { initiator, votes: { [initiator]: 'yes' } };
  broadcast(code, { type: 'poll_started', initiator, votes: room.endPoll.votes, totalPlayers: room.players.length });
  room.pollTimer = setTimeout(() => {
    if (!rooms[code]?.endPoll) return;
    room.players.forEach(p => { if (!room.endPoll.votes[p.name]) room.endPoll.votes[p.name] = 'timeout'; });
    broadcast(code, { type: 'poll_update', votes: room.endPoll.votes, totalPlayers: room.players.length, expired: true });
    resolvePoll(code);
  }, 60000);
}

function resolvePoll(code) {
  const room = rooms[code];
  if (!room?.endPoll) return;
  const votes = room.endPoll.votes;
  const allVoted = room.players.every(p => votes[p.name]);
  if (!allVoted) return;
  clearTimeout(room.pollTimer);
  const yesCount = Object.values(votes).filter(v => v === 'yes').length;
  const majority = yesCount > room.players.length / 2;
  if (majority) {
    const results = computeFinalResults(room);
    room.gameEnded = true; room.finalResults = results; room.endPoll = null;
    broadcast(code, { type: 'game_ended', results, votes, yesCount, totalVoted: room.players.length });
  } else {
    // Majority said No — continue game
    room.endPoll = null;
    broadcast(code, { type: 'poll_rejected', votes, yesCount, totalVoted: room.players.length });
  }
}

wss.on('connection', (ws) => {
  let joinedRoom = null, joinedName = null;

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      const { code } = msg;

      if (msg.type === 'create_room') {
        const maxP = Math.min(Math.max(msg.maxPlayers || 6, 2), 6);
        rooms[code] = makeRoom(msg.playerName, ws, maxP);
        rooms[code].playerWsMap.set(msg.playerName, ws);
        joinedRoom = code; joinedName = msg.playerName;
        // Start 60s lobby timer — auto-start when it expires
        rooms[code].lobbyTimer = setTimeout(() => {
          if (rooms[code] && !rooms[code].started && rooms[code].players.length >= 1) {
            rooms[code].started = true;
            rooms[code].currentTurnIndex = 0;
            broadcastRoomUpdate(code);
          }
        }, 60000);
        broadcastRoomUpdate(code);
      }

      if (msg.type === 'join_room') {
        if (!rooms[code]) rooms[code] = makeRoom(null, null, 6);
        const room = rooms[code];
        if (room.players.length >= room.maxPlayers) {
          ws.send(JSON.stringify({ type: 'join_error', message: `Room is full (max ${room.maxPlayers} players).` }));
          return;
        }
        room.clients.add(ws);
        joinedRoom = code; joinedName = msg.playerName;
        room.players = room.players.filter(p => p.name !== msg.playerName);
        room.players.push({ name: msg.playerName, isHost: false, online: true });
        room.playerWsMap.set(msg.playerName, ws);
        // If room is now full, auto-start
        if (room.players.length >= room.maxPlayers && !room.started) {
          clearTimeout(room.lobbyTimer);
          room.started = true; room.currentTurnIndex = 0;
        }
        broadcastRoomUpdate(code);
      }

      if (msg.type === 'update_name') {
        const room = rooms[code];
        if (!room) return;
        const { oldName, newName } = msg;
        room.players = room.players.map(p => p.name === oldName ? { ...p, name: newName } : p);
        room.playerWsMap.delete(oldName); room.playerWsMap.set(newName, ws);
        joinedName = newName;
        if (room.tickets[oldName]) { room.tickets[newName] = room.tickets[oldName]; delete room.tickets[oldName]; }
        broadcast(code, { type: 'player_renamed', oldName, newName });
        broadcastRoomUpdate(code);
      }

      if (msg.type === 'leave_room') {
        const room = rooms[code];
        if (!room) return;
        room.players = room.players.filter(p => p.name !== msg.playerName);
        room.clients.delete(ws);
        room.playerWsMap.delete(msg.playerName);
        broadcast(code, { type: 'player_left', playerName: msg.playerName });
        broadcastRoomUpdate(code);
        joinedRoom = null; joinedName = null;
      }

      if (msg.type === 'start_game') {
        const room = rooms[code];
        if (!room) return;
        clearTimeout(room.lobbyTimer);
        room.started = true; room.currentTurnIndex = 0; room.endPoll = null;
        broadcastRoomUpdate(code);
      }

      if (msg.type === 'share_ticket') {
        if (rooms[code]) { rooms[code].tickets[msg.playerName] = msg.ticket; broadcastRoomUpdate(code); }
      }

      if (msg.type === 'draw_number') {
        const room = rooms[code];
        if (!room || room.endPoll) return; // frozen during poll
        const cur = room.players[room.currentTurnIndex];
        if (cur?.name !== msg.playerName) return;
        if (!room.numberPool.length) {
          const results = computeFinalResults(room);
          room.gameEnded = true; room.finalResults = results;
          broadcast(code, { type: 'game_over', results }); return;
        }
        const num = room.numberPool.shift(); room.drawCount++;
        room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;
        broadcast(code, { type: 'number_drawn', num, drawIndex: room.drawCount, currentTurnPlayer: room.players[room.currentTurnIndex]?.name });
      }

      if (msg.type === 'claim_win') {
        const room = rooms[code];
        if (!room) return;
        const { winType, playerName } = msg;
        const existing = room.claimedWins[winType] || [];
        if (existing.some(c => c.name === playerName)) { ws.send(JSON.stringify({ type:'win_claimed', winType, alreadyClaimed:true, claims:existing })); return; }
        if (existing.length >= 2) { ws.send(JSON.stringify({ type:'win_claimed', winType, maxClaimed:true, claims:existing })); return; }
        const rank = existing.length + 1;
        const points = getPoints(rank, room.players.length, winType);
        const claimEntry = { name: playerName, points, rank };
        room.claimedWins[winType] = [...existing, claimEntry];
        room.claimDetails[`${winType}_${rank}`] = { playerName, drawIndex: room.drawCount, points, rank };
        broadcast(code, { type: 'win_claimed', winType, claims: room.claimedWins[winType], newClaim: claimEntry, drawIndex: room.drawCount });
      }

      if (msg.type === 'vote_end') {
        const room = rooms[code];
        if (!room) return;
        if (!room.endPoll) {
          startEndPoll(code, msg.playerName);
        } else {
          room.endPoll.votes[msg.playerName] = msg.vote;
          broadcast(code, { type: 'poll_update', votes: room.endPoll.votes, totalPlayers: room.players.length });
          resolvePoll(code);
        }
      }

    } catch(e) { console.error('WS:', e.message); }
  });

  ws.on('close', () => {
    if (joinedRoom && rooms[joinedRoom] && joinedName) {
      const room = rooms[joinedRoom];
      room.clients.delete(ws); room.playerWsMap.delete(joinedName);
      room.players = room.players.filter(p => p.name !== joinedName);
      broadcast(joinedRoom, { type: 'player_left', playerName: joinedName });
      broadcastRoomUpdate(joinedRoom);
      if (room.clients.size === 0) setTimeout(() => { if (rooms[joinedRoom]?.clients.size === 0) delete rooms[joinedRoom]; }, 30000);
    }
  });
});

function shuffle(arr) {
  for (let i = arr.length-1; i>0; i--) { const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; }
  return arr;
}

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`Tambola Queen server on port ${PORT}`));
