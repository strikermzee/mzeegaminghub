import React, { useState } from 'react';
import { useGame, PAWN_COLORS } from '../context/GameContext';
import Header from './Header';

const PrivateRoom = () => {
  const { 
    roomCode, 
    isHost, 
    players, 
    leaveRoom, 
    startGame 
  } = useGame();
  
  const [copied, setCopied] = useState(false);

  const handleCopyCode = () => {
    if (roomCode) {
      navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const canStartGame = isHost && players.length >= 2;

  const getPawnColor = (pawnId) => {
    const pawn = PAWN_COLORS.find(p => p.id === pawnId);
    return pawn ? pawn.color : '#ffffff';
  };

  // Get host player
  const hostPlayer = players.find(p => p.isHost);

  // Handle case when roomCode is not yet available
  if (!roomCode) {
    return (
      <div className="page">
        <Header showLobbyButton />
        <div className="bg-animation"></div>
        <div className="page-content">
          <div className="room-container">
            <p>Loading room...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <Header showLobbyButton />
      <div className="bg-animation"></div>
      
      <div className="page-content">
        <div className="room-container">
          {/* Room Code Section */}
          <div className="card room-code-section">
            <p className="room-code-label">Share this code with friends</p>
            <div className="room-code">
              {roomCode.split('').map((digit, index) => (
                <span key={index} style={{ animationDelay: `${index * 0.05 + 0.1}s` }}>
                  {digit}
                </span>
              ))}
            </div>
            <button 
              className="btn btn-secondary copy-code-btn"
              onClick={handleCopyCode}
            >
              <span>📋</span>
              {copied ? 'Copied!' : 'Copy code'}
            </button>
          </div>

          {/* Players Section */}
          <div className="card players-section">
            <div className="players-header">
              Players <span>({players.length}/4)</span>
            </div>
            
            {/* Show Host Name */}
            {hostPlayer && (
              <div className="host-info">
                👑 Host: <strong>{hostPlayer.username}</strong>
              </div>
            )}
            
            <div className="players-list">
              {players.map((player, index) => (
                <div 
                  key={player.id} 
                  className="player-item"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="player-pawn">
                    <div 
                      className="head" 
                      style={{ backgroundColor: getPawnColor(player.pawn) }}
                    ></div>
                    <div 
                      className="body" 
                      style={{ backgroundColor: getPawnColor(player.pawn) }}
                    ></div>
                  </div>
                  <div className="player-info">
                    <span className="player-name">{player.username}</span>
                    {player.isGuest && <span className="player-tag">(guest)</span>}
                  </div>
                  <div className="player-status">
                    {player.isHost && <span className="host-badge">HOST</span>}
                    <span className="status-dot"></span>
                  </div>
                </div>
              ))}
            </div>

            {players.length < 2 && (
              <p className="waiting-message">
                Waiting for at least 1 more player...
              </p>
            )}

            {isHost && (
              <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button 
                  className="btn btn-primary btn-start-game"
                  onClick={startGame}
                  disabled={!canStartGame}
                >
                  🚀 Start Game
                </button>
                {!canStartGame && (
                  <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
                    Need at least 2 players to start
                  </p>
                )}
              </div>
            )}

            {!isHost && (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px', marginTop: '24px' }}>
                Waiting for host to start the game...
              </p>
            )}
          </div>

          <button 
            className="btn btn-secondary btn-large"
            onClick={leaveRoom}
            style={{ marginTop: '16px' }}
          >
            ← Back
          </button>
        </div>
      </div>
    </div>
  );
};

export default PrivateRoom;
