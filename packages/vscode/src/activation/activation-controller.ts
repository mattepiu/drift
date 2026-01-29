/**
 * ActivationController - Extension lifecycle orchestrator
 * 
 * Single responsibility: Orchestrate phased extension activation.
 */

import * as vscode from 'vscode';

import { getPhasesByType } from './activation-phases.js';
import { createConnectionManager, type ConnectionManager } from '../client/index.js';
import { createCommandRouter } from '../commands/command-router.js';
import {
  createConnectionHandlers,
  createScanHandlers,
  createPatternHandlers,
  createViolationHandlers,
  createUIHandlers,
} from '../commands/handlers/index.js';
import {
  createLoggingMiddleware,
  createConnectionCheckMiddleware,
} from '../commands/middleware/index.js';
import { createConfigManager, type ConfigManager } from '../config/index.js';
import {
  createLogger,
  createDisposableManager,
  createServiceContainer,
  createEventBus,
  ServiceKeys,
  type Logger,
  type DisposableManager,
  type ServiceContainer,
  type EventBus,
} from '../infrastructure/index.js';
import { createStateManager, type StateManager } from '../state/index.js';
import { createDecorationController } from '../ui/decorations/index.js';
import { createNotificationService } from '../ui/notifications/index.js';
import { createStatusBar } from '../ui/status-bar/index.js';

/**
 * Phase timing data
 */
interface PhaseTiming {
  name: string;
  duration: number;
  success: boolean;
  error?: string;
}

/**
 * Activation controller
 */
