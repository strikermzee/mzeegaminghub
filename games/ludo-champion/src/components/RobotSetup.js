import React from 'react';
import { useGame } from '../context/GameContext';
import PawnSelector from './PawnSelector';

const RobotSetup = () => {
  const { 
    user, 
    robotCount, 
    setRobotCount, 
    selectedPawn, 
    setSelectedPawn, 
    goBack, 
    logout,
    startGame 
  } = useGame();

  const handleStartGame = () => {
    if (!selectedPawn) {
      alert('Please select a pawn first!');
      return;
    }
    startGame();
  };

  return (
    <div className="page page-center">
      <div className="bg-animation"></div>
      <div className="robot-container">
        <div className="card">
          <div className="mode-header">
            <div className="login-logo">🎲</div>
            <h1 className="login-title">Ludo Champion</h1>
            <p className="login-subtitle">Choose your game mode</p>
          </div>

          <div className="mode-welcome">
            Welcome, <span>{user?.username}</span>!
          </div>

          <div className="robot-selection">
            <div className="robot-selection-title">
              <span>🤖</span>
              Select Number of Robot Players
            </div>
            <div className="robot-options">
              {[1, 2, 3, 4].map((num) => (
                <div
                  key={num}
                  className={`robot-option ${robotCount === num ? 'selected' : ''}`}
                  onClick={() => setRobotCount(num)}
                >
                  <span className="number">{num}</span>
                  <span className="label">{num === 1 ? 'Robot' : 'Robots'}</span>
                </div>
              ))}
            </div>
          </div>

          <PawnSelector 
            selectedPawn={selectedPawn}
            onSelect={setSelectedPawn}
          />

          <button 
            className="btn btn-primary btn-start-game" 
            onClick={handleStartGame}
            disabled={!selectedPawn}
            style={{ marginBottom: '12px' }}
          >
            🚀 Start Game
          </button>

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

export default RobotSetup;
