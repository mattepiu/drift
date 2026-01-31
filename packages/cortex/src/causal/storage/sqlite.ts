/**
 * SQLite Causal Storage Implementation
 * 
 * Persists causal edges to SQLite, enabling graph traversal
 * and causal inference queries.
 * 
 * @module causal/storage/sqlite
 */

import type { Database as DatabaseType } from 'better-sqlite3';
import type {
  CausalEdge,
  CausalRelation,
  CausalEvidence,
  CausalGraphStats,
  CreateCausalEdgeRequest,
  UpdateCausalEdgeRequest,
} from '../../types/causal.js';
import type {
  ICausalStorage,
  CausalQueryOptions,
  BulkOperationResult,
} from './interface.js';
import { generateCausalEdgeId } from '../../utils/id-generator.js';

/**
 * SQL for creating the causal_edges table
 */
export const CAUSAL_EDGES_SCHEMA = `
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  valid_from TEXT NOT NULL DEFAULT (datetime('now')),
  valid_until TEXT,
  confidence REAL NOT NULL DEFAULT 1.0,
  importance TEXT DEFAULT 'normal',
  last_accessed TEXT,
  access_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  created_by TEXT,
  tags TEXT,
  archived INTEGER DEFAULT 0,
  archive_reason TEXT,
  superseded_by TEXT,
  supersedes TEXT,
  last_validated TEXT
);

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
`;

/**
 * Row type from database
 */
interface CausalEdgeRow {
  id: string;
  source_id: string;
  target_id: string;
  relation: string;
  strength: number;
  evidence: string | null;
  inferred: number;
  created_at: string;
  validated_at: string | null;
  created_by: string | null;
}

/**
 * SQLite implementation of causal storage
 */
export class SQLiteCausalStorage implements ICausalStorage {
  private db: DatabaseType;
  private initialized = false;

  constructor(database: DatabaseType) {
    this.db = database;
  }

  /**
   * Initialize the storage (create tables)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.db.exec(CAUSAL_EDGES_SCHEMA);
    this.initialized = true;
  }

  /**
   * Close the storage connection
   */
  async close(): Promise<void> {
    // Database lifecycle managed by parent SQLiteClient
    this.initialized = false;
  }

  /**
   * Create a new causal edge
   */
  async createEdge(request: CreateCausalEdgeRequest): Promise<string> {
    const id = generateCausalEdgeId();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO causal_edges (id, source_id, target_id, relation, strength, evidence, inferred, created_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      request.sourceId,
      request.targetId,
      request.relation,
      request.strength ?? 1.0,
      request.evidence ? JSON.stringify(request.evidence) : null,
      request.inferred ? 1 : 0,
      now,
      request.createdBy ?? null
    );

    return id;
  }

  /**
   * Get an edge by ID
   */
  async getEdge(id: string): Promise<CausalEdge | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM causal_edges WHERE id = ?
    `);

    const row = stmt.get(id) as CausalEdgeRow | undefined;
    return row ? this.rowToEdge(row) : null;
  }

  /**
   * Update an edge
   */
  async updateEdge(id: string, updates: UpdateCausalEdgeRequest): Promise<void> {
    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (updates.strength !== undefined) {
      setClauses.push('strength = ?');
      params.push(updates.strength);
    }

    if (updates.evidence !== undefined) {
      setClauses.push('evidence = ?');
      params.push(JSON.stringify(updates.evidence));
    }

    if (updates.validatedAt !== undefined) {
      setClauses.push('validated_at = ?');
      params.push(updates.validatedAt);
    }

    if (setClauses.length === 0) return;

    params.push(id);

    const stmt = this.db.prepare(`
      UPDATE causal_edges SET ${setClauses.join(', ')} WHERE id = ?
    `);

    stmt.run(...params);
  }

  /**
   * Delete an edge
   */
  async deleteEdge(id: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM causal_edges WHERE id = ?');
    stmt.run(id);
  }

  /**
   * Bulk create edges
   */
  async bulkCreateEdges(requests: CreateCausalEdgeRequest[]): Promise<BulkOperationResult> {
    const ids: string[] = [];
    const errors: Array<{ id?: string; error: string }> = [];
    let successful = 0;
    let failed = 0;

    const stmt = this.db.prepare(`
      INSERT INTO causal_edges (id, source_id, target_id, relation, strength, evidence, inferred, created_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();

    const insertMany = this.db.transaction((reqs: CreateCausalEdgeRequest[]) => {
      for (const request of reqs) {
        try {
          const id = generateCausalEdgeId();
          stmt.run(
            id,
            request.sourceId,
            request.targetId,
            request.relation,
            request.strength ?? 1.0,
            request.evidence ? JSON.stringify(request.evidence) : null,
            request.inferred ? 1 : 0,
            now,
            request.createdBy ?? null
          );
          ids.push(id);
          successful++;
        } catch (err) {
          failed++;
          errors.push({ error: (err as Error).message });
        }
      }
    });

    insertMany(requests);

    return { successful, failed, ids, errors: errors.length > 0 ? errors : undefined };
  }

