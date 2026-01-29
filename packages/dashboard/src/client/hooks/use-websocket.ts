/**
 * WebSocket Hook
 *
 * Manages WebSocket connection for real-time updates.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useCallback } from 'react';

import { useDashboardStore } from '../store';

import type { WebSocketMessage, Violation } from '../types';

const WS_RECONNECT_DELAY = 3000;
const WS_PING_INTERVAL = 30000;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();

  const { setConnectionStatus, addRealtimeViolation } = useDashboardStore();

  const connect = useCallback(() => {
    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    setConnectionStatus('connecting');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus('connected');

        // Start ping interval
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, WS_PING_INTERVAL);
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          handleMessage(message);
        } catch {
          console.error('Failed to parse WebSocket message');
        }
      };

      ws.onclose = () => {
        setConnectionStatus('disconnected');
        cleanup();
        scheduleReconnect();
      };

      ws.onerror = () => {
        setConnectionStatus('disconnected');
      };
    } catch {
      setConnectionStatus('disconnected');
      scheduleReconnect();
    }
  }, [setConnectionStatus]);

  const handleMessage = useCallback(
    (message: WebSocketMessage) => {
      switch (message.type) {
        case 'violation':
          addRealtimeViolation(message.payload);
          queryClient.invalidateQueries({ queryKey: ['violations'] });
          queryClient.invalidateQueries({ queryKey: ['stats'] });
          break;

        case 'pattern_updated':
          queryClient.invalidateQueries({ queryKey: ['patterns'] });
          queryClient.invalidateQueries({ queryKey: ['pattern', message.payload.id] });
          queryClient.invalidateQueries({ queryKey: ['stats'] });
          break;

        case 'patterns_changed':
          // Pattern files changed on disk (e.g., from watch mode)
          // Invalidate all pattern-related queries to refresh data
          queryClient.invalidateQueries({ queryKey: ['patterns'] });
          queryClient.invalidateQueries({ queryKey: ['stats'] });
          queryClient.invalidateQueries({ queryKey: ['violations'] });
          queryClient.invalidateQueries({ queryKey: ['files'] });
          break;

        case 'stats_updated':
          queryClient.setQueryData(['stats'], message.payload);
          break;

        case 'pong':
          // Connection is alive
          break;
      }
    },
    [addRealtimeViolation, queryClient]
  );

  const cleanup = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    reconnectTimeoutRef.current = setTimeout(connect, WS_RECONNECT_DELAY);
  }, [connect]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    cleanup();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionStatus('disconnected');
  }, [cleanup, setConnectionStatus]);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return { connect, disconnect };
}
