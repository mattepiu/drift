/**
 * Weight Configuration
 * 
 * Configures weights for hybrid embedding fusion.
 * Supports dynamic weight adjustment based on context.
 * 
 * @module embeddings/hybrid/weights
 */

/**
 * Fusion weights for combining embeddings
 */
export interface FusionWeights {
  /** Weight for structural embeddings (AST-based) */
  structural: number;
  /** Weight for semantic embeddings (CodeBERT) */
  semantic: number;
  /** Weight for lexical embeddings (TF-IDF) */
  lexical: number;
}

/**
 * Weight preset names
 */
export type WeightPreset =
  | 'balanced'
  | 'semantic-heavy'
  | 'structural-heavy'
  | 'lexical-heavy'
  | 'code-search'
  | 'similarity'
  | 'classification';

/**
 * Weight configuration
 */
export interface WeightConfig {
  /** Default weights */
  default: FusionWeights;
  /** Presets for different use cases */
  presets: Record<WeightPreset, FusionWeights>;
  /** Whether to normalize weights */
  normalize: boolean;
}

/**
 * Default weight presets
 */
const DEFAULT_PRESETS: Record<WeightPreset, FusionWeights> = {
  balanced: {
    structural: 0.3,
    semantic: 0.5,
    lexical: 0.2,
  },
  'semantic-heavy': {
    structural: 0.2,
    semantic: 0.7,
    lexical: 0.1,
  },
  'structural-heavy': {
    structural: 0.6,
    semantic: 0.3,
    lexical: 0.1,
  },
  'lexical-heavy': {
    structural: 0.2,
    semantic: 0.3,
    lexical: 0.5,
  },
  'code-search': {
    structural: 0.2,
    semantic: 0.6,
    lexical: 0.2,
  },
  similarity: {
    structural: 0.4,
    semantic: 0.4,
    lexical: 0.2,
  },
  classification: {
    structural: 0.5,
    semantic: 0.4,
    lexical: 0.1,
  },
};

/**
 * Default configuration
 */
const DEFAULT_CONFIG: WeightConfig = {
  default: DEFAULT_PRESETS.balanced,
  presets: DEFAULT_PRESETS,
  normalize: true,
};

/**
 * Weight manager for hybrid embeddings
 */
export class WeightManager {
  private config: WeightConfig;

  constructor(config?: Partial<WeightConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      presets: { ...DEFAULT_PRESETS, ...config?.presets },
    };
  }

  /**
   * Get default weights
   */
  getDefault(): FusionWeights {
    return { ...this.config.default };
  }

  /**
   * Get weights for a preset
   */
  getPreset(preset: WeightPreset): FusionWeights {
    const weights = this.config.presets[preset];
    return weights ? { ...weights } : this.getDefault();
  }

  /**
   * Create custom weights
   */
  createWeights(
    structural: number,
    semantic: number,
    lexical: number
  ): FusionWeights {
    const weights = { structural, semantic, lexical };
    return this.config.normalize ? this.normalizeWeights(weights) : weights;
  }

  /**
   * Normalize weights to sum to 1
   */
  normalizeWeights(weights: FusionWeights): FusionWeights {
    const sum = weights.structural + weights.semantic + weights.lexical;
    
    if (sum === 0) {
      return { structural: 1/3, semantic: 1/3, lexical: 1/3 };
    }

    return {
      structural: weights.structural / sum,
      semantic: weights.semantic / sum,
      lexical: weights.lexical / sum,
    };
  }

  /**
   * Interpolate between two weight configurations
   */
  interpolate(
    weights1: FusionWeights,
    weights2: FusionWeights,
    t: number
  ): FusionWeights {
    const clampedT = Math.max(0, Math.min(1, t));
    
    return this.normalizeWeights({
      structural: weights1.structural * (1 - clampedT) + weights2.structural * clampedT,
      semantic: weights1.semantic * (1 - clampedT) + weights2.semantic * clampedT,
      lexical: weights1.lexical * (1 - clampedT) + weights2.lexical * clampedT,
    });
  }

  /**
   * Adjust weights based on code characteristics
   */
  adjustForCode(
    baseWeights: FusionWeights,
    codeLength: number,
    hasComments: boolean,
    complexity: number
  ): FusionWeights {
    let weights = { ...baseWeights };

    // Short code benefits more from lexical matching
    if (codeLength < 100) {
      weights.lexical += 0.1;
      weights.semantic -= 0.05;
      weights.structural -= 0.05;
    }

    // Code with comments benefits from semantic understanding
    if (hasComments) {
      weights.semantic += 0.1;
      weights.lexical -= 0.1;
    }

    // Complex code benefits from structural analysis
    if (complexity > 10) {
      weights.structural += 0.1;
      weights.lexical -= 0.1;
    }

    return this.normalizeWeights(weights);
  }

  /**
   * Get recommended weights for a query type
   */
  getRecommendedWeights(queryType: string): FusionWeights {
    const queryLower = queryType.toLowerCase();

    if (queryLower.includes('search') || queryLower.includes('find')) {
      return this.getPreset('code-search');
    }

    if (queryLower.includes('similar') || queryLower.includes('like')) {
      return this.getPreset('similarity');
    }

    if (queryLower.includes('pattern') || queryLower.includes('structure')) {
      return this.getPreset('structural-heavy');
    }

    if (queryLower.includes('meaning') || queryLower.includes('semantic')) {
      return this.getPreset('semantic-heavy');
    }

    return this.getDefault();
  }

  /**
   * List available presets
   */
  listPresets(): WeightPreset[] {
    return Object.keys(this.config.presets) as WeightPreset[];
  }

  /**
   * Add a custom preset
   */
  addPreset(name: string, weights: FusionWeights): void {
    (this.config.presets as Record<string, FusionWeights>)[name] = 
      this.config.normalize ? this.normalizeWeights(weights) : weights;
  }
}
