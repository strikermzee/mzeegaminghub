import React, { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { socket, connectSocket } from '../socket';
import PawnSelector from './PawnSelector';
import Header from './Header';

const Lobby = () => {
  const { user, isGuest, createRoom, joinRoom, error, setError, goBack } = useGame();
  
  // Create room state
  const [createPawn, setCreatePawn] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [allowLateJoining, setAllowLateJoining] = useState(true);
  
  // Join room state
  const [joinCode, setJoinCode] = useState('');
  const [joinPawn, setJoinPawn] = useState(null);
  const [joinTakenPawns, setJoinTakenPawns] = useState([]);
  const [joinError, setJoinError] = useState('');
  const [roomInfo, setRoomInfo] = useState(null);
  const [sameNameConflict, setSameNameConflict] = useState(false);

  // Connect socket on mount
  useEffect(() => {
    connectSocket();
  }, []);

  // Handle code input - EXACTLY like Business Tycoon onCodeInput
  const handleCodeChange = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 7);
    setJoinCode(value);
    setJoinPawn(null);
    setJoinError('');
    setRoomInfo(null);
    setJoinTakenPawns([]);
    setSameNameConflict(false);
    
    if (value.length === 7) {
      setJoinError('Checking room...');
      // EXACTLY like Business Tycoon checkTakenColors
      socket.emit('checkRoom', { code: value, username: user.username }, (response) => {
        if (response.error || !response.exists) {
          setJoinError(response.error || 'Room not found');
          setJoinTakenPawns([]);
          setRoomInfo(null);
        } else if (response.isBlocked) {
          setJoinError('You have been blocked from this room.');
          setJoinTakenPawns([]);
          setRoomInfo(null);
        } else {
          setJoinError('');
          setJoinTakenPawns(response.takenPawns || []);
          setRoomInfo({
            hostName: response.hostName,
            playerCount: response.playerCount,
            isFull: response.isFull,
            playerNames: response.playerNames || [],
            gameStarted: response.gameStarted,
            allowLateJoining: response.allowLateJoining,
            sameNameIsHost: response.sameNameIsHost // If same name player is host
          });
          
          // Check for same name
          if (response.playerNames && response.playerNames.includes(user.username)) {
            setSameNameConflict(true);
          }
        }
      });
    }
  };

  // Create room - EXACTLY like Business Tycoon
  const handleCreateRoom = () => {
    if (!createPawn) {
      setError('Please select a pawn first!');
      setTimeout(() => setError(null), 3000);
      return;
    }
    createRoom(createPawn, allowLateJoining);
  };

  // Join room - EXACTLY like Business Tycoon
  const handleJoinRoom = (switchDevice = false) => {
    const code = joinCode.trim();
    
    if (code.length !== 7) {
      setError('Code must be 7 digits.');
      setTimeout(() => setError(null), 3000);
      return;
    }
    if (!/^\d{7}$/.test(code)) {
      setError('Code must contain only numbers.');
      setTimeout(() => setError(null), 3000);
      return;
    }
    if (!joinPawn) {
      setError('Please select a pawn first!');
      setTimeout(() => setError(null), 3000);
      return;
    }
    
    // Check if selected pawn is taken - EXACTLY like Business Tycoon
    if (joinTakenPawns.includes(joinPawn)) {
      setError('Pawn already taken! Please choose a different color.');
      setTimeout(() => setError(null), 3000);
      return;
    }
    
    joinRoom(code, joinPawn, switchDevice);
    setSameNameConflict(false);
  };

  const handleSendInvite = () => {
    if (inviteEmail) {
      alert(`Invite sent to ${inviteEmail}!`);
      setInviteEmail('');
    }
  };

  return (
    <div className="page">
      <Header />
      <div className="bg-animation"></div>
      
      <div className="page-content">
        <div className="lobby-container">
          {/* Create Room Section */}
          <div className="card lobby-section">
            <div className="lobby-section-header">
              <span className="lobby-section-icon">🎮</span>
              <h2 className="lobby-section-title">Create Room</h2>
            </div>
            <p className="lobby-section-subtitle">
              A private room with an invite code — share it with friends!
            </p>

            <PawnSelector 
              selectedPawn={createPawn}
              onSelect={setCreatePawn}
              takenPawns={[]}
            />

            {/* Late Joining Option */}
            <div className="late-joining-option">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={allowLateJoining}
                  onChange={(e) => setAllowLateJoining(e.target.checked)}
                />
                <span className="toggle-slider"></span>
                <span className="toggle-text">Allow Late Joining</span>
              </label>
              <p className="toggle-hint">
                {allowLateJoining 
                  ? 'Players can join after game starts' 
                  : 'No one can join after game starts'}
              </p>
            </div>

            <button 
              className="btn btn-primary btn-large"
              onClick={handleCreateRoom}
              disabled={!createPawn}
            >
              Create Room
            </button>

            <div className="email-invite">
              <div className="email-invite-label">
                <span>📧</span>
                Invite by Email (optional)
              </div>
              <div className="email-invite-row">
                <input
                  type="email"
                  className="form-input"
                  placeholder="friend@email.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
                <button 
                  className="btn btn-secondary"
                  onClick={handleSendInvite}
                >
                  Send
                </button>
              </div>
            </div>
          </div>

          {/* Join Room Section */}
          <div className="card lobby-section">
            <div className="lobby-section-header">
              <span className="lobby-section-icon">🔑</span>
              <h2 className="lobby-section-title">Join Room</h2>
            </div>
            <p className="lobby-section-subtitle">
              Enter the 7-digit invite code from your friend.
            </p>

            <div className="code-input-container">
              <label className="form-label">Invite Code</label>
              <input
                type="text"
                className="code-input"
                placeholder="1234567"
                value={joinCode}
                onChange={handleCodeChange}
                maxLength={7}
              />
              {joinError && <p className="join-status" style={{ color: joinError === 'Checking room...' ? '#888' : '#ff6b6b' }}>{joinError}</p>}
            </div>

            {/* Room Info - shows host name and player count */}
            {roomInfo && (
              <div className="room-info-box">
                <p>👑 Host: <strong>{roomInfo.hostName}</strong></p>
                <p>👥 Players: <strong>{roomInfo.playerCount}/4</strong></p>
                {roomInfo.isFull && <p className="room-full-warning">⚠️ Room is full!</p>}
              </div>
            )}

            <PawnSelector 
              selectedPawn={joinPawn}
              onSelect={setJoinPawn}
              takenPawns={joinTakenPawns}
              showTakenInfo={joinTakenPawns.length > 0}
            />

            {/* Same Name Conflict Options */}
            {sameNameConflict && joinPawn && (
              <div className="same-name-options">
                <p className="same-name-warning">⚠️ Someone with your name is already in this room!</p>
                {roomInfo && roomInfo.sameNameIsHost ? (
                  // Same name player is host - can only join anyway
                  <div className="same-name-buttons">
                    <p className="host-note">That player is the host. You can only join with a different identity.</p>
                    <button 
                      className="btn btn-primary"
                      onClick={() => handleJoinRoom(false)}
                    >
                      ➡️ Join anyway
                    </button>
                  </div>
                ) : (
                  // Same name player is not host - can switch
                  <div className="same-name-buttons">
                    <button 
                      className="btn btn-secondary"
                      onClick={() => handleJoinRoom(true)}
                    >
                      🔄 Switch to this device
                    </button>
                    <button 
                      className="btn btn-primary"
                      onClick={() => handleJoinRoom(false)}
                    >
                      ➡️ Join anyway
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Normal Join Button (only show if no same name conflict) */}
            {!sameNameConflict && (
              <button 
                className="btn btn-primary btn-large"
                onClick={() => handleJoinRoom(false)}
                disabled={!joinPawn || joinCode.length !== 7 || (roomInfo && roomInfo.isFull)}
              >
                Join Room
              </button>
            )}
          </div>
        </div>

        {/* Leaderboard */}
        <div className="card leaderboard">
          <div className="leaderboard-header">
            <span>🏆</span>
            <h3 className="leaderboard-title">Leaderboard</h3>
          </div>
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Wins</th>
                <th>Games</th>
                <th style={{ textAlign: 'right' }}>Best Rank</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan="4" className="leaderboard-empty">
                  No games played yet. Be the first!
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <button 
          className="btn btn-secondary btn-large"
          onClick={goBack}
          style={{ marginTop: '24px' }}
        >
          ← Back
        </button>
      </div>

      {error && <div className="error-toast">{error}</div>}
    </div>
  );
};

export default Lobby;
