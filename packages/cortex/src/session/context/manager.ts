/**
 * Session Context Manager
 * 
 * Manages session lifecycle and state.
 * Coordinates tracking and persistence.
 * 
 * @module session/context/manager
 */

import { randomUUID } from 'crypto';
import type {
  SessionContext,
  SessionConfig,
  SessionStats,
  SessionMetadata,
  CreateSessionRequest,
  SessionOperationResult,
} from '../../types/session-context.js';
import { DEFAULT_SESSION_CONFIG } from '../../types/session-context.js';
import { LoadedMemoryTracker } from './tracker.js';
import type { ISessionStorage } from '../storage/interface.js';

/**
 * Session Context Manager
 * 
 * Manages session lifecycle including:
 * - Session creation and termination
 * - State tracking
 * - Persistence (optional)
 * - Statistics
 */
export class SessionContextManager {
  private activeSession: SessionContext | null = null;
  private tracker: LoadedMemoryTracker;
  private config: SessionConfig;
  private storage: ISessionStorage | null;

  constructor(
    storage?: ISessionStorage,
    config?: Partial<SessionConfig>,
    tracker?: LoadedMemoryTracker
  ) {
    this.storage = storage || null;
    this.config = { ...DEFAULT_SESSION_CONFIG, ...config };
    this.tracker = tracker || new LoadedMemoryTracker();
  }

  /**
   * Start a new session
   */
  async startSession(request?: CreateSessionRequest): Promise<SessionContext> {
    // End any existing session
    if (this.activeSession) {
      await this.endSession(this.activeSession.id);
    }

    const now = new Date().toISOString();
    const session: SessionContext = {
      id: request?.id || randomUUID(),
      startedAt: now,
      loadedMemories: new Set(),
      loadedPatterns: new Set(),
      loadedFiles: new Set(),
      loadedConstraints: new Set(),
      tokensSent: 0,
      queriesMade: 0,
      lastActivity: now,
    };

    // Only add metadata if provided
    if (request?.metadata) {
      session.metadata = request.metadata;
    }

    this.activeSession = session;
    this.tracker.clear();

    // Persist if storage available
    if (this.storage && this.config.persistSessions) {
      await this.storage.saveSession(session);
    }

    return session;
  }

  /**
   * End a session
   */
  async endSession(sessionId: string): Promise<void> {
    if (this.activeSession?.id !== sessionId) {
      return;
    }

    const now = new Date().toISOString();
    this.activeSession.endedAt = now;

    // Persist final state
    if (this.storage && this.config.persistSessions) {
      await this.storage.saveSession(this.activeSession);
    }

    this.activeSession = null;
    this.tracker.clear();
  }

  /**
   * Get the active session
   */
  async getActiveSession(): Promise<SessionContext | null> {
    return this.activeSession;
  }

  /**
   * Record that a memory was loaded
   */
  async recordMemoryLoaded(
    sessionId: string,
    memoryId: string,
    tokenCount?: number
  ): Promise<void> {
    if (this.activeSession?.id !== sessionId) {
      return;
    }

    this.activeSession.loadedMemories.add(memoryId);
    this.activeSession.lastActivity = new Date().toISOString();
    
    if (tokenCount !== undefined) {
      this.activeSession.tokensSent += tokenCount;
      this.tracker.markLoaded('memory', memoryId, { tokenCount });
    } else {
      this.tracker.markLoaded('memory', memoryId);
    }

    // Persist update
    if (this.storage && this.config.persistSessions) {
      await this.storage.saveSession(this.activeSession);
    }
  }

  /**
   * Record that a pattern was loaded
   */
  async recordPatternLoaded(
    sessionId: string,
    patternId: string,
    tokenCount?: number
  ): Promise<void> {
    if (this.activeSession?.id !== sessionId) {
      return;
    }

    this.activeSession.loadedPatterns.add(patternId);
    this.activeSession.lastActivity = new Date().toISOString();
    
    if (tokenCount !== undefined) {
      this.activeSession.tokensSent += tokenCount;
      this.tracker.markLoaded('pattern', patternId, { tokenCount });
    } else {
      this.tracker.markLoaded('pattern', patternId);
    }
  }

