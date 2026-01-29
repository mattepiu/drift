/**
 * Extension-level type definitions
 */

import type * as vscode from 'vscode';

/**
 * Extension activation phases for progressive loading
 */
export type ActivationPhase = 'immediate' | 'deferred' | 'lazy';

/**
 * Connection states for LSP client
 */
export type ConnectionState = 
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'
  | 'failed';

/**
 * Severity levels matching LSP
 */
export type Severity = 'error' | 'warning' | 'info' | 'hint';

/**
 * Pattern status
 */
export type PatternStatus = 'discovered' | 'approved' | 'ignored';

/**
 * Logger interface for dependency injection
 */
export interface Logger {
  error(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

/**
 * Disposable resource manager
 */
export interface DisposableManager {
  add(disposable: vscode.Disposable): void;
  dispose(): void;
}

/**
 * Service locator for dependency injection
 */
export interface ServiceContainer {
  get<T>(key: string): T;
  register(key: string, instance: unknown): void;
  has(key: string): boolean;
}
