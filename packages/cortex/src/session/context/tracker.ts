/**
 * Loaded Memory Tracker
 * 
 * Tracks what has been loaded in the current session.
 * Enables efficient deduplication of context.
 * 
 * @module session/context/tracker
 */

/**
 * Types of trackable items
 */
export type TrackableType = 'memory' | 'pattern' | 'file' | 'constraint';

/**
 * Metadata for a loaded item
 */
export interface LoadedItemMetadata {
  /** When the item was loaded */
  loadedAt: string;
  /** Compression level used (for memories) */
  compressionLevel?: number;
  /** Token count */
  tokenCount?: number;
  /** Number of times loaded */
  loadCount: number;
}

/**
 * Loaded Memory Tracker
 * 
 * Tracks what has been loaded in the current session
 * to enable efficient deduplication.
 */
export class LoadedMemoryTracker {
  private loadedMemories: Map<string, LoadedItemMetadata> = new Map();
  private loadedPatterns: Map<string, LoadedItemMetadata> = new Map();
  private loadedFiles: Map<string, LoadedItemMetadata> = new Map();
  private loadedConstraints: Map<string, LoadedItemMetadata> = new Map();

  /**
   * Mark an item as loaded
   */
  markLoaded(
    type: TrackableType,
    id: string,
    metadata?: Partial<LoadedItemMetadata>
  ): void {
    const store = this.getStore(type);
    const existing = store.get(id);
    const now = new Date().toISOString();

    if (existing) {
      // Update existing entry
      store.set(id, {
        ...existing,
        loadCount: existing.loadCount + 1,
        ...metadata,
      });
    } else {
      // Create new entry
      store.set(id, {
        loadedAt: now,
        loadCount: 1,
        ...metadata,
      });
    }
  }

  /**
   * Check if an item is loaded
   */
  isLoaded(type: TrackableType, id: string): boolean {
    return this.getStore(type).has(id);
  }

  /**
   * Get all loaded items of a type
   */
  getLoaded(type: TrackableType): string[] {
    return Array.from(this.getStore(type).keys());
  }

  /**
   * Get loaded items as a Set
   */
  getLoadedSet(type: TrackableType): Set<string> {
    return new Set(this.getStore(type).keys());
  }

  /**
   * Get metadata for a loaded item
   */
  getMetadata(type: TrackableType, id: string): LoadedItemMetadata | undefined {
    return this.getStore(type).get(id);
  }

  /**
   * Get all metadata for a type
   */
  getAllMetadata(type: TrackableType): Map<string, LoadedItemMetadata> {
    return new Map(this.getStore(type));
  }

  /**
   * Get count of loaded items
   */
  getCount(type: TrackableType): number {
    return this.getStore(type).size;
  }

  /**
   * Get total count across all types
   */
  getTotalCount(): number {
    return (
      this.loadedMemories.size +
      this.loadedPatterns.size +
      this.loadedFiles.size +
      this.loadedConstraints.size
    );
  }

  /**
   * Get total tokens loaded
   */
  getTotalTokens(): number {
    let total = 0;

    for (const store of [
      this.loadedMemories,
      this.loadedPatterns,
      this.loadedFiles,
      this.loadedConstraints,
    ]) {
      for (const metadata of store.values()) {
        total += metadata.tokenCount || 0;
      }
    }

    return total;
  }

  /**
   * Remove an item from tracking
   */
  unmark(type: TrackableType, id: string): boolean {
    return this.getStore(type).delete(id);
  }

  /**
   * Clear all tracked items of a type
   */
  clearType(type: TrackableType): void {
    this.getStore(type).clear();
  }

  /**
   * Clear all tracked items
   */
  clear(): void {
    this.loadedMemories.clear();
    this.loadedPatterns.clear();
    this.loadedFiles.clear();
    this.loadedConstraints.clear();
  }

  /**
   * Export tracker state for serialization
   */
  export(): {
    memories: [string, LoadedItemMetadata][];
    patterns: [string, LoadedItemMetadata][];
    files: [string, LoadedItemMetadata][];
    constraints: [string, LoadedItemMetadata][];
  } {
    return {
      memories: Array.from(this.loadedMemories.entries()),
      patterns: Array.from(this.loadedPatterns.entries()),
      files: Array.from(this.loadedFiles.entries()),
      constraints: Array.from(this.loadedConstraints.entries()),
    };
  }

  /**
   * Import tracker state from serialization
   */
  import(state: {
    memories?: [string, LoadedItemMetadata][];
    patterns?: [string, LoadedItemMetadata][];
    files?: [string, LoadedItemMetadata][];
    constraints?: [string, LoadedItemMetadata][];
  }): void {
    if (state.memories) {
      this.loadedMemories = new Map(state.memories);
    }
    if (state.patterns) {
      this.loadedPatterns = new Map(state.patterns);
    }
    if (state.files) {
      this.loadedFiles = new Map(state.files);
    }
    if (state.constraints) {
      this.loadedConstraints = new Map(state.constraints);
    }
  }

  // Private helper

  private getStore(type: TrackableType): Map<string, LoadedItemMetadata> {
    switch (type) {
      case 'memory':
        return this.loadedMemories;
      case 'pattern':
        return this.loadedPatterns;
      case 'file':
        return this.loadedFiles;
      case 'constraint':
        return this.loadedConstraints;
      default:
        throw new Error(`Unknown trackable type: ${type}`);
    }
  }
}
