import React, { useState } from 'react';
import { useGame } from '../context/GameContext';

const Login = () => {
  const { login, register, loginAsGuest } = useGame();
  const [activeTab, setActiveTab] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestError, setGuestError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!username.trim()) {
      return;
    }
    if (activeTab === 'login') {
      login(username, password);
    } else {
      register(username, password);
    }
  };

  const handleGuestPlay = () => {
    if (!guestName.trim()) {
      setGuestError('Please type your name');
      return;
    }
    setGuestError('');
    loginAsGuest(guestName);
  };

  return (
    <div className="page page-center">
      <div className="bg-animation"></div>
      <div className="login-container">
        <div className="login-header">
          <div className="login-logo">🎲</div>
          <div className="login-title-container">
            <span className="login-mzee">MZee</span>
            <h1 className="login-title">Ludo Champion</h1>
          </div>
          <p className="login-subtitle">Multiplayer board game — invite friends & play!</p>
        </div>

        <div className="card">
          <div className="login-tabs">
            <button 
              className={`login-tab ${activeTab === 'login' ? 'active' : ''}`}
              onClick={() => setActiveTab('login')}
            >
              Log In
            </button>
            <button 
              className={`login-tab ${activeTab === 'register' ? 'active' : ''}`}
              onClick={() => setActiveTab('register')}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                type="text"
                className="form-input"
                placeholder="your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary btn-large">
              {activeTab === 'login' ? 'Log In' : 'Register'}
            </button>
          </form>

          <div className="login-divider">or play without an account</div>

          <div className="guest-section">
            <input
              type="text"
              className="form-input"
              placeholder="Enter your name"
              value={guestName}
              onChange={(e) => {
                setGuestName(e.target.value);
                if (e.target.value.trim()) setGuestError('');
              }}
            />
            {guestError && <p className="guest-error">{guestError}</p>}
            <button 
              type="button" 
              className="btn btn-secondary"
              onClick={handleGuestPlay}
            >
              Play as Guest
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
