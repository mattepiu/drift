/**
 * Consolidation Scheduler
 * 
 * Schedules periodic consolidation runs.
 * Can be configured for interval-based or threshold-based triggers.
 */

import type { ConsolidationEngine, ConsolidationResult } from './engine.js';

/**
 * Scheduler configuration
 */
export interface SchedulerConfig {
  /** Whether scheduling is enabled */
  enabled: boolean;
  /** Interval in hours between runs */
  intervalHours: number;
  /** Trigger consolidation if memory count exceeds this */
  maxMemoryCount: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: SchedulerConfig = {
  enabled: true,
  intervalHours: 24,
  maxMemoryCount: 1000,
};

/**
 * Consolidation scheduler
 */
export class ConsolidationScheduler {
  private engine: ConsolidationEngine;
  private config: SchedulerConfig;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastRun: Date | null = null;

  constructor(engine: ConsolidationEngine, config?: Partial<SchedulerConfig>) {
    this.engine = engine;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (!this.config.enabled) return;

    const intervalMs = this.config.intervalHours * 60 * 60 * 1000;

    this.timer = setInterval(async () => {
      await this.runIfNeeded();
    }, intervalMs);

    // Also run on startup if needed
    void this.runIfNeeded();
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Run consolidation if needed
   */
  async runIfNeeded(): Promise<ConsolidationResult | null> {
    // Check if enough time has passed
    if (this.lastRun) {
      const hoursSinceLastRun =
        (Date.now() - this.lastRun.getTime()) / (1000 * 60 * 60);

      if (hoursSinceLastRun < this.config.intervalHours) {
        return null;
      }
    }

    this.lastRun = new Date();
    return this.engine.consolidate();
  }

  /**
   * Force a consolidation run
   */
  async forceRun(): Promise<ConsolidationResult> {
    this.lastRun = new Date();
    return this.engine.consolidate();
  }

  /**
   * Get last run time
   */
  getLastRun(): Date | null {
    return this.lastRun;
  }
}
