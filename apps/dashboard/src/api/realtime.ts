import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { EmergencySnapshot } from './types';

export type ConnectionState = 'connecting' | 'live' | 'offline';

/**
 * Live updates from the escalation engine.
 *
 * The socket carries changes, not truth. Every screen loads its data over HTTP first
 * and treats a message as a reason to update what it already has, so a dropped
 * connection degrades the dashboard to a slightly stale one rather than an empty one.
 * The connection state is returned for exactly that reason: an operator has to be able
 * to tell the difference between "nothing is happening" and "I am no longer being told
 * what is happening".
 */
export function useRealtime(
  token: string | null,
  onUpdate: (snapshot: EmergencySnapshot) => void,
): ConnectionState {
  const [state, setState] = useState<ConnectionState>('connecting');

  // The handler is kept in a ref so that a screen passing a freshly created callback
  // on every render does not tear down and rebuild the socket on every render. The
  // ref is written in an effect rather than during render, because a render can be
  // discarded and a ref written during one would not be.
  const handler = useRef(onUpdate);
  useEffect(() => {
    handler.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!token) return;

    const url = import.meta.env.VITE_API_BASE_URL ?? window.location.origin;
    const socket: Socket = io(`${url}/realtime`, {
      auth: { token },
      transports: ['websocket'],
      // The gateway disconnects an unauthenticated socket, so retrying forever with a
      // stale token would be a tight loop against the API. Attempts are bounded and
      // spaced, and the screen says it is offline rather than pretending otherwise.
      reconnectionAttempts: 5,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
    });

    socket.on('connect', () => setState('live'));
    socket.on('disconnect', () => setState('offline'));
    socket.on('connect_error', () => setState('offline'));
    socket.on('unauthorized', () => setState('offline'));
    socket.on('emergency.updated', (snapshot: EmergencySnapshot) => handler.current(snapshot));

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [token]);

  // Derived rather than stored: with no token there is nothing to connect to, and
  // writing that into state would be a render spent saying so.
  return token ? state : 'offline';
}
