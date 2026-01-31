/**
 * Feature Extractor
 * 
 * Extracts structural features from AST analysis
 * for use in structural embeddings.
 * 
 * @module embeddings/structural/feature-extractor
 */

import type { ASTAnalysis, ReturnType, SideEffect } from './ast-analyzer.js';

/**
 * Structural features for embedding
 */
export interface StructuralFeatures {
  /** Has async/await patterns */
  hasAsync: boolean;
  /** Has error handling (try/catch) */
  hasErrorHandling: boolean;
  /** Has loop constructs */
  hasLoops: boolean;
  /** Has conditional logic */
  hasConditionals: boolean;
  /** Has recursive patterns */
  hasRecursion: boolean;
  /** Maximum call depth */
  callDepth: number;
  /** Parameter count */
  paramCount: number;
  /** Inferred return type */
  returnType: ReturnType;
  /** Detected side effects */
  sideEffects: SideEffect[];
  /** Cyclomatic complexity estimate */
  complexity: number;
  /** AST node count */
  nodeCount: number;
  /** Maximum nesting depth */
  maxNesting: number;
  /** Detected patterns */
  patterns: string[];
}

/**
 * Feature extractor configuration
 */
export interface FeatureExtractorConfig {
  /** Maximum patterns to detect */
  maxPatterns: number;
  /** Complexity threshold for "complex" classification */
  complexityThreshold: number;
  /** Nesting threshold for "deeply nested" classification */
  nestingThreshold: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: FeatureExtractorConfig = {
  maxPatterns: 10,
  complexityThreshold: 10,
  nestingThreshold: 4,
};

/**
 * Pattern definitions for detection
 */
const PATTERN_DEFINITIONS: Array<{
  name: string;
  detect: (analysis: ASTAnalysis, code: string) => boolean;
}> = [
  {
    name: 'async-await',
    detect: (analysis) => analysis.hasAsync,
  },
  {
    name: 'error-handling',
    detect: (analysis) => analysis.hasErrorHandling,
  },
  {
    name: 'iteration',
    detect: (analysis) => analysis.hasLoops,
  },
  {
    name: 'conditional-logic',
    detect: (analysis) => analysis.hasConditionals,
  },
  {
    name: 'recursive',
    detect: (analysis) => analysis.hasRecursion,
  },
  {
    name: 'high-complexity',
    detect: (analysis) => analysis.complexity > 10,
  },
  {
    name: 'deeply-nested',
    detect: (analysis) => analysis.maxNesting > 4,
  },
  {
    name: 'side-effects',
    detect: (analysis) => analysis.sideEffects.length > 0,
  },
  {
    name: 'io-operations',
    detect: (analysis) => analysis.sideEffects.some(e => e.type === 'io'),
  },
  {
    name: 'network-operations',
    detect: (analysis) => analysis.sideEffects.some(e => e.type === 'network'),
  },
  {
    name: 'state-mutation',
    detect: (analysis) => analysis.sideEffects.some(e => e.type === 'mutation'),
  },
  {
    name: 'promise-based',
    detect: (analysis) => analysis.returnType === 'promise',
  },
  {
    name: 'observable-based',
    detect: (analysis) => analysis.returnType === 'observable',
  },
  {
    name: 'factory-pattern',
    detect: (_, code) => /return\s+new\s+\w+/.test(code),
  },
  {
    name: 'builder-pattern',
    detect: (_, code) => /return\s+this\b/.test(code),
  },
  {
    name: 'singleton-pattern',
    detect: (_, code) => /static\s+instance|getInstance\s*\(/.test(code),
  },
  {
    name: 'decorator-pattern',
    detect: (_, code) => /@\w+\s*\(/.test(code),
  },
  {
    name: 'middleware-pattern',
    detect: (_, code) => /\b(req|request)\s*,\s*(res|response)\s*,\s*(next|done)\b/.test(code),
  },
  {
    name: 'event-handler',
    detect: (_, code) => /on[A-Z]\w+|handle[A-Z]\w+|\.on\s*\(/.test(code),
  },
  {
    name: 'validation',
    detect: (_, code) => /validate|isValid|check[A-Z]|assert/.test(code),
  },
];

/**
 * Feature extractor for structural embeddings
 */
export class FeatureExtractor {
  private config: FeatureExtractorConfig;

  constructor(config?: Partial<FeatureExtractorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Extract structural features from AST analysis
   */
  extract(analysis: ASTAnalysis, code: string): StructuralFeatures {
    const patterns = this.detectPatterns(analysis, code);

    return {
      hasAsync: analysis.hasAsync,
      hasErrorHandling: analysis.hasErrorHandling,
      hasLoops: analysis.hasLoops,
      hasConditionals: analysis.hasConditionals,
      hasRecursion: analysis.hasRecursion,
      callDepth: analysis.callDepth,
      paramCount: analysis.paramCount,
      returnType: analysis.returnType,
      sideEffects: analysis.sideEffects,
      complexity: analysis.complexity,
      nodeCount: analysis.nodeCount,
      maxNesting: analysis.maxNesting,
      patterns,
    };
  }

  /**
   * Detect patterns in code
   */
  detectPatterns(analysis: ASTAnalysis, code: string): string[] {
    const detected: string[] = [];

    for (const pattern of PATTERN_DEFINITIONS) {
      if (detected.length >= this.config.maxPatterns) break;
      
      if (pattern.detect(analysis, code)) {
        detected.push(pattern.name);
      }
    }

    return detected;
  }

  /**
   * Convert features to a numeric vector
   */
  toVector(features: StructuralFeatures, dimensions: number): number[] {
    const vector = new Array(dimensions).fill(0);
    let idx = 0;

    // Boolean features (normalized to 0/1)
    vector[idx++] = features.hasAsync ? 1 : 0;
    vector[idx++] = features.hasErrorHandling ? 1 : 0;
    vector[idx++] = features.hasLoops ? 1 : 0;
    vector[idx++] = features.hasConditionals ? 1 : 0;
    vector[idx++] = features.hasRecursion ? 1 : 0;

    // Numeric features (normalized)
    vector[idx++] = Math.min(features.callDepth / 10, 1);
    vector[idx++] = Math.min(features.paramCount / 10, 1);
    vector[idx++] = Math.min(features.complexity / 20, 1);
    vector[idx++] = Math.min(features.nodeCount / 100, 1);
    vector[idx++] = Math.min(features.maxNesting / 10, 1);

    // Return type encoding (one-hot style)
    const returnTypes: ReturnType[] = ['void', 'primitive', 'object', 'array', 'promise', 'observable', 'unknown'];
    const returnTypeIdx = returnTypes.indexOf(features.returnType);
    if (returnTypeIdx >= 0 && idx + returnTypeIdx < dimensions) {
      vector[idx + returnTypeIdx] = 1;
    }
    idx += returnTypes.length;

    // Side effect encoding
    const sideEffectTypes = ['io', 'mutation', 'network', 'storage', 'logging', 'unknown'];
    for (const effect of features.sideEffects) {
      const effectIdx = sideEffectTypes.indexOf(effect.type);
      if (effectIdx >= 0 && idx + effectIdx < dimensions) {
        vector[idx + effectIdx] = Math.max(vector[idx + effectIdx]!, effect.confidence);
      }
    }
    idx += sideEffectTypes.length;

    // Pattern encoding (hash-based for remaining dimensions)
    for (const pattern of features.patterns) {
      const hash = this.hashString(pattern);
      const patternIdx = idx + (Math.abs(hash) % (dimensions - idx));
      if (patternIdx < dimensions) {
        vector[patternIdx] = 1;
      }
    }

    // Normalize the vector
    return this.normalizeVector(vector);
  }

  /**
   * Get feature summary as text
   */
  summarize(features: StructuralFeatures): string {
    const parts: string[] = [];

    if (features.hasAsync) parts.push('async');
    if (features.hasErrorHandling) parts.push('error-handling');
    if (features.hasLoops) parts.push('iterative');
    if (features.hasRecursion) parts.push('recursive');
    if (features.complexity > this.config.complexityThreshold) parts.push('complex');
    if (features.maxNesting > this.config.nestingThreshold) parts.push('deeply-nested');
    if (features.sideEffects.length > 0) {
      parts.push(`side-effects(${features.sideEffects.map(e => e.type).join(',')})`);
    }
    if (features.patterns.length > 0) {
      parts.push(`patterns(${features.patterns.slice(0, 3).join(',')})`);
    }

    return parts.join(', ') || 'simple';
  }

  // Private helpers

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
