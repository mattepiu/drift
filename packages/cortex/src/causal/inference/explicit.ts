/**
 * Explicit Reference Inference Strategy
 * 
 * Infers causal relationships based on explicit references
 * in memory content. Looks for memory IDs, supersedes/supersededBy
 * fields, and textual references.
 * 
 * @module causal/inference/explicit
 */

import type { Memory } from '../../types/memory.js';
import type { CausalEvidence } from '../../types/causal.js';
import type { IInferenceStrategy, InferredEdge } from './engine.js';

/**
 * Explicit inference configuration
 */
export interface ExplicitInferenceConfig {
  /** Confidence for supersedes relationships */
  supersedesConfidence: number;
  /** Confidence for ID references */
  idReferenceConfidence: number;
  /** Confidence for textual references */
  textualReferenceConfidence: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ExplicitInferenceConfig = {
  supersedesConfidence: 0.95,
  idReferenceConfidence: 0.85,
  textualReferenceConfidence: 0.6,
};

/**
 * Explicit reference inference strategy
 * 
 * Finds causal relationships from explicit references
 * in memory metadata and content.
 */
export class ExplicitInferenceStrategy implements IInferenceStrategy {
  readonly name = 'explicit_reference' as const;
  private config: ExplicitInferenceConfig;

  constructor(config?: Partial<ExplicitInferenceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Infer causal edges based on explicit references
   */
  async infer(memory: Memory, candidates: Memory[]): Promise<InferredEdge[]> {
    const edges: InferredEdge[] = [];
    const candidateMap = new Map(candidates.map(c => [c.id, c]));

    // Check supersedes/supersededBy fields
    if (memory.supersedes && candidateMap.has(memory.supersedes)) {
      edges.push({
        sourceId: memory.supersedes,
        targetId: memory.id,
        relation: 'supersedes',
        confidence: this.config.supersedesConfidence,
        evidence: this.createEvidence('supersedes', memory.supersedes),
      });
    }

    if (memory.supersededBy && candidateMap.has(memory.supersededBy)) {
      edges.push({
        sourceId: memory.id,
        targetId: memory.supersededBy,
        relation: 'supersedes',
        confidence: this.config.supersedesConfidence,
        evidence: this.createEvidence('supersededBy', memory.supersededBy),
      });
    }

    // Check for memory ID references in content
    const contentRefs = this.findMemoryIdReferences(memory, candidateMap);
    for (const ref of contentRefs) {
      edges.push({
        sourceId: ref.referencedId,
        targetId: memory.id,
        relation: 'derived_from',
        confidence: this.config.idReferenceConfidence,
        evidence: this.createEvidence('idReference', ref.referencedId, ref.context),
      });
    }

    // Check for textual references (topic/name mentions)
    const textualRefs = this.findTextualReferences(memory, candidates);
    for (const ref of textualRefs) {
      // Avoid duplicates
      if (edges.some(e => e.sourceId === ref.candidateId)) {
        continue;
      }

      edges.push({
        sourceId: ref.candidateId,
        targetId: memory.id,
        relation: 'supports',
        confidence: ref.confidence,
        evidence: this.createEvidence('textualReference', ref.candidateId, ref.matchedText),
      });
    }

    return edges;
  }

  /**
   * Find memory ID references in content
   */
  private findMemoryIdReferences(
    memory: Memory,
    candidateMap: Map<string, Memory>
  ): Array<{ referencedId: string; context: string }> {
    const refs: Array<{ referencedId: string; context: string }> = [];

    // Memory ID pattern: mem_<timestamp>_<random>
    const idPattern = /mem_[a-z0-9]+_[a-f0-9]+/gi;

    // Search in various content fields
    const contentToSearch = this.getSearchableContent(memory);

    for (const content of contentToSearch) {
      const matches = content.match(idPattern);
      if (matches) {
        for (const match of matches) {
          if (candidateMap.has(match) && match !== memory.id) {
            // Extract context around the reference
            const index = content.indexOf(match);
            const start = Math.max(0, index - 30);
            const end = Math.min(content.length, index + match.length + 30);
            const context = content.slice(start, end);

            refs.push({ referencedId: match, context });
          }
        }
      }
    }

    return refs;
  }

  /**
   * Find textual references to other memories
   */
  private findTextualReferences(
    memory: Memory,
    candidates: Memory[]
  ): Array<{ candidateId: string; matchedText: string; confidence: number }> {
    const refs: Array<{ candidateId: string; matchedText: string; confidence: number }> = [];
    const contentToSearch = this.getSearchableContent(memory).join(' ').toLowerCase();

    for (const candidate of candidates) {
      // Get searchable terms from candidate
      const terms = this.getSearchableTerms(candidate);

      for (const term of terms) {
        if (term.length < 4) continue; // Skip short terms

        const termLower = term.toLowerCase();

        // Check for exact match
        if (contentToSearch.includes(termLower)) {
          // Calculate confidence based on term specificity
          const confidence = this.calculateTermConfidence(term, contentToSearch);

          if (confidence >= 0.3) {
            refs.push({
              candidateId: candidate.id,
              matchedText: term,
              confidence: Math.min(confidence, this.config.textualReferenceConfidence),
            });
            break; // One match per candidate is enough
          }
        }
      }
    }

    return refs;
  }

  /**
   * Get searchable content from a memory
   */
  private getSearchableContent(memory: Memory): string[] {
    const content: string[] = [memory.summary];

    // Type-specific content
    if ('knowledge' in memory && typeof memory.knowledge === 'string') {
      content.push(memory.knowledge);
    }
    if ('rationale' in memory && typeof memory.rationale === 'string') {
      content.push(memory.rationale);
    }
    if ('context' in memory && typeof memory.context === 'string') {
      content.push(memory.context);
    }
    if ('description' in memory && typeof memory.description === 'string') {
      content.push(memory.description);
    }
    if ('warnings' in memory && Array.isArray(memory.warnings)) {
      content.push(...memory.warnings);
    }

    return content.filter(Boolean);
  }

  /**
   * Get searchable terms from a memory
   */
  private getSearchableTerms(memory: Memory): string[] {
    const terms: string[] = [];

    // Add topic/name
    if ('topic' in memory && typeof memory.topic === 'string') {
      terms.push(memory.topic);
    }
    if ('name' in memory && typeof memory.name === 'string') {
      terms.push(memory.name);
    }
    if ('patternName' in memory && typeof memory.patternName === 'string') {
      terms.push(memory.patternName);
    }
    if ('constraintName' in memory && typeof memory.constraintName === 'string') {
      terms.push(memory.constraintName);
    }

    // Add tags
    if (memory.tags) {
      terms.push(...memory.tags);
    }

    return terms.filter(t => t && t.length >= 4);
  }

  /**
   * Calculate confidence based on term specificity
   */
  private calculateTermConfidence(term: string, content: string): number {
    // Longer terms are more specific
    const lengthFactor = Math.min(1, term.length / 20);

    // Count occurrences
    const regex = new RegExp(term.toLowerCase(), 'gi');
    const matches = content.match(regex);
    const occurrences = matches ? matches.length : 0;

    // More occurrences = higher confidence (up to a point)
    const occurrenceFactor = Math.min(1, occurrences / 3);

    // Check if it's a common word
    const commonWords = new Set([
      'function', 'class', 'method', 'variable', 'const', 'type',
      'error', 'warning', 'info', 'data', 'value', 'result',
      'user', 'admin', 'system', 'config', 'settings',
    ]);

    const specificityFactor = commonWords.has(term.toLowerCase()) ? 0.3 : 1.0;

    return lengthFactor * 0.3 + occurrenceFactor * 0.3 + specificityFactor * 0.4;
  }

  /**
   * Create evidence for the inference
   */
  private createEvidence(
    type: 'supersedes' | 'supersededBy' | 'idReference' | 'textualReference',
    referencedId: string,
    context?: string
  ): CausalEvidence {
    let description: string;

    switch (type) {
      case 'supersedes':
        description = `Explicitly supersedes memory ${referencedId}`;
        break;
      case 'supersededBy':
        description = `Explicitly superseded by memory ${referencedId}`;
        break;
      case 'idReference':
        description = context
          ? `References memory ID in content: "...${context}..."`
          : `References memory ID ${referencedId}`;
        break;
      case 'textualReference':
        description = context
          ? `Textual reference to "${context}"`
          : `Textual reference found`;
        break;
    }

    const confidence = type === 'supersedes' || type === 'supersededBy'
      ? this.config.supersedesConfidence
      : type === 'idReference'
        ? this.config.idReferenceConfidence
        : this.config.textualReferenceConfidence;

    return {
      type: 'explicit',
      description,
      confidence,
      reference: referencedId,
      gatheredAt: new Date().toISOString(),
    };
  }
}
