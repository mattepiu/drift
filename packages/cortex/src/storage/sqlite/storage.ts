/**
 * SQLite Memory Storage Implementation
 * 
 * Full implementation of IMemoryStorage using SQLite with sqlite-vec for vector search.
 */

import type { IMemoryStorage, QueryOptions, Citation, RelationshipType } from '../interface.js';
import type { Memory, MemoryType, MemoryQuery, MemorySummary } from '../../types/index.js';
import { SQLiteClient } from './client.js';
import { runMigrations } from './migrations.js';
import { VECTOR_SCHEMA } from './schema.js';
import * as Q from './queries.js';
import { generateId } from '../../utils/id-generator.js';

/**
 * SQLite implementation of memory storage
 */
export class SQLiteMemoryStorage implements IMemoryStorage {
  private client: SQLiteClient;
  private scopeFilters: { recordedBefore?: string; validAt?: string } = {};
  private vecEnabled = false;

  constructor(dbPath: string) {
    this.client = new SQLiteClient({ dbPath });
  }

  /**
   * Initialize the storage
   */
  async initialize(): Promise<void> {
    // Run migrations
    await runMigrations(this.client);

    // Check if sqlite-vec is available from client
    this.vecEnabled = this.client.vecEnabled;

    // Create vector table if extension is loaded
    if (this.vecEnabled) {
      try {
        this.client.exec(VECTOR_SCHEMA);
      } catch (err) {
        console.warn('Failed to create vector table:', (err as Error).message);
        this.vecEnabled = false;
      }
    }
  }

  /**
   * Close the storage
   */
  async close(): Promise<void> {
    this.client.close();
  }

  /**
   * Create a new memory
   */
  async create(memory: Memory): Promise<string> {
    const id = memory.id || generateId();
    const now = new Date().toISOString();

    const stmt = this.client.prepare(Q.INSERT_MEMORY);
    stmt.run(
      id,
      memory.type,
      JSON.stringify(memory),
      memory.summary || this.generateSummary(memory),
      memory.transactionTime?.recordedAt || now,
      memory.validTime?.validFrom || now,
      memory.confidence ?? 1.0,
      memory.importance ?? 'normal',
      memory.createdBy ?? null,
      memory.tags ? JSON.stringify(memory.tags) : null,
      memory.createdAt || now,
      memory.updatedAt || now,
      memory.accessCount ?? 0
    );

    return id;
  }

  /**
   * Read a memory by ID
   */
  async read(id: string): Promise<Memory | null> {
    let sql = Q.GET_MEMORY;
    const params: unknown[] = [id];

    // Add scope filters
    const scopeClause = this.buildScopeClause();
    if (scopeClause) {
      sql = sql.replace('AND archived = 0', `AND archived = 0 ${scopeClause}`);
    }

    const stmt = this.client.prepare(sql);
    const row = stmt.get(...params) as { id: string; content: string } | undefined;

    if (row) {
      // Update access tracking
      this.client.prepare(Q.UPDATE_ACCESS).run(new Date().toISOString(), id);
      const memory = JSON.parse(row.content) as Memory;
      memory.id = row.id;
      return memory;
    }

    return null;
  }

  /**
   * Update a memory
   */
  async update(id: string, updates: Partial<Memory>): Promise<void> {
    const existing = await this.read(id);
    if (!existing) {
      throw new Error(`Memory not found: ${id}`);
    }

    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    const stmt = this.client.prepare(Q.UPDATE_MEMORY);
    stmt.run(
      JSON.stringify(updated),
      updated.summary,
      updated.confidence,
      updated.importance,
      updated.tags ? JSON.stringify(updated.tags) : null,
      updated.updatedAt,
      updated.lastValidated ?? null,
      id
    );
  }

  /**
   * Delete a memory
   */
  async delete(id: string): Promise<void> {
    const stmt = this.client.prepare(Q.SOFT_DELETE_MEMORY);
    stmt.run(new Date().toISOString(), id);
  }

