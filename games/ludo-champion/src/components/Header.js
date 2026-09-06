import React from 'react';
import { useGame } from '../context/GameContext';

const Header = ({ showLobbyButton = false }) => {
  const { user, logout, leaveRoom, isFullscreen, toggleFullscreen } = useGame();

  const handleLobbyClick = () => {
    leaveRoom();
  };

  return (
    <header className="header">
      <div className="logo">
        <span className="logo-icon">🎲</span>
        <div className="logo-text-container">
          <span className="logo-mzee">MZee</span>
          <span className="logo-text">LUDO CHAMPION</span>
        </div>
      </div>

      <div className="header-actions">
        <span className="header-user">
          Hello, <span>{user?.username}</span>
        </span>
        
        {showLobbyButton && (
          <button className="btn btn-secondary btn-small" onClick={handleLobbyClick}>
            ← Lobby
          </button>
        )}
        
        <button 
          className="btn btn-icon" 
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? '⊙' : '⛶'}
        </button>
        
        <button 
          className="btn btn-icon"
          title="Sound"
        >
          🔊
        </button>
        
        <button className="btn btn-outline btn-small" onClick={logout}>
          Log out
        </button>
      </div>
    </header>
  );
};

export default Header;
