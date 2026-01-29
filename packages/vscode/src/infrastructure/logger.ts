/**
 * Logger - Centralized logging with output channel integration
 * 
 * Single responsibility: Provide structured logging to VS Code output channel.
 */

import * as vscode from 'vscode';

import type { Logger as ILogger } from '../types/index.js';

/**
 * Log levels for filtering
 */
type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

/**
 * Logger implementation with VS Code output channel
 */
export class Logger implements ILogger {
  private readonly channel: vscode.OutputChannel;
  private readonly minLevel: LogLevel;

  constructor(channelName: string, minLevel: LogLevel = 'info') {
    this.channel = vscode.window.createOutputChannel(channelName);
    this.minLevel = minLevel;
  }

  error(message: string, ...args: unknown[]): void {
    this.log('error', message, args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.log('warn', message, args);
  }

  info(message: string, ...args: unknown[]): void {
    this.log('info', message, args);
  }

  debug(message: string, ...args: unknown[]): void {
    this.log('debug', message, args);
  }

  /**
   * Show the output channel
   */
  show(): void {
    this.channel.show();
  }

  /**
   * Dispose the output channel
   */
  dispose(): void {
    this.channel.dispose();
  }

  private log(level: LogLevel, message: string, args: unknown[]): void {
    if (LOG_LEVEL_PRIORITY[level] > LOG_LEVEL_PRIORITY[this.minLevel]) {
      return;
    }

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    
    let formattedMessage = `${prefix} ${message}`;
    
    if (args.length > 0) {
      const argsStr = args
        .map(arg => {
          if (arg instanceof Error) {
            return `${arg.message}\n${arg.stack ?? ''}`;
          }
          if (typeof arg === 'object' && arg !== null) {
            try {
              return JSON.stringify(arg, null, 2);
            } catch {
              return '[Object]';
            }
          }
          return String(arg);
        })
        .join(' ');
      formattedMessage += ` ${argsStr}`;
    }

    this.channel.appendLine(formattedMessage);
  }
}

/**
 * Factory function for creating loggers
 */
export function createLogger(channelName: string = 'Drift', minLevel: LogLevel = 'info'): Logger {
  return new Logger(channelName, minLevel);
}
