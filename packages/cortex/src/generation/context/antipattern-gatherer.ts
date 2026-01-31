/**
 * Anti-Pattern Gatherer
 * 
 * Gathers anti-patterns to avoid during code generation.
 * Uses code smell memories to identify patterns that
 * should not be followed.
 * 
 * @module generation/context/antipattern-gatherer
 */

import type { IMemoryStorage } from '../../storage/interface.js';
import type { Memory, MemoryType } from '../../types/index.js';
import type { CodeSmellMemory } from '../../types/code-smell.js';
import type { GenerationTarget, AntiPatternContext } from '../types.js';

/**
 * Configuration for anti-pattern gatherer
 */
export interface AntiPatternGathererConfig {
  /** Maximum anti-patterns to gather */
  maxAntiPatterns: number;
  /** Minimum relevance score */
  minRelevance: number;
  /** Include examples */
  includeExamples: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: AntiPatternGathererConfig = {
  maxAntiPatterns: 10,
  minRelevance: 0.3,
  includeExamples: true,
};

/**
 * Anti-Pattern Gatherer
 * 
 * Gathers anti-patterns to avoid during code generation.
 */
export class AntiPatternGatherer {
  private config: AntiPatternGathererConfig;
  private storage: IMemoryStorage;

  constructor(storage: IMemoryStorage, config?: Partial<AntiPatternGathererConfig>) {
    this.storage = storage;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Gather anti-pattern context for generation
   */
  async gather(target: GenerationTarget, query: string): Promise<AntiPatternContext[]> {
    const contexts: AntiPatternContext[] = [];
    const seen = new Set<string>();

    // Get code smells linked to the file
    const fileSmells = await this.getFileSmells(target.filePath);
    for (const memory of fileSmells) {
      if (seen.has(memory.id)) continue;
      seen.add(memory.id);

      const context = this.buildAntiPatternContext(memory as CodeSmellMemory, target, query, 'file_linked');
      if (context && context.relevanceScore >= this.config.minRelevance) {
        contexts.push(context);
      }
    }

    // Get code smells by topic/tags
    const topicSmells = await this.getTopicSmells(target, query);
    for (const memory of topicSmells) {
      if (seen.has(memory.id)) continue;
      seen.add(memory.id);

      const context = this.buildAntiPatternContext(memory as CodeSmellMemory, target, query, 'topic_matched');
      if (context && context.relevanceScore >= this.config.minRelevance) {
        contexts.push(context);
      }
    }

    // Get high-severity code smells
    const severeSmells = await this.getSevereSmells();
    for (const memory of severeSmells) {
      if (seen.has(memory.id)) continue;
      seen.add(memory.id);

      const context = this.buildAntiPatternContext(memory as CodeSmellMemory, target, query, 'severe');
      if (context && this.smellApplies(memory as CodeSmellMemory, target, query)) {
        contexts.push(context);
      }
    }

    // Sort by relevance (errors first)
    contexts.sort((a, b) => {
      // Prioritize by severity implied in the pattern
      const aIsError = a.reason.toLowerCase().includes('error') || a.reason.toLowerCase().includes('security');
      const bIsError = b.reason.toLowerCase().includes('error') || b.reason.toLowerCase().includes('security');
      if (aIsError && !bIsError) return -1;
      if (bIsError && !aIsError) return 1;
      return b.relevanceScore - a.relevanceScore;
    });

    return contexts.slice(0, this.config.maxAntiPatterns);
  }

  /**
   * Get code smells linked to a file
   */
  private async getFileSmells(file: string): Promise<Memory[]> {
    try {
      const memories = await this.storage.findByFile(file);
      return memories.filter(m => m.type === 'code_smell');
    } catch {
      return [];
    }
  }

  /**
   * Get code smells by topic
   */
  private async getTopicSmells(target: GenerationTarget, query: string): Promise<Memory[]> {
    try {
      // Build tags from target and query
      const tags: string[] = [];
      
      // Add language/framework as tags
      tags.push(target.language);
      if (target.framework) {
        tags.push(target.framework);
      }

      // Extract keywords from query
      const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      tags.push(...keywords.slice(0, 3));

      const results = await this.storage.search({
        types: ['code_smell'] as MemoryType[],
        tags,
        limit: 15,
      });

      return results;
    } catch {
      return [];
    }
  }

  /**
   * Get severe code smells (errors)
   */
  private async getSevereSmells(): Promise<Memory[]> {
    try {
      const results = await this.storage.search({
        types: ['code_smell'] as MemoryType[],
        importance: ['critical', 'high'],
        limit: 10,
      });

      return results;
    } catch {
      return [];
    }
  }

  /**
   * Check if code smell applies to target
   */
  smellApplies(smell: CodeSmellMemory, target: GenerationTarget, query: string): boolean {
    const queryLower = query.toLowerCase();
    const nameLower = smell.name.toLowerCase();
    const descLower = smell.description.toLowerCase();

    // Check name match in query
    if (queryLower.includes(nameLower) || nameLower.includes(queryLower.split(' ')[0] ?? '')) {
      return true;
    }

    // Check description keywords in query
    const descKeywords = descLower.split(/\s+/).filter(w => w.length > 4);
    if (descKeywords.some(kw => queryLower.includes(kw))) {
      return true;
    }

    // Check linked files
    if (smell.linkedFiles) {
      for (const linkedFile of smell.linkedFiles) {
        if (target.filePath.includes(linkedFile) || linkedFile.includes(target.filePath)) {
          return true;
        }
      }
    }

    // Check tags
    if (smell.tags) {
      const targetTags = [target.language, target.framework].filter(Boolean).map(t => t?.toLowerCase());
      if (smell.tags.some(tag => targetTags.includes(tag.toLowerCase()))) {
        return true;
      }
    }

    // Error severity always applies
    if (smell.severity === 'error') {
      return true;
    }

    return false;
  }

  /**
   * Build anti-pattern context from code smell memory
   */
  private buildAntiPatternContext(
    memory: CodeSmellMemory,
    _target: GenerationTarget,
    _query: string,
    relevanceReason: string
  ): AntiPatternContext | null {
    // Calculate relevance score
    const relevanceScore = this.calculateRelevance(memory, relevanceReason);

    // Build result - only include optional properties if they have values
    const result: AntiPatternContext = {
      memoryId: memory.id,
      name: memory.name,
      pattern: memory.pattern ?? memory.description,
      reason: memory.reason,
      alternative: memory.suggestion,
      relevanceScore,
    };

    if (this.config.includeExamples) {
      if (memory.exampleBad) {
        result.badExample = memory.exampleBad;
      }
      if (memory.exampleGood) {
        result.goodExample = memory.exampleGood;
      }
    }

    return result;
  }

  /**
   * Calculate relevance score
   */
  private calculateRelevance(
    memory: CodeSmellMemory,
    reason: string
  ): number {
    let score = memory.confidence;

    // Boost for file-linked
    if (reason === 'file_linked') {
      score += 0.25;
    }

    // Boost for topic match
    if (reason === 'topic_matched') {
      score += 0.15;
    }

    // Boost for severe
    if (reason === 'severe') {
      score += 0.1;
    }

    // Boost for error severity
    if (memory.severity === 'error') {
      score += 0.2;
    } else if (memory.severity === 'warning') {
      score += 0.1;
    }

    // Boost for high access count
    if (memory.accessCount > 10) {
      score += 0.1;
    }

    // Boost for auto-detect enabled (actively monitored)
    if (memory.autoDetect) {
      score += 0.05;
    }

    return Math.min(score, 1.0);
  }
}
