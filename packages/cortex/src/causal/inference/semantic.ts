/**
 * Semantic Similarity Inference Strategy
 * 
 * Infers causal relationships based on semantic similarity
 * of memory content. Memories with similar topics, knowledge,
 * or context are more likely to be related.
 * 
 * @module causal/inference/semantic
 */

import type { Memory } from '../../types/memory.js';
import type { CausalEvidence } from '../../types/causal.js';
import type { IInferenceStrategy, InferredEdge } from './engine.js';

/**
 * Semantic inference configuration
 */
export interface SemanticInferenceConfig {
  /** Minimum similarity score to consider */
  minSimilarity: number;
  /** Weight for topic similarity */
  topicWeight: number;
  /** Weight for tag overlap */
  tagWeight: number;
  /** Weight for linked entity overlap */
  entityWeight: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: SemanticInferenceConfig = {
  minSimilarity: 0.3,
  topicWeight: 0.4,
  tagWeight: 0.3,
  entityWeight: 0.3,
};

/**
 * Semantic similarity inference strategy
 * 
 * Uses text similarity and shared attributes to infer
 * causal relationships.
 */
export class SemanticInferenceStrategy implements IInferenceStrategy {
  readonly name = 'semantic_similarity' as const;
  private config: SemanticInferenceConfig;

