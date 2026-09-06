import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { socket, connectSocket } from '../socket';

const GameContext = createContext(null);

export const PAWN_COLORS = [
  { id: 'red', name: 'Red', color: '#f44336' },
  { id: 'blue', name: 'Blue', color: '#2196f3' },
  { id: 'green', name: 'Green', color: '#4caf50' },
  { id: 'yellow', name: 'Yellow', color: '#ffb300' },
];

// Identity resolved by index.js from the hub session before the app mounts. Read on
// demand, never at module scope: imports are evaluated before index.js runs, so a
// module-level snapshot would always be undefined.
const hubUser = () => (typeof window !== 'undefined' && window.__MZEE_USER__) || null;

export const GameProvider = ({ children }) => {
  // User state — seeded from the hub, so signing in there signs you in here.
  const [user, setUser] = useState(() => {
    const h = hubUser();
    return h ? { username: h.name || h.username, isGuest: !!h.isGuest } : null;
  });
  const [isGuest, setIsGuest] = useState(() => !!(hubUser() || {}).isGuest);

  // Game state
  const [gameMode, setGameMode] = useState(null);
  // Skip straight past the game's own login screen when the hub already knows who this is.
  const [currentPage, setCurrentPage] = useState(() => (hubUser() ? 'mode-select' : 'login'));
  
  // Room state
  const [roomCode, setRoomCode] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [players, setPlayers] = useState([]);
  const [takenPawns, setTakenPawns] = useState([]);
  
  // Robot game state
  const [robotCount, setRobotCount] = useState(1);
  const [selectedPawn, setSelectedPawn] = useState(null);
  
  // Error state
  const [error, setError] = useState(null);
  
  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Socket event listeners - EXACTLY like Business Tycoon
  useEffect(() => {
    // Room created - host only
    socket.on('roomCreated', ({ code }) => {
      setRoomCode(code);
      setIsHost(true);
      setCurrentPage('private-room');
    });

    // Room update - all players get this
    socket.on('roomUpdate', (data) => {
      setRoomCode(data.code);
      setPlayers(data.players);
      setTakenPawns(data.takenPawns || []);
      // Check if I'm host
      const me = data.players.find(p => p.id === socket.id);
      if (me) {
        setIsHost(me.isHost);
      }
      // Navigate to private room if not already there
      if (currentPage === 'lobby') {
        setCurrentPage('private-room');
      }
    });

    // Join error
    socket.on('joinError', (msg) => {
      setError(msg);
      setTimeout(() => setError(null), 3000);
    });

    // Game started
    socket.on('gameStarted', () => {
      setCurrentPage('game');
    });

    // Late join approved - go directly to game
    socket.on('lateJoinApproved', () => {
      setCurrentPage('game');
    });

    // Late join denied - go back to lobby
    socket.on('lateJoinDenied', ({ message }) => {
      setError(message);
      setCurrentPage('lobby');
      setTimeout(() => setError(null), 5000);
    });

    // Waiting for host approval
    socket.on('waitingForApproval', ({ message }) => {
      setError(message);
    });

    // Kicked by switch device - go to LOGIN page
    socket.on('kickedToLogin', ({ reason }) => {
      setError(reason);
      setRoomCode(null);
      setIsHost(false);
      setPlayers([]);
      // The hub owns the account, so a device switch drops back to mode select,
      // not to a login screen that would ask for credentials a second time.
      if (!hubUser()) setUser(null);
      setCurrentPage(hubUser() ? 'mode-select' : 'login');
      setTimeout(() => setError(null), 5000);
    });

    // Notification
    socket.on('notification', (msg) => {
      console.log('Notification:', msg);
    });

    return () => {
      socket.off('roomCreated');
      socket.off('roomUpdate');
      socket.off('joinError');
      socket.off('gameStarted');
      socket.off('lateJoinApproved');
      socket.off('lateJoinDenied');
      socket.off('waitingForApproval');
      socket.off('kickedToLogin');
      socket.off('notification');
    };
  }, [currentPage]);

  // Login functions
  const login = useCallback((username, password) => {
    setUser({ username, isGuest: false });
    setIsGuest(false);
    setCurrentPage('mode-select');
  }, []);

  const register = useCallback((username, password) => {
    setUser({ username, isGuest: false });
    setIsGuest(false);
    setCurrentPage('mode-select');
  }, []);

  const loginAsGuest = useCallback((displayName) => {
    const name = displayName || `Guest_${Math.floor(Math.random() * 10000)}`;
    setUser({ username: name, isGuest: true });
    setIsGuest(true);
    setCurrentPage('mode-select');
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setIsGuest(false);
    setGameMode(null);
    setRoomCode(null);
    setPlayers([]);
    setTakenPawns([]);
    setSelectedPawn(null);
    // The account belongs to the hub, so leaving the game returns there rather than
    // dropping into a second login screen this game no longer owns.
    if (hubUser()) {
      window.location.href = '/';
      return;
    }
    setCurrentPage('login');
  }, []);

  // Game mode selection
  const selectGameMode = useCallback((mode) => {
    setGameMode(mode);
    setSelectedPawn(null);
    if (mode === 'robot') {
      setCurrentPage('robot-setup');
    } else {
      setCurrentPage('lobby');
    }
  }, []);

  // Room functions - EXACTLY like Business Tycoon
  const createRoom = useCallback((pawnId, allowLateJoining = true) => {
    connectSocket();
    setSelectedPawn(pawnId);
    // Emit to server - server will respond with roomCreated
    socket.emit('createRoom', { 
      username: user.username, 
      pawn: pawnId, 
      isGuest: isGuest,
      allowLateJoining
    });
  }, [user, isGuest]);

  const joinRoom = useCallback((code, pawnId, switchDevice = false) => {
    connectSocket();
    setSelectedPawn(pawnId);
    // Emit to server - server will respond with roomUpdate or joinError
    socket.emit('joinRoom', { 
      code, 
      username: user.username, 
      pawn: pawnId, 
      isGuest: isGuest,
      switchDevice
    });
  }, [user, isGuest]);

  const leaveRoom = useCallback(() => {
    socket.emit('leaveRoom');
    setRoomCode(null);
    setIsHost(false);
    setPlayers([]);
    setTakenPawns([]);
    setSelectedPawn(null);
    setCurrentPage('lobby');
  }, []);

  // Start game - EXACTLY like Business Tycoon
  const startGame = useCallback(() => {
    socket.emit('startGame');
  }, []);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch(err => {
        console.log('Fullscreen error:', err);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      }).catch(err => {
        console.log('Exit fullscreen error:', err);
      });
    }
  }, []);

  // Go back function
  const goBack = useCallback(() => {
    switch (currentPage) {
      case 'robot-setup':
      case 'lobby':
        setGameMode(null);
        setSelectedPawn(null);
        setCurrentPage('mode-select');
        break;
      case 'private-room':
        leaveRoom();
        break;
      case 'mode-select':
        logout();
        break;
      default:
        break;
    }
  }, [currentPage, leaveRoom, logout]);

  const value = {
    // User
    user,
    isGuest,
    login,
    register,
    loginAsGuest,
    logout,
    
    // Navigation
    currentPage,
    setCurrentPage,
    goBack,
    
    // Game mode
    gameMode,
    selectGameMode,
    
    // Robot game
    robotCount,
    setRobotCount,
    
    // Pawn selection
    selectedPawn,
    setSelectedPawn,
    takenPawns,
    
    // Room
    roomCode,
    isHost,
    players,
    createRoom,
    joinRoom,
    leaveRoom,
    
    // Game
    startGame,
    socket,
    
    // Error
    error,
    setError,
    
    // Fullscreen
    isFullscreen,
    toggleFullscreen,
  };

  return (
    <GameContext.Provider value={value}>
      {children}
    </GameContext.Provider>
  );
};

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
};

export default GameContext;
