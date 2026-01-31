/**
 * Semantic Embeddings Module
 * 
 * Code-aware semantic embeddings using CodeBERT
 * and similar transformer models.
 * 
 * @module embeddings/semantic
 */

export {
  SemanticEmbedder,
  type SemanticEmbedderConfig,
} from './embedder.js';

export {
  CodeBERTProvider,
  type CodeBERTConfig,
  type TokenizationResult,
} from './codebert.js';

export {
  ModelLoader,
  type ModelLoaderConfig,
  type ModelMetadata,
} from './model-loader.js';
