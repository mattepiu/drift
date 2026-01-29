/**
 * Code Splitting Detector - LEARNING VERSION
 *
 * Learns code splitting patterns from the user's codebase:
 * - Chunk naming conventions
 * - Split point patterns
 * - Bundle organization
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

export type ChunkNamingStyle = 'kebab-case' | 'camelCase' | 'descriptive';

export interface CodeSplittingConventions {
  [key: string]: unknown;
  chunkNaming: ChunkNamingStyle;
  usesWebpackMagicComments: boolean;
  usesPrefetch: boolean;
}

interface CodeSplitInfo {
  chunkName: string | null;
  namingStyle: ChunkNamingStyle | null;
  hasMagicComment: boolean;
  hasPrefetch: boolean;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function detectChunkNamingStyle(name: string): ChunkNamingStyle {
  if (name.includes('-')) {return 'kebab-case';}
  if (/^[a-z]/.test(name) && /[A-Z]/.test(name)) {return 'camelCase';}
  return 'descriptive';
}

function extractCodeSplitPatterns(content: string, file: string): CodeSplitInfo[] {
  const results: CodeSplitInfo[] = [];

  // Dynamic imports with webpack magic comments
  const dynamicImportPattern = /import\s*\(\s*\/\*\s*webpackChunkName:\s*['"]([^'"]+)['"]\s*\*\/\s*['"]([^'"]+)['"]\s*\)/g;
  let match;
  while ((match = dynamicImportPattern.exec(content)) !== null) {
    const chunkName = match[1] || null;
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    const hasPrefetch = /webpackPrefetch/.test(match[0]);

    results.push({
      chunkName,
      namingStyle: chunkName ? detectChunkNamingStyle(chunkName) : null,
      hasMagicComment: true,
      hasPrefetch,
      line,
      column,
      file,
    });
  }

  // Plain dynamic imports
  const plainImportPattern = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = plainImportPattern.exec(content)) !== null) {
    // Skip if already matched with magic comment
    if (content.slice(match.index - 50, match.index).includes('webpackChunkName')) {continue;}

    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      chunkName: null,
      namingStyle: null,
      hasMagicComment: false,
      hasPrefetch: false,
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning Code Splitting Detector
// ============================================================================

export class CodeSplittingLearningDetector extends LearningDetector<CodeSplittingConventions> {
  readonly id = 'performance/code-splitting';
  readonly category = 'performance' as const;
  readonly subcategory = 'code-splitting';
  readonly name = 'Code Splitting Detector (Learning)';
  readonly description = 'Learns code splitting patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof CodeSplittingConventions> {
    return ['chunkNaming', 'usesWebpackMagicComments', 'usesPrefetch'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof CodeSplittingConventions, ValueDistribution>
  ): void {
    const patterns = extractCodeSplitPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const namingDist = distributions.get('chunkNaming')!;
    const magicDist = distributions.get('usesWebpackMagicComments')!;
    const prefetchDist = distributions.get('usesPrefetch')!;

    for (const pattern of patterns) {
      if (pattern.namingStyle) {
        namingDist.add(pattern.namingStyle, context.file);
      }
      magicDist.add(pattern.hasMagicComment, context.file);
      prefetchDist.add(pattern.hasPrefetch, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<CodeSplittingConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const splitPatterns = extractCodeSplitPatterns(context.content, context.file);
    if (splitPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedUsesMagic = conventions.conventions.usesWebpackMagicComments?.value;
    const learnedNaming = conventions.conventions.chunkNaming?.value;

    // Check magic comment usage
    if (learnedUsesMagic === true) {
      for (const pattern of splitPatterns) {
        if (!pattern.hasMagicComment) {
          violations.push(this.createConventionViolation(
            pattern.file, pattern.line, pattern.column,
            'webpack magic comments', 'missing', 'with chunk name',
            `Dynamic import should include webpackChunkName (project convention)`
          ));
        }
      }
    }

    // Check chunk naming style
    if (learnedNaming) {
      for (const pattern of splitPatterns) {
        if (pattern.namingStyle && pattern.namingStyle !== learnedNaming) {
          violations.push(this.createConventionViolation(
            pattern.file, pattern.line, pattern.column,
            'chunk naming', pattern.namingStyle, learnedNaming,
            `Chunk name uses ${pattern.namingStyle} but project uses ${learnedNaming}`
          ));
        }
      }
    }

    if (splitPatterns.length > 0) {
      const first = splitPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/code-split`,
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

export function createCodeSplittingLearningDetector(): CodeSplittingLearningDetector {
  return new CodeSplittingLearningDetector();
}
