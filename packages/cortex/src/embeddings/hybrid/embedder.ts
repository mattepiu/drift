/**
 * Hybrid Embedder
 * 
 * Combines structural, semantic, and lexical embeddings
 * into a unified hybrid embedding for code understanding.
 * 
 * @module embeddings/hybrid/embedder
 */

import type { IEmbeddingProvider } from '../interface.js';
import { StructuralEmbedder, type StructuralEmbedderConfig } from '../structural/index.js';
import { SemanticEmbedder, type SemanticEmbedderConfig } from '../semantic/index.js';
import { LexicalEmbedder, type LexicalEmbedderConfig } from '../lexical/index.js';
import { FusionLayer, type FusionLayerConfig, type FusionStrategy } from './fusion.js';
import { WeightManager, type FusionWeights, type WeightPreset } from './weights.js';

/**
 * Hybrid embedder configuration
 */
export interface HybridEmbedderConfig {
  /** Output dimensions */
  dimensions: number;
  /** Structural embedder config */
  structural?: Partial<StructuralEmbedderConfig>;
  /** Semantic embedder config */
  semantic?: Partial<SemanticEmbedderConfig>;
  /** Lexical embedder config */
  lexical?: Partial<LexicalEmbedderConfig>;
  /** Fusion layer config */
  fusion?: Partial<FusionLayerConfig>;
  /** Default weight preset */
  defaultWeightPreset: WeightPreset;
  /** Maximum tokens per input */
  maxTokens: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: HybridEmbedderConfig = {
  dimensions: 768,
  defaultWeightPreset: 'balanced',
  maxTokens: 8192,
};

/**
 * Embedding context for customization
 */
export interface EmbeddingContext {
  /** Language of the code */
  language?: string;
  /** Weight preset to use */
  weightPreset?: WeightPreset;
  /** Custom weights */
  weights?: FusionWeights;
  /** Fusion strategy */
  fusionStrategy?: FusionStrategy;
}

/**
 * Detailed embedding result
 */
export interface HybridEmbeddingResult {
  /** Combined embedding */
  embedding: number[];
  /** Individual embeddings */
  components: {
    structural: number[];
    semantic: number[];
    lexical: number[];
  };
  /** Contribution from each component */
  contributions: {
    structural: number;
    semantic: number;
    lexical: number;
  };
  /** Weights used */
  weights: FusionWeights;
}

/**
 * Hybrid embedder combining three embedding types
 * 
 * Combines:
 * - Structural (128 dims): AST patterns, complexity, architecture
 * - Semantic (512 dims): CodeBERT-based meaning understanding
 * - Lexical (128 dims): TF-IDF term frequencies
 * 
 * Total: 768 dimensions (configurable)
 */
export class HybridEmbedder implements IEmbeddingProvider {
  readonly name = 'hybrid';
  readonly dimensions: number;
  readonly maxTokens: number;

  private config: HybridEmbedderConfig;
  private structural: StructuralEmbedder;
  private semantic: SemanticEmbedder;
  private lexical: LexicalEmbedder;
  private fusion: FusionLayer;
  private weightManager: WeightManager;
  private initialized = false;

  constructor(config?: Partial<HybridEmbedderConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.dimensions = this.config.dimensions;
    this.maxTokens = this.config.maxTokens;

    // Initialize component embedders
    this.structural = new StructuralEmbedder({
      dimensions: 128,
      ...this.config.structural,
    });

    this.semantic = new SemanticEmbedder({
      dimensions: 512,
      ...this.config.semantic,
    });

    this.lexical = new LexicalEmbedder({
      dimensions: 128,
      ...this.config.lexical,
    });

    // Initialize fusion layer
    this.fusion = new FusionLayer({
      outputDimensions: this.dimensions,
      ...this.config.fusion,
    });

    // Initialize weight manager
    this.weightManager = new WeightManager();
  }

  /**
   * Initialize all component embedders
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await Promise.all([
      this.structural.initialize(),
      this.semantic.initialize(),
      this.lexical.initialize(),
    ]);

    this.initialized = true;
  }

  /**
   * Generate hybrid embedding for text/code
   */
  async embed(text: string, context?: EmbeddingContext): Promise<number[]> {
    const result = await this.embedWithDetails(text, context);
    return result.embedding;
  }

