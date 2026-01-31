/**
 * Causal Storage Interface
 * 
 * Defines the contract for causal edge persistence.
 * Implementations handle storing and retrieving causal
 * relationships between memories.
 * 
 * @module causal/storage/interface
 */

import type {
  CausalEdge,
  CausalRelation,
  CausalEvidence,
  CausalGraphStats,
  CreateCausalEdgeRequest,
  UpdateCausalEdgeRequest,
} from '../../types/causal.js';

/**
 * Query options for causal edge retrieval
 */
export interface CausalQueryOptions {
  /** Filter by relation types */
  relationTypes?: CausalRelation[];
  /** Minimum edge strength */
  minStrength?: number;
  /** Include inferred edges */
  includeInferred?: boolean;
  /** Maximum results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Order by field */
  orderBy?: 'strength' | 'createdAt' | 'validatedAt';
  /** Order direction */
  orderDir?: 'asc' | 'desc';
}

/**
 * Bulk operation result
 */
export interface BulkOperationResult {
  /** Number of successful operations */
  successful: number;
  /** Number of failed operations */
  failed: number;
  /** IDs of created/updated items */
  ids: string[];
  /** Errors encountered */
  errors?: Array<{ id?: string; error: string }> | undefined;
}

/**
 * Causal storage interface
 * 
 * All causal storage implementations must implement this interface.
 */
export interface ICausalStorage {
  // Lifecycle
  /** Initialize the storage (create tables, indexes) */
  initialize(): Promise<void>;
  /** Close the storage connection */
  close(): Promise<void>;

  // CRUD Operations
  /** Create a new causal edge */
  createEdge(request: CreateCausalEdgeRequest): Promise<string>;
  /** Get an edge by ID */
  getEdge(id: string): Promise<CausalEdge | null>;
  /** Update an edge */
  updateEdge(id: string, updates: UpdateCausalEdgeRequest): Promise<void>;
  /** Delete an edge */
  deleteEdge(id: string): Promise<void>;

  // Bulk Operations
  /** Create multiple edges */
  bulkCreateEdges(requests: CreateCausalEdgeRequest[]): Promise<BulkOperationResult>;
  /** Delete multiple edges */
  bulkDeleteEdges(ids: string[]): Promise<BulkOperationResult>;

  // Query Operations
  /** Get all edges from a source memory */
  getEdgesFrom(sourceId: string, options?: CausalQueryOptions): Promise<CausalEdge[]>;
  /** Get all edges to a target memory */
  getEdgesTo(targetId: string, options?: CausalQueryOptions): Promise<CausalEdge[]>;
  /** Get all edges for a memory (both directions) */
  getEdgesFor(memoryId: string, options?: CausalQueryOptions): Promise<CausalEdge[]>;
  /** Get edge between two specific memories */
  getEdgeBetween(sourceId: string, targetId: string, relation?: CausalRelation): Promise<CausalEdge | null>;
  /** Find edges by relation type */
  findByRelation(relation: CausalRelation, options?: CausalQueryOptions): Promise<CausalEdge[]>;

  // Strength Operations
  /** Update edge strength */
  updateStrength(id: string, strength: number): Promise<void>;
  /** Increment edge strength (with max cap) */
  incrementStrength(id: string, delta: number, maxStrength?: number): Promise<void>;
  /** Decay edge strengths over time */
  decayStrengths(decayFactor: number, minStrength?: number): Promise<number>;

  // Evidence Operations
  /** Add evidence to an edge */
  addEvidence(edgeId: string, evidence: CausalEvidence): Promise<void>;
  /** Remove evidence from an edge */
  removeEvidence(edgeId: string, evidenceIndex: number): Promise<void>;

  // Validation Operations
  /** Mark edge as validated */
  markValidated(id: string, validatedBy?: string): Promise<void>;
  /** Get edges needing validation */
  getUnvalidatedEdges(options?: CausalQueryOptions): Promise<CausalEdge[]>;

  // Statistics
  /** Get graph statistics */
  getStats(): Promise<CausalGraphStats>;
  /** Count edges */
  countEdges(options?: CausalQueryOptions): Promise<number>;
  /** Get most connected memories */
  getMostConnected(limit?: number): Promise<Array<{ memoryId: string; connectionCount: number }>>;

  // Cleanup
  /** Delete edges for a memory (when memory is deleted) */
  deleteEdgesForMemory(memoryId: string): Promise<number>;
  /** Delete weak edges (below strength threshold) */
  deleteWeakEdges(minStrength: number): Promise<number>;
  /** Delete old unvalidated edges */
  deleteOldUnvalidated(olderThanDays: number): Promise<number>;
}
