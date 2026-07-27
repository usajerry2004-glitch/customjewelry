import { io, Socket } from 'socket.io-client';
import { API } from './apiFetch';

// The REST API base includes the /api/v1 prefix; the socket server listens
// on the same host but isn't under that prefix (Nest's global prefix only
// applies to the HTTP router, not the websocket gateway).
const SOCKET_URL = API.replace(/\/api\/v1\/?$/, '');

let socket: Socket | null = null;

// One shared connection per tab, reused across every OrderConversation that
// mounts — reconnecting per-component would multiply typing/read broadcasts
// unnecessarily and thrash the server with repeated handshakes.
export function getSocket(): Socket | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('jf_token');
  if (!token) {
    // Logged out — drop any lingering connection instead of leaving it
    // running in the background under a now-invalid session.
    if (socket) { socket.disconnect(); socket = null; }
    return null;
  }

  if (socket && socket.auth && (socket.auth as any).token === token) return socket;

  if (socket) socket.disconnect();
  socket = io(SOCKET_URL, {
    auth: { token },
    withCredentials: true,
    transports: ['websocket', 'polling'],
  });
  return socket;
}
