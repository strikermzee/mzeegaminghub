import React from 'react';
import { useGame } from '../context/GameContext';

const ModeSelect = () => {
  const { user, selectGameMode, logout, goBack } = useGame();

  return (
    <div className="page page-center">
      <div className="bg-animation"></div>
      <div className="mode-container">
        <div className="card">
          <div className="mode-header">
            <div className="login-logo">🎲</div>
            <h1 className="login-title">Ludo Champion</h1>
            <p className="login-subtitle">Choose your game mode</p>
          </div>

          <div className="mode-welcome">
            Welcome, <span>{user?.username}</span>!
          </div>

          <div className="mode-cards">
            <div 
              className="card card-clickable mode-card"
              onClick={() => selectGameMode('robot')}
            >
              <div className="mode-icon">🤖</div>
              <div className="mode-info">
                <h3>Play with Robot</h3>
                <p>Play against AI opponents. Practice your strategy solo!</p>
              </div>
            </div>

            <div 
              className="card card-clickable mode-card"
              onClick={() => selectGameMode('friends')}
            >
              <div className="mode-icon">👥</div>
              <div className="mode-info">
                <h3>Play with Friends</h3>
                <p>Create or join a room to play with real players online.</p>
              </div>
            </div>
          </div>

          <button 
            className="btn btn-secondary btn-large" 
            onClick={goBack}
            style={{ marginBottom: '12px' }}
          >
            ← Back
          </button>

          <button className="btn btn-outline btn-large" onClick={logout}>
            Log out
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModeSelect;
