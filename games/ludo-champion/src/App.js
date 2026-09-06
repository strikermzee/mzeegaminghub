import React from 'react';
import { GameProvider, useGame } from './context/GameContext';
import Login from './components/Login';
import ModeSelect from './components/ModeSelect';
import RobotSetup from './components/RobotSetup';
import Lobby from './components/Lobby';
import PrivateRoom from './components/PrivateRoom';
import Game from './components/Game';
import './styles/App.css';

const AppContent = () => {
  const { currentPage, isFullscreen, toggleFullscreen, error } = useGame();

  const renderPage = () => {
    switch (currentPage) {
      case 'login':
        return <Login />;
      case 'mode-select':
        return <ModeSelect />;
      case 'robot-setup':
        return <RobotSetup />;
      case 'lobby':
        return <Lobby />;
      case 'private-room':
        return <PrivateRoom />;
      case 'game':
        return <Game />;
      default:
        return <Login />;
    }
  };

  return (
    <div className={`app ${isFullscreen ? 'fullscreen' : ''}`}>
      {currentPage !== 'login' && currentPage !== 'mode-select' && currentPage !== 'robot-setup' && (
        <button 
          className="btn btn-icon fullscreen-btn" 
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          style={{ display: 'none' }} // Hidden since header has it
        >
          {isFullscreen ? '⊙' : '⛶'}
        </button>
      )}
      {renderPage()}
      {error && <div className="error-toast">{error}</div>}
    </div>
  );
};

function App() {
  return (
    <GameProvider>
      <AppContent />
    </GameProvider>
  );
}

export default App;
