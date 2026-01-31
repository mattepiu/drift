/**
 * Storage Factory
 * 
 * Creates storage instances based on configuration.
 * Auto-detects the best storage backend for the environment.
 */

import type { IMemoryStorage } from './interface.js';
import { SQLiteMemoryStorage } from './sqlite/storage.js';

/**
 * Storage type
 */
export type StorageType = 'sqlite' | 'postgres';

/**
 * Storage configuration
 */
export interface StorageConfig {
  /** Storage type */
  type: StorageType;
  /** SQLite database path (for sqlite type) */
  sqlitePath?: string;
  /** PostgreSQL connection string (for postgres type) */
  postgresUrl?: string;
}

/**
 * Default SQLite path
 */
export const DEFAULT_SQLITE_PATH = '.drift/cortex/memory.db';

/**
 * Create a storage instance
 */
export async function createStorage(config: StorageConfig): Promise<IMemoryStorage> {
  switch (config.type) {
    case 'sqlite': {
      const path = config.sqlitePath || DEFAULT_SQLITE_PATH;
      const storage = new SQLiteMemoryStorage(path);
      await storage.initialize();
      return storage;
    }

    case 'postgres': {
      // PostgreSQL implementation would go here
      throw new Error('PostgreSQL storage not yet implemented');
    }

    default:
      throw new Error(`Unknown storage type: ${config.type}`);
  }
}

/**
 * Auto-detect and create the best storage for the environment
 */
export async function autoDetectStorage(): Promise<IMemoryStorage> {
  // Check for PostgreSQL connection string
  const postgresUrl = process.env['DRIFT_CORTEX_POSTGRES_URL'];
  if (postgresUrl) {
    return createStorage({ type: 'postgres', postgresUrl });
  }

  // Default to SQLite
  const sqlitePath = process.env['DRIFT_CORTEX_SQLITE_PATH'] || DEFAULT_SQLITE_PATH;
  return createStorage({ type: 'sqlite', sqlitePath });
}