  constructor(config?: Partial<SemanticInferenceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Infer causal edges based on semantic similarity
   */
  async infer(memory: Memory, candidates: Memory[]): Promise<InferredEdge[]> {
    const edges: InferredEdge[] = [];

    for (const candidate of candidates) {
      const similarity = this.calculateSimilarity(memory, candidate);

      if (similarity < this.config.minSimilarity) {
        continue;
      }

      const relation = this.determineRelation(memory, candidate, similarity);

      edges.push({
        sourceId: candidate.id,
        targetId: memory.id,
        relation,
        confidence: similarity,
        evidence: this.createEvidence(memory, candidate, similarity),
      });
    }

    return edges;
  }

  /**
   * Calculate semantic similarity between two memories
   */
  private calculateSimilarity(memory: Memory, candidate: Memory): number {
    let totalScore = 0;
    let totalWeight = 0;

    // Topic similarity (for memories with topics)
    const topicSimilarity = this.calculateTopicSimilarity(memory, candidate);
    if (topicSimilarity !== null) {
      totalScore += topicSimilarity * this.config.topicWeight;
      totalWeight += this.config.topicWeight;
    }

    // Tag overlap
    const tagSimilarity = this.calculateTagSimilarity(memory, candidate);
    totalScore += tagSimilarity * this.config.tagWeight;
    totalWeight += this.config.tagWeight;

    // Linked entity overlap
    const entitySimilarity = this.calculateEntitySimilarity(memory, candidate);
    totalScore += entitySimilarity * this.config.entityWeight;
    totalWeight += this.config.entityWeight;

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  /**
   * Calculate topic similarity
   */
  private calculateTopicSimilarity(memory: Memory, candidate: Memory): number | null {
    const memoryTopic = this.extractTopic(memory);
    const candidateTopic = this.extractTopic(candidate);

    if (!memoryTopic || !candidateTopic) {
      return null;
    }

    // Exact match
    if (memoryTopic.toLowerCase() === candidateTopic.toLowerCase()) {
      return 1.0;
    }

    // Partial match (one contains the other)
    const memLower = memoryTopic.toLowerCase();
    const candLower = candidateTopic.toLowerCase();

    if (memLower.includes(candLower) || candLower.includes(memLower)) {
      return 0.7;
    }

    // Word overlap
    const memWords = new Set(memLower.split(/\s+/));
    const candWords = new Set(candLower.split(/\s+/));
    const intersection = [...memWords].filter(w => candWords.has(w));

    if (intersection.length > 0) {
      return intersection.length / Math.max(memWords.size, candWords.size);
    }

    return 0;
  }

  /**
   * Calculate tag similarity using Jaccard index
   */
  private calculateTagSimilarity(memory: Memory, candidate: Memory): number {
    const memoryTags = new Set(memory.tags || []);
    const candidateTags = new Set(candidate.tags || []);

    if (memoryTags.size === 0 && candidateTags.size === 0) {
      return 0;
    }

    const intersection = [...memoryTags].filter(t => candidateTags.has(t));
    const union = new Set([...memoryTags, ...candidateTags]);

    return intersection.length / union.size;
  }

  /**
   * Calculate linked entity similarity
   */
  private calculateEntitySimilarity(memory: Memory, candidate: Memory): number {
    const memoryEntities = this.extractLinkedEntities(memory);
    const candidateEntities = this.extractLinkedEntities(candidate);

    if (memoryEntities.size === 0 && candidateEntities.size === 0) {
      return 0;
    }

    const intersection = [...memoryEntities].filter(e => candidateEntities.has(e));
    const union = new Set([...memoryEntities, ...candidateEntities]);

    return intersection.length / union.size;
  }

  /**
   * Extract topic from memory
   */
  private extractTopic(memory: Memory): string | null {
    // Type-specific topic extraction
    if ('topic' in memory && typeof memory.topic === 'string') {
      return memory.topic;
    }
    if ('patternName' in memory && typeof memory.patternName === 'string') {
      return memory.patternName;
    }
    if ('constraintName' in memory && typeof memory.constraintName === 'string') {
      return memory.constraintName;
    }
    if ('name' in memory && typeof memory.name === 'string') {
      return memory.name;
    }

    return null;
  }

  /**
   * Extract all linked entities from a memory
   */
  private extractLinkedEntities(memory: Memory): Set<string> {
    const entities = new Set<string>();

    if (memory.linkedPatterns) {
      memory.linkedPatterns.forEach(p => entities.add(`pattern:${p}`));
    }
    if (memory.linkedConstraints) {
      memory.linkedConstraints.forEach(c => entities.add(`constraint:${c}`));
    }
    if (memory.linkedFiles) {
      memory.linkedFiles.forEach(f => entities.add(`file:${f}`));
    }
    if (memory.linkedFunctions) {
      memory.linkedFunctions.forEach(f => entities.add(`function:${f}`));
    }

    return entities;
  }

  /**
   * Determine the causal relation type
   */
  private determineRelation(
    memory: Memory,
    candidate: Memory,
    similarity: number
  ): InferredEdge['relation'] {
    // High similarity suggests derivation or support
    if (similarity > 0.8) {
      return 'derived_from';
    }

    // Same type often means support
    if (memory.type === candidate.type) {
      return 'supports';
    }

    // Different types with moderate similarity
    if (candidate.type === 'tribal' || candidate.type === 'semantic') {
      return 'enabled';
    }

    return 'supports';
  }

  /**
   * Create evidence for the inference
   */
  private createEvidence(
    memory: Memory,
    candidate: Memory,
    similarity: number
  ): CausalEvidence {
    const reasons: string[] = [];

    // Check what contributed to similarity
    const topicSim = this.calculateTopicSimilarity(memory, candidate);
    if (topicSim && topicSim > 0.5) {
      reasons.push('similar topics');
    }

    const tagSim = this.calculateTagSimilarity(memory, candidate);
    if (tagSim > 0.3) {
      reasons.push('shared tags');
    }

    const entitySim = this.calculateEntitySimilarity(memory, candidate);
    if (entitySim > 0.3) {
      reasons.push('linked to same entities');
    }

    const description = reasons.length > 0
      ? `Semantic similarity (${Math.round(similarity * 100)}%): ${reasons.join(', ')}`
      : `Semantic similarity: ${Math.round(similarity * 100)}%`;

    return {
      type: 'semantic',
      description,
      confidence: similarity,
      gatheredAt: new Date().toISOString(),
    };
  }
}
