import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useGame } from '../context/GameContext';
import LudoBoard from './LudoBoard';
import '../styles/Game.css';

// Sound System - Web Audio API
let audioCtx = null;
let soundEnabled = true;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playSound(type) {
  if (!soundEnabled) return;
  initAudio();
  if (!audioCtx) return;
  
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  
  switch(type) {
    case 'dice':
      osc.type = 'square';
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.2);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
      break;
    case 'move':
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(500, now + 0.05);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
      break;
    case 'capture':
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(500, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.3);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
      break;
    case 'home':
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523, now);
      osc.frequency.setValueAtTime(659, now + 0.1);
      osc.frequency.setValueAtTime(784, now + 0.2);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
      break;
    case 'turn':
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
      break;
    case 'tick':
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1000, now);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
      break;
    case 'win':
      const notes = [523, 659, 784, 1047];
      notes.forEach((freq, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g);
        g.connect(audioCtx.destination);
        o.type = 'sine';
        o.frequency.setValueAtTime(freq, now + i * 0.15);
        g.gain.setValueAtTime(0.2, now + i * 0.15);
        g.gain.exponentialRampToValueAtTime(0.01, now + i * 0.15 + 0.3);
        o.start(now + i * 0.15);
        o.stop(now + i * 0.15 + 0.3);
      });
      return;
    default:
      break;
  }
}

const TURN_TIME = 60; // 60 seconds per turn

