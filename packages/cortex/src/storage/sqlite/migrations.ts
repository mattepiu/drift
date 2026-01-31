/**
 * SQLite Schema Migrations
 * 
 * Handles schema versioning and migrations for the Cortex database.
 */

import type { SQLiteClient } from './client.js';
import { SCHEMA, SCHEMA_VERSION } from './schema.js';

/**
 * Migration definition
 */
export interface Migration {
  version: number;
  description: string;
  up: string;
  down?: string;
}

/**
 * All migrations in order
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Initial schema',
    up: SCHEMA,
  },
  // Cortex v2 migrations
  {
    version: 2,
    description: 'Causal edges table for causal graph',
    up: `
      -- Causal edges table for tracking causal relationships between memories
      CREATE TABLE IF NOT EXISTS causal_edges (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        relation TEXT NOT NULL CHECK (relation IN (
          'caused', 'enabled', 'prevented', 'contradicts',
          'supersedes', 'supports', 'derived_from', 'triggered_by'
        )),
        strength REAL DEFAULT 1.0 CHECK (strength >= 0 AND strength <= 1),
        evidence TEXT,  -- JSON array of CausalEvidence
        inferred INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        validated_at TEXT,
        created_by TEXT,
        
        FOREIGN KEY (source_id) REFERENCES memories(id) ON DELETE CASCADE,
        FOREIGN KEY (target_id) REFERENCES memories(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_causal_source ON causal_edges(source_id);
      CREATE INDEX IF NOT EXISTS idx_causal_target ON causal_edges(target_id);
      CREATE INDEX IF NOT EXISTS idx_causal_relation ON causal_edges(relation);
      CREATE INDEX IF NOT EXISTS idx_causal_strength ON causal_edges(strength);
      CREATE INDEX IF NOT EXISTS idx_causal_inferred ON causal_edges(inferred);
      CREATE INDEX IF NOT EXISTS idx_causal_validated ON causal_edges(validated_at);
    `,
    down: `
      DROP INDEX IF EXISTS idx_causal_validated;
      DROP INDEX IF EXISTS idx_causal_inferred;
      DROP INDEX IF EXISTS idx_causal_strength;
      DROP INDEX IF EXISTS idx_causal_relation;
      DROP INDEX IF EXISTS idx_causal_target;
      DROP INDEX IF EXISTS idx_causal_source;
      DROP TABLE IF EXISTS causal_edges;
    `,
  },
  {
    version: 3,
    description: 'Session context table for token efficiency',
    up: `
      -- Session context table for tracking what has been loaded
      CREATE TABLE IF NOT EXISTS session_contexts (
        id TEXT PRIMARY KEY,
        started_at TEXT DEFAULT (datetime('now')),
        ended_at TEXT,
        loaded_memories TEXT,  -- JSON array of memory IDs
        loaded_patterns TEXT,  -- JSON array of pattern IDs
        loaded_files TEXT,     -- JSON array of file paths
        loaded_constraints TEXT, -- JSON array of constraint IDs
        tokens_sent INTEGER DEFAULT 0,
        queries_made INTEGER DEFAULT 0,
        last_activity TEXT DEFAULT (datetime('now')),
        metadata TEXT  -- JSON object with session metadata
      );

      CREATE INDEX IF NOT EXISTS idx_session_started ON session_contexts(started_at);
      CREATE INDEX IF NOT EXISTS idx_session_ended ON session_contexts(ended_at);
      CREATE INDEX IF NOT EXISTS idx_session_activity ON session_contexts(last_activity);
    `,
    down: `
      DROP INDEX IF EXISTS idx_session_activity;
      DROP INDEX IF EXISTS idx_session_ended;
      DROP INDEX IF EXISTS idx_session_started;
      DROP TABLE IF EXISTS session_contexts;
    `,
  },
  {
    version: 4,
    description: 'Validation history table for active learning',
    up: `
      -- Validation history for tracking memory validation feedback
      CREATE TABLE IF NOT EXISTS memory_validation_history (
        id TEXT PRIMARY KEY,
        memory_id TEXT NOT NULL,
        action TEXT NOT NULL CHECK (action IN ('confirmed', 'rejected', 'modified')),
        previous_confidence REAL,
        new_confidence REAL,
        feedback TEXT,
        validated_at TEXT DEFAULT (datetime('now')),
        validated_by TEXT,
        session_id TEXT,
        
        FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE,
        FOREIGN KEY (session_id) REFERENCES session_contexts(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_validation_memory ON memory_validation_history(memory_id);
      CREATE INDEX IF NOT EXISTS idx_validation_action ON memory_validation_history(action);
      CREATE INDEX IF NOT EXISTS idx_validation_time ON memory_validation_history(validated_at);
    `,
    down: `
      DROP INDEX IF EXISTS idx_validation_time;
      DROP INDEX IF EXISTS idx_validation_action;
      DROP INDEX IF EXISTS idx_validation_memory;
      DROP TABLE IF EXISTS memory_validation_history;
    `,
  },
  {
    version: 5,
    description: 'Usage history table for memory effectiveness tracking',
    up: `
      -- Usage history for tracking memory effectiveness
      CREATE TABLE IF NOT EXISTS memory_usage_history (
        id TEXT PRIMARY KEY,
        memory_id TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK (outcome IN ('accepted', 'modified', 'rejected')),
        context TEXT,  -- JSON with generation context
        used_at TEXT DEFAULT (datetime('now')),
        session_id TEXT,
        
        FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE,
        FOREIGN KEY (session_id) REFERENCES session_contexts(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_usage_memory ON memory_usage_history(memory_id);
      CREATE INDEX IF NOT EXISTS idx_usage_outcome ON memory_usage_history(outcome);
      CREATE INDEX IF NOT EXISTS idx_usage_time ON memory_usage_history(used_at);
    `,
    down: `
      DROP INDEX IF EXISTS idx_usage_time;
      DROP INDEX IF EXISTS idx_usage_outcome;
      DROP INDEX IF EXISTS idx_usage_memory;
      DROP TABLE IF EXISTS memory_usage_history;
    `,
  },
];

/**
 * Run migrations to bring database to current version
 */
export async function runMigrations(client: SQLiteClient): Promise<void> {
  const db = client.database;

  // Create migrations table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT DEFAULT (datetime('now')),
      description TEXT
    );
  `);

  // Get current version
  const currentVersion = db.prepare(
    'SELECT MAX(version) as version FROM schema_migrations'
  ).get() as { version: number | null };

  const version = currentVersion?.version ?? 0;

  // Apply pending migrations
  for (const migration of MIGRATIONS) {
    if (migration.version > version) {
      console.log(`Applying migration ${migration.version}: ${migration.description}`);

      client.transaction(() => {
        db.exec(migration.up);
        db.prepare(
          'INSERT INTO schema_migrations (version, description) VALUES (?, ?)'
        ).run(migration.version, migration.description);
      });
    }
  }
}

/**
 * Get current schema version
 */
export function getSchemaVersion(client: SQLiteClient): number {
  const db = client.database;

  try {
    const result = db.prepare(
      'SELECT MAX(version) as version FROM schema_migrations'
    ).get() as { version: number | null };

    return result?.version ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Check if migrations are needed
 */
export function needsMigration(client: SQLiteClient): boolean {
  const currentVersion = getSchemaVersion(client);
  return currentVersion < SCHEMA_VERSION;
}
