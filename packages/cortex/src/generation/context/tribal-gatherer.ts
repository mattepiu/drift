/**
 * Tribal Context Gatherer
 * 
 * Gathers tribal knowledge context for code generation.
 * Finds relevant institutional knowledge, warnings,
 * and gotchas for the target.
 * 
 * @module generation/context/tribal-gatherer
 */

import type { IMemoryStorage } from '../../storage/interface.js';
import type { Memory, MemoryType } from '../../types/index.js';
import type { TribalMemory } from '../../types/tribal-memory.js';
import type { GenerationTarget, TribalContext } from '../types.js';

/**
 * Configuration for tribal gatherer
 */
export interface TribalGathererConfig {
  /** Maximum tribal memories to gather */
  maxTribal: number;
  /** Minimum relevance score */
  minRelevance: number;
  /** Prioritize critical severity */
  prioritizeCritical: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: TribalGathererConfig = {
  maxTribal: 10,
  minRelevance: 0.3,
  prioritizeCritical: true,
};

/**
 * Tribal Context Gatherer
 * 
 * Gathers tribal knowledge context for code generation.
 */
export class TribalContextGatherer {
  private config: TribalGathererConfig;
  private storage: IMemoryStorage;

  constructor(storage: IMemoryStorage, config?: Partial<TribalGathererConfig>) {
    this.storage = storage;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Gather tribal context for generation
   */
  async gather(target: GenerationTarget, query: string): Promise<TribalContext[]> {
    const contexts: TribalContext[] = [];
    const seen = new Set<string>();

    // Get tribal knowledge linked to the file
    const fileTribal = await this.getFileTribal(target.filePath);
    for (const memory of fileTribal) {
      if (seen.has(memory.id)) continue;
      seen.add(memory.id);

      const context = this.buildTribalContext(memory as TribalMemory, target, query, 'file_linked');
      if (context && context.relevanceScore >= this.config.minRelevance) {
        contexts.push(context);
      }
    }

    // Get tribal knowledge by topic
    const topicTribal = await this.getTopicTribal(target, query);
    for (const memory of topicTribal) {
      if (seen.has(memory.id)) continue;
      seen.add(memory.id);

      const context = this.buildTribalContext(memory as TribalMemory, target, query, 'topic_matched');
      if (context && context.relevanceScore >= this.config.minRelevance) {
        contexts.push(context);
      }
    }

    // Get critical tribal knowledge
    const criticalTribal = await this.getCriticalTribal();
    for (const memory of criticalTribal) {
      if (seen.has(memory.id)) continue;
      seen.add(memory.id);

      const context = this.buildTribalContext(memory as TribalMemory, target, query, 'critical');
      if (context && this.tribalApplies(memory as TribalMemory, target, query)) {
        contexts.push(context);
      }
    }

    // Sort by relevance (critical first if configured)
    contexts.sort((a, b) => {
      if (this.config.prioritizeCritical) {
        if (a.severity === 'critical' && b.severity !== 'critical') return -1;
        if (b.severity === 'critical' && a.severity !== 'critical') return 1;
      }
      return b.relevanceScore - a.relevanceScore;
    });

    return contexts.slice(0, this.config.maxTribal);
  }

  /**
   * Get tribal knowledge linked to a file
   */
  private async getFileTribal(file: string): Promise<Memory[]> {
    try {
      const memories = await this.storage.findByFile(file);
      return memories.filter(m => m.type === 'tribal');
    } catch {
      return [];
    }
  }

  /**
   * Get tribal knowledge by topic
   */
  private async getTopicTribal(target: GenerationTarget, query: string): Promise<Memory[]> {
    try {
      // Build topics from target and query
      const topics: string[] = [];
      
      // Add language/framework as topics
      topics.push(target.language);
      if (target.framework) {
        topics.push(target.framework);
      }

      // Extract keywords from query
      const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      topics.push(...keywords.slice(0, 3));

      const results = await this.storage.search({
        types: ['tribal'] as MemoryType[],
        topics,
        limit: 15,
      });

      return results;
    } catch {
      return [];
    }
  }

  /**
   * Get critical tribal knowledge
   */
  private async getCriticalTribal(): Promise<Memory[]> {
    try {
      const results = await this.storage.search({
        types: ['tribal'] as MemoryType[],
        importance: ['critical'],
        limit: 10,
      });

      return results;
    } catch {
      return [];
    }
  }

  /**
   * Check if tribal knowledge applies to target
   */
  tribalApplies(tribal: TribalMemory, target: GenerationTarget, query: string): boolean {
    // Check topic match
    const topic = tribal.topic.toLowerCase();
    const queryLower = query.toLowerCase();
    const fileLower = target.filePath.toLowerCase();

    // Direct topic match in query
    if (queryLower.includes(topic)) {
      return true;
    }

    // Topic match in file path
    if (fileLower.includes(topic)) {
      return true;
    }

    // Check linked files
    if (tribal.linkedFiles) {
      for (const linkedFile of tribal.linkedFiles) {
        if (target.filePath.includes(linkedFile) || linkedFile.includes(target.filePath)) {
          return true;
        }
      }
    }

    // Check linked tables (for database-related targets)
    if (tribal.linkedTables && tribal.linkedTables.length > 0) {
      const dbKeywords = ['database', 'db', 'sql', 'query', 'table', 'model'];
      if (dbKeywords.some(kw => queryLower.includes(kw) || fileLower.includes(kw))) {
        return true;
      }
    }

    // Critical severity always applies
    if (tribal.severity === 'critical') {
      return true;
    }

    return false;
  }

  /**
   * Build tribal context from memory
   */
  private buildTribalContext(
    memory: TribalMemory,
    target: GenerationTarget,
    query: string,
    relevanceReason: string
  ): TribalContext | null {
    // Calculate relevance score
    const relevanceScore = this.calculateRelevance(memory, target, query, relevanceReason);

    // Build result - only include optional properties if they have values
    const result: TribalContext = {
      memoryId: memory.id,
      topic: memory.topic,
      knowledge: memory.knowledge,
      severity: memory.severity,
      relevanceReason: this.formatRelevanceReason(relevanceReason),
      relevanceScore,
    };

    if (memory.warnings && memory.warnings.length > 0) {
      result.warnings = memory.warnings;
    }

    if (memory.consequences && memory.consequences.length > 0) {
      result.consequences = memory.consequences;
    }

    return result;
  }

  /**
   * Calculate relevance score
   */
  private calculateRelevance(
    memory: TribalMemory,
    _target: GenerationTarget,
    _query: string,
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

    // Boost for critical severity
    if (memory.severity === 'critical') {
      score += 0.2;
    } else if (memory.severity === 'warning') {
      score += 0.1;
    }

    // Boost for high access count
    if (memory.accessCount > 10) {
      score += 0.1;
    }

    // Boost for recent validation
    if (memory.lastValidated) {
      const daysSinceValidation = this.daysSince(memory.lastValidated);
      if (daysSinceValidation < 30) {
        score += 0.05;
      }
    }

    return Math.min(score, 1.0);
  }

  /**
   * Calculate days since a date
   */
  private daysSince(dateStr: string): number {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Format relevance reason for display
   */
  private formatRelevanceReason(reason: string): string {
    switch (reason) {
      case 'file_linked':
        return 'Linked to target file';
      case 'topic_matched':
        return 'Matches topic/keywords';
      case 'critical':
        return 'Critical knowledge';
      default:
        return 'Related knowledge';
    }
  }
}
