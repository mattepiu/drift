/**
 * Semantic Embedder
 * 
 * Generates code-aware semantic embeddings using CodeBERT
 * or similar transformer models.
 * 
 * @module embeddings/semantic/embedder
 */

import { ModelLoader, type ModelMetadata } from './model-loader.js';
import { CodeBERTProvider, type CodeBERTConfig } from './codebert.js';

/**
 * Semantic embedder configuration
 */
export interface SemanticEmbedderConfig {
  /** Model ID to use */
  modelId: string;
  /** Output dimensions (will be projected if different from model) */
  dimensions: number;
  /** CodeBERT configuration */
  codebert?: Partial<CodeBERTConfig>;
  /** Whether to use fallback if model unavailable */
  useFallback: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: SemanticEmbedderConfig = {
  modelId: 'codebert-base',
  dimensions: 512,
  useFallback: true,
};

/**
 * Semantic embedder using CodeBERT
 * 
 * Generates embeddings that capture:
 * - Code semantics and meaning
 * - Variable and function relationships
 * - Programming language patterns
 * - Cross-language similarities
 */
export class SemanticEmbedder {
  readonly dimensions: number;

  private config: SemanticEmbedderConfig;
  private modelLoader: ModelLoader;
  private provider: CodeBERTProvider;
  private metadata: ModelMetadata | null = null;
  private initialized = false;
  private projectionMatrix: number[][] | null = null;

  constructor(config?: Partial<SemanticEmbedderConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.dimensions = this.config.dimensions;
    this.modelLoader = new ModelLoader();
    this.provider = new CodeBERTProvider(this.config.codebert);
  }

  /**
   * Initialize the embedder
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Get model metadata
      this.metadata = this.modelLoader.getModelMetadata(this.config.modelId) ?? null;

      if (this.metadata) {
        // Initialize provider with metadata
        await this.provider.initialize(this.metadata);

        // Create projection matrix if dimensions differ
        if (this.metadata.dimensions !== this.dimensions) {
          this.projectionMatrix = this.createProjectionMatrix(
            this.metadata.dimensions,
            this.dimensions
          );
        }
      }

      this.initialized = true;
    } catch (error) {
      if (this.config.useFallback) {
        console.warn('Failed to initialize semantic embedder, using fallback:', error);
        this.initialized = true;
      } else {
        throw error;
      }
    }
  }

  /**
   * Generate embedding for code
   */
  async embed(code: string): Promise<number[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Get raw embedding from provider
    const rawEmbedding = await this.provider.embed(code);

    // Sanitize any NaN values
    const sanitized = rawEmbedding.map(v => isFinite(v) ? v : 0);

    // Project to target dimensions if needed
    if (this.projectionMatrix) {
      return this.projectEmbedding(sanitized, this.projectionMatrix);
    }

    // Truncate or pad to target dimensions
    return this.adjustDimensions(sanitized, this.dimensions);
  }

  /**
   * Generate embeddings for multiple code snippets
   */
  async embedBatch(codes: string[]): Promise<number[][]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const embeddings = await this.provider.embedBatch(codes);

    if (this.projectionMatrix) {
      return embeddings.map(emb => this.projectEmbedding(emb, this.projectionMatrix!));
    }

    return embeddings.map(emb => this.adjustDimensions(emb, this.dimensions));
  }

  /**
   * Calculate semantic similarity between two code snippets
   */
  async similarity(code1: string, code2: string): Promise<number> {
    const [emb1, emb2] = await this.embedBatch([code1, code2]);
    return this.cosineSimilarity(emb1!, emb2!);
  }

  /**
   * Find semantically similar code from candidates
   */
  async findSimilar(
    query: string,
    candidates: string[],
    topK = 5
  ): Promise<Array<{ index: number; code: string; score: number }>> {
    const queryEmb = await this.embed(query);
    const candidateEmbs = await this.embedBatch(candidates);

    const scored = candidates.map((code, index) => ({
      index,
      code,
      score: this.cosineSimilarity(queryEmb, candidateEmbs[index]!),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /**
   * Check if embedder is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      if (!this.initialized) {
        await this.initialize();
      }
      return this.initialized;
    } catch {
      return this.config.useFallback;
    }
  }

  /**
   * Get model information
   */
  getModelInfo(): {
    modelId: string;
    modelDimensions: number;
    outputDimensions: number;
    initialized: boolean;
  } {
    return {
      modelId: this.config.modelId,
      modelDimensions: this.metadata?.dimensions ?? 768,
      outputDimensions: this.dimensions,
      initialized: this.initialized,
    };
  }

  // Private helpers

  private createProjectionMatrix(fromDim: number, toDim: number): number[][] {
    // Create a random projection matrix for dimensionality reduction
    // Using Gaussian random projection
    const matrix: number[][] = [];
    const scale = 1 / Math.sqrt(toDim);

    for (let i = 0; i < toDim; i++) {
      const row: number[] = [];
      for (let j = 0; j < fromDim; j++) {
        // Use deterministic pseudo-random values based on position
        const seed = i * fromDim + j;
        row.push(this.gaussianRandom(seed) * scale);
      }
      matrix.push(row);
    }

    return matrix;
  }

  private projectEmbedding(embedding: number[], matrix: number[][]): number[] {
    const result: number[] = [];

    for (const row of matrix) {
      let sum = 0;
      for (let j = 0; j < embedding.length && j < row.length; j++) {
        const embVal = embedding[j] ?? 0;
        const matVal = row[j] ?? 0;
        if (isFinite(embVal) && isFinite(matVal)) {
          sum += embVal * matVal;
        }
      }
      result.push(isFinite(sum) ? sum : 0);
    }

    return this.normalizeVector(result);
  }

  private adjustDimensions(embedding: number[], targetDim: number): number[] {
    if (embedding.length === targetDim) {
      return embedding;
    }

    if (embedding.length > targetDim) {
      // Truncate
      return this.normalizeVector(embedding.slice(0, targetDim));
    }

    // Pad with zeros
    const padded = [...embedding, ...new Array(targetDim - embedding.length).fill(0)];
    return this.normalizeVector(padded);
  }

  private gaussianRandom(seed: number): number {
    // Box-Muller transform with seeded random
    const u1 = this.seededRandom(seed);
    const u2 = this.seededRandom(seed + 1);
    return Math.sqrt(-2 * Math.log(u1 + 0.0001)) * Math.cos(2 * Math.PI * u2);
  }

  private seededRandom(seed: number): number {
    // Simple seeded random number generator
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      const aVal = a[i] ?? 0;
      const bVal = b[i] ?? 0;
      dotProduct += aVal * bVal;
      normA += aVal * aVal;
      normB += bVal * bVal;
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0 || !isFinite(magnitude)) return 0;

    const result = dotProduct / magnitude;
    return isFinite(result) ? result : 0;
  }

  private normalizeVector(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (magnitude === 0 || !isFinite(magnitude)) return vector;
    return vector.map(v => v / magnitude);
  }
}
