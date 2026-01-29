/**
 * Repository Pattern Detector - LEARNING VERSION
 *
 * Learns repository pattern conventions from the user's codebase:
 * - Repository naming conventions
 * - Method naming patterns
 * - Return type patterns
 *
 * @requirements DRIFT-CORE - Learn patterns from user's code, not enforce arbitrary rules
 */

import {
  LearningDetector,
  ValueDistribution,
  type DetectionContext,
  type DetectionResult,
  type LearningResult,
} from '../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type RepositoryNamingSuffix = 'Repository' | 'Repo' | 'Store' | 'DAO';

export interface RepositoryPatternConventions {
  [key: string]: unknown;
  namingSuffix: RepositoryNamingSuffix;
  usesAsyncMethods: boolean;
  methodPrefix: string | null;
}

interface RepositoryPatternInfo {
  className: string;
  suffix: RepositoryNamingSuffix | null;
  methods: string[];
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function detectSuffix(name: string): RepositoryNamingSuffix | null {
  if (name.endsWith('Repository')) {return 'Repository';}
  if (name.endsWith('Repo')) {return 'Repo';}
  if (name.endsWith('Store')) {return 'Store';}
  if (name.endsWith('DAO')) {return 'DAO';}
  return null;
}

function extractRepositoryPatterns(content: string, file: string): RepositoryPatternInfo[] {
  const results: RepositoryPatternInfo[] = [];

  // Class-based repositories
  const classPattern = /class\s+(\w+(?:Repository|Repo|Store|DAO))\s*(?:extends|implements|{)/g;
  let match;
  while ((match = classPattern.exec(content)) !== null) {
    const className = match[1] || '';
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    // Extract methods
    const classEnd = content.indexOf('}', match.index + match[0].length);
    const classBody = content.slice(match.index, classEnd);
    const methodPattern = /(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/g;
    const methods: string[] = [];
    let methodMatch;
    while ((methodMatch = methodPattern.exec(classBody)) !== null) {
      if (methodMatch[1] && methodMatch[1] !== 'constructor') {
        methods.push(methodMatch[1]);
      }
    }

    results.push({
      className,
      suffix: detectSuffix(className),
      methods,
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning Repository Pattern Detector
// ============================================================================

export class RepositoryPatternLearningDetector extends LearningDetector<RepositoryPatternConventions> {
  readonly id = 'data-access/repository-pattern';
  readonly category = 'data-access' as const;
  readonly subcategory = 'repository-pattern';
  readonly name = 'Repository Pattern Detector (Learning)';
  readonly description = 'Learns repository pattern conventions from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof RepositoryPatternConventions> {
    return ['namingSuffix', 'usesAsyncMethods', 'methodPrefix'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof RepositoryPatternConventions, ValueDistribution>
  ): void {
    const patterns = extractRepositoryPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const suffixDist = distributions.get('namingSuffix')!;

    for (const pattern of patterns) {
      if (pattern.suffix) {
        suffixDist.add(pattern.suffix, context.file);
      }
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<RepositoryPatternConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const repoPatterns = extractRepositoryPatterns(context.content, context.file);
    if (repoPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedSuffix = conventions.conventions.namingSuffix?.value;

    // Check naming suffix consistency
    if (learnedSuffix) {
      for (const pattern of repoPatterns) {
        if (pattern.suffix && pattern.suffix !== learnedSuffix) {
          violations.push(this.createConventionViolation(
            pattern.file, pattern.line, pattern.column,
            'repository naming', pattern.suffix, learnedSuffix,
            `Repository '${pattern.className}' uses '${pattern.suffix}' suffix but project uses '${learnedSuffix}'`
          ));
        }
      }
    }

    if (repoPatterns.length > 0) {
      const first = repoPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/repository`,
        location: { file: context.file, line: first.line, column: first.column },
        confidence: 1.0,
        isOutlier: violations.length > 0,
      });
    }

    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }

  override generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createRepositoryPatternLearningDetector(): RepositoryPatternLearningDetector {
  return new RepositoryPatternLearningDetector();
}
