/**
 * Causal Inference Engine
 * 
 * Orchestrates multiple inference strategies to automatically
 * discover causal relationships between memories.
 * 
 * @module causal/inference/engine
 */

import type {
  CausalEdge,
  CausalInferenceResult,
  CausalInferenceStrategy,
  CausalEvidence,
} from '../../types/causal.js';
import type { Memory } from '../../types/memory.js';
import type { ICausalStorage } from '../storage/interface.js';
import type { IMemoryStorage } from '../../storage/interface.js';
import { TemporalInferenceStrategy } from './temporal.js';
import { SemanticInferenceStrategy } from './semantic.js';
import { EntityInferenceStrategy } from './entity.js';
import { ExplicitInferenceStrategy } from './explicit.js';

/**
 * Inference engine configuration
 */
export interface InferenceEngineConfig {
  /** Minimum confidence to create an edge */
  minConfidence: number;
  /** Maximum edges to infer per memory */
  maxEdgesPerMemory: number;
  /** Strategies to use */
  strategies: CausalInferenceStrategy[];
  /** Whether to validate inferences before storing */
  validateBeforeStore: boolean;
  /** Weight for each strategy */
  strategyWeights: Partial<Record<CausalInferenceStrategy, number>>;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: InferenceEngineConfig = {
  minConfidence: 0.5,
  maxEdgesPerMemory: 10,
  strategies: ['temporal_proximity', 'semantic_similarity', 'entity_overlap', 'explicit_reference'],
  validateBeforeStore: true,
  strategyWeights: {
    temporal_proximity: 0.2,
    semantic_similarity: 0.3,
    entity_overlap: 0.25,
    explicit_reference: 0.4,
    pattern_matching: 0.15,
    file_co_occurrence: 0.1,
  },
};

/**
 * Inference strategy interface
 */
export interface IInferenceStrategy {
  /** Strategy name */
  readonly name: CausalInferenceStrategy;
  /** Infer potential causal edges for a memory */
  infer(memory: Memory, candidates: Memory[]): Promise<InferredEdge[]>;
}

/**
 * An inferred edge before validation
 */
export interface InferredEdge {
  sourceId: string;
  targetId: string;
  relation: CausalEdge['relation'];
  confidence: number;
  evidence: CausalEvidence;
}

/**
 * Causal inference engine
 * 
 * Coordinates multiple inference strategies to discover
 * causal relationships between memories.
 */
export class CausalInferenceEngine {
  private config: InferenceEngineConfig;
  private strategies: Map<CausalInferenceStrategy, IInferenceStrategy>;

  constructor(
    private causalStorage: ICausalStorage,
    private memoryStorage: IMemoryStorage,
    config?: Partial<InferenceEngineConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.strategies = new Map();

    // Initialize strategies
    this.initializeStrategies();
  }