  /**
   * Bulk create memories
   */
  async bulkCreate(memories: Memory[]): Promise<string[]> {
    const ids: string[] = [];

    this.client.transaction(() => {
      for (const memory of memories) {
        const id = this.createSync(memory);
        ids.push(id);
      }
    });

    return ids;
  }

  /**
   * Bulk update memories
   */
  async bulkUpdate(updates: Array<{ id: string; updates: Partial<Memory> }>): Promise<void> {
    this.client.transaction(() => {
      for (const { id, updates: memoryUpdates } of updates) {
        this.updateSync(id, memoryUpdates);
      }
    });
  }

  /**
   * Bulk delete memories
   */
  async bulkDelete(ids: string[]): Promise<void> {
    const stmt = this.client.prepare(Q.SOFT_DELETE_MEMORY);
    const now = new Date().toISOString();

    this.client.transaction(() => {
      for (const id of ids) {
        stmt.run(now, id);
      }
    });
  }

  /**
   * Find memories by type
   */
  async findByType(type: MemoryType, options?: QueryOptions): Promise<Memory[]> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const stmt = this.client.prepare(Q.FIND_BY_TYPE);
    const rows = stmt.all(type, limit, offset) as Array<{ id: string; content: string }>;

    return rows.map(r => {
      const memory = JSON.parse(r.content) as Memory;
      memory.id = r.id;
      return memory;
    });
  }

  /**
   * Find memories by pattern
   */
  async findByPattern(patternId: string): Promise<Memory[]> {
    const stmt = this.client.prepare(Q.FIND_BY_PATTERN);
    const rows = stmt.all(patternId) as Array<{ id: string; content: string }>;

    return rows.map(r => {
      const memory = JSON.parse(r.content) as Memory;
      memory.id = r.id;
      return memory;
    });
  }

  /**
   * Find memories by constraint
   */
  async findByConstraint(constraintId: string): Promise<Memory[]> {
    const stmt = this.client.prepare(Q.FIND_BY_CONSTRAINT);
    const rows = stmt.all(constraintId) as Array<{ id: string; content: string }>;

    return rows.map(r => {
      const memory = JSON.parse(r.content) as Memory;
      memory.id = r.id;
      return memory;
    });
  }

  /**
   * Find memories by file
   */
  async findByFile(filePath: string): Promise<Memory[]> {
    const stmt = this.client.prepare(Q.FIND_BY_FILE);
    const rows = stmt.all(filePath) as Array<{ id: string; content: string }>;

    return rows.map(r => {
      const memory = JSON.parse(r.content) as Memory;
      memory.id = r.id;
      return memory;
    });
  }

  /**
   * Find memories by function
   */
  async findByFunction(functionId: string): Promise<Memory[]> {
    const stmt = this.client.prepare(Q.FIND_BY_FUNCTION);
    const rows = stmt.all(functionId) as Array<{ id: string; content: string }>;

    return rows.map(r => {
      const memory = JSON.parse(r.content) as Memory;
      memory.id = r.id;
      return memory;
    });
  }

  /**
   * Search memories with complex query
   */
  async search(query: MemoryQuery): Promise<Memory[]> {
    const conditions: string[] = ['archived = 0'];
    const params: unknown[] = [];

    if (query.types?.length) {
      conditions.push(`type IN (${query.types.map(() => '?').join(', ')})`);
      params.push(...query.types);
    }

    if (query.minConfidence !== undefined) {
      conditions.push('confidence >= ?');
      params.push(query.minConfidence);
    }

    if (query.maxConfidence !== undefined) {
      conditions.push('confidence <= ?');
      params.push(query.maxConfidence);
    }

    if (query.importance?.length) {
      conditions.push(`importance IN (${query.importance.map(() => '?').join(', ')})`);
      params.push(...query.importance);
    }

    if (query.minDate) {
      conditions.push('created_at >= ?');
      params.push(query.minDate);
    }

    if (query.maxDate) {
      conditions.push('created_at <= ?');
      params.push(query.maxDate);
    }

    if (query.minAccessCount !== undefined) {
      conditions.push('access_count >= ?');
      params.push(query.minAccessCount);
    }

    // Add scope filters
    const scopeClause = this.buildScopeClause();
    if (scopeClause) {
      conditions.push(scopeClause.replace(/^AND /, ''));
    }

    // Map orderBy to actual column names
    const columnMap: Record<string, string> = {
      'accessCount': 'access_count',
      'createdAt': 'created_at',
      'updatedAt': 'updated_at',
      'lastAccessed': 'last_accessed',
      'confidence': 'confidence',
      'importance': 'importance',
    };
    const orderByColumn = columnMap[query.orderBy || ''] || query.orderBy || 'created_at';
    const orderDir = query.orderDir || 'desc';
    const limit = query.limit || 100;
    const offset = query.offset || 0;

    const sql = `
      SELECT id, content FROM memories
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${orderByColumn} ${orderDir}
      LIMIT ? OFFSET ?
    `;

    params.push(limit, offset);

    const stmt = this.client.prepare(sql);
    const rows = stmt.all(...params) as Array<{ id: string; content: string }>;

    return rows.map(r => {
      const memory = JSON.parse(r.content) as Memory;
      memory.id = r.id; // Ensure ID is always present
      return memory;
    });
  }

  /**
   * Similarity search using vector embeddings
   */
  async similaritySearch(embedding: number[], limit: number, threshold = 0.7): Promise<Memory[]> {
    if (!this.vecEnabled) {
      // Fallback to recency-based search when vec is not available
      console.warn('Vector search not available, falling back to recency search');
      return this.search({ 
        limit, 
        orderBy: 'last_accessed',
        orderDir: 'desc'
      });
    }

    // sqlite-vec uses vec_distance_cosine for similarity
    // Lower distance = more similar, so we use 1 - threshold for distance
    const maxDistance = 1 - threshold;
    
    const sql = `
      SELECT m.id, m.content
      FROM memory_embeddings e
      JOIN memory_embedding_link l ON l.embedding_rowid = e.rowid
      JOIN memories m ON m.id = l.memory_id
      WHERE m.archived = 0
        AND vec_distance_cosine(e.embedding, ?) < ?
      ORDER BY vec_distance_cosine(e.embedding, ?)
      LIMIT ?
    `;

    // sqlite-vec expects embeddings as JSON array or blob
    const embeddingJson = JSON.stringify(embedding);
    
    try {
      const stmt = this.client.prepare(sql);
      const rows = stmt.all(embeddingJson, maxDistance, embeddingJson, limit) as Array<{ id: string; content: string }>;
      return rows.map(r => {
        const memory = JSON.parse(r.content) as Memory;
        memory.id = r.id;
        return memory;
      });
    } catch (err) {
      console.warn('Vector search failed:', (err as Error).message);
      return this.search({ limit });
    }
  }

  /**
   * Upsert embedding for a memory
   */
  async upsertEmbedding(memoryId: string, embedding: number[]): Promise<void> {
    if (!this.vecEnabled) {
      return;
    }

    const embeddingJson = JSON.stringify(embedding);

    this.client.transaction(() => {
      // Check if embedding already exists
      const existing = this.client.prepare(
        'SELECT embedding_rowid FROM memory_embedding_link WHERE memory_id = ?'
      ).get(memoryId) as { embedding_rowid: number } | undefined;

      if (existing) {
        // Update existing embedding
        this.client.prepare(
          'UPDATE memory_embeddings SET embedding = ? WHERE rowid = ?'
        ).run(embeddingJson, existing.embedding_rowid);
      } else {
        // Insert new embedding
        const result = this.client.prepare(
          'INSERT INTO memory_embeddings (embedding) VALUES (?)'
        ).run(embeddingJson);
        
        // Link to memory
        this.client.prepare(
          'INSERT INTO memory_embedding_link (memory_id, embedding_rowid) VALUES (?, ?)'
        ).run(memoryId, result.lastInsertRowid);
      }
    });
  }

  /**
   * Scope queries to a specific transaction time
   */
  asOf(timestamp: string): IMemoryStorage {
    const scoped = new SQLiteMemoryStorage(this.client.path);
    scoped.client = this.client;
    scoped.scopeFilters = { ...this.scopeFilters, recordedBefore: timestamp };
    scoped.vecEnabled = this.vecEnabled;
    return scoped;
  }

  /**
   * Scope queries to a specific valid time
   */
  validAt(timestamp: string): IMemoryStorage {
    const scoped = new SQLiteMemoryStorage(this.client.path);
    scoped.client = this.client;
    scoped.scopeFilters = { ...this.scopeFilters, validAt: timestamp };
    scoped.vecEnabled = this.vecEnabled;
    return scoped;
  }

  /**
   * Add a relationship between memories
   */
  async addRelationship(sourceId: string, targetId: string, type: RelationshipType): Promise<void> {
    const stmt = this.client.prepare(Q.ADD_RELATIONSHIP);
    stmt.run(sourceId, targetId, type, 1.0);
  }

  /**
   * Remove a relationship between memories
   */
  async removeRelationship(sourceId: string, targetId: string, type: RelationshipType): Promise<void> {
    const stmt = this.client.prepare(Q.REMOVE_RELATIONSHIP);
    stmt.run(sourceId, targetId, type);
  }

  /**
   * Get related memories
   */
  async getRelated(memoryId: string, type?: RelationshipType, _depth = 1): Promise<Memory[]> {
    const sql = type ? Q.GET_RELATED_BY_TYPE : Q.GET_RELATED;
    const stmt = this.client.prepare(sql);
    const params = type ? [memoryId, type] : [memoryId];
    const rows = stmt.all(...params) as Array<{ id: string; content: string }>;

    return rows.map(r => {
      const memory = JSON.parse(r.content) as Memory;
      memory.id = r.id;
      return memory;
    });
  }

  /**
   * Link memory to pattern
   */
  async linkToPattern(memoryId: string, patternId: string): Promise<void> {
    const stmt = this.client.prepare(Q.LINK_PATTERN);
    stmt.run(memoryId, patternId);
  }

  /**
   * Link memory to constraint
   */
  async linkToConstraint(memoryId: string, constraintId: string): Promise<void> {
    const stmt = this.client.prepare(Q.LINK_CONSTRAINT);
    stmt.run(memoryId, constraintId);
  }

  /**
   * Link memory to file
   */
  async linkToFile(memoryId: string, filePath: string, citation?: Citation): Promise<void> {
    const stmt = this.client.prepare(Q.LINK_FILE);
    stmt.run(
      memoryId,
      filePath,
      citation?.lineStart ?? null,
      citation?.lineEnd ?? null,
      citation?.contentHash ?? null
    );
  }

  /**
   * Link memory to function
   */
  async linkToFunction(memoryId: string, functionId: string): Promise<void> {
    const stmt = this.client.prepare(Q.LINK_FUNCTION);
    stmt.run(memoryId, functionId);
  }

  /**
   * Count memories
   */
  async count(filter?: Partial<MemoryQuery>): Promise<number> {
    if (!filter) {
      const stmt = this.client.prepare(Q.COUNT_TOTAL);
      const result = stmt.get() as { count: number };
      return result.count;
    }

    const memories = await this.search({ ...filter, limit: 100000 });
    return memories.length;
  }

  /**
   * Count memories by type
   */
  async countByType(): Promise<Record<MemoryType, number>> {
    const stmt = this.client.prepare(Q.COUNT_BY_TYPE);
    const rows = stmt.all() as Array<{ type: MemoryType; count: number }>;

    const result: Record<MemoryType, number> = {
      core: 0,
      tribal: 0,
      procedural: 0,
      semantic: 0,
      episodic: 0,
      pattern_rationale: 0,
      constraint_override: 0,
      decision_context: 0,
      code_smell: 0,
    };

    for (const row of rows) {
      result[row.type] = row.count;
    }

    return result;
  }

  /**
   * Get memory summaries
   */
  async getSummaries(filter?: Partial<MemoryQuery>): Promise<MemorySummary[]> {
    const limit = filter?.limit ?? 100;
    const offset = filter?.offset ?? 0;

    const stmt = this.client.prepare(Q.GET_SUMMARIES);
    const rows = stmt.all(limit, offset) as MemorySummary[];

    return rows;
  }

  /**
   * Vacuum the database
   */
  async vacuum(): Promise<void> {
    this.client.exec('VACUUM');
  }

  /**
   * Create a checkpoint
   */
  async checkpoint(): Promise<void> {
    this.client.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  }

  // Private helpers

  private createSync(memory: Memory): string {
    const id = memory.id || generateId();
    const now = new Date().toISOString();

    const stmt = this.client.prepare(Q.INSERT_MEMORY);
    stmt.run(
      id,
      memory.type,
      JSON.stringify(memory),
      memory.summary || this.generateSummary(memory),
      memory.transactionTime?.recordedAt || now,
      memory.validTime?.validFrom || now,
      memory.confidence ?? 1.0,
      memory.importance ?? 'normal',
      memory.createdBy ?? null,
      memory.tags ? JSON.stringify(memory.tags) : null,
      memory.createdAt || now,
      memory.updatedAt || now,
      memory.accessCount ?? 0
    );

    return id;
  }

  private updateSync(id: string, updates: Partial<Memory>): void {
    const stmt = this.client.prepare(Q.GET_MEMORY);
    const row = stmt.get(id) as { content: string } | undefined;

    if (!row) {
      throw new Error(`Memory not found: ${id}`);
    }

    const existing = JSON.parse(row.content) as Memory;
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };

    const updateStmt = this.client.prepare(Q.UPDATE_MEMORY);
    updateStmt.run(
      JSON.stringify(updated),
      updated.summary,
      updated.confidence,
      updated.importance,
      updated.tags ? JSON.stringify(updated.tags) : null,
      updated.updatedAt,
      updated.lastValidated ?? null,
      id
    );
  }

  private buildScopeClause(): string {
    const clauses: string[] = [];

    if (this.scopeFilters.recordedBefore) {
      clauses.push(`recorded_at <= '${this.scopeFilters.recordedBefore}'`);
    }

    if (this.scopeFilters.validAt) {
      clauses.push(`valid_from <= '${this.scopeFilters.validAt}'`);
      clauses.push(`(valid_until IS NULL OR valid_until > '${this.scopeFilters.validAt}')`);
    }

    return clauses.length > 0 ? `AND ${clauses.join(' AND ')}` : '';
  }

  private generateSummary(memory: Memory): string {
    switch (memory.type) {
      case 'tribal':
        return `⚠️ ${memory.topic}: ${memory.knowledge?.slice(0, 50)}...`;
      case 'procedural':
        return `📋 ${memory.name}: ${memory.steps?.length || 0} steps`;
      case 'semantic':
        return `💡 ${memory.topic}: ${memory.knowledge?.slice(0, 50)}...`;
      case 'pattern_rationale':
        return `🎯 ${memory.patternName}: ${memory.rationale?.slice(0, 50)}...`;
      case 'constraint_override':
        return `✅ Override: ${memory.constraintName}`;
      case 'code_smell':
        return `🚫 Avoid: ${memory.name}`;
      case 'decision_context':
        return `📝 Decision: ${memory.decisionSummary?.slice(0, 50)}...`;
      case 'episodic':
        return `💭 ${memory.context?.focus || 'Interaction'}`;
      case 'core':
        return `🏠 ${memory.project?.name || 'Project'}`;
      default:
        return (memory as Memory).summary || 'Memory';
    }
  }
}
