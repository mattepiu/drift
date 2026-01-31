/**
 * Behavioral Signal Extractor
 * 
 * Extracts user behavior signals for prediction.
 * Analyzes query patterns, intents, and usage
 * to predict which memories will be relevant.
 * 
 * @module prediction/signals/behavioral-signals
 */

import type { BehavioralSignals, Intent, UserPattern } from '../types.js';

/**
 * Configuration for behavioral signal extraction
 */
export interface BehavioralSignalExtractorConfig {
  /** Maximum recent queries to track */
  maxRecentQueries: number;
  /** Maximum recent intents to track */
  maxRecentIntents: number;
  /** Maximum frequent memories to track */
  maxFrequentMemories: number;
  /** Maximum user patterns to detect */
  maxUserPatterns: number;
  /** Minimum occurrences for a pattern */
  minPatternOccurrences: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: BehavioralSignalExtractorConfig = {
  maxRecentQueries: 20,
  maxRecentIntents: 10,
  maxFrequentMemories: 50,
  maxUserPatterns: 10,
  minPatternOccurrences: 3,
};

/**
 * Query record for tracking
 */
interface QueryRecord {
  query: string;
  intent: Intent;
  timestamp: Date;
  file?: string;
  memoriesUsed: string[];
}

/**
 * Memory usage record
 */
interface MemoryUsageRecord {
  memoryId: string;
  usageCount: number;
  lastUsed: Date;
  contexts: string[];
}

/**
 * Behavioral Signal Extractor
 * 
 * Extracts user behavior signals for prediction.
 */
export class BehavioralSignalExtractor {
  private config: BehavioralSignalExtractorConfig;
  private queryHistory: QueryRecord[] = [];
  private memoryUsage: Map<string, MemoryUsageRecord> = new Map();
  private currentTask: string | undefined;
  private detectedPatterns: UserPattern[] = [];

