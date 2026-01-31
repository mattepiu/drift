/**
 * Structural Embeddings Module
 * 
 * AST-based structural embeddings for code.
 * Captures code structure, patterns, and architectural features.
 * 
 * @module embeddings/structural
 */

export {
  StructuralEmbedder,
  type StructuralEmbedderConfig,
  type StructuralEmbeddingResult,
} from './embedder.js';

export {
  ASTAnalyzer,
  type ASTNode,
  type ASTAnalysis,
  type ReturnType,
  type SideEffect,
} from './ast-analyzer.js';

export {
  FeatureExtractor,
  type FeatureExtractorConfig,
  type StructuralFeatures,
} from './feature-extractor.js';

export {
  PatternClassifier,
  type PatternClassifierConfig,
  type PatternCategory,
  type ClassificationResult,
} from './pattern-classifier.js';
