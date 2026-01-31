/**
 * Causal Relationship Types
 * 
 * Defines the causal graph data structures for tracking
 * "why" relationships between memories. This enables:
 * - Tracing the origins of knowledge
 * - Understanding effects of decisions
 * - Generating human-readable narratives
 * 
 * @module types/causal
 */

/**
 * The 8 causal relationship types
 * 
 * These represent different ways memories can be causally connected:
 * - caused: Direct causation (A caused B)
 * - enabled: Made possible (A enabled B to happen)
 * - prevented: Blocked from happening (A prevented B)
 * - contradicts: Conflicts with (A contradicts B)
 * - supersedes: Replaces (A supersedes B, making B obsolete)
 * - supports: Provides evidence for (A supports B)
 * - derived_from: Extracted from (A was derived from B)
 * - triggered_by: Initiated by (A was triggered by B)
 */
export type CausalRelation =
  | 'caused'
  | 'enabled'
  | 'prevented'
  | 'contradicts'
  | 'supersedes'
  | 'supports'
  | 'derived_from'
  | 'triggered_by';

/**
 * Evidence supporting a causal relationship
 */
export interface CausalEvidence {
  /** Type of evidence */
  type: 'temporal' | 'semantic' | 'entity' | 'explicit' | 'user_confirmed';
  /** Description of the evidence */
  description: string;
  /** Confidence in this evidence (0.0 - 1.0) */
  confidence: number;
  /** Reference to supporting data (commit hash, file path, etc.) */
  reference?: string;
  /** When this evidence was gathered */
  gatheredAt: string;
}

/**
 * An edge in the causal graph
 * 
 * Represents a directed relationship from source to target
 * with a specific causal relation type.
 */
export interface CausalEdge {
  /** Unique identifier for this edge */
  id: string;
  /** Source memory ID (the cause) */
  sourceId: string;
  /** Target memory ID (the effect) */
  targetId: string;
  /** Type of causal relationship */
  relation: CausalRelation;
  /** Strength of the relationship (0.0 - 1.0) */
  strength: number;
  /** Evidence supporting this relationship */
  evidence: CausalEvidence[];
  /** When this edge was created */
  createdAt: string;
  /** When this edge was last validated */
  validatedAt?: string | undefined;
  /** Whether this edge was inferred or explicitly created */
  inferred: boolean;
  /** User who created/validated this edge */
  createdBy?: string | undefined;
}

/**
 * A node in a causal chain (memory with context)
 */
export interface CausalNode {
  /** Memory ID */
  memoryId: string;
  /** Memory type */
  memoryType: string;
  /** Memory summary */
  summary: string;
  /** Depth in the chain (0 = root) */
  depth: number;
  /** Edges leading to this node */
  incomingEdges: CausalEdge[];
  /** Edges leading from this node */
  outgoingEdges: CausalEdge[];
}

/**
 * A path through the causal graph
 * 
 * Represents a chain of causally connected memories,
 * useful for generating narratives and explanations.
 */
export interface CausalChain {
  /** The root memory ID (starting point) */
  rootId: string;
  /** Direction of traversal */
  direction: 'origins' | 'effects' | 'bidirectional';
  /** All nodes in the chain */
  nodes: CausalNode[];
  /** All edges in the chain */
  edges: CausalEdge[];
  /** Maximum depth reached */
  maxDepth: number;
  /** Total number of memories in chain */
  totalMemories: number;
  /** Aggregate confidence of the chain */
  chainConfidence: number;
  /** When this chain was computed */
  computedAt: string;
}

/**
 * Result of automatic causal inference
 */
export interface CausalInferenceResult {
  /** The memory being analyzed */
  memoryId: string;
  /** Inferred causal edges */
  inferredEdges: CausalEdge[];
  /** Confidence in the overall inference */
  confidence: number;
  /** Strategies used for inference */
  strategiesUsed: CausalInferenceStrategy[];
  /** Time taken for inference (ms) */
  inferenceTimeMs: number;
  /** Any warnings or notes */
  warnings?: string[] | undefined;
}

/**
 * Strategies for automatic causal inference
 */
export type CausalInferenceStrategy =
  | 'temporal_proximity'
  | 'semantic_similarity'
  | 'entity_overlap'
  | 'explicit_reference'
  | 'pattern_matching'
  | 'file_co_occurrence';

/**
 * Options for graph traversal
 */
export interface GraphTraversalOptions {
  /** Maximum depth to traverse */
  maxDepth?: number;
  /** Minimum edge strength to follow */
  minStrength?: number;
  /** Relation types to include (empty = all) */
  relationTypes?: CausalRelation[];
  /** Whether to include inferred edges */
  includeInferred?: boolean;
  /** Maximum number of nodes to return */
  maxNodes?: number;
  /** Whether to compute chain confidence */
  computeConfidence?: boolean;
}

/**
 * Statistics about the causal graph
 */
export interface CausalGraphStats {
  /** Total number of edges */
  totalEdges: number;
  /** Edges by relation type */
  edgesByRelation: Record<CausalRelation, number>;
  /** Number of inferred vs explicit edges */
  inferredCount: number;
  explicitCount: number;
  /** Average edge strength */
  averageStrength: number;
  /** Number of connected components */
  connectedComponents: number;
  /** Memories with most causal connections */
  mostConnected: Array<{ memoryId: string; connectionCount: number }>;
}

/**
 * Request to create a causal edge
 */
export interface CreateCausalEdgeRequest {
  sourceId: string;
  targetId: string;
  relation: CausalRelation;
  strength?: number;
  evidence?: CausalEvidence[];
  inferred?: boolean;
  createdBy?: string;
}

/**
 * Request to update a causal edge
 */
export interface UpdateCausalEdgeRequest {
  strength?: number;
  evidence?: CausalEvidence[];
  validatedAt?: string;
}
