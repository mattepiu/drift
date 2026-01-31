/**
 * Memory Storage Interface
 * 
 * Defines the contract for memory storage implementations.
 * Supports CRUD operations, vector search, bitemporal queries,
 * and relationship management.
 */

import type { Memory, MemoryType, MemoryQuery, MemorySummary } from '../types/index.js';

/**
 * Query options for storage operations
 */
export interface QueryOptions {
  /** Maximum results to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Field to order by */
  orderBy?: string;
  /** Order direction */
  orderDir?: 'asc' | 'desc';
  /** Minimum confidence threshold */
  minConfidence?: number;
  /** Include archived memories */
  includeArchived?: boolean;
}

/**
 * Citation information for file links
 */
export interface Citation {
  /** Starting line number */
  lineStart?: number;
  /** Ending line number */
  lineEnd?: number;
  /** Content hash for drift detection */
  contentHash?: string;
}

/**
 * Relationship types between memories
 */
export type RelationshipType = 'supersedes' | 'supports' | 'contradicts' | 'related' | 'derived_from';

/**
 * Memory storage interface
 * 
 * All storage implementations must implement this interface.
 */
export interface IMemoryStorage {
  // Lifecycle
  /** Initialize the storage (create tables, load extensions) */
  initialize(): Promise<void>;
  /** Close the storage connection */
  close(): Promise<void>;

  // CRUD Operations
  /** Create a new memory */
  create(memory: Memory): Promise<string>;
  /** Read a memory by ID */
  read(id: string): Promise<Memory | null>;
  /** Update a memory */
  update(id: string, updates: Partial<Memory>): Promise<void>;
  /** Delete a memory */
  delete(id: string): Promise<void>;

  // Bulk Operations
  /** Create multiple memories */
  bulkCreate(memories: Memory[]): Promise<string[]>;
  /** Update multiple memories */
  bulkUpdate(updates: Array<{ id: string; updates: Partial<Memory> }>): Promise<void>;
  /** Delete multiple memories */
  bulkDelete(ids: string[]): Promise<void>;

  // Query Operations
  /** Find memories by type */
  findByType(type: MemoryType, options?: QueryOptions): Promise<Memory[]>;
  /** Find memories linked to a pattern */
  findByPattern(patternId: string): Promise<Memory[]>;
  /** Find memories linked to a constraint */
  findByConstraint(constraintId: string): Promise<Memory[]>;
  /** Find memories linked to a file */
  findByFile(filePath: string): Promise<Memory[]>;
  /** Find memories linked to a function */
  findByFunction(functionId: string): Promise<Memory[]>;
  /** Search memories with complex query */
  search(query: MemoryQuery): Promise<Memory[]>;

  // Vector Operations
  /** Search by vector similarity */
  similaritySearch(embedding: number[], limit: number, threshold?: number): Promise<Memory[]>;
  /** Insert or update embedding for a memory */
  upsertEmbedding(memoryId: string, embedding: number[]): Promise<void>;

  // Bitemporal Operations
  /** Scope queries to a specific transaction time */
  asOf(timestamp: string): IMemoryStorage;
  /** Scope queries to a specific valid time */
  validAt(timestamp: string): IMemoryStorage;

  // Relationship Operations
  /** Add a relationship between memories */
  addRelationship(sourceId: string, targetId: string, type: RelationshipType): Promise<void>;
  /** Remove a relationship between memories */
  removeRelationship(sourceId: string, targetId: string, type: RelationshipType): Promise<void>;
  /** Get related memories */
  getRelated(memoryId: string, type?: RelationshipType, depth?: number): Promise<Memory[]>;

  // Link Operations
  /** Link a memory to a pattern */
  linkToPattern(memoryId: string, patternId: string): Promise<void>;
  /** Link a memory to a constraint */
  linkToConstraint(memoryId: string, constraintId: string): Promise<void>;
  /** Link a memory to a file */
  linkToFile(memoryId: string, filePath: string, citation?: Citation): Promise<void>;
  /** Link a memory to a function */
  linkToFunction(memoryId: string, functionId: string): Promise<void>;

  // Aggregation
  /** Count memories matching filter */
  count(filter?: Partial<MemoryQuery>): Promise<number>;
  /** Count memories by type */
  countByType(): Promise<Record<MemoryType, number>>;
  /** Get memory summaries */
  getSummaries(filter?: Partial<MemoryQuery>): Promise<MemorySummary[]>;

  // Maintenance
  /** Vacuum the database */
  vacuum(): Promise<void>;
  /** Create a checkpoint */
  checkpoint(): Promise<void>;
}
