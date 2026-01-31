/**
 * Temporal Signal Extractor
 * 
 * Extracts time-based signals for prediction.
 * Analyzes temporal patterns to predict which
 * memories will be relevant at different times.
 * 
 * @module prediction/signals/temporal-signals
 */

import type { TemporalSignals } from '../types.js';

/**
 * Configuration for temporal signal extraction
 */
export interface TemporalSignalExtractorConfig {
  /** Morning start hour (0-23) */
  morningStart: number;
  /** Afternoon start hour (0-23) */
  afternoonStart: number;
  /** Evening start hour (0-23) */
  eveningStart: number;
  /** Night start hour (0-23) */
  nightStart: number;
  /** Session timeout in minutes */
  sessionTimeoutMinutes: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: TemporalSignalExtractorConfig = {
  morningStart: 6,
  afternoonStart: 12,
  eveningStart: 17,
  nightStart: 21,
  sessionTimeoutMinutes: 30,
};

/**
 * Temporal Signal Extractor
 * 
 * Extracts time-based signals for prediction.
 */
export class TemporalSignalExtractor {
  private config: TemporalSignalExtractorConfig;
  private sessionStartTime: Date | null = null;
  private lastQueryTime: Date | null = null;

  constructor(config?: Partial<TemporalSignalExtractorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Extract temporal signals
   */
  extract(): TemporalSignals {
    const now = new Date();
    const timeOfDay = this.getTimeOfDay(now);
    const dayOfWeek = this.getDayOfWeek(now);
    const sessionDuration = this.getSessionDuration(now);
    const timeSinceLastQuery = this.getTimeSinceLastQuery(now);
    const isNewSession = this.isNewSession(now);

    // Update tracking
    if (isNewSession) {
      this.sessionStartTime = now;
    }
    this.lastQueryTime = now;

    return {
      timeOfDay,
      dayOfWeek,
      sessionDuration,
      timeSinceLastQuery,
      isNewSession,
    };
  }

  /**
   * Get time of day category
   */
  private getTimeOfDay(now: Date): 'morning' | 'afternoon' | 'evening' | 'night' {
    const hour = now.getHours();

    if (hour >= this.config.nightStart || hour < this.config.morningStart) {
      return 'night';
    } else if (hour >= this.config.eveningStart) {
      return 'evening';
    } else if (hour >= this.config.afternoonStart) {
      return 'afternoon';
    } else {
      return 'morning';
    }
  }

  /**
   * Get day of week
   */
  private getDayOfWeek(now: Date): string {
    const days = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ];
    const dayIndex = now.getDay();
    return days[dayIndex] ?? 'unknown';
  }

  /**
   * Get session duration in minutes
   */
  private getSessionDuration(now: Date): number {
    if (!this.sessionStartTime) {
      return 0;
    }

    const durationMs = now.getTime() - this.sessionStartTime.getTime();
    return Math.floor(durationMs / (1000 * 60));
  }

  /**
   * Get time since last query in seconds
   */
  private getTimeSinceLastQuery(now: Date): number {
    if (!this.lastQueryTime) {
      return 0;
    }

    const durationMs = now.getTime() - this.lastQueryTime.getTime();
    return Math.floor(durationMs / 1000);
  }

  /**
   * Check if this is a new session
   */
  private isNewSession(now: Date): boolean {
    if (!this.lastQueryTime) {
      return true;
    }

    const timeSinceLastMs = now.getTime() - this.lastQueryTime.getTime();
    const timeoutMs = this.config.sessionTimeoutMinutes * 60 * 1000;

    return timeSinceLastMs > timeoutMs;
  }

  /**
   * Start a new session explicitly
   */
  startSession(): void {
    this.sessionStartTime = new Date();
    this.lastQueryTime = new Date();
  }

  /**
   * End the current session
   */
  endSession(): void {
    this.sessionStartTime = null;
    this.lastQueryTime = null;
  }

  /**
   * Get session start time
   */
  getSessionStartTime(): Date | null {
    return this.sessionStartTime;
  }

  /**
   * Check if session is active
   */
  isSessionActive(): boolean {
    if (!this.lastQueryTime) {
      return false;
    }

    const now = new Date();
    const timeSinceLastMs = now.getTime() - this.lastQueryTime.getTime();
    const timeoutMs = this.config.sessionTimeoutMinutes * 60 * 1000;

    return timeSinceLastMs <= timeoutMs;
  }

  /**
   * Get work pattern based on time
   */
  getWorkPattern(): 'peak' | 'normal' | 'off-hours' {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();

    // Weekend
    if (day === 0 || day === 6) {
      return 'off-hours';
    }

    // Peak hours (9am - 12pm, 2pm - 5pm)
    if ((hour >= 9 && hour < 12) || (hour >= 14 && hour < 17)) {
      return 'peak';
    }

    // Normal work hours (8am - 6pm)
    if (hour >= 8 && hour < 18) {
      return 'normal';
    }

    return 'off-hours';
  }
}
