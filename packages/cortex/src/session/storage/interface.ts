/**
 * Session Storage Interface
 * 
 * Defines the contract for session persistence.
 * 
 * @module session/storage/interface
 */

import type {
  SessionContext,
  SerializableSessionContext,
  SessionStats,
} from '../../types/session-context.js';

/**
 * Session Storage Interface
 * 
 * Defines methods for persisting and retrieving sessions.
 */
export interface ISessionStorage {
  /**
   * Save a session
   */
  saveSession(session: SessionContext): Promise<void>;

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): Promise<SessionContext | null>;

  /**
   * Get all sessions
   */
  getAllSessions(): Promise<SessionContext[]>;

  /**
   * Get recent sessions
   */
  getRecentSessions(limit: number): Promise<SessionContext[]>;

  /**
   * Delete a session
   */
  deleteSession(sessionId: string): Promise<boolean>;

  /**
   * Delete sessions before a date
   */
  deleteSessionsBefore(date: string): Promise<number>;

  /**
   * Get session statistics
   */
  getSessionStats(sessionId: string): Promise<SessionStats | null>;

  /**
   * Check if a session exists
   */
  sessionExists(sessionId: string): Promise<boolean>;

  /**
   * Get active sessions (not ended)
   */
  getActiveSessions(): Promise<SessionContext[]>;

  /**
   * Close the storage connection
   */
  close(): Promise<void>;
}

/**
 * Helper to serialize SessionContext for storage
 */
export function serializeSession(session: SessionContext): SerializableSessionContext {
  const result: SerializableSessionContext = {
    id: session.id,
    startedAt: session.startedAt,
    loadedMemories: Array.from(session.loadedMemories),
    loadedPatterns: Array.from(session.loadedPatterns),
    loadedFiles: Array.from(session.loadedFiles),
    loadedConstraints: Array.from(session.loadedConstraints),
    tokensSent: session.tokensSent,
    queriesMade: session.queriesMade,
    lastActivity: session.lastActivity,
  };
  
  if (session.endedAt) {
    result.endedAt = session.endedAt;
  }
  if (session.metadata) {
    result.metadata = session.metadata;
  }
  
  return result;
}

/**
 * Helper to deserialize SessionContext from storage
 */
export function deserializeSession(data: SerializableSessionContext): SessionContext {
  const result: SessionContext = {
    id: data.id,
    startedAt: data.startedAt,
    loadedMemories: new Set(data.loadedMemories),
    loadedPatterns: new Set(data.loadedPatterns),
    loadedFiles: new Set(data.loadedFiles),
    loadedConstraints: new Set(data.loadedConstraints),
    tokensSent: data.tokensSent,
    queriesMade: data.queriesMade,
    lastActivity: data.lastActivity,
  };
  
  if (data.endedAt) {
    result.endedAt = data.endedAt;
  }
  if (data.metadata) {
    result.metadata = data.metadata;
  }
  
  return result;
}
