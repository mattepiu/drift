/**
 * ConnectionManager - LSP connection lifecycle management
 * 
 * Single responsibility: Manage LSP client connection with auto-recovery.
 */

import * as vscode from 'vscode';

import { CONNECTION_CONFIG } from './connection-config.js';
import { createLanguageClient } from './language-client-factory.js';

import type { EventBus } from '../infrastructure/event-bus.js';
import type { Logger } from '../infrastructure/index.js';
import type { ConnectionState, ServerConfig } from '../types/index.js';
import type { LanguageClient, StateChangeEvent } from 'vscode-languageclient/node';


/**
 * Connection manager for LSP client
 */
export class ConnectionManager implements vscode.Disposable {
  private client: LanguageClient | null = null;
  private state: ConnectionState = 'disconnected';
  private restartCount = 0;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private readonly disposables: vscode.Disposable[] = [];

  private readonly stateEmitter = new vscode.EventEmitter<ConnectionState>();
  readonly onStateChange = this.stateEmitter.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly logger: Logger,
    private readonly eventBus: EventBus,
    private config: ServerConfig
  ) {}

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Get the language client (if connected)
   */
  getClient(): LanguageClient | null {
    return this.state === 'connected' ? this.client : null;
  }

  /**
   * Connect to the LSP server
   */
  async connect(): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      this.logger.debug('Already connected or connecting');
      return;
    }

    this.setState('connecting');

    try {
      this.client = createLanguageClient(this.context, this.logger, this.config);
      
      // Set up client event handlers
      this.setupClientHandlers();

      // Start the client
      await this.client.start();

      // Wait for ready state
      await this.waitForReady();

      this.setState('connected');
      this.restartCount = 0;
      this.startHealthCheck();

      this.logger.info('Connected to Drift LSP server');
      
    } catch (error) {
      await this.handleConnectionError(error);
    }
  }

  /**
   * Disconnect from the LSP server
   */
  async disconnect(): Promise<void> {
    this.stopHealthCheck();

    if (this.client) {
      try {
        await Promise.race([
          this.client.stop(),
          this.timeout(CONNECTION_CONFIG.shutdownTimeout),
        ]);
      } catch (error) {
        this.logger.warn('Error during disconnect:', error);
      }
      this.client = null;
    }

    this.setState('disconnected');
    this.logger.info('Disconnected from Drift LSP server');
  }

  /**
   * Reconnect to the LSP server
   */
  async reconnect(): Promise<void> {
    await this.disconnect();
    await this.connect();
  }

  /**
   * Update server configuration
   */
  updateConfig(config: ServerConfig): void {
    this.config = config;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.stopHealthCheck();
    this.stateEmitter.dispose();
    
    if (this.client) {
      this.client.stop().catch(() => {});
      this.client = null;
    }

    for (const d of this.disposables) {
      d.dispose();
    }
  }

  private setState(state: ConnectionState): void {
    const previousState = this.state;
    this.state = state;
    this.stateEmitter.fire(state);
    this.eventBus.emit('connection:changed', { status: state, previousStatus: previousState });
  }

  private setupClientHandlers(): void {
    if (!this.client) {return;}

    // Handle client errors
    this.client.onDidChangeState((event: StateChangeEvent) => {
      this.logger.debug(`Client state changed: ${String(event.oldState)} -> ${String(event.newState)}`);
    });
  }

  private async waitForReady(): Promise<void> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    const timeout = CONNECTION_CONFIG.initializeTimeout;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (this.client.isRunning()) {
        return;
      }
      await this.delay(100);
    }

    throw new Error(`Server initialization timed out after ${String(timeout)}ms`);
  }

  private async handleConnectionError(error: unknown): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.logger.error('Connection error:', errorMessage);

    this.setState('error');
    this.eventBus.emit('connection:error', {
      error: error instanceof Error ? error : new Error(errorMessage),
      recoverable: this.restartCount < CONNECTION_CONFIG.maxRestarts,
    });

    if (this.restartCount >= CONNECTION_CONFIG.maxRestarts) {
      this.setState('failed');
      this.logger.error(`Max restart attempts (${String(CONNECTION_CONFIG.maxRestarts)}) reached`);
      return;
    }

    const delay = this.calculateBackoff();
    this.restartCount++;

    this.logger.info(
      `Reconnecting in ${String(delay)}ms (attempt ${String(this.restartCount)}/${String(CONNECTION_CONFIG.maxRestarts)})`
    );

    this.setState('reconnecting');
    await this.delay(delay);
    await this.connect();
  }

  private calculateBackoff(): number {
    const delay = CONNECTION_CONFIG.restartDelay * 
      Math.pow(CONNECTION_CONFIG.backoffMultiplier, this.restartCount);
    return Math.min(delay, CONNECTION_CONFIG.maxBackoffDelay);
  }

  private startHealthCheck(): void {
    this.stopHealthCheck();

    this.healthCheckTimer = setInterval(() => {
      void this.isHealthy().then(healthy => {
        if (!healthy) {
          this.logger.warn('Health check failed, reconnecting...');
          void this.reconnect();
        }
      });
    }, CONNECTION_CONFIG.healthCheckInterval);
  }

  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  private async isHealthy(): Promise<boolean> {
    if (!this.client?.isRunning()) {
      return false;
    }

    try {
      await Promise.race([
        this.client.sendRequest('drift/health'),
        this.timeout(5000),
      ]);
      return true;
    } catch {
      return false;
    }
  }

  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => { reject(new Error('Timeout')); }, ms);
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Factory function for creating connection manager
 */
export function createConnectionManager(
  context: vscode.ExtensionContext,
  logger: Logger,
  eventBus: EventBus,
  config: ServerConfig
): ConnectionManager {
  return new ConnectionManager(context, logger, eventBus, config);
}
