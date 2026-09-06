import { io } from 'socket.io-client';

// Ludo runs inside MZeeGamingHub on the hub's own HTTP server, so it shares the origin
// with every other game. The namespaced path is what keeps its traffic clear of
// Business Tycoon's Socket.IO and Tambola's WebSocket on that same server.
export const BASE = '/games/ludo-champion';

export const socket = io(window.location.origin, {
  path: BASE + '/socket.io',
  autoConnect: false
});

export const connectSocket = () => {
  if (!socket.connected) {
    socket.connect();
  }
};

export const disconnectSocket = () => {
  if (socket.connected) {
    socket.disconnect();
  }
};
