/**
 * L2 SQLite Cache
 * 
 * Persistent SQLite cache for computed embeddings.
 * Slower than L1 but survives restarts.
 * 
 * @module embeddings/cache/l2-sqlite
 */

import type Database from 'better-sqlite3';

/**
 * L2 cache configuration
 */
export interface L2CacheConfig {
  /** Table name for cache */
  tableName: string;
  /** Maximum entries (0 = unlimited) */
  maxEntries: number;
  /** TTL in milliseconds (0 = no expiry) */
  ttl: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: L2CacheConfig = {
  tableName: 'embedding_cache',
  maxEntries: 100000,
  ttl: 0, // No expiry by default
};

/**
 * Cache statistics
 */
export interface L2CacheStats {
  /** Number of entries */
  size: number;
  /** Maximum size */
  maxSize: number;
  /** Total bytes used (approximate) */
  bytesUsed: number;
  /** Cache hits */
  hits: number;
  /** Cache misses */
  misses: number;
  /** Hit rate */
  hitRate: number;
}

/**
 * L2 SQLite Cache for persistent embedding storage
 */
export class L2SQLiteCache {
  private db: Database.Database | null = null;
  private config: L2CacheConfig;
  private hits = 0;
  private misses = 0;
  private _initialized = false;

  constructor(config?: Partial<L2CacheConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize with database connection
   */
  async initialize(db: Database.Database): Promise<void> {
    this.db = db;
    await this.ensureTable();
    this._initialized = true;
  }

  /**
   * Check if cache is initialized
   */
  get initialized(): boolean {
    return this._initialized;
  }

  /**
   * Get embedding from cache
   */
  async get(hash: string): Promise<number[] | null> {
    if (!this.db) return null;

    try {
      const row = this.db.prepare(`
        SELECT embedding, created_at FROM ${this.config.tableName}
        WHERE hash = ?
      `).get(hash) as { embedding: Buffer; created_at: string } | undefined;

      if (!row) {
        this.misses++;
        return null;
      }

      // Check TTL
      if (this.config.ttl > 0) {
        const createdAt = new Date(row.created_at).getTime();
        if (Date.now() - createdAt > this.config.ttl) {
          await this.delete(hash);
          this.misses++;
          return null;
        }
      }

      // Update access time
      this.db.prepare(`
        UPDATE ${this.config.tableName}
        SET last_access = datetime('now'), access_count = access_count + 1
        WHERE hash = ?
      `).run(hash);

      this.hits++;
      return this.deserializeEmbedding(row.embedding);
    } catch {
      this.misses++;
      return null;
    }
  }

  /**
   * Set embedding in cache
   */
  async set(hash: string, embedding: number[]): Promise<void> {
    if (!this.db) return;

    try {
      // Check capacity
      if (this.config.maxEntries > 0) {
        const count = this.getCount();
        if (count >= this.config.maxEntries) {
          await this.evictLRU(Math.ceil(this.config.maxEntries * 0.1)); // Evict 10%
        }
      }

      const serialized = this.serializeEmbedding(embedding);

      this.db.prepare(`
        INSERT OR REPLACE INTO ${this.config.tableName}
        (hash, embedding, dimensions, created_at, last_access, access_count)
        VALUES (?, ?, ?, datetime('now'), datetime('now'), 1)
      `).run(hash, serialized, embedding.length);
    } catch (error) {
      console.error('L2 cache set error:', error);
    }
  }

  /**
   * Check if hash exists in cache
   */
  async has(hash: string): Promise<boolean> {
    if (!this.db) return false;

    try {
      const row = this.db.prepare(`
        SELECT 1 FROM ${this.config.tableName} WHERE hash = ?
      `).get(hash);

      return !!row;
    } catch {
      return false;
    }
  }

  /**
   * Delete entry from cache
   */
  async delete(hash: string): Promise<boolean> {
    if (!this.db) return false;

    try {
      const result = this.db.prepare(`
        DELETE FROM ${this.config.tableName} WHERE hash = ?
      `).run(hash);

      return result.changes > 0;
    } catch {
      return false;
    }
  }

  /**
   * Clear all entries
   */
  async clear(): Promise<void> {
    if (!this.db) return;

    try {
      this.db.prepare(`DELETE FROM ${this.config.tableName}`).run();
      this.hits = 0;
      this.misses = 0;
    } catch (error) {
      console.error('L2 cache clear error:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<L2CacheStats> {
    const size = this.getCount();
    const bytesUsed = this.getBytesUsed();
    const total = this.hits + this.misses;

    return {
      size,
      maxSize: this.config.maxEntries,
      bytesUsed,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  /**
   * Get multiple embeddings at once
   */
  async getBatch(hashes: string[]): Promise<Map<string, number[]>> {
    const result = new Map<string, number[]>();
    if (!this.db || hashes.length === 0) return result;

    try {
      const placeholders = hashes.map(() => '?').join(',');
      const rows = this.db.prepare(`
        SELECT hash, embedding FROM ${this.config.tableName}
        WHERE hash IN (${placeholders})
      `).all(...hashes) as Array<{ hash: string; embedding: Buffer }>;

      for (const row of rows) {
        result.set(row.hash, this.deserializeEmbedding(row.embedding));
        this.hits++;
      }

      this.misses += hashes.length - rows.length;
    } catch (error) {
      console.error('L2 cache getBatch error:', error);
    }

    return result;
  }

  /**
   * Set multiple embeddings at once
   */
  async setBatch(entries: Array<{ hash: string; embedding: number[] }>): Promise<void> {
    if (!this.db || entries.length === 0) return;

    try {
      const insert = this.db.prepare(`
        INSERT OR REPLACE INTO ${this.config.tableName}
        (hash, embedding, dimensions, created_at, last_access, access_count)
        VALUES (?, ?, ?, datetime('now'), datetime('now'), 1)
      `);

      const transaction = this.db.transaction((items: typeof entries) => {
        for (const { hash, embedding } of items) {
          insert.run(hash, this.serializeEmbedding(embedding), embedding.length);
        }
      });

      transaction(entries);
    } catch (error) {
      console.error('L2 cache setBatch error:', error);
    }
  }

  /**
   * Evict expired entries
   */
  async evictExpired(): Promise<number> {
    if (!this.db || this.config.ttl === 0) return 0;

    try {
      const cutoff = new Date(Date.now() - this.config.ttl).toISOString();
      const result = this.db.prepare(`
        DELETE FROM ${this.config.tableName}
        WHERE created_at < ?
      `).run(cutoff);

      return result.changes;
    } catch {
      return 0;
    }
  }

  // Private helpers

  private async ensureTable(): Promise<void> {
    if (!this.db) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.config.tableName} (
        hash TEXT PRIMARY KEY,
        embedding BLOB NOT NULL,
        dimensions INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        last_access TEXT DEFAULT (datetime('now')),
        access_count INTEGER DEFAULT 1
      );

      CREATE INDEX IF NOT EXISTS idx_${this.config.tableName}_last_access
      ON ${this.config.tableName}(last_access);

      CREATE INDEX IF NOT EXISTS idx_${this.config.tableName}_created_at
      ON ${this.config.tableName}(created_at);
    `);
  }

  private getCount(): number {
    if (!this.db) return 0;

    try {
      const row = this.db.prepare(`
        SELECT COUNT(*) as count FROM ${this.config.tableName}
      `).get() as { count: number };

      return row.count;
    } catch {
      return 0;
    }
  }

  private getBytesUsed(): number {
    if (!this.db) return 0;

    try {
      const row = this.db.prepare(`
        SELECT SUM(LENGTH(embedding)) as bytes FROM ${this.config.tableName}
      `).get() as { bytes: number | null };

      return row.bytes ?? 0;
    } catch {
      return 0;
    }
  }

  private async evictLRU(count: number): Promise<void> {
    if (!this.db) return;

    try {
      this.db.prepare(`
        DELETE FROM ${this.config.tableName}
        WHERE hash IN (
          SELECT hash FROM ${this.config.tableName}
          ORDER BY last_access ASC
          LIMIT ?
        )
      `).run(count);
    } catch (error) {
      console.error('L2 cache evictLRU error:', error);
    }
  }

  private serializeEmbedding(embedding: number[]): Buffer {
    // Store as Float32Array for efficiency
    const float32 = new Float32Array(embedding);
    return Buffer.from(float32.buffer);
  }

  private deserializeEmbedding(buffer: Buffer): number[] {
    const float32 = new Float32Array(
      buffer.buffer,
      buffer.byteOffset,
      buffer.length / 4
    );
    return Array.from(float32);
  }
}
