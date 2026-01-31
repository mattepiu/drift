/**
 * Causal Graph Module
 * 
 * Provides causal relationship tracking between memories,
 * enabling "why" narratives and understanding of how
 * knowledge evolved over time.
 * 
 * @module causal
 */

// Storage
export * from './storage/index.js';

// Traversal
export * from './traversal/index.js';

// Inference
export * from './inference/index.js';

// Narrative
export * from './narrative/index.js';

// Re-export types for convenience
export type {
  CausalRelation,
  CausalEdge,
  CausalChain,
  CausalNode,
  CausalEvidence,
  CausalInferenceResult,
  CausalInferenceStrategy,
  GraphTraversalOptions,
  CausalGraphStats,
  CreateCausalEdgeRequest,
  UpdateCausalEdgeRequest,
} from '../types/causal.js';
