/**
 * Fusion Layer
 * 
 * Fuses multiple embedding types into a single hybrid embedding.
 * Supports weighted combination and various fusion strategies.
 * 
 * @module embeddings/hybrid/fusion
 */

import type { FusionWeights } from './weights.js';

/**
 * Fusion strategy
 */
export type FusionStrategy =
  | 'concatenate'
  | 'weighted-sum'
  | 'attention'
  | 'gated';

/**
 * Fusion layer configuration
 */
export interface FusionLayerConfig {
  /** Fusion strategy */
  strategy: FusionStrategy;
  /** Output dimensions */
  outputDimensions: number;
  /** Whether to normalize output */
  normalize: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: FusionLayerConfig = {
  strategy: 'concatenate',
  outputDimensions: 768,
  normalize: true,
};

/**
 * Fusion result with metadata
 */
export interface FusionResult {
  /** Fused embedding */
  embedding: number[];
  /** Contribution from each component */
  contributions: {
    structural: number;
    semantic: number;
    lexical: number;
  };
  /** Strategy used */
  strategy: FusionStrategy;
}

/**
 * Fusion layer for combining embeddings
 */
export class FusionLayer {
  private config: FusionLayerConfig;

  constructor(config?: Partial<FusionLayerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Fuse multiple embeddings into one
   */
  fuse(
    structural: number[],
    semantic: number[],
    lexical: number[],
    weights: FusionWeights
  ): number[] {
    const result = this.fuseWithDetails(structural, semantic, lexical, weights);
    return result.embedding;
  }

  /**
   * Fuse with detailed results
   */
  fuseWithDetails(
    structural: number[],
    semantic: number[],
    lexical: number[],
    weights: FusionWeights
  ): FusionResult {
    let embedding: number[];
    let contributions: FusionResult['contributions'];

    switch (this.config.strategy) {
      case 'weighted-sum':
        ({ embedding, contributions } = this.weightedSum(
          structural, semantic, lexical, weights
        ));
        break;

      case 'attention':
        ({ embedding, contributions } = this.attentionFusion(
          structural, semantic, lexical, weights
        ));
        break;

      case 'gated':
        ({ embedding, contributions } = this.gatedFusion(
          structural, semantic, lexical, weights
        ));
        break;

      case 'concatenate':
      default:
        ({ embedding, contributions } = this.concatenate(
          structural, semantic, lexical, weights
        ));
        break;
    }

    // Ensure output dimensions
    embedding = this.adjustDimensions(embedding, this.config.outputDimensions);

    // Normalize if configured
    if (this.config.normalize) {
      embedding = this.normalizeVector(embedding);
    }

    return {
      embedding,
      contributions,
      strategy: this.config.strategy,
    };
  }

  /**
   * Concatenate embeddings with weighted scaling
   */
  private concatenate(
    structural: number[],
    semantic: number[],
    lexical: number[],
    weights: FusionWeights
  ): { embedding: number[]; contributions: FusionResult['contributions'] } {
    // Scale each embedding by its weight
    const scaledStructural = structural.map(v => v * weights.structural);
    const scaledSemantic = semantic.map(v => v * weights.semantic);
    const scaledLexical = lexical.map(v => v * weights.lexical);

    // Concatenate
    const embedding = [...scaledStructural, ...scaledSemantic, ...scaledLexical];

    // Calculate contributions based on magnitudes
    const structMag = this.magnitude(scaledStructural);
    const semMag = this.magnitude(scaledSemantic);
    const lexMag = this.magnitude(scaledLexical);
    const totalMag = structMag + semMag + lexMag || 1;

    return {
      embedding,
      contributions: {
        structural: structMag / totalMag,
        semantic: semMag / totalMag,
        lexical: lexMag / totalMag,
      },
    };
  }

  /**
   * Weighted sum of embeddings (requires same dimensions)
   */
  private weightedSum(
    structural: number[],
    semantic: number[],
    lexical: number[],
    weights: FusionWeights
  ): { embedding: number[]; contributions: FusionResult['contributions'] } {
    // Adjust all to same dimensions
    const targetDim = this.config.outputDimensions;
    const adjStructural = this.adjustDimensions(structural, targetDim);
    const adjSemantic = this.adjustDimensions(semantic, targetDim);
    const adjLexical = this.adjustDimensions(lexical, targetDim);

    // Weighted sum
    const embedding = new Array(targetDim).fill(0);
    for (let i = 0; i < targetDim; i++) {
      embedding[i] = 
        adjStructural[i]! * weights.structural +
        adjSemantic[i]! * weights.semantic +
        adjLexical[i]! * weights.lexical;
    }

    return {
      embedding,
      contributions: {
        structural: weights.structural,
        semantic: weights.semantic,
        lexical: weights.lexical,
      },
    };
  }

  /**
   * Attention-based fusion
   */
  private attentionFusion(
    structural: number[],
    semantic: number[],
    lexical: number[],
    weights: FusionWeights
  ): { embedding: number[]; contributions: FusionResult['contributions'] } {
    // Adjust all to same dimensions
    const targetDim = this.config.outputDimensions;
    const adjStructural = this.adjustDimensions(structural, targetDim);
    const adjSemantic = this.adjustDimensions(semantic, targetDim);
    const adjLexical = this.adjustDimensions(lexical, targetDim);

    // Calculate attention scores based on embedding magnitudes and weights
    const structScore = this.magnitude(adjStructural) * weights.structural;
    const semScore = this.magnitude(adjSemantic) * weights.semantic;
    const lexScore = this.magnitude(adjLexical) * weights.lexical;

    // Softmax normalization
    const maxScore = Math.max(structScore, semScore, lexScore);
    const expStruct = Math.exp(structScore - maxScore);
    const expSem = Math.exp(semScore - maxScore);
    const expLex = Math.exp(lexScore - maxScore);
    const sumExp = expStruct + expSem + expLex || 1;

    const attentionWeights = {
      structural: expStruct / sumExp,
      semantic: expSem / sumExp,
      lexical: expLex / sumExp,
    };

    // Weighted combination
    const embedding = new Array(targetDim).fill(0);
    for (let i = 0; i < targetDim; i++) {
      embedding[i] = 
        adjStructural[i]! * attentionWeights.structural +
        adjSemantic[i]! * attentionWeights.semantic +
        adjLexical[i]! * attentionWeights.lexical;
    }

    return {
      embedding,
      contributions: attentionWeights,
    };
  }

  /**
   * Gated fusion with learned-like gates
   */
  private gatedFusion(
    structural: number[],
    semantic: number[],
    lexical: number[],
    weights: FusionWeights
  ): { embedding: number[]; contributions: FusionResult['contributions'] } {
    // Adjust all to same dimensions
    const targetDim = this.config.outputDimensions;
    const adjStructural = this.adjustDimensions(structural, targetDim);
    const adjSemantic = this.adjustDimensions(semantic, targetDim);
    const adjLexical = this.adjustDimensions(lexical, targetDim);

    // Calculate per-dimension gates based on embedding values
    const embedding = new Array(targetDim).fill(0);
    let structContrib = 0;
    let semContrib = 0;
    let lexContrib = 0;

    for (let i = 0; i < targetDim; i++) {
      // Sigmoid-like gating based on absolute values
      const structGate = this.sigmoid(Math.abs(adjStructural[i]!) * weights.structural);
      const semGate = this.sigmoid(Math.abs(adjSemantic[i]!) * weights.semantic);
      const lexGate = this.sigmoid(Math.abs(adjLexical[i]!) * weights.lexical);

      const gateSum = structGate + semGate + lexGate || 1;

      embedding[i] = 
        adjStructural[i]! * (structGate / gateSum) +
        adjSemantic[i]! * (semGate / gateSum) +
        adjLexical[i]! * (lexGate / gateSum);

      structContrib += structGate / gateSum;
      semContrib += semGate / gateSum;
      lexContrib += lexGate / gateSum;
    }

    const totalContrib = structContrib + semContrib + lexContrib || 1;

    return {
      embedding,
      contributions: {
        structural: structContrib / totalContrib,
        semantic: semContrib / totalContrib,
        lexical: lexContrib / totalContrib,
      },
    };
  }

  // Helper methods

  private adjustDimensions(vector: number[], targetDim: number): number[] {
    if (vector.length === targetDim) {
      return vector;
    }

    if (vector.length > targetDim) {
      // Use strided sampling to preserve information
      const result = new Array(targetDim).fill(0);
      const stride = vector.length / targetDim;
      
      for (let i = 0; i < targetDim; i++) {
        const srcIdx = Math.floor(i * stride);
        result[i] = vector[srcIdx]!;
      }
      
      return result;
    }

    // Pad with interpolated values
    const result = new Array(targetDim).fill(0);
    const scale = vector.length / targetDim;
    
    for (let i = 0; i < targetDim; i++) {
      const srcIdx = i * scale;
      const lowIdx = Math.floor(srcIdx);
      const highIdx = Math.min(lowIdx + 1, vector.length - 1);
      const t = srcIdx - lowIdx;
      
      result[i] = vector[lowIdx]! * (1 - t) + vector[highIdx]! * t;
    }
    
    return result;
  }

  private normalizeVector(vector: number[]): number[] {
    const mag = this.magnitude(vector);
    if (mag === 0) return vector;
    return vector.map(v => v / mag);
  }

  private magnitude(vector: number[]): number {
    return Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  }

  private sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
  }
}
