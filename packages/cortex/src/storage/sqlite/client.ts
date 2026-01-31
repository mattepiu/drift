/**
 * SQLite Client Wrapper
 * 
 * Wraps better-sqlite3 with WAL mode, foreign key support, and sqlite-vec for vector search.
 */

import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

/**
 * SQLite client configuration
 */
export interface SQLiteClientConfig {
  /** Path to the database file */
  dbPath: string;
  /** Enable WAL mode (default: true) */
  walMode?: boolean;
  /** Enable foreign keys (default: true) */
  foreignKeys?: boolean;
  /** Enable vector search (default: true) */
  vectorSearch?: boolean;
  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * SQLite client wrapper
 */
export class SQLiteClient {
  private db: DatabaseType;
  private readonly config: Required<SQLiteClientConfig>;
  private _vecEnabled = false;

  constructor(config: SQLiteClientConfig) {
    this.config = {
      dbPath: config.dbPath,
      walMode: config.walMode ?? true,
      foreignKeys: config.foreignKeys ?? true,
      vectorSearch: config.vectorSearch ?? true,
      verbose: config.verbose ?? false,
    };

    this.db = new Database(this.config.dbPath, {
      verbose: this.config.verbose ? console.log : undefined,
    });

    // Configure pragmas
    if (this.config.walMode) {
      this.db.pragma('journal_mode = WAL');
    }
    if (this.config.foreignKeys) {
      this.db.pragma('foreign_keys = ON');
    }

    // Load sqlite-vec extension
    if (this.config.vectorSearch) {
      try {
        sqliteVec.load(this.db);
        this._vecEnabled = true;
      } catch (err) {
        console.warn('sqlite-vec not available:', (err as Error).message);
        this._vecEnabled = false;
      }
    }
  }

  /**
   * Check if vector search is enabled
   */
  get vecEnabled(): boolean {
    return this._vecEnabled;
  }

  /**
   * Get the underlying database instance
   */
  get database(): DatabaseType {
    return this.db;
  }

  /**
   * Execute raw SQL
   */
  exec(sql: string): void {
    this.db.exec(sql);
  }

  /**
   * Prepare a statement
   */
  prepare(sql: string): Database.Statement {
    return this.db.prepare(sql);
  }

  /**
   * Run a transaction
   */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Check if the database is open
   */
  get isOpen(): boolean {
    return this.db.open;
  }

  /**
   * Get database file path
   */
  get path(): string {
    return this.db.name;
  }
}