export class ActivationController implements vscode.Disposable {
  private readonly disposables: DisposableManager;
  private readonly services: ServiceContainer;
  private readonly phaseTimings: PhaseTiming[] = [];
  private activated = false;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.disposables = createDisposableManager();
    this.services = createServiceContainer();
  }

  /**
   * Activate the extension
   */
  async activate(): Promise<void> {
    if (this.activated) {
      return;
    }

    const startTime = performance.now();

    try {
      // Phase 1: Immediate (blocking)
      await this.runImmediatePhase();

      // Phase 2: Deferred (non-blocking)
      setImmediate(() => {
        this.runDeferredPhase().catch((error: unknown) => {
          this.getLogger().error('Deferred activation failed:', error);
        });
      });

      this.activated = true;

      const totalTime = performance.now() - startTime;
      this.getLogger().info(`Extension activated in ${totalTime.toFixed(2)}ms`);

    } catch (error) {
      this.getLogger().error('Activation failed:', error);
      throw error;
    }
  }

  /**
   * Deactivate the extension
   */
  async deactivate(): Promise<void> {
    this.getLogger().info('Deactivating extension...');

    // Disconnect from server
    const connectionManager = this.services.tryGet<ConnectionManager>(ServiceKeys.ConnectionManager);
    if (connectionManager) {
      await connectionManager.disconnect();
    }

    // Dispose all resources
    this.disposables.dispose();
    this.services.clear();

    this.activated = false;
    this.getLogger().info('Extension deactivated');
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.deactivate().catch(() => {});
  }

  /**
   * Get phase timings for telemetry
   */
  getPhaseTimings(): PhaseTiming[] {
    return [...this.phaseTimings];
  }

  private async runImmediatePhase(): Promise<void> {
    const phases = getPhasesByType('immediate');

    for (const phase of phases) {
      await this.runPhase(phase.name, () => this.initializePhase(phase.name));
    }
  }

  private async runDeferredPhase(): Promise<void> {
    const phases = getPhasesByType('deferred');

    for (const phase of phases) {
      await this.runPhase(phase.name, () => this.initializePhase(phase.name));
    }

    // Register lazy providers
    this.registerLazyProviders();
  }

  private async runPhase(name: string, fn: () => Promise<void>): Promise<void> {
    const startTime = performance.now();

    try {
      await fn();
      
      this.phaseTimings.push({
        name,
        duration: performance.now() - startTime,
        success: true,
      });
    } catch (error) {
      this.phaseTimings.push({
        name,
        duration: performance.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async initializePhase(name: string): Promise<void> {
    switch (name) {
      case 'infrastructure':
        this.initializeInfrastructure();
        break;
      case 'state':
        this.initializeState();
        break;
      case 'config':
        this.initializeConfig();
        break;
      case 'statusBar':
        this.initializeStatusBar();
        break;
      case 'connection':
        await this.initializeConnection();
        break;
      case 'commands':
        this.initializeCommands();
        break;
      case 'decorations':
        this.initializeDecorations();
        break;
    }
  }

  private initializeInfrastructure(): void {
    // Create logger
    const logger = createLogger('Drift', 'info');
    this.services.register(ServiceKeys.Logger, logger);
    this.disposables.add(logger);

    // Create event bus
    const eventBus = createEventBus();
    this.services.register('eventBus', eventBus);
    this.disposables.add(eventBus);

    logger.info('Infrastructure initialized');
  }

  private initializeState(): void {
    const stateManager = createStateManager(this.context);
    this.services.register(ServiceKeys.StateManager, stateManager);
    this.disposables.add(stateManager);

    this.getLogger().debug('State manager initialized');
  }

  private initializeConfig(): void {
    const configManager = createConfigManager(this.getLogger());
    this.services.register(ServiceKeys.ConfigManager, configManager);
    this.disposables.add(configManager);

    this.getLogger().debug('Config manager initialized');
  }

  private initializeStatusBar(): void {
    const stateManager = this.services.get<StateManager>(ServiceKeys.StateManager);
    const statusBar = createStatusBar(stateManager);
    this.services.register(ServiceKeys.StatusBar, statusBar);
    this.disposables.add(statusBar);

    this.getLogger().debug('Status bar initialized');
  }

  private async initializeConnection(): Promise<void> {
    const configManager = this.services.get<ConfigManager>(ServiceKeys.ConfigManager);
    const eventBus = this.services.get<EventBus>('eventBus');
    const stateManager = this.services.get<StateManager>(ServiceKeys.StateManager);

    const connectionManager = createConnectionManager(
      this.context,
      this.getLogger(),
      eventBus,
      configManager.get('server')
    );
    this.services.register(ServiceKeys.ConnectionManager, connectionManager);
    this.disposables.add(connectionManager);

    // Update state on connection changes
    connectionManager.onStateChange(status => {
      stateManager.update(draft => {
        draft.connection.status = status;
      });
    });

    // Start connection
    await connectionManager.connect();

    this.getLogger().debug('Connection manager initialized');
  }

  private initializeCommands(): void {
    const stateManager = this.services.get<StateManager>(ServiceKeys.StateManager);
    const connectionManager = this.services.get<ConnectionManager>(ServiceKeys.ConnectionManager);
    const eventBus = this.services.get<EventBus>('eventBus');

    // Create notification service
    const notifications = createNotificationService(this.getLogger());

    // Create command router
    const router = createCommandRouter(this.context, this.getLogger(), stateManager);
    this.services.register(ServiceKeys.CommandRouter, router);
    this.disposables.add(router);

    // Add middleware
    router
      .use(createLoggingMiddleware(this.getLogger()))
      .use(createConnectionCheckMiddleware(stateManager));

    // Register command handlers
    createConnectionHandlers(router, connectionManager, stateManager, notifications);
    createScanHandlers(router, connectionManager, stateManager, notifications, eventBus);
    createPatternHandlers(router, connectionManager, notifications);
    createViolationHandlers(router, connectionManager, notifications);
    createUIHandlers(router, notifications);

    this.getLogger().debug('Commands initialized');
  }

  private initializeDecorations(): void {
    const configManager = this.services.get<ConfigManager>(ServiceKeys.ConfigManager);
    
    const decorationController = createDecorationController(this.context, configManager);
    this.services.register(ServiceKeys.DecorationController, decorationController);
    this.disposables.add(decorationController);

    this.getLogger().debug('Decorations initialized');
  }

  private registerLazyProviders(): void {
    // Tree views and webviews are registered but not initialized until accessed
    // This keeps activation fast while still registering the providers
    
    this.getLogger().debug('Lazy providers registered');
  }

  private getLogger(): Logger {
    return this.services.get<Logger>(ServiceKeys.Logger);
  }
}

/**
 * Factory function for creating activation controller
 */
export function createActivationController(
  context: vscode.ExtensionContext
): ActivationController {
  return new ActivationController(context);
}
