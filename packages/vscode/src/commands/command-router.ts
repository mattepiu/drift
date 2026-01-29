/**
 * CommandRouter - Centralized command handling with middleware
 * 
 * Single responsibility: Route commands through middleware chain.
 */

import * as vscode from 'vscode';

import type { DriftCommand } from './command-definitions.js';
import type { Logger } from '../infrastructure/index.js';
import type { StateManager } from '../state/index.js';

/**
 * Command context passed to handlers
 */
export interface CommandContext {
  command: DriftCommand;
  args: unknown[];
  startTime: number;
  progress?: vscode.Progress<{ message?: string; increment?: number }>;
  cancellationToken?: vscode.CancellationToken;
}

/**
 * Command handler function
 */
export type CommandHandler = (ctx: CommandContext) => Promise<void>;

/**
 * Command middleware function
 */
export type CommandMiddleware = (
  ctx: CommandContext,
  next: () => Promise<void>
) => Promise<void>;

/**
 * Command registration
 */
interface CommandRegistration {
  id: DriftCommand;
  handler: CommandHandler;
  showProgress?: boolean;
  progressTitle?: string;
}

/**
 * Command router with middleware support
 */
export class CommandRouter implements vscode.Disposable {
  private readonly handlers = new Map<DriftCommand, CommandRegistration>();
  private readonly middleware: CommandMiddleware[] = [];
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly logger: Logger,
    _stateManager: StateManager // Available for future use
  ) {}

  /**
   * Add middleware to the chain
   */
  use(middleware: CommandMiddleware): this {
    this.middleware.push(middleware);
    return this;
  }

  /**
   * Register a command handler
   */
  register(registration: CommandRegistration): vscode.Disposable {
    this.handlers.set(registration.id, registration);

    const disposable = vscode.commands.registerCommand(
      registration.id,
      async (...args: unknown[]) => {
        await this.execute(registration, args);
      }
    );

    this.disposables.push(disposable);
    this.context.subscriptions.push(disposable);

    return disposable;
  }

  /**
   * Register multiple command handlers
   */
  registerAll(registrations: CommandRegistration[]): void {
    for (const reg of registrations) {
      this.register(reg);
    }
  }

  /**
   * Execute a command programmatically
   */
  async executeCommand(command: DriftCommand, ...args: unknown[]): Promise<void> {
    await vscode.commands.executeCommand(command, ...args);
  }

  /**
   * Dispose all registered commands
   */
  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.handlers.clear();
    this.middleware.length = 0;
  }

  private async execute(registration: CommandRegistration, args: unknown[]): Promise<void> {
    const ctx: CommandContext = {
      command: registration.id,
      args,
      startTime: performance.now(),
    };

    try {
      if (registration.showProgress) {
        await this.executeWithProgress(registration, ctx);
      } else {
        await this.executeWithMiddleware(registration.handler, ctx);
      }
    } catch (error) {
      this.handleError(registration.id, error);
    }
  }

  private async executeWithProgress(
    registration: CommandRegistration,
    ctx: CommandContext
  ): Promise<void> {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: registration.progressTitle || `Drift: ${registration.id}`,
        cancellable: true,
      },
      async (progress, token) => {
        ctx.progress = progress;
        ctx.cancellationToken = token;
        await this.executeWithMiddleware(registration.handler, ctx);
      }
    );
  }

  private async executeWithMiddleware(
    handler: CommandHandler,
    ctx: CommandContext
  ): Promise<void> {
    let index = 0;

    const next = async (): Promise<void> => {
      if (index < this.middleware.length) {
        const mw = this.middleware[index++];
        if (mw) {
          await mw(ctx, next);
        }
      } else {
        await handler(ctx);
      }
    };

    await next();
  }

  private handleError(command: DriftCommand, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`Command ${command} failed:`, message);

    void vscode.window
      .showErrorMessage(`Drift: ${message}`, 'Retry', 'Show Logs')
      .then((action) => {
        if (action === 'Retry') {
          void vscode.commands.executeCommand(command);
        } else if (action === 'Show Logs') {
          void vscode.commands.executeCommand('drift.showLogs');
        }
      });
  }
}

/**
 * Factory function for creating command router
 */
export function createCommandRouter(
  context: vscode.ExtensionContext,
  logger: Logger,
  stateManager: StateManager
): CommandRouter {
  return new CommandRouter(context, logger, stateManager);
}
