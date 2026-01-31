/**
 * SQLite Session Storage
 * 
 * Persists sessions to SQLite database.
 * 
 * @module session/storage/sqlite
 */

import type Database from 'better-sqlite3';
import type {
  SessionContext,
  SerializableSessionContext,
  SessionStats,
} from '../../types/session-context.js';
import type { ISessionStorage } from './interface.js';
import { serializeSession, deserializeSession } from './interface.js';

/**
 * SQLite Session Storage
 * 
 * Implements session persistence using SQLite.
 */
export class SQLiteSessionStorage implements ISessionStorage {
  private db: Database.Database;
  private initialized = false;

  constructor(db: Database.Database) {
    this.db = db;
    this.ensureTable();
  }

  /**
   * Ensure the sessions table exists
   */
  private ensureTable(): void {
    if (this.initialized) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        loaded_memories TEXT NOT NULL DEFAULT '[]',
        loaded_patterns TEXT NOT NULL DEFAULT '[]',
        loaded_files TEXT NOT NULL DEFAULT '[]',
        loaded_constraints TEXT NOT NULL DEFAULT '[]',
        tokens_sent INTEGER NOT NULL DEFAULT 0,
        queries_made INTEGER NOT NULL DEFAULT 0,
        last_activity TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
      CREATE INDEX IF NOT EXISTS idx_sessions_ended_at ON sessions(ended_at);
      CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON sessions(last_activity);
    `);

    this.initialized = true;
  }

  /**
   * Save a session
   */
  async saveSession(session: SessionContext): Promise<void> {
    const serialized = serializeSession(session);
    
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sessions (
        id, started_at, ended_at, loaded_memories, loaded_patterns,
        loaded_files, loaded_constraints, tokens_sent, queries_made,
        last_activity, metadata, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')
      )
    `);

    stmt.run(
      serialized.id,
      serialized.startedAt,
      serialized.endedAt || null,
      JSON.stringify(serialized.loadedMemories),
      JSON.stringify(serialized.loadedPatterns),
      JSON.stringify(serialized.loadedFiles),
      JSON.stringify(serialized.loadedConstraints),
      serialized.tokensSent,
      serialized.queriesMade,
      serialized.lastActivity,
      serialized.metadata ? JSON.stringify(serialized.metadata) : null
    );
  }

  /**
   * Get a session by ID
   */
  async getSession(sessionId: string): Promise<SessionContext | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM sessions WHERE id = ?
    `);

    const row = stmt.get(sessionId) as SessionRow | undefined;
    
    if (!row) {
      return null;
    }

    return this.rowToSession(row);
  }

  /**
   * Get all sessions
   */
  async getAllSessions(): Promise<SessionContext[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM sessions ORDER BY started_at DESC
    `);

    const rows = stmt.all() as SessionRow[];
    return rows.map(row => this.rowToSession(row));
  }

  /**
   * Get recent sessions
   */
  async getRecentSessions(limit: number): Promise<SessionContext[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM sessions ORDER BY last_activity DESC LIMIT ?
    `);

    const rows = stmt.all(limit) as SessionRow[];
    return rows.map(row => this.rowToSession(row));
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    const stmt = this.db.prepare(`
      DELETE FROM sessions WHERE id = ?
    `);

    const result = stmt.run(sessionId);
    return result.changes > 0;
  }

  /**
   * Delete sessions before a date
   */
  async deleteSessionsBefore(date: string): Promise<number> {
    const stmt = this.db.prepare(`
      DELETE FROM sessions WHERE ended_at IS NOT NULL AND ended_at < ?
    `);

    const result = stmt.run(date);
    return result.changes;
  }

  /**
   * Get session statistics
   */
  async getSessionStats(sessionId: string): Promise<SessionStats | null> {
    const session = await this.getSession(sessionId);
    
    if (!session) {
      return null;
    }

    const endTime = session.endedAt || new Date().toISOString();
    const durationMs = new Date(endTime).getTime() - new Date(session.startedAt).getTime();

    return {
      sessionId: session.id,
      durationMs,
      memoriesLoaded: session.loadedMemories.size,
      uniqueMemoriesLoaded: session.loadedMemories.size,
      patternsLoaded: session.loadedPatterns.size,
      filesReferenced: session.loadedFiles.size,
      tokensSent: session.tokensSent,
      tokensSaved: 0, // Would need more tracking to calculate
      deduplicationEfficiency: 0,
      queriesMade: session.queriesMade,
      avgTokensPerQuery: session.queriesMade > 0
        ? session.tokensSent / session.queriesMade
        : 0,
      compressionLevelDistribution: { 0: 0, 1: 0, 2: 0, 3: 0 },
    };
  }

  /**
   * Check if a session exists
   */
  async sessionExists(sessionId: string): Promise<boolean> {
    const stmt = this.db.prepare(`
      SELECT 1 FROM sessions WHERE id = ?
    `);

    const row = stmt.get(sessionId);
    return row !== undefined;
  }

  /**
   * Get active sessions (not ended)
   */
  async getActiveSessions(): Promise<SessionContext[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM sessions WHERE ended_at IS NULL ORDER BY last_activity DESC
    `);

    const rows = stmt.all() as SessionRow[];
    return rows.map(row => this.rowToSession(row));
  }

  /**
   * Close the storage connection
   */
  async close(): Promise<void> {
    // Database is managed externally, don't close it here
  }

  // Private helper methods

  private rowToSession(row: SessionRow): SessionContext {
    const serialized: SerializableSessionContext = {
      id: row.id,
      startedAt: row.started_at,
      loadedMemories: JSON.parse(row.loaded_memories),
      loadedPatterns: JSON.parse(row.loaded_patterns),
      loadedFiles: JSON.parse(row.loaded_files),
      loadedConstraints: JSON.parse(row.loaded_constraints),
      tokensSent: row.tokens_sent,
      queriesMade: row.queries_made,
      lastActivity: row.last_activity,
    };

    // Only add optional properties if they have values
    if (row.ended_at) {
      serialized.endedAt = row.ended_at;
    }
    if (row.metadata) {
      serialized.metadata = JSON.parse(row.metadata);
    }

    return deserializeSession(serialized);
  }
}

/**
 * Database row type
 */
interface SessionRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  loaded_memories: string;
  loaded_patterns: string;
  loaded_files: string;
  loaded_constraints: string;
  tokens_sent: number;
  queries_made: number;
  last_activity: string;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}