  /**
   * Bulk delete edges
   */
  async bulkDeleteEdges(ids: string[]): Promise<BulkOperationResult> {
    const stmt = this.db.prepare('DELETE FROM causal_edges WHERE id = ?');
    let successful = 0;
    let failed = 0;
    const errors: Array<{ id: string; error: string }> = [];

    const deleteMany = this.db.transaction((edgeIds: string[]) => {
      for (const id of edgeIds) {
        try {
          const result = stmt.run(id);
          if (result.changes > 0) {
            successful++;
          } else {
            failed++;
            errors.push({ id, error: 'Edge not found' });
          }
        } catch (err) {
          failed++;
          errors.push({ id, error: (err as Error).message });
        }
      }
    });

    deleteMany(ids);

    return { successful, failed, ids: [], errors: errors.length > 0 ? errors : undefined };
  }

  /**
   * Get all edges from a source memory
   */
  async getEdgesFrom(sourceId: string, options?: CausalQueryOptions): Promise<CausalEdge[]> {
    const { sql, params } = this.buildQuery(
      'SELECT * FROM causal_edges WHERE source_id = ?',
      [sourceId],
      options
    );

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as CausalEdgeRow[];
    return rows.map(row => this.rowToEdge(row));
  }

  /**
   * Get all edges to a target memory
   */
  async getEdgesTo(targetId: string, options?: CausalQueryOptions): Promise<CausalEdge[]> {
    const { sql, params } = this.buildQuery(
      'SELECT * FROM causal_edges WHERE target_id = ?',
      [targetId],
      options
    );

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as CausalEdgeRow[];
    return rows.map(row => this.rowToEdge(row));
  }

  /**
   * Get all edges for a memory (both directions)
   */
  async getEdgesFor(memoryId: string, options?: CausalQueryOptions): Promise<CausalEdge[]> {
    const { sql, params } = this.buildQuery(
      'SELECT * FROM causal_edges WHERE source_id = ? OR target_id = ?',
      [memoryId, memoryId],
      options
    );

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as CausalEdgeRow[];
    return rows.map(row => this.rowToEdge(row));
  }

  /**
   * Get edge between two specific memories
   */
  async getEdgeBetween(
    sourceId: string,
    targetId: string,
    relation?: CausalRelation
  ): Promise<CausalEdge | null> {
    let sql = 'SELECT * FROM causal_edges WHERE source_id = ? AND target_id = ?';
    const params: unknown[] = [sourceId, targetId];

    if (relation) {
      sql += ' AND relation = ?';
      params.push(relation);
    }

    sql += ' LIMIT 1';

    const stmt = this.db.prepare(sql);
    const row = stmt.get(...params) as CausalEdgeRow | undefined;
    return row ? this.rowToEdge(row) : null;
  }

  /**
   * Find edges by relation type
   */
  async findByRelation(relation: CausalRelation, options?: CausalQueryOptions): Promise<CausalEdge[]> {
    const { sql, params } = this.buildQuery(
      'SELECT * FROM causal_edges WHERE relation = ?',
      [relation],
      options
    );

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as CausalEdgeRow[];
    return rows.map(row => this.rowToEdge(row));
  }

  /**
   * Update edge strength
   */
  async updateStrength(id: string, strength: number): Promise<void> {
    const clampedStrength = Math.max(0, Math.min(1, strength));
    const stmt = this.db.prepare('UPDATE causal_edges SET strength = ? WHERE id = ?');
    stmt.run(clampedStrength, id);
  }

