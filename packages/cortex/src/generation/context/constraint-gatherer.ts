/**
 * Constraint Context Gatherer
 * 
 * Gathers constraint context for code generation.
 * Finds applicable constraints and any overrides
 * for the target.
 * 
 * @module generation/context/constraint-gatherer
 */

import type { IMemoryStorage } from '../../storage/interface.js';
import type { MemoryType } from '../../types/index.js';
import type { ConstraintOverrideMemory } from '../../types/constraint-override.js';
import type { GenerationTarget, ConstraintContext, ConstraintOverrideContext } from '../types.js';

/**
 * Configuration for constraint gatherer
 */
export interface ConstraintGathererConfig {
  /** Maximum constraints to gather */
  maxConstraints: number;
  /** Minimum relevance score */
  minRelevance: number;
  /** Include overrides */
  includeOverrides: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ConstraintGathererConfig = {
  maxConstraints: 10,
  minRelevance: 0.3,
  includeOverrides: true,
};

/**
 * Constraint Context Gatherer
 * 
 * Gathers constraint context for code generation.
 */
export class ConstraintContextGatherer {
  private config: ConstraintGathererConfig;
  private storage: IMemoryStorage;

  constructor(storage: IMemoryStorage, config?: Partial<ConstraintGathererConfig>) {
    this.storage = storage;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Gather constraint context for generation
   */
  async gather(target: GenerationTarget): Promise<ConstraintContext[]> {
    const contexts: ConstraintContext[] = [];
    const seen = new Set<string>();

    // Get constraints linked to the file
    const fileConstraints = await this.getFileConstraints(target.filePath);
    for (const constraintId of fileConstraints) {
      if (seen.has(constraintId)) continue;
      seen.add(constraintId);

      const context = await this.buildConstraintContext(constraintId, target, 'file_linked');
      if (context && context.relevanceScore >= this.config.minRelevance) {
        contexts.push(context);
      }
    }

    // Get constraints by directory/path pattern
    const pathConstraints = await this.getPathConstraints(target.filePath);
    for (const constraintId of pathConstraints) {
      if (seen.has(constraintId)) continue;
      seen.add(constraintId);

      const context = await this.buildConstraintContext(constraintId, target, 'path_matched');
      if (context && context.relevanceScore >= this.config.minRelevance) {
        contexts.push(context);
      }
    }

    // Get global constraints
    const globalConstraints = await this.getGlobalConstraints();
    for (const constraintId of globalConstraints) {
      if (seen.has(constraintId)) continue;
      seen.add(constraintId);

      const context = await this.buildConstraintContext(constraintId, target, 'global');
      if (context && context.relevanceScore >= this.config.minRelevance) {
        contexts.push(context);
      }
    }

    // Sort by relevance (hard constraints first)
    contexts.sort((a, b) => {
      if (a.isHard && !b.isHard) return -1;
      if (b.isHard && !a.isHard) return 1;
      return b.relevanceScore - a.relevanceScore;
    });

    return contexts.slice(0, this.config.maxConstraints);
  }

  /**
   * Get constraints linked to a file
   */
  private async getFileConstraints(file: string): Promise<string[]> {
    try {
      const memories = await this.storage.findByFile(file);
      const constraintIds = new Set<string>();

      for (const memory of memories) {
        if (memory.linkedConstraints) {
          for (const constraintId of memory.linkedConstraints) {
            constraintIds.add(constraintId);
          }
        }
      }

      return Array.from(constraintIds);
    } catch {
      return [];
    }
  }

  /**
   * Get constraints by path pattern
   */
  private async getPathConstraints(filePath: string): Promise<string[]> {
    try {
      // Extract path components
      const pathParts = filePath.split('/').filter(p => p.length > 0);
      const constraintIds = new Set<string>();

      // Search for constraint overrides that mention path patterns
      const results = await this.storage.search({
        types: ['constraint_override'] as MemoryType[],
        limit: 20,
      });

      for (const memory of results) {
        const override = memory as ConstraintOverrideMemory;
        // Check if scope matches path
        if (this.scopeMatchesPath(override.scope, pathParts)) {
          constraintIds.add(override.constraintId);
        }
      }

      return Array.from(constraintIds);
    } catch {
      return [];
    }
  }

  /**
   * Get global constraints
   */
  private async getGlobalConstraints(): Promise<string[]> {
    try {
      // Search for constraint overrides with global scope
      const results = await this.storage.search({
        types: ['constraint_override'] as MemoryType[],
        limit: 20,
      });

      const constraintIds = new Set<string>();
      for (const memory of results) {
        const override = memory as ConstraintOverrideMemory;
        if (override.scope.type === 'global') {
          constraintIds.add(override.constraintId);
        }
      }

      return Array.from(constraintIds);
    } catch {
      return [];
    }
  }

  /**
   * Check if scope matches path
   */
  private scopeMatchesPath(scope: ConstraintOverrideMemory['scope'], pathParts: string[]): boolean {
    const scopeTarget = scope.target.toLowerCase();
    
    // Check for glob patterns
    if (scopeTarget.includes('*')) {
      const pattern = scopeTarget.replace(/\*/g, '.*');
      const regex = new RegExp(pattern, 'i');
      return regex.test(pathParts.join('/'));
    }

    // Check for direct path match
    for (const part of pathParts) {
      if (scopeTarget.includes(part.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  /**
   * Build constraint context
   */
  private async buildConstraintContext(
    constraintId: string,
    target: GenerationTarget,
    relevanceReason: string
  ): Promise<ConstraintContext | null> {
    // Get overrides for this constraint
    const overrides = this.config.includeOverrides
      ? await this.getOverrides(constraintId, target.filePath)
      : [];

    // Calculate relevance score
    const relevanceScore = this.calculateRelevance(relevanceReason, overrides);

    // Determine if constraint is hard or soft
    const isHard = this.isHardConstraint(constraintId, overrides);

    // Build result - only include optional properties if they have values
    const result: ConstraintContext = {
      constraintId,
      constraintName: this.formatConstraintName(constraintId),
      description: `Constraint: ${constraintId}`,
      isHard,
      relevanceScore,
    };

    if (overrides.length > 0) {
      result.overrides = overrides;
    }

    return result;
  }

  /**
   * Get overrides for a constraint
   */
  private async getOverrides(constraintId: string, filePath: string): Promise<ConstraintOverrideContext[]> {
    try {
      const results = await this.storage.search({
        types: ['constraint_override'] as MemoryType[],
        constraints: [constraintId],
        limit: 10,
      });

      const overrides: ConstraintOverrideContext[] = [];
      for (const memory of results) {
        const override = memory as ConstraintOverrideMemory;
        if (override.constraintId === constraintId) {
          // Check if override applies to this file
          if (this.overrideApplies(override, filePath)) {
            const ctx: ConstraintOverrideContext = {
              memoryId: override.id,
              scope: `${override.scope.type}:${override.scope.target}`,
              reason: override.reason,
            };
            // Note: alternative is not in ConstraintOverrideMemory, so we skip it
            overrides.push(ctx);
          }
        }
      }

      return overrides;
    } catch {
      return [];
    }
  }

  /**
   * Check if override applies to file
   */
  private overrideApplies(override: ConstraintOverrideMemory, filePath: string): boolean {
    const scopeType = override.scope.type;
    const scopeTarget = override.scope.target.toLowerCase();
    const pathLower = filePath.toLowerCase();

    // Global scope applies everywhere
    if (scopeType === 'global') {
      return true;
    }

    // File scope - direct match
    if (scopeType === 'file') {
      return pathLower.includes(scopeTarget) || scopeTarget.includes(pathLower);
    }

    // Directory scope - path contains directory
    if (scopeType === 'directory') {
      return pathLower.includes(scopeTarget);
    }

    // Check glob pattern in target
    if (scopeTarget.includes('*')) {
      const pattern = scopeTarget.replace(/\*/g, '.*');
      const regex = new RegExp(pattern, 'i');
      return regex.test(pathLower);
    }

    return false;
  }

  /**
   * Calculate relevance score
   */
  private calculateRelevance(
    reason: string,
    overrides: ConstraintOverrideContext[]
  ): number {
    let score = 0.5; // Base score

    // Boost for file-linked
    if (reason === 'file_linked') {
      score += 0.3;
    }

    // Boost for path-matched
    if (reason === 'path_matched') {
      score += 0.2;
    }

    // Boost for global (always relevant)
    if (reason === 'global') {
      score += 0.1;
    }

    // Reduce if there are overrides (constraint may not fully apply)
    if (overrides.length > 0) {
      score -= 0.1;
    }

    return Math.min(Math.max(score, 0), 1.0);
  }

  /**
   * Determine if constraint is hard
   */
  private isHardConstraint(constraintId: string, overrides: ConstraintOverrideContext[]): boolean {
    // If there are overrides, it's soft
    if (overrides.length > 0) {
      return false;
    }

    // Check constraint ID for hints
    const hardKeywords = ['must', 'required', 'mandatory', 'security', 'auth'];
    const idLower = constraintId.toLowerCase();
    
    return hardKeywords.some(kw => idLower.includes(kw));
  }

  /**
   * Format constraint name for display
   */
  private formatConstraintName(constraintId: string): string {
    // Convert kebab-case or snake_case to Title Case
    return constraintId
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }
}