  /**
   * Generate hybrid embedding with full details
   */
  async embedWithDetails(
    text: string,
    context?: EmbeddingContext
  ): Promise<HybridEmbeddingResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const language = context?.language ?? 'typescript';

    // Generate component embeddings in parallel
    const [structuralEmb, semanticEmb, lexicalEmb] = await Promise.all([
      Promise.resolve(this.structural.embed(text, language)),
      this.semantic.embed(text),
      Promise.resolve(this.lexical.embed(text)),
    ]);

    // Sanitize embeddings (replace NaN with 0)
    const sanitize = (arr: number[]) => arr.map(v => isFinite(v) ? v : 0);
    const sanitizedStructural = sanitize(structuralEmb);
    const sanitizedSemantic = sanitize(semanticEmb);
    const sanitizedLexical = sanitize(lexicalEmb);

    // Get weights
    const weights = this.getWeights(context);

    // Fuse embeddings
    const fusionResult = this.fusion.fuseWithDetails(
      sanitizedStructural,
      sanitizedSemantic,
      sanitizedLexical,
      weights
    );

    // Sanitize final embedding
    const sanitizedEmbedding = sanitize(fusionResult.embedding);

    return {
      embedding: sanitizedEmbedding,
      components: {
        structural: sanitizedStructural,
        semantic: sanitizedSemantic,
        lexical: sanitizedLexical,
      },
      contributions: fusionResult.contributions,
      weights,
    };
  }

  /**
   * Generate embeddings for multiple texts
   */
  async embedBatch(texts: string[], context?: EmbeddingContext): Promise<number[][]> {
    if (!this.initialized) {
      await this.initialize();
    }

    return Promise.all(texts.map(text => this.embed(text, context)));
  }

  /**
   * Hybrid search with customizable weights
   */
  async hybridSearch(
    query: string,
    candidates: Array<{ id: string; code: string }>,
    options?: {
      weights?: FusionWeights;
      topK?: number;
      language?: string;
    }
  ): Promise<Array<{ id: string; code: string; score: number; breakdown: FusionWeights }>> {
    const { weights, topK = 10, language = 'typescript' } = options ?? {};

    // Build context, only including weights if defined
    const context: EmbeddingContext = { language };
    if (weights) {
      context.weights = weights;
    }

    // Get query embedding
    const queryResult = await this.embedWithDetails(query, context);

    // Score candidates
    const scored = await Promise.all(
      candidates.map(async (candidate) => {
        const candidateResult = await this.embedWithDetails(candidate.code, context);
        
        // Calculate overall similarity
        const score = this.cosineSimilarity(
          queryResult.embedding,
          candidateResult.embedding
        );

        // Calculate per-component similarity for breakdown
        const breakdown: FusionWeights = {
          structural: this.cosineSimilarity(
            queryResult.components.structural,
            candidateResult.components.structural
          ),
          semantic: this.cosineSimilarity(
            queryResult.components.semantic,
            candidateResult.components.semantic
          ),
          lexical: this.cosineSimilarity(
            queryResult.components.lexical,
            candidateResult.components.lexical
          ),
        };

        return {
          id: candidate.id,
          code: candidate.code,
          score,
          breakdown,
        };
      })
    );

    // Sort by score and return top K
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
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get weight manager for customization
   */
  getWeightManager(): WeightManager {
    return this.weightManager;
  }

  /**
   * Get component embedders for direct access
   */
  getComponents(): {
    structural: StructuralEmbedder;
    semantic: SemanticEmbedder;
    lexical: LexicalEmbedder;
  } {
    return {
      structural: this.structural,
      semantic: this.semantic,
      lexical: this.lexical,
    };
  }

  // Private helpers

  private getWeights(context?: EmbeddingContext): FusionWeights {
    if (context?.weights) {
      return this.weightManager.normalizeWeights(context.weights);
    }

    if (context?.weightPreset) {
      return this.weightManager.getPreset(context.weightPreset);
    }

    return this.weightManager.getPreset(this.config.defaultWeightPreset);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      // Adjust dimensions if needed
      const minLen = Math.min(a.length, b.length);
      a = a.slice(0, minLen);
      b = b.slice(0, minLen);
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
}
