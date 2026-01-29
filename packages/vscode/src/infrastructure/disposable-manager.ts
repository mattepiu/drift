/**
 * DisposableManager - Centralized resource cleanup
 * 
 * Single responsibility: Track and dispose VS Code disposables.
 */

import * as vscode from 'vscode';

import type { DisposableManager as IDisposableManager } from '../types/index.js';

/**
 * Manages disposable resources for proper cleanup
 */
export class DisposableManager implements IDisposableManager, vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private disposed = false;

  /**
   * Add a disposable to be managed
   */
  add(disposable: vscode.Disposable): void {
    if (this.disposed) {
      // If already disposed, dispose the new item immediately
      disposable.dispose();
      return;
    }
    this.disposables.push(disposable);
  }

  /**
   * Add multiple disposables
   */
  addAll(...disposables: vscode.Disposable[]): void {
    for (const d of disposables) {
      this.add(d);
    }
  }

  /**
   * Create a disposable from a cleanup function
   */
  addCallback(cleanup: () => void): void {
    this.add({ dispose: cleanup });
  }

  /**
   * Dispose all managed resources
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    
    this.disposed = true;
    
    // Dispose in reverse order (LIFO)
    while (this.disposables.length > 0) {
      const disposable = this.disposables.pop();
      try {
        disposable?.dispose();
      } catch (error) {
        // Log error but continue disposing other resources
        void error;
      }
    }
  }

  /**
   * Check if already disposed
   */
  isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Get count of managed disposables
   */
  get count(): number {
    return this.disposables.length;
  }
}

/**
 * Factory function for creating disposable managers
 */
export function createDisposableManager(): DisposableManager {
  return new DisposableManager();
}
