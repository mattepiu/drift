/**
 * Entity Overlap Inference Strategy
 * 
 * Infers causal relationships based on shared entities
 * (files, functions, patterns, constraints). Memories
 * linked to the same code entities are likely related.
 * 
 * @module causal/inference/entity
 */

import type { Memory } from '../../types/memory.js';
import type { CausalEvidence } from '../../types/causal.js';
import type { IInferenceStrategy, InferredEdge } from './engine.js';

/**
 * Entity inference configuration
 */
export interface EntityInferenceConfig {
  /** Minimum overlap ratio to consider */
  minOverlapRatio: number;
  /** Weight for file overlap */
  fileWeight: number;
  /** Weight for function overlap */
  functionWeight: number;
  /** Weight for pattern overlap */
  patternWeight: number;
  /** Weight for constraint overlap */
  constraintWeight: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: EntityInferenceConfig = {
  minOverlapRatio: 0.2,
  fileWeight: 0.35,
  functionWeight: 0.3,
  patternWeight: 0.2,
  constraintWeight: 0.15,
};

/**
 * Entity overlap inference strategy
 * 
 * Memories that reference the same code entities
 * (files, functions, patterns) are likely causally related.
 */
export class EntityInferenceStrategy implements IInferenceStrategy {
  readonly name = 'entity_overlap' as const;
  private config: EntityInferenceConfig;

  constructor(config?: Partial<EntityInferenceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Infer causal edges based on entity overlap
   */
  async infer(memory: Memory, candidates: Memory[]): Promise<InferredEdge[]> {
    const edges: InferredEdge[] = [];
    const memoryEntities = this.extractEntities(memory);

    // Skip if memory has no linked entities
    if (this.countEntities(memoryEntities) === 0) {
      return edges;
    }

    for (const candidate of candidates) {
      const candidateEntities = this.extractEntities(candidate);

      // Skip if candidate has no linked entities
      if (this.countEntities(candidateEntities) === 0) {
        continue;
      }

      const overlap = this.calculateOverlap(memoryEntities, candidateEntities);

      if (overlap.score < this.config.minOverlapRatio) {
        continue;
      }

      const relation = this.determineRelation(memory, candidate, overlap);

      edges.push({
        sourceId: candidate.id,
        targetId: memory.id,
        relation,
        confidence: overlap.score,
        evidence: this.createEvidence(overlap),
      });
    }

    return edges;
  }

  /**
   * Extract all entities from a memory
   */
  private extractEntities(memory: Memory): EntitySet {
    return {
      files: new Set(memory.linkedFiles || []),
      functions: new Set(memory.linkedFunctions || []),
      patterns: new Set(memory.linkedPatterns || []),
      constraints: new Set(memory.linkedConstraints || []),
    };
  }

  /**
   * Count total entities
   */
  private countEntities(entities: EntitySet): number {
    return (
      entities.files.size +
      entities.functions.size +
      entities.patterns.size +
      entities.constraints.size
    );
  }

  /**
   * Calculate overlap between two entity sets
   */
  private calculateOverlap(a: EntitySet, b: EntitySet): OverlapResult {
    const fileOverlap = this.setOverlap(a.files, b.files);
    const functionOverlap = this.setOverlap(a.functions, b.functions);
    const patternOverlap = this.setOverlap(a.patterns, b.patterns);
    const constraintOverlap = this.setOverlap(a.constraints, b.constraints);

    // Weighted score
    let totalWeight = 0;
    let weightedScore = 0;

    if (a.files.size > 0 || b.files.size > 0) {
      weightedScore += fileOverlap.ratio * this.config.fileWeight;
      totalWeight += this.config.fileWeight;
    }

    if (a.functions.size > 0 || b.functions.size > 0) {
      weightedScore += functionOverlap.ratio * this.config.functionWeight;
      totalWeight += this.config.functionWeight;
    }

    if (a.patterns.size > 0 || b.patterns.size > 0) {
      weightedScore += patternOverlap.ratio * this.config.patternWeight;
      totalWeight += this.config.patternWeight;
    }

    if (a.constraints.size > 0 || b.constraints.size > 0) {
      weightedScore += constraintOverlap.ratio * this.config.constraintWeight;
      totalWeight += this.config.constraintWeight;
    }

    const score = totalWeight > 0 ? weightedScore / totalWeight : 0;

    return {
      score,
      files: fileOverlap,
      functions: functionOverlap,
      patterns: patternOverlap,
      constraints: constraintOverlap,
    };
  }

  /**
   * Calculate overlap between two sets
   */
  private setOverlap(a: Set<string>, b: Set<string>): SetOverlapResult {
    if (a.size === 0 && b.size === 0) {
      return { intersection: [], ratio: 0 };
    }

    const intersection = [...a].filter(x => b.has(x));
    const union = new Set([...a, ...b]);
    const ratio = intersection.length / union.size;

    return { intersection, ratio };
  }

  /**
   * Determine the causal relation type
   */
  private determineRelation(
    _memory: Memory,
    candidate: Memory,
    overlap: OverlapResult
  ): InferredEdge['relation'] {
    // Strong file overlap suggests direct derivation
    if (overlap.files.ratio > 0.5) {
      return 'derived_from';
    }

    // Function overlap suggests code-level causation
    if (overlap.functions.ratio > 0.5) {
      return 'caused';
    }

    // Pattern overlap suggests enabling
    if (overlap.patterns.ratio > 0.5) {
      return 'enabled';
    }

    // Constraint overlap suggests support
    if (overlap.constraints.ratio > 0.5) {
      return 'supports';
    }

    // Default based on memory types
    if (candidate.type === 'episodic') {
      return 'triggered_by';
    }

    return 'supports';
  }

  /**
   * Create evidence for the inference
   */
  private createEvidence(overlap: OverlapResult): CausalEvidence {
    const details: string[] = [];

    if (overlap.files.intersection.length > 0) {
      details.push(`${overlap.files.intersection.length} shared file(s)`);
    }

    if (overlap.functions.intersection.length > 0) {
      details.push(`${overlap.functions.intersection.length} shared function(s)`);
    }

    if (overlap.patterns.intersection.length > 0) {
      details.push(`${overlap.patterns.intersection.length} shared pattern(s)`);
    }

    if (overlap.constraints.intersection.length > 0) {
      details.push(`${overlap.constraints.intersection.length} shared constraint(s)`);
    }

    const description = details.length > 0
      ? `Entity overlap: ${details.join(', ')}`
      : `Entity overlap score: ${Math.round(overlap.score * 100)}%`;

    return {
      type: 'entity',
      description,
      confidence: overlap.score,
      gatheredAt: new Date().toISOString(),
    };
  }
}

/**
 * Entity set structure
 */
interface EntitySet {
  files: Set<string>;
  functions: Set<string>;
  patterns: Set<string>;
  constraints: Set<string>;
}

/**
 * Set overlap result
 */
interface SetOverlapResult {
  intersection: string[];
  ratio: number;
}

/**
 * Full overlap result
 */
interface OverlapResult {
  score: number;
  files: SetOverlapResult;
  functions: SetOverlapResult;
  patterns: SetOverlapResult;
  constraints: SetOverlapResult;
}
