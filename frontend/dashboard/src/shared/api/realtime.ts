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
  /** Called when the connection comes back after dropping, to catch up on what was missed. */
  onReconnect?: () => void,
): ConnectionState {
  const [state, setState] = useState<ConnectionState>('connecting');

  // The handler is kept in a ref so that a screen passing a freshly created callback
  // on every render does not tear down and rebuild the socket on every render. The
  // ref is written in an effect rather than during render, because a render can be
  // discarded and a ref written during one would not be.
  const handler = useRef(onUpdate);
  const reconnected = useRef(onReconnect);
  useEffect(() => {
    handler.current = onUpdate;
    reconnected.current = onReconnect;
  }, [onUpdate, onReconnect]);

  useEffect(() => {
    if (!token) return;

    const url = import.meta.env.VITE_API_BASE_URL ?? window.location.origin;
    const socket: Socket = io(`${url}/realtime`, {
      auth: { token },
      transports: ['websocket'],
      // Keeps trying, spaced out to ten seconds, so a console left open through a restart
      // or a network drop comes back by itself. A refused token is the exception: the
      // gateway says so with "unauthorized", and retrying it would only be refused again,
      // so that stops here until a fresh token starts a new connection.
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
    });

    let connectedBefore = false;
    socket.on('connect', () => {
      setState('live');
      // Anything that changed while the connection was down was never sent, so the screen
      // fetches again rather than showing a board that quietly missed an emergency.
      if (connectedBefore) reconnected.current?.();
      connectedBefore = true;
    });
    socket.on('disconnect', () => setState('offline'));
    socket.on('connect_error', () => setState('offline'));
    socket.on('unauthorized', () => {
      setState('offline');
      socket.io.opts.reconnection = false;
    });
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