  /**
   * Increment edge strength
   */
  async incrementStrength(id: string, delta: number, maxStrength = 1.0): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE causal_edges 
      SET strength = MIN(?, strength + ?) 
      WHERE id = ?
    `);
    stmt.run(maxStrength, delta, id);
  }

  /**
   * Decay edge strengths over time
   */
  async decayStrengths(decayFactor: number, minStrength = 0.1): Promise<number> {
    const stmt = this.db.prepare(`
      UPDATE causal_edges 
      SET strength = MAX(?, strength * ?) 
      WHERE strength > ?
    `);
    const result = stmt.run(minStrength, decayFactor, minStrength);
    return result.changes;
  }

  /**
   * Add evidence to an edge
   */
  async addEvidence(edgeId: string, evidence: CausalEvidence): Promise<void> {
    const edge = await this.getEdge(edgeId);
    if (!edge) {
      throw new Error(`Edge not found: ${edgeId}`);
    }

    const updatedEvidence = [...edge.evidence, evidence];
    const stmt = this.db.prepare('UPDATE causal_edges SET evidence = ? WHERE id = ?');
    stmt.run(JSON.stringify(updatedEvidence), edgeId);
  }

  /**
   * Remove evidence from an edge
   */
  async removeEvidence(edgeId: string, evidenceIndex: number): Promise<void> {
    const edge = await this.getEdge(edgeId);
    if (!edge) {
      throw new Error(`Edge not found: ${edgeId}`);
    }

    if (evidenceIndex < 0 || evidenceIndex >= edge.evidence.length) {
      throw new Error(`Invalid evidence index: ${evidenceIndex}`);
    }

    const updatedEvidence = edge.evidence.filter((_, i) => i !== evidenceIndex);
    const stmt = this.db.prepare('UPDATE causal_edges SET evidence = ? WHERE id = ?');
    stmt.run(JSON.stringify(updatedEvidence), edgeId);
  }

  /**
   * Mark edge as validated
   */
  async markValidated(id: string, _validatedBy?: string): Promise<void> {
    const now = new Date().toISOString();
    
    // If validatedBy provided, we could store it in evidence or a separate field
    // For now, just update validated_at
    const stmt = this.db.prepare('UPDATE causal_edges SET validated_at = ? WHERE id = ?');
    stmt.run(now, id);
  }

  /**
   * Get edges needing validation
   */
  async getUnvalidatedEdges(options?: CausalQueryOptions): Promise<CausalEdge[]> {
    const { sql, params } = this.buildQuery(
      'SELECT * FROM causal_edges WHERE validated_at IS NULL',
      [],
      options
    );

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as CausalEdgeRow[];
    return rows.map(row => this.rowToEdge(row));
  }

  /**
   * Get graph statistics
   */
  async getStats(): Promise<CausalGraphStats> {
    // Total edges
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM causal_edges');
    const totalResult = totalStmt.get() as { count: number };

    // Edges by relation
    const byRelationStmt = this.db.prepare(`
      SELECT relation, COUNT(*) as count FROM causal_edges GROUP BY relation
    `);
    const byRelationRows = byRelationStmt.all() as Array<{ relation: string; count: number }>;
    const edgesByRelation: Record<CausalRelation, number> = {
      caused: 0,
      enabled: 0,
      prevented: 0,
      contradicts: 0,
      supersedes: 0,
      supports: 0,
      derived_from: 0,
      triggered_by: 0,
    };
    for (const row of byRelationRows) {
      edgesByRelation[row.relation as CausalRelation] = row.count;
    }

    // Inferred vs explicit
    const inferredStmt = this.db.prepare(`
      SELECT inferred, COUNT(*) as count FROM causal_edges GROUP BY inferred
    `);
    const inferredRows = inferredStmt.all() as Array<{ inferred: number; count: number }>;
    let inferredCount = 0;
    let explicitCount = 0;
    for (const row of inferredRows) {
      if (row.inferred === 1) {
        inferredCount = row.count;
      } else {
        explicitCount = row.count;
      }
    }

    // Average strength
    const avgStmt = this.db.prepare('SELECT AVG(strength) as avg FROM causal_edges');
    const avgResult = avgStmt.get() as { avg: number | null };

    // Most connected (by total edges)
    const connectedStmt = this.db.prepare(`
      SELECT memory_id, COUNT(*) as connection_count FROM (
        SELECT source_id as memory_id FROM causal_edges
        UNION ALL
        SELECT target_id as memory_id FROM causal_edges
      ) GROUP BY memory_id ORDER BY connection_count DESC LIMIT 10
    `);
    const connectedRows = connectedStmt.all() as Array<{ memory_id: string; connection_count: number }>;
    const mostConnected = connectedRows.map(row => ({
      memoryId: row.memory_id,
      connectionCount: row.connection_count,
    }));

    // Connected components (simplified - just count unique memories)
    const uniqueMemoriesStmt = this.db.prepare(`
      SELECT COUNT(DISTINCT memory_id) as count FROM (
        SELECT source_id as memory_id FROM causal_edges
        UNION
        SELECT target_id as memory_id FROM causal_edges
      )
    `);
    const uniqueResult = uniqueMemoriesStmt.get() as { count: number };

    return {
      totalEdges: totalResult.count,
      edgesByRelation,
      inferredCount,
      explicitCount,
      averageStrength: avgResult.avg ?? 0,
      connectedComponents: uniqueResult.count, // Simplified
      mostConnected,
    };
  }

  /**
   * Count edges
   */
  async countEdges(options?: CausalQueryOptions): Promise<number> {
    let sql = 'SELECT COUNT(*) as count FROM causal_edges WHERE 1=1';
    const params: unknown[] = [];

    if (options?.relationTypes?.length) {
      sql += ` AND relation IN (${options.relationTypes.map(() => '?').join(', ')})`;
      params.push(...options.relationTypes);
    }

    if (options?.minStrength !== undefined) {
      sql += ' AND strength >= ?';
      params.push(options.minStrength);
    }

    if (options?.includeInferred === false) {
      sql += ' AND inferred = 0';
    }

    const stmt = this.db.prepare(sql);
    const result = stmt.get(...params) as { count: number };
    return result.count;
  }

  /**
   * Get most connected memories
   */
  async getMostConnected(limit = 10): Promise<Array<{ memoryId: string; connectionCount: number }>> {
    const stmt = this.db.prepare(`
      SELECT memory_id, COUNT(*) as connection_count FROM (
        SELECT source_id as memory_id FROM causal_edges
        UNION ALL
        SELECT target_id as memory_id FROM causal_edges
      ) GROUP BY memory_id ORDER BY connection_count DESC LIMIT ?
    `);

    const rows = stmt.all(limit) as Array<{ memory_id: string; connection_count: number }>;
    return rows.map(row => ({
      memoryId: row.memory_id,
      connectionCount: row.connection_count,
    }));
  }

  /**
   * Delete edges for a memory
   */
  async deleteEdgesForMemory(memoryId: string): Promise<number> {
    const stmt = this.db.prepare(`
      DELETE FROM causal_edges WHERE source_id = ? OR target_id = ?
    `);
    const result = stmt.run(memoryId, memoryId);
    return result.changes;
  }

  /**
   * Delete weak edges
   */
  async deleteWeakEdges(minStrength: number): Promise<number> {
    const stmt = this.db.prepare('DELETE FROM causal_edges WHERE strength < ?');
    const result = stmt.run(minStrength);
    return result.changes;
  }

  /**
   * Delete old unvalidated edges
   */
  async deleteOldUnvalidated(olderThanDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    const cutoffStr = cutoffDate.toISOString();

    const stmt = this.db.prepare(`
      DELETE FROM causal_edges 
      WHERE validated_at IS NULL AND created_at < ?
    `);
    const result = stmt.run(cutoffStr);
    return result.changes;
  }

  // Private helpers

  private rowToEdge(row: CausalEdgeRow): CausalEdge {
    return {
      id: row.id,
      sourceId: row.source_id,
      targetId: row.target_id,
      relation: row.relation as CausalRelation,
      strength: row.strength,
      evidence: row.evidence ? JSON.parse(row.evidence) : [],
      inferred: row.inferred === 1,
      createdAt: row.created_at,
      validatedAt: row.validated_at ?? undefined,
      createdBy: row.created_by ?? undefined,
    };
  }

  private buildQuery(
    baseSql: string,
    baseParams: unknown[],
    options?: CausalQueryOptions
  ): { sql: string; params: unknown[] } {
    let sql = baseSql;
    const params = [...baseParams];

    if (options?.relationTypes?.length) {
      sql += ` AND relation IN (${options.relationTypes.map(() => '?').join(', ')})`;
      params.push(...options.relationTypes);
    }

    if (options?.minStrength !== undefined) {
      sql += ' AND strength >= ?';
      params.push(options.minStrength);
    }

    if (options?.includeInferred === false) {
      sql += ' AND inferred = 0';
    }

    // Order by
    const orderBy = options?.orderBy ?? 'created_at';
    const orderDir = options?.orderDir ?? 'desc';
    const columnMap: Record<string, string> = {
      strength: 'strength',
      createdAt: 'created_at',
      validatedAt: 'validated_at',
    };
    sql += ` ORDER BY ${columnMap[orderBy] ?? 'created_at'} ${orderDir}`;

    // Limit and offset
    if (options?.limit !== undefined) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options?.offset !== undefined) {
      sql += ' OFFSET ?';
      params.push(options.offset);
    }

    return { sql, params };
  }
}
