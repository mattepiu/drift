/**
 * useAccessStream Hook
 * 
 * Subscribes to real-time data access events for live visualization.
 */

import { useEffect, useCallback, useRef } from 'react';

import { useGalaxyStore } from '../store/index.js';

import type { AccessEvent, GalaxyEvent } from '../types/index.js';

// ============================================================================
// Types
// ============================================================================

export interface UseAccessStreamOptions {
  /** WebSocket URL for event stream */
  url?: string;
  /** Auto-connect on mount */
  autoConnect?: boolean;
  /** Reconnect on disconnect */
  autoReconnect?: boolean;
  /** Reconnect delay in ms */
  reconnectDelay?: number;
  /** Max events to keep in memory */
  maxEvents?: number;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useAccessStream(options: UseAccessStreamOptions = {}) {
  const {
    url = 'ws://localhost:3001/events',
    autoConnect = false,
    autoReconnect = true,
    reconnectDelay = 3000,
    maxEvents = 100,
  } = options;
  
  const { addEvent, setLiveMode, isLiveMode } = useGalaxyStore();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Connect to WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {return;}
    
    try {
      const ws = new WebSocket(url);
      
      ws.onopen = () => {
        setLiveMode(true);
        console.log('[Galaxy] Connected to event stream');
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Transform to GalaxyEvent
          const galaxyEvent: GalaxyEvent = {
            type: data.type || 'access',
            targetId: data.tableId || data.targetId,
            data: data as AccessEvent,
            timestamp: data.timestamp || new Date().toISOString(),
          };
          
          addEvent(galaxyEvent);
        } catch (err) {
          console.warn('[Galaxy] Failed to parse event:', err);
        }
      };
      
      ws.onclose = () => {
        setLiveMode(false);
        console.log('[Galaxy] Disconnected from event stream');
        
        // Auto-reconnect
        if (autoReconnect) {
          reconnectTimeoutRef.current = setTimeout(connect, reconnectDelay);
        }
      };
      
      ws.onerror = (err) => {
        console.error('[Galaxy] WebSocket error:', err);
      };
      
      wsRef.current = ws;
    } catch (err) {
      console.error('[Galaxy] Failed to connect:', err);
    }
  }, [url, autoReconnect, reconnectDelay, addEvent, setLiveMode]);
  
  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setLiveMode(false);
  }, [setLiveMode]);
  
  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    
    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);
  
  return {
    isConnected: isLiveMode,
    connect,
    disconnect,
  };
}
