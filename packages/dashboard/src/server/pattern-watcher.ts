/**
 * Pattern Watcher
 *
 * Watches the .drift/patterns/ directory for changes and emits events
 * when patterns are added, updated, or removed.
 *
 * @requirements Phase 5 - Dashboard auto-refresh when watch mode updates patterns
 */

import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ============================================================================
// Types
// ============================================================================

export interface PatternChangeEvent {
  type: 'created' | 'updated' | 'deleted';
  category: string;
  status: string;
  timestamp: string;
}

export interface PatternWatcherOptions {
  /** Path to the .drift directory */
  driftDir: string;
  /** Debounce delay in milliseconds (default: 500) */
  debounceMs?: number;
}

// ============================================================================
// Pattern Watcher
// ============================================================================

export class PatternWatcher extends EventEmitter {
  private readonly driftDir: string;
  private readonly patternsDir: string;
  private readonly debounceMs: number;
  private watchers: fs.FSWatcher[] = [];
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private isWatching: boolean = false;

  constructor(options: PatternWatcherOptions) {
    super();
    this.driftDir = options.driftDir;
    this.patternsDir = path.join(options.driftDir, 'patterns');
    this.debounceMs = options.debounceMs ?? 500;
  }

  /**
   * Start watching for pattern changes
   */
  start(): void {
    if (this.isWatching) {
      return;
    }

    this.isWatching = true;

    // Watch the patterns directory and subdirectories
    const statusDirs = ['discovered', 'approved', 'ignored'];
    
    for (const status of statusDirs) {
      const statusDir = path.join(this.patternsDir, status);
      this.watchDirectory(statusDir, status);
    }

    // Also watch the index directory for file-map changes
    const indexDir = path.join(this.driftDir, 'index');
    this.watchDirectory(indexDir, 'index');

    this.emit('started');
  }

  /**
   * Stop watching for pattern changes
   */
  stop(): void {
    if (!this.isWatching) {
      return;
    }

    this.isWatching = false;

    // Close all watchers
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];

    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    this.emit('stopped');
  }

  /**
   * Check if currently watching
   */
  get watching(): boolean {
    return this.isWatching;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Watch a directory for changes
   */
  private watchDirectory(dirPath: string, status: string): void {
    // Ensure directory exists
    if (!fs.existsSync(dirPath)) {
      try {
        fs.mkdirSync(dirPath, { recursive: true });
      } catch {
        // Directory might be created later
        return;
      }
    }

    try {
      const watcher = fs.watch(dirPath, (eventType, filename) => {
        if (!filename?.endsWith('.json')) {
          return;
        }

        // Skip temp files
        if (filename.endsWith('.tmp') || filename.startsWith('.')) {
          return;
        }

        const filePath = path.join(dirPath, filename);
        const category = filename.replace('.json', '');

        // Debounce to avoid multiple events for the same file
        this.debounceChange(filePath, () => {
          this.handleFileChange(filePath, category, status, eventType);
        });
      });

      this.watchers.push(watcher);

      watcher.on('error', (error) => {
        console.error(`Watcher error for ${dirPath}:`, error);
      });
    } catch (error) {
      console.error(`Failed to watch ${dirPath}:`, error);
    }
  }

  /**
   * Debounce file change events
   */
  private debounceChange(key: string, callback: () => void): void {
    const existing = this.debounceTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      callback();
    }, this.debounceMs);

    this.debounceTimers.set(key, timer);
  }

  /**
   * Handle a file change event
   */
  private handleFileChange(
    filePath: string,
    category: string,
    status: string,
    eventType: string
  ): void {
    // Determine the change type
    let changeType: PatternChangeEvent['type'];
    
    if (!fs.existsSync(filePath)) {
      changeType = 'deleted';
    } else if (eventType === 'rename') {
      // 'rename' can mean created or deleted
      changeType = 'created';
    } else {
      changeType = 'updated';
    }

    const event: PatternChangeEvent = {
      type: changeType,
      category,
      status,
      timestamp: new Date().toISOString(),
    };

    console.log(`[PatternWatcher] Detected ${changeType}: ${status}/${category}.json`);
    this.emit('change', event);

    // Also emit specific events
    this.emit(changeType, event);
  }
}
