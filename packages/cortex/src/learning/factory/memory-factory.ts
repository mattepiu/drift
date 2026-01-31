/**
 * Learning Memory Factory
 * 
 * Creates appropriate memories from analyzed corrections
 * by delegating to specialized creators.
 * 
 * @module learning/factory/memory-factory
 */

import type { Memory } from '../../types/memory.js';
import type { TribalMemory } from '../../types/tribal-memory.js';
import type { PatternRationaleMemory } from '../../types/pattern-rationale.js';
import type { CodeSmellMemory } from '../../types/code-smell.js';
import type { AnalyzedCorrection, CorrectionCategory } from '../../types/learning.js';
import type { IMemoryStorage } from '../../storage/interface.js';
import { TribalMemoryCreator, type MemoryCreator } from './tribal-creator.js';
import { PatternRationaleCreator } from './pattern-creator.js';
import { CodeSmellCreator } from './smell-creator.js';

/**
 * Factory result
 */
export interface FactoryResult {
  /** Created memory */
  memory: Memory;
  /** Memory type created */
  memoryType: string;
  /** Whether memory was stored */
  stored: boolean;
  /** Storage ID if stored */
  storageId?: string;
}

/**
 * Learning Memory Factory
 * 
 * Creates memories from analyzed corrections using the appropriate
 * specialized creator based on correction category.
 */
export class LearningMemoryFactory {
  private tribalCreator: TribalMemoryCreator;
  private patternCreator: PatternRationaleCreator;
  private smellCreator: CodeSmellCreator;

  constructor(
    tribalCreator?: TribalMemoryCreator,
    patternCreator?: PatternRationaleCreator,
    smellCreator?: CodeSmellCreator,
    private storage?: IMemoryStorage
  ) {
    this.tribalCreator = tribalCreator || new TribalMemoryCreator();
    this.patternCreator = patternCreator || new PatternRationaleCreator();
    this.smellCreator = smellCreator || new CodeSmellCreator();
  }

  /**
   * Create a memory from an analyzed correction
   */
  async createFromCorrection(analysis: AnalyzedCorrection): Promise<FactoryResult> {
    // Select appropriate creator
    const creator = this.selectCreator(analysis.category);

    // Create memory
    const memory = creator.create(analysis);

    // Store if storage is available
    let stored = false;
    let storageId: string | undefined;

    if (this.storage) {
      try {
        storageId = await this.storage.create(memory);
        stored = true;
      } catch (error) {
        console.error('Failed to store memory:', error);
      }
    }

    const result: FactoryResult = {
      memory,
      memoryType: memory.type,
      stored,
    };
    
    if (storageId) {
      result.storageId = storageId;
    }

    return result;
  }

  /**
   * Create memories from multiple corrections
   */
  async createFromCorrections(
    analyses: AnalyzedCorrection[]
  ): Promise<FactoryResult[]> {
    const results: FactoryResult[] = [];

    for (const analysis of analyses) {
      const result = await this.createFromCorrection(analysis);
      results.push(result);
    }

    return results;
  }

  /**
   * Select the appropriate creator based on category
   */
  selectCreator(
    category: CorrectionCategory
  ): MemoryCreator<TribalMemory | PatternRationaleMemory | CodeSmellMemory> {
    switch (category) {
      // Tribal knowledge categories
      case 'tribal_miss':
      case 'style_preference':
      case 'naming_convention':
        return this.tribalCreator;

      // Pattern rationale categories
      case 'pattern_violation':
      case 'architecture_mismatch':
      case 'constraint_violation':
        return this.patternCreator;

      // Code smell categories
      case 'security_issue':
      case 'performance_issue':
      case 'api_misuse':
        return this.smellCreator;

      // Default to tribal for uncategorized
      case 'other':
      default:
        return this.tribalCreator;
    }
  }

  /**
   * Create a tribal memory directly
   */
  createTribalMemory(analysis: AnalyzedCorrection): TribalMemory {
    return this.tribalCreator.create(analysis);
  }

  /**
   * Create a pattern rationale memory directly
   */
  createPatternRationaleMemory(analysis: AnalyzedCorrection): PatternRationaleMemory {
    return this.patternCreator.create(analysis);
  }

  /**
   * Create a code smell memory directly
   */
  createCodeSmellMemory(analysis: AnalyzedCorrection): CodeSmellMemory {
    return this.smellCreator.create(analysis);
  }

  /**
   * Get suggested memory type for a category
   */
  getSuggestedType(category: CorrectionCategory): string {
    const typeMap: Record<CorrectionCategory, string> = {
      tribal_miss: 'tribal',
      style_preference: 'tribal',
      naming_convention: 'tribal',
      pattern_violation: 'pattern_rationale',
      architecture_mismatch: 'pattern_rationale',
      constraint_violation: 'pattern_rationale',
      security_issue: 'code_smell',
      performance_issue: 'code_smell',
      api_misuse: 'code_smell',
      other: 'tribal',
    };

    return typeMap[category];
  }

  /**
   * Create factory with default dependencies
   */
  static create(storage?: IMemoryStorage): LearningMemoryFactory {
    return new LearningMemoryFactory(
      new TribalMemoryCreator(),
      new PatternRationaleCreator(),
      new CodeSmellCreator(),
      storage
    );
  }
}