  constructor(config?: Partial<BehavioralSignalExtractorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Extract behavioral signals
   */
  extract(): BehavioralSignals {
    const recentQueries = this.getRecentQueries();
    const recentIntents = this.getRecentIntents();
    const frequentMemories = this.getFrequentMemories();
    const userPatterns = this.detectUserPatterns();

    const result: BehavioralSignals = {
      recentQueries,
      recentIntents,
      frequentMemories,
      userPatterns,
    };

    // Only add currentTask if it's defined
    if (this.currentTask !== undefined) {
      result.currentTask = this.currentTask;
    }

    return result;
  }

  /**
   * Record a query
   */
  recordQuery(
    query: string,
    intent: Intent,
    file?: string,
    memoriesUsed: string[] = []
  ): void {
    const record: QueryRecord = {
      query,
      intent,
      timestamp: new Date(),
      memoriesUsed,
    };

    // Only add file if defined
    if (file !== undefined) {
      record.file = file;
    }

    this.queryHistory.push(record);

    // Trim history
    if (this.queryHistory.length > this.config.maxRecentQueries * 2) {
      this.queryHistory = this.queryHistory.slice(-this.config.maxRecentQueries);
    }

    // Update memory usage
    for (const memoryId of memoriesUsed) {
      this.recordMemoryUsage(memoryId, query);
    }

    // Re-detect patterns
    this.detectedPatterns = this.detectUserPatterns();
  }

  /**
   * Record memory usage
   */
  recordMemoryUsage(memoryId: string, context: string): void {
    const existing = this.memoryUsage.get(memoryId);

    if (existing) {
      existing.usageCount++;
      existing.lastUsed = new Date();
      if (!existing.contexts.includes(context)) {
        existing.contexts.push(context);
        if (existing.contexts.length > 10) {
          existing.contexts.shift();
        }
      }
    } else {
      this.memoryUsage.set(memoryId, {
        memoryId,
        usageCount: 1,
        lastUsed: new Date(),
        contexts: [context],
      });
    }
  }

  /**
   * Set current task context
   */
  setCurrentTask(task: string | undefined): void {
    this.currentTask = task;
  }

  /**
   * Get recent queries
   */
  private getRecentQueries(): string[] {
    return this.queryHistory
      .slice(-this.config.maxRecentQueries)
      .map((r) => r.query);
  }

  /**
   * Get recent intents
   */
  private getRecentIntents(): Intent[] {
    const intents = this.queryHistory
      .slice(-this.config.maxRecentIntents)
      .map((r) => r.intent);

    // Deduplicate while preserving order
    const seen = new Set<Intent>();
    const unique: Intent[] = [];
    for (const intent of intents.reverse()) {
      if (!seen.has(intent)) {
        seen.add(intent);
        unique.push(intent);
      }
    }
    return unique.reverse();
  }

  /**
   * Get frequently used memories
   */
  private getFrequentMemories(): string[] {
    const entries = Array.from(this.memoryUsage.entries());

    // Sort by usage count descending
    entries.sort((a, b) => b[1].usageCount - a[1].usageCount);

    return entries
      .slice(0, this.config.maxFrequentMemories)
      .map(([id]) => id);
  }

  /**
   * Detect user patterns from history
   */
  private detectUserPatterns(): UserPattern[] {
    const patterns: UserPattern[] = [];

    // Detect file sequence patterns
    const fileSequencePattern = this.detectFileSequencePattern();
    if (fileSequencePattern) {
      patterns.push(fileSequencePattern);
    }

    // Detect query sequence patterns
    const querySequencePattern = this.detectQuerySequencePattern();
    if (querySequencePattern) {
      patterns.push(querySequencePattern);
    }

    // Detect time-based patterns
    const timeBasedPattern = this.detectTimeBasedPattern();
    if (timeBasedPattern) {
      patterns.push(timeBasedPattern);
    }

    // Detect task-based patterns
    const taskBasedPattern = this.detectTaskBasedPattern();
    if (taskBasedPattern) {
      patterns.push(taskBasedPattern);
    }

    return patterns.slice(0, this.config.maxUserPatterns);
  }

  /**
   * Get detected patterns (for external access)
   */
  getDetectedPatterns(): UserPattern[] {
    return this.detectedPatterns;
  }

  /**
   * Detect file sequence patterns
   */
  private detectFileSequencePattern(): UserPattern | null {
    const filesWithQueries = this.queryHistory
      .filter((r) => r.file)
      .map((r) => r.file as string);

    if (filesWithQueries.length < this.config.minPatternOccurrences) {
      return null;
    }

    // Find common file pairs
    const pairs = new Map<string, number>();
    for (let i = 0; i < filesWithQueries.length - 1; i++) {
      const current = filesWithQueries[i];
      const next = filesWithQueries[i + 1];
      if (current && next) {
        const key = `${current}|${next}`;
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
    }

    // Find most common pair
    let maxPair = '';
    let maxCount = 0;
    for (const [pair, count] of pairs) {
      if (count > maxCount) {
        maxPair = pair;
        maxCount = count;
      }
    }

    if (maxCount < this.config.minPatternOccurrences) {
      return null;
    }

    const [file1, file2] = maxPair.split('|');

    // Get associated memories
    const associatedMemories = this.getMemoriesForFiles([file1 ?? '', file2 ?? '']);

    return {
      type: 'file_sequence',
      description: `Often work on ${file1} then ${file2}`,
      confidence: Math.min(maxCount / 10, 1),
      associatedMemories,
    };
  }

  /**
   * Detect query sequence patterns
   */
  private detectQuerySequencePattern(): UserPattern | null {
    if (this.queryHistory.length < this.config.minPatternOccurrences) {
      return null;
    }

    // Find common intent sequences
    const intentPairs = new Map<string, number>();
    for (let i = 0; i < this.queryHistory.length - 1; i++) {
      const current = this.queryHistory[i];
      const next = this.queryHistory[i + 1];
      if (current && next) {
        const key = `${current.intent}|${next.intent}`;
        intentPairs.set(key, (intentPairs.get(key) ?? 0) + 1);
      }
    }

    // Find most common pair
    let maxPair = '';
    let maxCount = 0;
    for (const [pair, count] of intentPairs) {
      if (count > maxCount) {
        maxPair = pair;
        maxCount = count;
      }
    }

    if (maxCount < this.config.minPatternOccurrences) {
      return null;
    }

    const [intent1, intent2] = maxPair.split('|');

    // Get associated memories from queries with these intents
    const associatedMemories = this.getMemoriesForIntents([
      intent1 as Intent,
      intent2 as Intent,
    ]);

    return {
      type: 'query_sequence',
      description: `Often ${intent1} followed by ${intent2}`,
      confidence: Math.min(maxCount / 10, 1),
      associatedMemories,
    };
  }

  /**
   * Detect time-based patterns
   */
  private detectTimeBasedPattern(): UserPattern | null {
    if (this.queryHistory.length < this.config.minPatternOccurrences) {
      return null;
    }

    // Group queries by hour
    const hourCounts = new Map<number, { count: number; memories: string[] }>();
    for (const record of this.queryHistory) {
      const hour = record.timestamp.getHours();
      const existing = hourCounts.get(hour);
      if (existing) {
        existing.count++;
        for (const memId of record.memoriesUsed) {
          if (!existing.memories.includes(memId)) {
            existing.memories.push(memId);
          }
        }
      } else {
        hourCounts.set(hour, {
          count: 1,
          memories: [...record.memoriesUsed],
        });
      }
    }

    // Find peak hour
    let peakHour = 0;
    let peakCount = 0;
    for (const [hour, data] of hourCounts) {
      if (data.count > peakCount) {
        peakHour = hour;
        peakCount = data.count;
      }
    }

    if (peakCount < this.config.minPatternOccurrences) {
      return null;
    }

    const peakData = hourCounts.get(peakHour);
    const associatedMemories = peakData?.memories ?? [];

    return {
      type: 'time_based',
      description: `Most active around ${peakHour}:00`,
      confidence: Math.min(peakCount / this.queryHistory.length, 1),
      associatedMemories: associatedMemories.slice(0, 10),
    };
  }

  /**
   * Detect task-based patterns
   */
  private detectTaskBasedPattern(): UserPattern | null {
    if (!this.currentTask) {
      return null;
    }

    // Get memories used during this task
    const taskMemories = new Set<string>();
    for (const record of this.queryHistory.slice(-20)) {
      for (const memId of record.memoriesUsed) {
        taskMemories.add(memId);
      }
    }

    if (taskMemories.size < this.config.minPatternOccurrences) {
      return null;
    }

    return {
      type: 'task_based',
      description: `Working on: ${this.currentTask}`,
      confidence: 0.8,
      associatedMemories: Array.from(taskMemories).slice(0, 10),
    };
  }

  /**
   * Get memories associated with files
   */
  private getMemoriesForFiles(files: string[]): string[] {
    const memories = new Set<string>();

    for (const record of this.queryHistory) {
      if (record.file && files.includes(record.file)) {
        for (const memId of record.memoriesUsed) {
          memories.add(memId);
        }
      }
    }

    return Array.from(memories).slice(0, 10);
  }

  /**
   * Get memories associated with intents
   */
  private getMemoriesForIntents(intents: Intent[]): string[] {
    const memories = new Set<string>();

    for (const record of this.queryHistory) {
      if (intents.includes(record.intent)) {
        for (const memId of record.memoriesUsed) {
          memories.add(memId);
        }
      }
    }

    return Array.from(memories).slice(0, 10);
  }

  /**
   * Clear all behavioral data
   */
  clear(): void {
    this.queryHistory = [];
    this.memoryUsage.clear();
    this.currentTask = undefined;
    this.detectedPatterns = [];
  }

  /**
   * Export state for persistence
   */
  export(): {
    queryHistory: QueryRecord[];
    memoryUsage: [string, MemoryUsageRecord][];
    currentTask?: string;
  } {
    const result: {
      queryHistory: QueryRecord[];
      memoryUsage: [string, MemoryUsageRecord][];
      currentTask?: string;
    } = {
      queryHistory: this.queryHistory,
      memoryUsage: Array.from(this.memoryUsage.entries()),
    };

    if (this.currentTask !== undefined) {
      result.currentTask = this.currentTask;
    }

    return result;
  }

  /**
   * Import state from persistence
   */
  import(state: {
    queryHistory?: QueryRecord[];
    memoryUsage?: [string, MemoryUsageRecord][];
    currentTask?: string;
  }): void {
    if (state.queryHistory) {
      this.queryHistory = state.queryHistory;
    }
    if (state.memoryUsage) {
      this.memoryUsage = new Map(state.memoryUsage);
    }
    if (state.currentTask !== undefined) {
      this.currentTask = state.currentTask;
    }
    this.detectedPatterns = this.detectUserPatterns();
  }
}