  /**
   * Record that a file was loaded
   */
  async recordFileLoaded(
    sessionId: string,
    filePath: string,
    tokenCount?: number
  ): Promise<void> {
    if (this.activeSession?.id !== sessionId) {
      return;
    }

    this.activeSession.loadedFiles.add(filePath);
    this.activeSession.lastActivity = new Date().toISOString();
    
    if (tokenCount !== undefined) {
      this.activeSession.tokensSent += tokenCount;
      this.tracker.markLoaded('file', filePath, { tokenCount });
    } else {
      this.tracker.markLoaded('file', filePath);
    }
  }

  /**
   * Record a query was made
   */
  async recordQuery(sessionId: string, tokenCount: number): Promise<void> {
    if (this.activeSession?.id !== sessionId) {
      return;
    }

    this.activeSession.queriesMade++;
    this.activeSession.tokensSent += tokenCount;
    this.activeSession.lastActivity = new Date().toISOString();
  }

  /**
   * Get session statistics
   */
  async getSessionStats(sessionId: string): Promise<SessionStats | null> {
    const session = this.activeSession?.id === sessionId
      ? this.activeSession
      : await this.storage?.getSession(sessionId);

    if (!session) {
      return null;
    }

    const endTime = session.endedAt || new Date().toISOString();
    const durationMs = new Date(endTime).getTime() - new Date(session.startedAt).getTime();

    // Get compression level distribution from tracker
    const compressionLevelDistribution: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    const memoryMetadata = this.tracker.getAllMetadata('memory');
    for (const metadata of memoryMetadata.values()) {
      const level = metadata.compressionLevel ?? 2;
      compressionLevelDistribution[level] = (compressionLevelDistribution[level] || 0) + 1;
    }

    // Calculate deduplication efficiency
    const totalLoads = Array.from(memoryMetadata.values())
      .reduce((sum, m) => sum + m.loadCount, 0);
    const uniqueLoads = memoryMetadata.size;
    const deduplicationEfficiency = totalLoads > 0
      ? 1 - (uniqueLoads / totalLoads)
      : 0;

    // Estimate tokens saved
    let tokensSaved = 0;
    for (const metadata of memoryMetadata.values()) {
      if (metadata.loadCount > 1) {
        tokensSaved += (metadata.tokenCount || 50) * (metadata.loadCount - 1);
      }
    }

    return {
      sessionId: session.id,
      durationMs,
      memoriesLoaded: totalLoads,
      uniqueMemoriesLoaded: uniqueLoads,
      patternsLoaded: session.loadedPatterns.size,
      filesReferenced: session.loadedFiles.size,
      tokensSent: session.tokensSent,
      tokensSaved,
      deduplicationEfficiency,
      queriesMade: session.queriesMade,
      avgTokensPerQuery: session.queriesMade > 0
        ? session.tokensSent / session.queriesMade
        : 0,
      compressionLevelDistribution,
    };
  }

  /**
   * Check if session is still valid
   */
  isSessionValid(session: SessionContext): boolean {
    if (session.endedAt) {
      return false;
    }

    const now = Date.now();
    const lastActivity = new Date(session.lastActivity).getTime();
    const startTime = new Date(session.startedAt).getTime();

    // Check inactivity timeout
    if (this.config.inactivityTimeout) {
      if (now - lastActivity > this.config.inactivityTimeout) {
        return false;
      }
    }

    // Check max duration
    if (this.config.maxDuration) {
      if (now - startTime > this.config.maxDuration) {
        return false;
      }
    }

    // Check max tokens
    if (this.config.maxTokensPerSession) {
      if (session.tokensSent >= this.config.maxTokensPerSession) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get the tracker instance
   */
  getTracker(): LoadedMemoryTracker {
    return this.tracker;
  }

  /**
   * Update session metadata
   */
  async updateMetadata(
    sessionId: string,
    metadata: Partial<SessionMetadata>
  ): Promise<SessionOperationResult> {
    if (this.activeSession?.id !== sessionId) {
      return {
        success: false,
        sessionId,
        message: 'Session not found or not active',
      };
    }

    this.activeSession.metadata = {
      ...this.activeSession.metadata,
      ...metadata,
    };

    return {
      success: true,
      sessionId,
      message: 'Metadata updated',
      session: this.activeSession,
    };
  }

  /**
   * Cleanup old sessions
   */
  async cleanup(): Promise<number> {
    if (!this.storage || !this.config.autoCleanup) {
      return 0;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - (this.config.retentionDays || 7));

    return await this.storage.deleteSessionsBefore(cutoffDate.toISOString());
  }
}
