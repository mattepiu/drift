/**
 * Pattern Context Gatherer
 * 
 * Gathers pattern context for code generation.
 * Finds relevant patterns based on file, query,
 * and provides examples.
 * 
 * @module generation/context/pattern-gatherer
 */

import type { IMemoryStorage } from '../../storage/interface.js';
import type { Memory, MemoryType } from '../../types/index.js';
import type { PatternRationaleMemory } from '../../types/pattern-rationale.js';
import type { GenerationTarget, PatternContext, CodeExample } from '../types.js';

/**
 * Configuration for pattern gatherer
 */
export interface PatternGathererConfig {
  /** Maximum patterns to gather */
  maxPatterns: number;
  /** Minimum relevance score */
  minRelevance: number;
  /** Whether to include examples */
  includeExamples: boolean;
  /** Maximum examples per pattern */
  maxExamplesPerPattern: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: PatternGathererConfig = {
  maxPatterns: 10,
  minRelevance: 0.3,
  includeExamples: true,
  maxExamplesPerPattern: 2,
};

/**
 * Pattern Context Gatherer
 * 
 * Gathers pattern context for code generation.
 */
export class PatternContextGatherer {
  private config: PatternGathererConfig;
  private storage: IMemoryStorage;

  constructor(storage: IMemoryStorage, config?: Partial<PatternGathererConfig>) {
    this.storage = storage;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Gather pattern context for generation
   */
  async gather(target: GenerationTarget, query: string): Promise<PatternContext[]> {
    const contexts: PatternContext[] = [];
    const seen = new Set<string>();

    // Get patterns linked to the file
    const filePatterns = await this.getFilePatterns(target.filePath);
    for (const memory of filePatterns) {
      if (seen.has(memory.id)) continue;
      seen.add(memory.id);

      const context = await this.buildPatternContext(memory, target, 'file_linked');
      if (context.relevanceScore >= this.config.minRelevance) {
        contexts.push(context);
      }
    }

    // Get patterns matching the query
    const queryPatterns = await this.getQueryPatterns(query);
    for (const memory of queryPatterns) {
      if (seen.has(memory.id)) continue;
      seen.add(memory.id);

      const context = await this.buildPatternContext(memory, target, 'query_matched');
      if (context.relevanceScore >= this.config.minRelevance) {
        contexts.push(context);
      }
    }

    // Get patterns for the language/framework
    const frameworkPatterns = await this.getFrameworkPatterns(target);
    for (const memory of frameworkPatterns) {
      if (seen.has(memory.id)) continue;
      seen.add(memory.id);

      const context = await this.buildPatternContext(memory, target, 'framework_matched');
      if (context.relevanceScore >= this.config.minRelevance) {
        contexts.push(context);
      }
    }

    // Sort by relevance and limit
    contexts.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return contexts.slice(0, this.config.maxPatterns);
  }

  /**
   * Get patterns linked to a file
   */
  private async getFilePatterns(file: string): Promise<Memory[]> {
    try {
      const memories = await this.storage.findByFile(file);
      return memories.filter(m => m.type === 'pattern_rationale');
    } catch {
      return [];
    }
  }

  /**
   * Get patterns matching a query
   */
  private async getQueryPatterns(query: string): Promise<Memory[]> {
    try {
      // Extract keywords from query
      const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      
      const results = await this.storage.search({
        types: ['pattern_rationale'] as MemoryType[],
        tags: keywords.slice(0, 5),
        limit: 10,
      });

      return results;
    } catch {
      return [];
    }
  }

  /**
   * Get patterns for the target framework/language
   */
  private async getFrameworkPatterns(target: GenerationTarget): Promise<Memory[]> {
    try {
      const topics: string[] = [target.language];
      if (target.framework) {
        topics.push(target.framework);
      }

      const results = await this.storage.search({
        types: ['pattern_rationale'] as MemoryType[],
        topics,
        limit: 10,
      });

      return results;
    } catch {
      return [];
    }
  }

  /**
   * Build pattern context from memory
   */
  private async buildPatternContext(
    memory: Memory,
    _target: GenerationTarget,
    relevanceReason: string
  ): Promise<PatternContext> {
    const patternMemory = memory as PatternRationaleMemory;
    
    // Calculate relevance score
    const relevanceScore = this.calculateRelevance(patternMemory, relevanceReason);

    // Get example if configured
    const example = this.config.includeExamples
      ? this.getPatternExample(patternMemory)
      : undefined;

    // Extract key rules from rationale
    const keyRules = this.extractKeyRules(patternMemory);

    // Build result - only include optional properties if they have values
    const result: PatternContext = {
      patternId: patternMemory.patternId,
      patternName: patternMemory.summary,
      category: this.inferCategory(patternMemory),
      relevanceReason: this.formatRelevanceReason(relevanceReason),
      relevanceScore,
      keyRules,
      confidence: patternMemory.confidence,
    };

    if (example) {
      result.example = example;
    }

    return result;
  }

  /**
   * Calculate relevance score
   */
  private calculateRelevance(
    memory: PatternRationaleMemory,
    reason: string
  ): number {
    let score = memory.confidence;

    // Boost for file-linked patterns
    if (reason === 'file_linked') {
      score += 0.2;
    }

    // Boost for query-matched patterns
    if (reason === 'query_matched') {
      score += 0.1;
    }

    // Boost for framework-matched patterns
    if (reason === 'framework_matched') {
      score += 0.05;
    }

    // Boost for high access count
    if (memory.accessCount > 10) {
      score += 0.1;
    } else if (memory.accessCount > 5) {
      score += 0.05;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Get example code for a pattern
   * Uses citations from the pattern memory
   */
  private getPatternExample(memory: PatternRationaleMemory): CodeExample | undefined {
    // Check if memory has citations (which contain code examples)
    if (memory.citations && memory.citations.length > 0) {
      const citation = memory.citations[0];
      if (citation) {
        const example: CodeExample = {
          code: citation.snippet ?? `// See ${citation.file}:${citation.lineStart}-${citation.lineEnd}`,
          language: this.inferLanguageFromFile(citation.file),
        };
        if (citation.file) {
          example.filePath = citation.file;
        }
        if (citation.lineStart !== undefined) {
          example.lineStart = citation.lineStart;
        }
        if (citation.lineEnd !== undefined) {
          example.lineEnd = citation.lineEnd;
        }
        return example;
      }
    }

    return undefined;
  }

  /**
   * Infer language from file extension
   */
  private inferLanguageFromFile(file: string): string {
    const ext = file.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'js':
      case 'jsx':
        return 'javascript';
      case 'py':
        return 'python';
      case 'java':
        return 'java';
      case 'cs':
        return 'csharp';
      case 'go':
        return 'go';
      case 'rs':
        return 'rust';
      default:
        return 'typescript';
    }
  }

  /**
   * Extract key rules from pattern rationale
   */
  private extractKeyRules(memory: PatternRationaleMemory): string[] {
    const rules: string[] = [];

    // Add rationale as a rule
    if (memory.rationale) {
      rules.push(memory.rationale);
    }

    // Add any explicit rules
    if (memory.tags) {
      for (const tag of memory.tags.slice(0, 3)) {
        rules.push(`Follow ${tag} conventions`);
      }
    }

    return rules.slice(0, 5);
  }

  /**
   * Infer category from pattern memory
   */
  private inferCategory(memory: PatternRationaleMemory): string {
    // Use pattern category if available
    if (memory.patternCategory) {
      return memory.patternCategory;
    }

    // Check tags for category hints
    const categoryTags = ['api', 'auth', 'database', 'error', 'logging', 'testing', 'ui'];
    for (const tag of memory.tags ?? []) {
      if (categoryTags.includes(tag.toLowerCase())) {
        return tag.toLowerCase();
      }
    }

    return 'general';
  }

  /**
   * Format relevance reason for display
   */
  private formatRelevanceReason(reason: string): string {
    switch (reason) {
      case 'file_linked':
        return 'Linked to target file';
      case 'query_matched':
        return 'Matches query keywords';
      case 'framework_matched':
        return 'Matches target framework/language';
      default:
        return 'Related pattern';
    }
  }
}
