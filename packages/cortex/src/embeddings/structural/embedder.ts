/**
 * Structural Embedder
 * 
 * Generates AST-based structural embeddings for code.
 * Captures code structure, patterns, and architectural features.
 * 
 * @module embeddings/structural/embedder
 */

import { ASTAnalyzer } from './ast-analyzer.js';
import { FeatureExtractor, type StructuralFeatures } from './feature-extractor.js';
import { PatternClassifier, type ClassificationResult } from './pattern-classifier.js';

/**
 * Structural embedder configuration
 */
export interface StructuralEmbedderConfig {
  /** Output dimensions */
  dimensions: number;
  /** Weight for feature vector */
  featureWeight: number;
  /** Weight for pattern vector */
  patternWeight: number;
  /** Weight for category vector */
  categoryWeight: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: StructuralEmbedderConfig = {
  dimensions: 128,
  featureWeight: 0.4,
  patternWeight: 0.3,
  categoryWeight: 0.3,
};

/**
 * Structural embedding result
 */
export interface StructuralEmbeddingResult {
  /** The embedding vector */
  embedding: number[];
  /** Extracted features */
  features: StructuralFeatures;
  /** Classification result */
  classification: ClassificationResult;
}

/**
 * Structural embedder using AST analysis
 * 
 * Generates embeddings based on:
 * - AST structure and patterns
 * - Code complexity metrics
 * - Architectural pattern detection
 * - Side effect analysis
 */
export class StructuralEmbedder {
  readonly dimensions: number;

  private config: StructuralEmbedderConfig;
  private astAnalyzer: ASTAnalyzer;
  private featureExtractor: FeatureExtractor;
  private patternClassifier: PatternClassifier;

  constructor(config?: Partial<StructuralEmbedderConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.dimensions = this.config.dimensions;
    this.astAnalyzer = new ASTAnalyzer();
    this.featureExtractor = new FeatureExtractor();
    this.patternClassifier = new PatternClassifier();
  }

  /**
   * Initialize the embedder
   */
  async initialize(): Promise<void> {
    // Structural embedder doesn't need async initialization
    // but we keep the interface consistent
  }

  /**
   * Generate embedding for code
   */
  embed(code: string, language = 'typescript'): number[] {
    const result = this.embedWithDetails(code, language);
    return result.embedding;
  }

  /**
   * Generate embedding with full details
   */
  embedWithDetails(code: string, language = 'typescript'): StructuralEmbeddingResult {
    // Analyze AST
    const analysis = this.astAnalyzer.analyze(code, language);

    // Extract features
    const features = this.featureExtractor.extract(analysis, code);

    // Classify patterns
    const classification = this.patternClassifier.classify(code, features);

    // Generate embedding components
    const featureVector = this.featureExtractor.toVector(
      features,
      Math.floor(this.dimensions * this.config.featureWeight)
    );

    const patternVector = this.generatePatternVector(
      features.patterns,
      classification.architecturalPatterns,
      Math.floor(this.dimensions * this.config.patternWeight)
    );

    const categoryVector = this.patternClassifier.getCategoryVector(
      classification.category,
      Math.floor(this.dimensions * this.config.categoryWeight)
    );

    // Combine vectors
    const embedding = this.combineVectors(
      featureVector,
      patternVector,
      categoryVector
    );

    return {
      embedding,
      features,
      classification,
    };
  }

  /**
   * Generate embeddings for multiple code snippets
   */
  embedBatch(codes: string[], language = 'typescript'): number[][] {
    return codes.map(code => this.embed(code, language));
  }

  /**
   * Calculate structural similarity between two code snippets
   */
  similarity(code1: string, code2: string, language = 'typescript'): number {
    const emb1 = this.embed(code1, language);
    const emb2 = this.embed(code2, language);
    return this.cosineSimilarity(emb1, emb2);
  }

  /**
   * Find structurally similar code from candidates
   */
  findSimilar(
    query: string,
    candidates: string[],
    topK = 5,
    language = 'typescript'
  ): Array<{ index: number; code: string; score: number; classification: ClassificationResult }> {
    const queryResult = this.embedWithDetails(query, language);

    const scored = candidates.map((code, index) => {
      const candidateResult = this.embedWithDetails(code, language);
      return {
        index,
        code,
        score: this.cosineSimilarity(queryResult.embedding, candidateResult.embedding),
        classification: candidateResult.classification,
      };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /**
   * Get structural analysis for code
   */
  analyze(code: string, language = 'typescript'): {
    features: StructuralFeatures;
    classification: ClassificationResult;
    summary: string;
  } {
    const analysis = this.astAnalyzer.analyze(code, language);
    const features = this.featureExtractor.extract(analysis, code);
    const classification = this.patternClassifier.classify(code, features);
    const summary = this.featureExtractor.summarize(features);

    return { features, classification, summary };
  }

  /**
   * Check if embedder is available
   */
  async isAvailable(): Promise<boolean> {
    return true; // Structural embedder is always available
  }

  // Private helpers

  private generatePatternVector(
    codePatterns: string[],
    architecturalPatterns: string[],
    dimensions: number
  ): number[] {
    const vector = new Array(dimensions).fill(0);
    const allPatterns = [...codePatterns, ...architecturalPatterns];

    for (const pattern of allPatterns) {
      const hash = this.hashString(pattern);
      const idx = Math.abs(hash) % dimensions;
      vector[idx] = 1;
    }

    return this.normalizeVector(vector);
  }

  private combineVectors(...vectors: number[][]): number[] {
    const _totalLength = vectors.reduce((sum, v) => sum + v.length, 0);
    void _totalLength; // Suppress unused variable warning
    const combined = new Array(this.dimensions).fill(0);

    let offset = 0;
    for (const vector of vectors) {
      for (let i = 0; i < vector.length && offset + i < this.dimensions; i++) {
        combined[offset + i] = vector[i]!;
      }
      offset += vector.length;
    }

    // Pad or truncate to exact dimensions
    if (combined.length < this.dimensions) {
      combined.push(...new Array(this.dimensions - combined.length).fill(0));
    }

    return this.normalizeVector(combined.slice(0, this.dimensions));
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i]! * b[i]!;
      normA += a[i]! * a[i]!;
      normB += b[i]! * b[i]!;
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) return 0;

    return dotProduct / magnitude;
  }

  private hashString(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash = hash | 0;
    }
    return hash;
  }

  private normalizeVector(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (magnitude === 0) return vector;
    return vector.map(v => v / magnitude);
  }
}
