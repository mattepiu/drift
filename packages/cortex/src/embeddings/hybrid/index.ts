/**
 * Hybrid Embeddings Module
 * 
 * Combines structural, semantic, and lexical embeddings
 * into a unified hybrid embedding for code understanding.
 * 
 * @module embeddings/hybrid
 */

export {
  HybridEmbedder,
  type HybridEmbedderConfig,
  type HybridEmbeddingResult,
  type EmbeddingContext,
} from './embedder.js';

export {
  FusionLayer,
  type FusionLayerConfig,
  type FusionStrategy,
  type FusionResult,
} from './fusion.js';

export {
  WeightManager,
  type FusionWeights,
  type WeightPreset,
  type WeightConfig,
} from './weights.js';
