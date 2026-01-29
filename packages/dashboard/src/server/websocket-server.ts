/**
 * WebSocket Server
 *
 * Manages WebSocket connections for realtime violation streaming.
 *
 * @requirements 2.1 - Expose a WebSocket endpoint at `/ws` for realtime communication
 * @requirements 2.3 - Broadcast violations to all connected WebSocket clients
 */

import { WebSocketServer, WebSocket, type RawData } from 'ws';

import type { DashboardViolation } from './drift-data-reader.js';
import type { Server } from 'http';

// ============================================================================
// Types
// ============================================================================

export type WebSocketMessageType = 
  | 'violation'
  | 'pattern_updated'
  | 'patterns_changed'
  | 'stats_updated'
  | 'ping'
  | 'pong'
  | 'connected';

export interface WebSocketMessage {
  type: WebSocketMessageType;
  payload?: unknown;
  timestamp: string;
}

export interface PatternUpdatePayload {
  id: string;
  status: string;
  action: 'approved' | 'ignored' | 'deleted';
}

export interface PatternsChangedPayload {
  type: 'created' | 'updated' | 'deleted';
  category: string;
  status: string;
}

// ============================================================================
// WebSocket Manager
// ============================================================================

export class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private pingInterval: NodeJS.Timeout | null = null;

  /**
   * Get the number of connected clients
   */
  get clientCount(): number {
    return this.clients.size;
  }

  /**
   * Attach WebSocket server to an HTTP server
   * @requirements 2.1 - WebSocket endpoint at /ws
   */
  attach(server: Server): void {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws',
    });

    this.wss.on('connection', (ws: WebSocket) => {
      this.handleConnection(ws);
    });

    // Start ping interval for connection health
    this.startPingInterval();
  }

  /**
   * Close the WebSocket server and all connections
   */
  close(): void {
    // Stop ping interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    // Close all client connections
    for (const client of this.clients) {
      client.close(1000, 'Server shutting down');
    }
    this.clients.clear();

    // Close the WebSocket server
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }

  /**
   * Broadcast a violation to all connected clients
   * @requirements 2.3 - Broadcast violations to all connected clients
   */
  broadcastViolation(violation: DashboardViolation): void {
    this.broadcast({
      type: 'violation',
      payload: violation,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Broadcast a pattern update to all connected clients
   */
  broadcastPatternUpdate(update: PatternUpdatePayload): void {
    this.broadcast({
      type: 'pattern_updated',
      payload: update,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Broadcast stats update to all connected clients
   */
  broadcastStatsUpdate(stats: unknown): void {
    this.broadcast({
      type: 'stats_updated',
      payload: stats,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Broadcast patterns changed event to all connected clients
   * Triggers client-side data refresh
   */
  broadcastPatternsChanged(payload: PatternsChangedPayload): void {
    this.broadcast({
      type: 'patterns_changed',
      payload,
      timestamp: new Date().toISOString(),
    });
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Handle a new WebSocket connection
   */
  private handleConnection(ws: WebSocket): void {
    // Add to clients set
    this.clients.add(ws);

    // Send connected message
    this.send(ws, {
      type: 'connected',
      payload: { clientCount: this.clients.size },
      timestamp: new Date().toISOString(),
    });

    // Handle messages from client
    ws.on('message', (data: RawData) => {
      this.handleMessage(ws, data);
    });

    // Handle client disconnect
    ws.on('close', () => {
      this.clients.delete(ws);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.clients.delete(ws);
    });
  }

  /**
   * Handle incoming message from a client
   */
  private handleMessage(ws: WebSocket, data: RawData): void {
    try {
      const message = JSON.parse(data.toString()) as WebSocketMessage;

      // Handle ping/pong for connection health
      if (message.type === 'ping') {
        this.send(ws, {
          type: 'pong',
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      // Ignore invalid messages
      console.error('Invalid WebSocket message:', error);
    }
  }

  /**
   * Send a message to a specific client
   */
  private send(ws: WebSocket, message: WebSocketMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcast a message to all connected clients
   */
  private broadcast(message: WebSocketMessage): void {
    const messageStr = JSON.stringify(message);
    
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    }
  }

  /**
   * Start ping interval for connection health monitoring
   */
  private startPingInterval(): void {
    // Ping every 30 seconds
    this.pingInterval = setInterval(() => {
      const pingMessage: WebSocketMessage = {
        type: 'ping',
        timestamp: new Date().toISOString(),
      };
      
      for (const client of this.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(pingMessage));
        } else {
          // Remove dead connections
          this.clients.delete(client);
        }
      }
    }, 30000);
  }
}