  /**
   * Infer causal relationships for a memory
   * 
   * Analyzes the memory and finds potential causes
   * (memories that may have led to this one).
   */
  async inferCauses(memory: Memory): Promise<CausalInferenceResult> {
    const startTime = Date.now();
    const warnings: string[] = [];

    // Get candidate memories (created before this one)
    const candidates = await this.getCandidates(memory, 'before');

    if (candidates.length === 0) {
      return this.createEmptyResult(memory.id, startTime);
    }

    // Run inference strategies
    const allInferred = await this.runStrategies(memory, candidates, 'causes');

    // Deduplicate and rank
    const ranked = this.rankAndDeduplicate(allInferred);

    // Filter by confidence
    const filtered = ranked.filter(e => e.confidence >= this.config.minConfidence);

    // Limit results
    const limited = filtered.slice(0, this.config.maxEdgesPerMemory);

    // Validate if configured
    const validated = this.config.validateBeforeStore
      ? await this.validateInferences(limited, warnings)
      : limited;

    // Convert to edges
    const inferredEdges = await this.createEdges(validated);

    return {
      memoryId: memory.id,
      inferredEdges,
      confidence: this.computeOverallConfidence(inferredEdges),
      strategiesUsed: this.getUsedStrategies(allInferred),
      inferenceTimeMs: Date.now() - startTime,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Infer causal relationships from a memory
   * 
   * Analyzes the memory and finds potential effects
   * (memories that may have been influenced by this one).
   */
  async inferEffects(memory: Memory): Promise<CausalInferenceResult> {
    const startTime = Date.now();
    const warnings: string[] = [];

    // Get candidate memories (created after this one)
    const candidates = await this.getCandidates(memory, 'after');

    if (candidates.length === 0) {
      return this.createEmptyResult(memory.id, startTime);
    }

    // Run inference strategies
    const allInferred = await this.runStrategies(memory, candidates, 'effects');

    // Deduplicate and rank
    const ranked = this.rankAndDeduplicate(allInferred);

    // Filter by confidence
    const filtered = ranked.filter(e => e.confidence >= this.config.minConfidence);

    // Limit results
    const limited = filtered.slice(0, this.config.maxEdgesPerMemory);

    // Validate if configured
    const validated = this.config.validateBeforeStore
      ? await this.validateInferences(limited, warnings)
      : limited;

    // Convert to edges
    const inferredEdges = await this.createEdges(validated);

    return {
      memoryId: memory.id,
      inferredEdges,
      confidence: this.computeOverallConfidence(inferredEdges),
      strategiesUsed: this.getUsedStrategies(allInferred),
      inferenceTimeMs: Date.now() - startTime,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Validate an existing edge
   */
  async validateInference(edge: CausalEdge): Promise<boolean> {
    // Check if both memories still exist
    const source = await this.memoryStorage.read(edge.sourceId);
    const target = await this.memoryStorage.read(edge.targetId);

    if (!source || !target) {
      return false;
    }

    // Check temporal ordering (source should be before target for most relations)
    if (edge.relation !== 'contradicts' && edge.relation !== 'supports') {
      const sourceTime = new Date(source.createdAt).getTime();
      const targetTime = new Date(target.createdAt).getTime();

      if (sourceTime > targetTime) {
        return false;
      }
    }

    // Check if edge strength is still reasonable
    if (edge.strength < 0.1) {
      return false;
    }

    return true;
  }

  /**
   * Store inferred edges
   */
  async storeInferences(result: CausalInferenceResult): Promise<string[]> {
    const ids: string[] = [];

    for (const edge of result.inferredEdges) {
      // Check if edge already exists
      const existing = await this.causalStorage.getEdgeBetween(
        edge.sourceId,
        edge.targetId,
        edge.relation
      );

      if (existing) {
        // Update strength if new inference is stronger
        if (edge.strength > existing.strength) {
          await this.causalStorage.updateStrength(existing.id, edge.strength);
        }
        ids.push(existing.id);
      } else {
        // Create new edge
        const id = await this.causalStorage.createEdge({
          sourceId: edge.sourceId,
          targetId: edge.targetId,
          relation: edge.relation,
          strength: edge.strength,
          evidence: edge.evidence,
          inferred: true,
        });
        ids.push(id);
      }
    }

    return ids;
  }

  // Private methods

  private initializeStrategies(): void {
    if (this.config.strategies.includes('temporal_proximity')) {
      this.strategies.set('temporal_proximity', new TemporalInferenceStrategy());
    }
    if (this.config.strategies.includes('semantic_similarity')) {
      this.strategies.set('semantic_similarity', new SemanticInferenceStrategy());
    }
    if (this.config.strategies.includes('entity_overlap')) {
      this.strategies.set('entity_overlap', new EntityInferenceStrategy());
    }
    if (this.config.strategies.includes('explicit_reference')) {
      this.strategies.set('explicit_reference', new ExplicitInferenceStrategy());
    }
  }

  private async getCandidates(
    memory: Memory,
    direction: 'before' | 'after'
  ): Promise<Memory[]> {
    const memoryTime = memory.createdAt;

    const query: import('../../types/memory.js').MemoryQuery = {
      limit: 100,
      orderBy: 'createdAt',
      orderDir: direction === 'before' ? 'desc' : 'asc',
    };

    if (direction === 'before') {
      query.maxDate = memoryTime;
    } else {
      query.minDate = memoryTime;
    }

    const candidates = await this.memoryStorage.search(query);

    // Filter out the memory itself
    return candidates.filter(c => c.id !== memory.id);
  }

  private async runStrategies(
    memory: Memory,
    candidates: Memory[],
    direction: 'causes' | 'effects'
  ): Promise<Array<InferredEdge & { strategy: CausalInferenceStrategy }>> {
    const results: Array<InferredEdge & { strategy: CausalInferenceStrategy }> = [];

    for (const [strategyName, strategy] of this.strategies) {
      try {
        const inferred = await strategy.infer(memory, candidates);

        for (const edge of inferred) {
          // Adjust source/target based on direction
          const adjustedEdge = direction === 'causes'
            ? edge // candidate -> memory
            : { ...edge, sourceId: memory.id, targetId: edge.sourceId }; // memory -> candidate

          results.push({
            ...adjustedEdge,
            strategy: strategyName,
          });
        }
      } catch (err) {
        console.warn(`Strategy ${strategyName} failed:`, (err as Error).message);
      }
    }

    return results;
  }

  private rankAndDeduplicate(
    inferred: Array<InferredEdge & { strategy: CausalInferenceStrategy }>
  ): InferredEdge[] {
    // Group by source-target-relation
    const groups = new Map<string, Array<InferredEdge & { strategy: CausalInferenceStrategy }>>();

    for (const edge of inferred) {
      const key = `${edge.sourceId}:${edge.targetId}:${edge.relation}`;
      const group = groups.get(key) || [];
      group.push(edge);
      groups.set(key, group);
    }

    // Merge groups
    const merged: InferredEdge[] = [];

    for (const group of groups.values()) {
      if (group.length === 0) continue;

      // Combine confidences using weighted average
      let totalWeight = 0;
      let weightedConfidence = 0;
      const evidences: CausalEvidence[] = [];

      for (const edge of group) {
        const weight = this.config.strategyWeights[edge.strategy] ?? 0.1;
        totalWeight += weight;
        weightedConfidence += edge.confidence * weight;
        evidences.push(edge.evidence);
      }

      const first = group[0];
      if (first) {
        merged.push({
          sourceId: first.sourceId,
          targetId: first.targetId,
          relation: first.relation,
          confidence: totalWeight > 0 ? weightedConfidence / totalWeight : first.confidence,
          evidence: evidences[0] ?? first.evidence,
        });
      }
    }

    // Sort by confidence
    merged.sort((a, b) => b.confidence - a.confidence);

    return merged;
  }

  private async validateInferences(
    inferred: InferredEdge[],
    warnings: string[]
  ): Promise<InferredEdge[]> {
    const validated: InferredEdge[] = [];

    for (const edge of inferred) {
      // Check if both memories exist
      const source = await this.memoryStorage.read(edge.sourceId);
      const target = await this.memoryStorage.read(edge.targetId);

      if (!source) {
        warnings.push(`Source memory not found: ${edge.sourceId}`);
        continue;
      }

      if (!target) {
        warnings.push(`Target memory not found: ${edge.targetId}`);
        continue;
      }

      // Check for existing contradicting edge
      const existing = await this.causalStorage.getEdgeBetween(
        edge.targetId,
        edge.sourceId,
        edge.relation
      );

      if (existing && existing.strength > edge.confidence) {
        warnings.push(`Contradicting edge exists with higher strength`);
        continue;
      }

      validated.push(edge);
    }

    return validated;
  }

  private async createEdges(inferred: InferredEdge[]): Promise<CausalEdge[]> {
    const edges: CausalEdge[] = [];
    const now = new Date().toISOString();

    for (const inf of inferred) {
      edges.push({
        id: '', // Will be assigned on storage
        sourceId: inf.sourceId,
        targetId: inf.targetId,
        relation: inf.relation,
        strength: inf.confidence,
        evidence: [inf.evidence],
        inferred: true,
        createdAt: now,
      });
    }

    return edges;
  }

  private computeOverallConfidence(edges: CausalEdge[]): number {
    if (edges.length === 0) return 0;
    return edges.reduce((sum, e) => sum + e.strength, 0) / edges.length;
  }

  private getUsedStrategies(
    inferred: Array<{ strategy: CausalInferenceStrategy }>
  ): CausalInferenceStrategy[] {
    return [...new Set(inferred.map(e => e.strategy))];
  }

  private createEmptyResult(memoryId: string, startTime: number): CausalInferenceResult {
    return {
      memoryId,
      inferredEdges: [],
      confidence: 0,
      strategiesUsed: [],
      inferenceTimeMs: Date.now() - startTime,
    };
  }
}
