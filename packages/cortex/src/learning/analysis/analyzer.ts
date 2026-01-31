/**
 * Correction Analyzer
 * 
 * Orchestrates the full analysis of a correction:
 * - Computes diff between original and corrected code
 * - Categorizes the correction
 * - Extracts generalizable principles
 * - Suggests memory type to create
 * 
 * @module learning/analysis/analyzer
 */

import { randomUUID } from 'crypto';
import type {
  AnalyzedCorrection,
  CorrectionCategory,
  CorrectionMetadata,
  SuggestedMemoryType,
} from '../../types/learning.js';
import type { IMemoryStorage } from '../../storage/interface.js';
import { DiffAnalyzer } from './diff-analyzer.js';
import { CorrectionCategorizer } from './categorizer.js';
import { PrincipleExtractor } from './principle-extractor.js';

/**
 * Options for correction analysis
 */
export interface AnalysisOptions {
  /** Include related memory search */
  findRelatedMemories?: boolean;
  /** Maximum related memories to find */
  maxRelatedMemories?: number;
  /** Additional metadata */
  metadata?: CorrectionMetadata;
}

/**
 * Correction Analyzer
 * 
 * Orchestrates the analysis of user corrections to understand
 * what went wrong and extract learnable principles.
 */
export class CorrectionAnalyzer {
  constructor(
    private categorizer: CorrectionCategorizer,
    private principleExtractor: PrincipleExtractor,
    private diffAnalyzer: DiffAnalyzer,
    private storage?: IMemoryStorage
  ) {}

  /**
   * Analyze a correction
   */
  async analyze(
    original: string,
    feedback: string,
    correctedCode?: string,
    options: AnalysisOptions = {}
  ): Promise<AnalyzedCorrection> {
    const id = randomUUID();

    // Compute diff if corrected code is provided
    const diff = correctedCode
      ? this.diffAnalyzer.computeDiff(original, correctedCode)
      : undefined;

    // Categorize the correction
    const categorizationResult = this.categorizer.categorize(
      original,
      feedback,
      diff || null
    );

    // Extract principle
    const principle = this.principleExtractor.extract(
      original,
      feedback,
      diff || null,
      categorizationResult.category
    );

    // Determine suggested memory type
    const suggestedMemoryType = this.suggestMemoryType(
      categorizationResult.category,
      principle.isHardRule
    );

    // Find related memories if storage is available
    let relatedMemories: string[] = [];
    if (options.findRelatedMemories && this.storage) {
      relatedMemories = await this.findRelatedMemories(
        feedback,
        categorizationResult.category,
        options.maxRelatedMemories || 5
      );
    }

    const result: AnalyzedCorrection = {
      id,
      original,
      feedback,
      category: categorizationResult.category,
      categoryConfidence: categorizationResult.confidence,
      principle,
      suggestedMemoryType,
      relatedMemories,
      analyzedAt: new Date().toISOString(),
    };

    // Add optional properties only if they have values
    if (correctedCode) {
      result.correctedCode = correctedCode;
    }
    if (diff) {
      result.diff = diff;
    }
    if (options.metadata) {
      result.metadata = options.metadata;
    }

    return result;
  }

  /**
   * Analyze multiple corrections in batch
   */
  async analyzeBatch(
    corrections: Array<{
      original: string;
      feedback: string;
      correctedCode?: string;
      metadata?: CorrectionMetadata;
    }>,
    options: Omit<AnalysisOptions, 'metadata'> = {}
  ): Promise<AnalyzedCorrection[]> {
    const results: AnalyzedCorrection[] = [];

    for (const correction of corrections) {
      const analysisOptions: AnalysisOptions = { ...options };
      if (correction.metadata) {
        analysisOptions.metadata = correction.metadata;
      }
      const result = await this.analyze(
        correction.original,
        correction.feedback,
        correction.correctedCode,
        analysisOptions
      );
      results.push(result);
    }

    return results;
  }

  /**
   * Suggest memory type based on category
   */
  private suggestMemoryType(
    _category: CorrectionCategory,
    isHardRule: boolean
  ): SuggestedMemoryType {
    switch (_category) {
      case 'tribal_miss':
        return 'tribal';

      case 'pattern_violation':
      case 'architecture_mismatch':
        return 'pattern_rationale';

      case 'security_issue':
      case 'performance_issue':
      case 'api_misuse':
        return 'code_smell';

      case 'constraint_violation':
        return 'constraint_override';

      case 'style_preference':
      case 'naming_convention':
        // Style preferences become tribal knowledge
        return 'tribal';

      case 'other':
      default:
        // Default to procedural for general corrections
        return isHardRule ? 'tribal' : 'procedural';
    }
  }

  /**
   * Find related memories
   */
  private async findRelatedMemories(
    feedback: string,
    _category: CorrectionCategory,
    limit: number
  ): Promise<string[]> {
    if (!this.storage) {
      return [];
    }

    try {
      // Search for memories with similar topics
      const keywords = feedback
        .toLowerCase()
        .split(/\W+/)
        .filter(w => w.length > 3)
        .slice(0, 5);

      const memories = await this.storage.search({
        tags: keywords,
        limit,
      });

      return memories.map(m => m.id);
    } catch {
      return [];
    }
  }

  /**
   * Create analyzer with default dependencies
   */
  static create(storage?: IMemoryStorage): CorrectionAnalyzer {
    return new CorrectionAnalyzer(
      new CorrectionCategorizer(),
      new PrincipleExtractor(),
      new DiffAnalyzer(),
      storage
    );
  }
}
