/**
 * DashboardServer
 *
 * Main server class that orchestrates Express and WebSocket servers
 * for the Drift Dashboard.
 *
 * @requirements 1.1 - Start an Express server on localhost:3847
 * @requirements 1.2 - Start on the specified port
 * @requirements 1.3 - Automatically open the default browser to the dashboard URL
 * @requirements 1.5 - Handle port conflict errors gracefully
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DriftDataReader, type DashboardViolation } from './drift-data-reader.js';
import { createExpressApp } from './express-app.js';
import { PatternWatcher, type PatternChangeEvent } from './pattern-watcher.js';
import { WebSocketManager } from './websocket-server.js';

import type { Server } from 'http';

// Get the directory of this file for resolving static files
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DashboardServerOptions {
  /** Port to listen on (default: 3847) */
  port: number;
  /** Path to the .drift directory */
  driftDir: string;
  /** Whether to automatically open browser on start */
  openBrowser: boolean;
}

export class DashboardServer {
  private readonly options: DashboardServerOptions;
  private readonly reader: DriftDataReader;
  private readonly wsManager: WebSocketManager;
  private readonly patternWatcher: PatternWatcher;
  private server: Server | null = null;

  constructor(options: DashboardServerOptions) {
    this.options = options;
    this.reader = new DriftDataReader(options.driftDir);
    this.wsManager = new WebSocketManager();
    this.patternWatcher = new PatternWatcher({ driftDir: options.driftDir });
    
    // Wire up pattern watcher to WebSocket broadcasts
    this.patternWatcher.on('change', (event: PatternChangeEvent) => {
      this.wsManager.broadcastPatternsChanged({
        type: event.type,
        category: event.category,
        status: event.status,
      });
    });
  }

  /**
   * Get the configured port
   */
  get port(): number {
    return this.options.port;
  }

  /**
   * Get the drift directory path
   */
  get driftDir(): string {
    return this.options.driftDir;
  }

  /**
   * Check if the server is running
   */
  get isRunning(): boolean {
    return this.server !== null;
  }

  /**
   * Get the number of connected WebSocket clients
   */
  get connectedClients(): number {
    return this.wsManager.clientCount;
  }

  /**
   * Start the dashboard server
   * @requirements 1.1, 1.2, 1.3
   */
  async start(): Promise<void> {
    if (this.server) {
      throw new Error('Server is already running');
    }

    // Resolve static files directory (dist/client relative to dist/server)
    const staticDir = path.resolve(__dirname, '..', 'client');

    // Create Express app
    const app = createExpressApp({
      reader: this.reader,
      staticDir,
      enableCors: true,
    });

    // Create HTTP server
    return new Promise((resolve, reject) => {
      this.server = app.listen(this.options.port, async () => {
        console.log(`Dashboard server running at http://localhost:${this.options.port}`);

        // Attach WebSocket server
        this.wsManager.attach(this.server!);

        // Start pattern watcher for realtime updates
        this.patternWatcher.start();

        // Open browser if requested
        if (this.options.openBrowser) {
          try {
            await this.openBrowser();
          } catch (error) {
            // Don't fail if browser can't be opened
            console.warn('Could not open browser:', error);
          }
        }

        resolve();
      });

      this.server.on('error', (error: NodeJS.ErrnoException) => {
        this.server = null;
        
        if (error.code === 'EADDRINUSE') {
          reject(new Error(`Port ${this.options.port} is already in use. Try a different port with --port <number>`));
        } else {
          reject(error);
        }
      });
    });
  }

  /**
   * Stop the dashboard server
   */
  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    // Stop pattern watcher
    this.patternWatcher.stop();

    // Close WebSocket connections
    this.wsManager.close();

    // Close HTTP server
    return new Promise((resolve, reject) => {
      this.server!.close((error) => {
        this.server = null;
        
        if (error) {
          reject(error);
        } else {
          console.log('Dashboard server stopped');
          resolve();
        }
      });
    });
  }

  /**
   * Broadcast a violation to all connected WebSocket clients
   * @requirements 2.3
   */
  broadcastViolation(violation: DashboardViolation): void {
    this.wsManager.broadcastViolation(violation);
  }

  /**
   * Open the default browser to the dashboard URL
   * @requirements 1.3
   */
  private async openBrowser(): Promise<void> {
    // Dynamic import to avoid issues with ESM
    const open = await import('open');
    await open.default(`http://localhost:${this.options.port}`);
  }
}
