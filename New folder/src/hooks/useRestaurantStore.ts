import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientAction, RestaurantState, ServerMessage } from '../types';

export function useRestaurantStore() {
  const [state, setState] = useState<RestaurantState | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const retryCountRef = useRef(0);
  const unmountedRef = useRef(false);

  const fetchInitialState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (res.ok) {
        const data = (await res.json()) as RestaurantState;
        if (!unmountedRef.current) {
          setState(data);
        }
      }
    } catch {
      // WebSocket connection will hydrate once reachable
    }
  }, []);

  const connect = useCallback(() => {
    if (unmountedRef.current) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmountedRef.current) return;
      setConnected(true);
      setError(null);
      retryCountRef.current = 0;
    };

    ws.onmessage = (event) => {
      if (unmountedRef.current) return;
      try {
        const msg = JSON.parse(event.data) as ServerMessage;
        if (msg.type === 'state:sync') {
          setState(msg.payload);
        } else if (msg.type === 'error') {
          setError(msg.payload.message);
        }
      } catch {
        // ignore malformed frame
      }
    };

    ws.onclose = () => {
      if (unmountedRef.current) return;
      setConnected(false);
      const delay = Math.min(4000, 400 * Math.pow(1.6, retryCountRef.current));
      retryCountRef.current += 1;
      reconnectTimerRef.current = window.setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    fetchInitialState();
    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect, fetchInitialState]);

  const dispatch = useCallback(async (action: ClientAction) => {
    setError(null);
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(action));
      return;
    }

    try {
      const res = await fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Action failed');
        return;
      }
      if (json.state) {
        setState(json.state);
      }
    } catch {
      setError('Unable to reach restaurant server. Reconnecting...');
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { state, connected, error, dispatch, clearError };
}