const Game = () => {
  const { players, leaveRoom, user, socket } = useGame();
  const [showRules, setShowRules] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [expandLog, setExpandLog] = useState(false);
  const [isRolling, setIsRolling] = useState(false);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [isMusicEnabled, setIsMusicEnabled] = useState(true);
  const [timeLeft, setTimeLeft] = useState(TURN_TIME);
  const [lateJoinRequest, setLateJoinRequest] = useState(null);
  const [showLateJoinSettings, setShowLateJoinSettings] = useState(false);
  const [allowLateJoining, setAllowLateJoining] = useState(true);
  const [blockedPlayers, setBlockedPlayers] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [showChat, setShowChat] = useState(true);
  const timerRef = useRef(null);
  const lastTurnRef = useRef(null);
  const musicRef = useRef(null);
  const chatEndRef = useRef(null);
  
  // Game state from server
  const [gameState, setGameState] = useState({
    currentTurn: 0,
    diceValues: [1, 1],
    hasRolled: false,
    hasMoved: false,
    rolledSix: false,
    showPawnSelect: false,
    pawnsOut: {},
    pawnPositions: {},
    pawnsHome: {},
    gameLog: ['Game started!'],
    winner: null,
    placements: [],
    gameEnded: false,
    resignationWin: false,
    roomCode: null,
    hostId: null,
    endGameVote: null,
    allowLateJoining: true
  });

  const currentPlayer = players[gameState.currentTurn];
  const isMyTurn = currentPlayer?.username === user?.username;
  const isHost = gameState.hostId === socket?.id;
  const totalPlayers = players.length;

  // Background music effect
  useEffect(() => {
    if (musicRef.current) {
      if (isMusicEnabled) {
        musicRef.current.play().catch(() => {});
      } else {
        musicRef.current.pause();
      }
    }
  }, [isMusicEnabled]);

  // Initialize music on first interaction
  useEffect(() => {
    const startMusic = () => {
      if (musicRef.current && isMusicEnabled) {
        musicRef.current.volume = 0.3;
        musicRef.current.play().catch(() => {});
      }
      document.removeEventListener('click', startMusic);
    };
    document.addEventListener('click', startMusic);
    return () => document.removeEventListener('click', startMusic);
  }, [isMusicEnabled]);

  // Timer effect
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    
    // Reset timer when turn changes
    if (lastTurnRef.current !== gameState.currentTurn) {
      setTimeLeft(TURN_TIME);
      lastTurnRef.current = gameState.currentTurn;
      if (isMyTurn) playSound('turn');
    }
    
    if (!gameState.winner) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            // Time's up - auto end turn
            if (isMyTurn && socket) {
              socket.emit('forceEndTurn');
            }
            return TURN_TIME;
          }
          // Play tick sound in last 10 seconds
          if (prev <= 10 && isMyTurn) {
            playSound('tick');
          }
          return prev - 1;
        });
      }, 1000);
    }
    
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState.currentTurn, gameState.winner, isMyTurn, socket]);

  useEffect(() => {
    if (!socket) return;

    socket.on('gameStateUpdate', (newState) => {
      // Check for capture sound
      if (newState.gameLog && newState.gameLog[0]?.includes('captured')) {
        playSound('capture');
      }
      // Check for home sound
      if (newState.gameLog && newState.gameLog[0]?.includes('reached home')) {
        playSound('home');
      }
      // Check for move sound
      if (newState.gameLog && newState.gameLog[0]?.includes('moved')) {
        playSound('move');
      }
      
      setGameState(newState);
      setIsRolling(false);
      
      // Update allowLateJoining from server state
      if (newState.allowLateJoining !== undefined) {
        setAllowLateJoining(newState.allowLateJoining);
      }
      
      // Update blockedPlayers from server state
      if (newState.blockedPlayers !== undefined) {
        setBlockedPlayers(newState.blockedPlayers);
      }
      
      // Check for winner
      if (newState.winner || newState.gameEnded) {
        playSound('win');
      }
    });

    // Late join request for host
    socket.on('lateJoinRequest', ({ username, pawn }) => {
      setLateJoinRequest({ username, pawn });
    });

    // Blocked list update
    socket.on('blockedListUpdate', ({ blockedPlayers }) => {
      setBlockedPlayers(blockedPlayers || []);
    });

    // Late joining setting updated
    socket.on('lateJoiningUpdated', ({ allowLateJoining }) => {
      setAllowLateJoining(allowLateJoining);
    });

    // Chat message received
    socket.on('chatMessage', (message) => {
      setChatMessages(prev => [...prev.slice(-49), message]);
      // Auto-scroll to bottom
      setTimeout(() => {
        if (chatEndRef.current) {
          chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    });

    return () => {
      socket.off('gameStateUpdate');
      socket.off('lateJoinRequest');
      socket.off('blockedListUpdate');
      socket.off('lateJoiningUpdated');
      socket.off('chatMessage');
    };
  }, [socket]);

  const rollDice = () => {
    if (!isMyTurn || isRolling || gameState.hasRolled) return;
    setIsRolling(true);
    playSound('dice');
    
    let rollCount = 0;
    const rollInterval = setInterval(() => {
      setGameState(prev => ({
        ...prev,
        diceValues: [
          Math.floor(Math.random() * 6) + 1,
          Math.floor(Math.random() * 6) + 1
        ]
      }));
      rollCount++;
      if (rollCount >= 12) {
        clearInterval(rollInterval);
        socket.emit('rollDice');
      }
    }, 80);
  };

  const movePawnOut = () => {
    playSound('move');
    socket.emit('movePawnOut');
  };

  const skipPawnOut = () => {
    socket.emit('skipPawnOut');
  };

  const movePawn = (pawnIndex) => {
    playSound('move');
    socket.emit('movePawn', { pawnIndex });
  };

  const endTurn = () => {
    socket.emit('endTurn');
  };

  // Late Join Approval (host only) - action: 'admit', 'deny', 'block'
  const approveLateJoin = (action) => {
    socket.emit('approveLateJoin', { action });
    setLateJoinRequest(null);
  };

  // Toggle late joining setting (host only)
  const toggleLateJoining = () => {
    const newValue = !allowLateJoining;
    socket.emit('toggleLateJoining', { allow: newValue });
    setAllowLateJoining(newValue);
  };

  // Unblock a player (host only)
  const unblockPlayer = (username) => {
    socket.emit('unblockPlayer', { username });
  };

  // Toggle music
  const toggleMusic = () => {
    setIsMusicEnabled(!isMusicEnabled);
  };

  // Send chat message
  const sendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    socket.emit('sendChat', { message: chatInput });
    setChatInput('');
  };

  // End Game Voting
  const startEndGameVote = () => {
    socket.emit('startEndGameVote');
  };

  const voteEndGame = (vote) => {
    socket.emit('voteEndGame', { vote });
  };

  const cancelEndGameVote = () => {
    socket.emit('cancelEndGameVote');
  };

  const hasVoted = () => {
    if (!gameState.endGameVote) return false;
    return socket?.id in (gameState.endGameVote.votes || {});
  };

  const toggleSound = () => {
    soundEnabled = !soundEnabled;
    setIsSoundEnabled(soundEnabled);
    if (soundEnabled) playSound('turn');
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => console.log(err));
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(err => console.log(err));
      setIsFullscreen(false);
    }
  };

  const getDiceFace = (value) => {
    const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    return faces[value - 1] || '⚀';
  };

  const getPawnColor = (pawnId) => {
    const colors = {
      red: '#e53935',
      blue: '#1e88e5',
      green: '#43a047',
      yellow: '#f9a825'
    };
    return colors[pawnId] || '#ffffff';
  };

  // Get pawns on board for current player
  const getMovablePawns = () => {
    if (!currentPlayer) return [];
    const positions = gameState.pawnPositions[currentPlayer.username] || [];
    const total = gameState.diceValues[0] + gameState.diceValues[1];
    return positions
      .map((pos, idx) => ({ pos, idx }))
      .filter(p => p.pos !== null && p.pos !== -1);
  };

  const movablePawns = getMovablePawns();

  // Format time display
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="game-page">
      {/* Winner Overlay with Placements */}
      {(gameState.winner || gameState.gameEnded) && (
        <div className="winner-overlay">
          <div className="winner-modal">
            {gameState.winner === 'DRAW' ? (
              <>
                <h1>🤝 DRAW! 🤝</h1>
                <h2>Game Ended</h2>
                <p>All players agreed to end the game in a draw.</p>
              </>
            ) : gameState.resignationWin ? (
              <>
                <h1>🏆 TRUE CHAMPION 🏆</h1>
                <h2>{gameState.winner}</h2>
                <p>Congratulations! All players left by resignation.</p>
                <p>{gameState.winner} has won!</p>
              </>
            ) : totalPlayers === 2 ? (
              // 2 players - no places, just champion
              <>
                <h1>🏆 TRUE CHAMPION 🏆</h1>
                <h2>{gameState.winner}</h2>
                <p>Congratulations! All 4 pawns reached home!</p>
              </>
            ) : (
              // 3 or 4 players - show places
              <>
                <h1>🏆 TRUE CHAMPION 🏆</h1>
                <h2>{gameState.winner}</h2>
                <div className="placements-list">
                  {gameState.placements && gameState.placements.map((p, idx) => (
                    <div key={idx} className={`placement-item place-${p.place}`}>
                      <span className="place-badge">
                        {p.place === 1 ? '🥇 1st' : p.place === 2 ? '🥈 2nd' : '🥉 3rd'}
                      </span>
                      <span className="place-name">{p.username}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            <button className="action-btn" onClick={leaveRoom}>
              Back to Lobby
            </button>
          </div>
        </div>
      )}

      {/* Late Join Request Modal (Host Only) */}
      {isHost && lateJoinRequest && (
        <div className="late-join-overlay">
          <div className="late-join-modal">
            <h2>🚪 Late Join Request</h2>
            <p><strong>{lateJoinRequest.username}</strong> wants to join the game</p>
            <p className="pawn-info">Pawn: <span className={`pawn-color ${lateJoinRequest.pawn}`}>{lateJoinRequest.pawn}</span></p>
            <div className="late-join-buttons">
              <button className="action-btn admit-btn" onClick={() => approveLateJoin('admit')}>
                ✓ Admit
              </button>
              <button className="action-btn deny-btn" onClick={() => approveLateJoin('deny')}>
                ✗ Deny
              </button>
              <button className="action-btn block-btn" onClick={() => approveLateJoin('block')}>
                🚫 Block
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Late Join Settings Panel (Host Only) */}
      {isHost && showLateJoinSettings && (
        <div className="late-join-settings-overlay">
          <div className="late-join-settings-modal">
            <div className="settings-header">
              <h2>⚙️ Late Joining Settings</h2>
              <button className="close-btn" onClick={() => setShowLateJoinSettings(false)}>✕</button>
            </div>
            
            <div className="settings-section">
              <label className="toggle-label">
                <span>Allow Late Joining</span>
                <div className={`toggle-switch ${allowLateJoining ? 'on' : 'off'}`} onClick={toggleLateJoining}>
                  <div className="toggle-slider"></div>
                </div>
              </label>
              <p className="setting-hint">
                {allowLateJoining ? 'Players can request to join during the game' : 'No one can join after game started'}
              </p>
            </div>

            {blockedPlayers.length > 0 && (
              <div className="settings-section">
                <h3>Blocked Players</h3>
                <div className="blocked-list">
                  {blockedPlayers.map((name, idx) => (
                    <div key={idx} className="blocked-item">
                      <span>{name}</span>
                      <button className="unblock-btn" onClick={() => unblockPlayer(name)}>Unblock</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Background Music - Peaceful ambient music */}
      <audio
        ref={musicRef}
        loop
        src="https://cdn.pixabay.com/audio/2022/02/22/audio_d1718ab41b.mp3"
      />

      {/* Header */}
      <div className="game-header">
        <div className="game-title">
          <span className="title-mzee">MZee</span>
          <span className="title-ludo">LUDO CHAMPION</span>
        </div>
        <div className="header-buttons">
          <button 
            className={`btn-icon ${!isSoundEnabled ? 'muted' : ''}`} 
            onClick={toggleSound} 
            title="Toggle Sound Effects"
          >
            {isSoundEnabled ? '🔊' : '🔇'}
          </button>
          <button 
            className={`btn-icon ${!isMusicEnabled ? 'muted' : ''}`} 
            onClick={toggleMusic} 
            title="Toggle Music"
          >
            {isMusicEnabled ? '🎵' : '🎵'}
          </button>
          <button className="btn-icon" onClick={toggleFullscreen} title="Fullscreen">
            {isFullscreen ? '⛶' : '⛶'}
          </button>
          <button className="btn-back" onClick={leaveRoom}>
            ← Back
          </button>
        </div>
      </div>

      <div className="game-content">
        {/* Left Panel */}
        <div className="left-panel">
          <div className="panel-section players-section">
            <h3 className="panel-header">👥 Players</h3>
            {players.map((player, index) => (
              <div 
                key={player.id} 
                className={`player-card ${index === gameState.currentTurn ? 'active' : ''}`}
                style={{ borderLeftColor: getPawnColor(player.pawn) }}
              >
                <div className="player-avatar" style={{ backgroundColor: getPawnColor(player.pawn) }}>
                  {player.isGuest ? '👤' : '🎮'}
                </div>
                <div className="player-info">
                  <span className="player-name">
                    {player.username}
                    {player.username === user?.username && <span className="you-badge">(you)</span>}
                  </span>
                  <div className="player-icons">
                    {player.isHost && <span title="Host">👑</span>}
                    <span title={player.pawn} style={{ color: getPawnColor(player.pawn) }}>♟</span>
                  </div>
                  <div className="player-stats">
                    <span>🏠 Home: {gameState.pawnsHome[player.username] || 0}/4</span>
                    <span>📍 Out: {gameState.pawnsOut[player.username] || 0}</span>
                  </div>
                </div>
                {index === gameState.currentTurn && <span className="turn-badge">🎲</span>}
              </div>
            ))}
          </div>

          <button className="action-btn rule-btn" onClick={() => setShowRules(true)}>
            📖 Rule Book
          </button>

          <div className="panel-section log-section">
            <div className="log-header">
              <h3 className="panel-header">📋 Game Log</h3>
              <button className="expand-btn" onClick={() => setExpandLog(true)}>
                🔼 Expand
              </button>
            </div>
            <div className="log-content">
              {gameState.gameLog.slice(0, 5).map((log, i) => (
                <div key={i} className="log-entry">{log}</div>
              ))}
            </div>
          </div>

          {/* Chat Section */}
          <div className="panel-section chat-section">
            <div className="chat-header">
              <h3 className="panel-header">💬 Chat</h3>
              <button className="chat-toggle-btn" onClick={() => setShowChat(!showChat)}>
                {showChat ? '🔽' : '🔼'}
              </button>
            </div>
            {showChat && (
              <>
                <div className="chat-messages">
                  {chatMessages.map((msg, i) => (
                    <div key={msg.id || i} className="chat-message">
                      <span 
                        className="chat-username" 
                        style={{ color: getPawnColor(msg.color) }}
                      >
                        {msg.username}:
                      </span>
                      <span className="chat-text">{msg.message}</span>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                <form className="chat-input-form" onSubmit={sendChat}>
                  <input
                    type="text"
                    className="chat-input"
                    placeholder="Type a message..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    maxLength={200}
                  />
                  <button type="submit" className="chat-send-btn">➤</button>
                </form>
              </>
            )}
          </div>
        </div>

        {/* Center - Board */}
        <div className="center-panel">
          <LudoBoard 
            players={players} 
            pawnsOut={gameState.pawnsOut} 
            pawnPositions={gameState.pawnPositions} 
            pawnsHome={gameState.pawnsHome} 
          />
        </div>

        {/* Right Panel */}
        <div className="right-panel">
          <div className="panel-section turn-section">
            <h3 className="panel-header">🎯 {currentPlayer?.username}'s Turn</h3>
            
            {/* Timer */}
            <div className={`turn-timer ${timeLeft <= 10 ? 'warning' : ''}`}>
              ⏱️ {formatTime(timeLeft)}
            </div>
            
            <div className="dice-container">
              <div className={`dice-box ${isRolling ? 'rolling' : ''}`}>
                {getDiceFace(gameState.diceValues[0])}
              </div>
              <div className={`dice-box ${isRolling ? 'rolling' : ''}`}>
                {getDiceFace(gameState.diceValues[1])}
              </div>
            </div>
            {gameState.hasRolled && (
              <div className="dice-total">
                Total: {gameState.diceValues[0] + gameState.diceValues[1]}
                {gameState.rolledSix && <span className="extra-turn-badge">+1 Turn!</span>}
              </div>
            )}
          </div>

          <div className="panel-section actions-section">
            <h3 className="panel-header">⚡ Actions</h3>
            {isMyTurn ? (
              <>
                {!gameState.hasRolled ? (
                  <button 
                    className="action-btn roll-btn"
                    onClick={rollDice}
                    disabled={isRolling}
                  >
                    🎲 {isRolling ? 'Rolling...' : 'Roll Dice'}
                  </button>
                ) : (
                  <>
                    {/* Move pawn out option - only if not already moved */}
                    {!gameState.hasMoved && gameState.showPawnSelect && (gameState.pawnsOut[currentPlayer?.username] || 0) < 4 && (
                      <div className="pawn-select-panel">
                        <p>You rolled {gameState.diceValues[0] + gameState.diceValues[1]}! Move a pawn out?</p>
                        <button className="action-btn move-btn" onClick={movePawnOut}>
                          ✓ Move Pawn Out
                        </button>
                        <button className="action-btn skip-btn" onClick={skipPawnOut}>
                          ✗ Skip
                        </button>
                      </div>
                    )}

                    {/* Move pawns on board - only if not already moved this turn */}
                    {!gameState.hasMoved && movablePawns.length > 0 && (
                      <div className="pawn-move-panel">
                        <p>Select pawn to move ({gameState.diceValues[0] + gameState.diceValues[1]} steps):</p>
                        <div className="pawn-buttons">
                          {movablePawns.map(p => (
                            <button
                              key={p.idx}
                              className="pawn-move-btn"
                              onClick={() => movePawn(p.idx)}
                              style={{ backgroundColor: getPawnColor(currentPlayer?.pawn) }}
                            >
                              Pawn {p.idx + 1} (Cell {p.pos})
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Show message if already moved */}
                    {gameState.hasMoved && (
                      <div className="moved-message">
                        ✓ Pawn moved! End turn or roll again if you have extra turn.
                      </div>
                    )}

                    {/* End Turn - disabled if pawns can still move */}
                    <button 
                      className={`action-btn ${gameState.rolledSix ? 'play-again-btn' : 'end-btn'}`}
                      onClick={endTurn}
                      disabled={!gameState.hasMoved && movablePawns.length > 0}
                      title={!gameState.hasMoved && movablePawns.length > 0 ? 'You must move a pawn first!' : ''}
                    >
                      {gameState.rolledSix ? '🎲 Roll Again (Extra Turn)' : '➡️ End Turn'}
                    </button>
                  </>
                )}
              </>
            ) : (
              <div className="waiting-msg">
                Waiting for {currentPlayer?.username}...
              </div>
            )}
          </div>

          {/* Host Controls */}
          {isHost && (
            <div className="panel-section host-controls">
              <h3 className="panel-header">👑 Host Controls</h3>
              <button className="action-btn settings-btn" onClick={() => setShowLateJoinSettings(true)}>
                ⚙️ Late Joining Settings
              </button>
              <button className="action-btn end-game-btn" onClick={startEndGameVote}>
                🚪 End Game
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Room Code Display Below Board */}
      {gameState.roomCode && (
        <div className="room-code-display">
          <span className="room-code-label">Room Code:</span>
          <span className="room-code-value">{gameState.roomCode}</span>
        </div>
      )}

      {/* End Game Vote Modal */}
      {gameState.endGameVote && gameState.endGameVote.active && (
        <div className="modal-overlay">
          <div className="modal-content vote-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🗳️ End Game Vote</h2>
              <button className="close-btn" onClick={cancelEndGameVote}>✕</button>
            </div>
            <div className="modal-body">
              <p className="vote-message">
                <strong>{gameState.endGameVote.startedBy}</strong> wants to end the game.
              </p>
              <p className="vote-info">If all players agree, the game will end in a DRAW.</p>
              
              <div className="vote-status">
                <h4>Votes:</h4>
                {players.map(p => {
                  const vote = gameState.endGameVote.votes[p.id];
                  return (
                    <div key={p.id} className="vote-player">
                      <span>{p.username}</span>
                      <span className={`vote-badge ${vote === true ? 'yes' : vote === false ? 'no' : 'pending'}`}>
                        {vote === true ? '✓ Yes' : vote === false ? '✗ No' : '⏳ Waiting'}
                      </span>
                    </div>
                  );
                })}
              </div>

              {!hasVoted() && (
                <div className="vote-buttons">
                  <button className="action-btn vote-yes" onClick={() => voteEndGame(true)}>
                    ✓ Yes, End Game
                  </button>
                  <button className="action-btn vote-no" onClick={() => voteEndGame(false)}>
                    ✗ No, Continue
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rule Book Modal */}
      {showRules && (
        <div className="modal-overlay" onClick={() => setShowRules(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📖 Rule Book</h2>
              <button className="close-btn" onClick={() => setShowRules(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="rule-section">
                <h3>🎯 Objective</h3>
                <p>Get all 4 tokens from your starting base to the home area before your opponents.</p>
              </div>
              
              <div className="rule-section">
                <h3>🎲 Starting</h3>
                <p>Roll a total of <span className="highlight">6</span> or <span className="highlight">12</span> to bring a token out of base. Rolling 6 or 12 also gives you an extra turn!</p>
              </div>
              
              <div className="rule-section">
                <h3>🚶 Movement</h3>
                <ul>
                  <li>Tokens move clockwise around the board</li>
                  <li>Move exactly the number shown on dice</li>
                  <li>Only ONE pawn can be moved per turn</li>
                  <li>Must roll exact number to enter home</li>
                </ul>
              </div>
              
              <div className="rule-section">
                <h3>⚔️ Capturing</h3>
                <ul>
                  <li>Land on opponent's token → send them back to base</li>
                  <li>Capturing gives you an extra turn!</li>
                  <li>⭐ Safe zones protect tokens from capture</li>
                </ul>
              </div>
              
              <div className="rule-section">
                <h3>⏱️ Timer</h3>
                <ul>
                  <li>Each player has 60 seconds per turn</li>
                  <li>If time runs out, turn automatically passes</li>
                </ul>
              </div>
              
              <div className="rule-section">
                <h3>⚠️ Special Rules</h3>
                <ul>
                  <li>3 consecutive 6s or 12s = turn skipped</li>
                  <li>No valid moves = turn automatically passes</li>
                  <li>Reaching home = extra turn</li>
                </ul>
              </div>
              
              <div className="rule-section">
                <h3>🏆 Winning</h3>
                <p>First player to get all 4 tokens into home wins!</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full Game Log Modal */}
      {expandLog && (
        <div className="modal-overlay" onClick={() => setExpandLog(false)}>
          <div className="modal-content game-log-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📜 Full Game Log</h2>
            </div>
            <div className="modal-body">
              {gameState.gameLog.map((log, i) => (
                <div key={i} className="log-entry-modal">{log}</div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="close-log-btn" onClick={() => setExpandLog(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Game;
