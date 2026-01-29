/**
 * Exception Hierarchy Detector - LEARNING VERSION
 *
 * Learns exception hierarchy patterns from the user's codebase:
 * - Base error class naming
 * - Error class inheritance patterns
 * - Error class naming conventions
 *
 * Flags violations only when code deviates from the PROJECT'S established patterns.
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

/**
 * Error class naming suffix
 */
export type ErrorClassSuffix = 'Error' | 'Exception' | 'Fault' | 'none';

/**
 * Conventions this detector learns
 */
export interface ExceptionHierarchyConventions {
  [key: string]: unknown;
  /** Base error class name */
  baseErrorClass: string | null;
  /** Error class naming suffix */
  classSuffix: ErrorClassSuffix;
  /** Whether project uses custom error classes */
  usesCustomErrors: boolean;
  /** Whether project uses error factories */
  usesErrorFactories: boolean;
}

/**
 * Exception pattern info extracted from code
 */
interface ExceptionPatternInfo {
  className: string;
  baseClass: string | null;
  suffix: ErrorClassSuffix;
  isFactory: boolean;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Detect suffix from class name
 */
function detectSuffix(className: string): ErrorClassSuffix {
  if (className.endsWith('Error')) {return 'Error';}
  if (className.endsWith('Exception')) {return 'Exception';}
  if (className.endsWith('Fault')) {return 'Fault';}
  return 'none';
}

/**
 * Extract exception patterns from content
 */
function extractExceptionPatterns(content: string, file: string): ExceptionPatternInfo[] {
  const results: ExceptionPatternInfo[] = [];

  // JavaScript/TypeScript class definitions
  const jsClassPattern = /class\s+(\w+)\s+extends\s+(\w+)/gi;
  let match;
  while ((match = jsClassPattern.exec(content)) !== null) {
    const className = match[1] || '';
    const baseClass = match[2] || '';

    // Only track error-related classes
    if (!className.includes('Error') && !className.includes('Exception') &&
        !baseClass.includes('Error') && !baseClass.includes('Exception')) {
      continue;
    }

    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      className,
      baseClass,
      suffix: detectSuffix(className),
      isFactory: false,
      line,
      column,
      file,
    });
  }

  // Python class definitions
  const pyClassPattern = /class\s+(\w+)\s*\(\s*(\w+)\s*\)/gi;
  while ((match = pyClassPattern.exec(content)) !== null) {
    const className = match[1] || '';
    const baseClass = match[2] || '';

    // Only track error-related classes
    if (!className.includes('Error') && !className.includes('Exception') &&
        !baseClass.includes('Error') && !baseClass.includes('Exception') &&
        baseClass !== 'Exception') {
      continue;
    }

    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      className,
      baseClass,
      suffix: detectSuffix(className),
      isFactory: false,
      line,
      column,
      file,
    });
  }

  // Error factory functions
  const factoryPattern = /(?:function|const)\s+(create\w*Error|make\w*Error)\s*[=(]/gi;
  while ((match = factoryPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      className: match[1] || '',
      baseClass: null,
      suffix: 'none',
      isFactory: true,
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning Exception Hierarchy Detector
// ============================================================================

export class ExceptionHierarchyLearningDetector extends LearningDetector<ExceptionHierarchyConventions> {
  readonly id = 'errors/exception-hierarchy';
  readonly category = 'errors' as const;
  readonly subcategory = 'exception-hierarchy';
  readonly name = 'Exception Hierarchy Detector (Learning)';
  readonly description = 'Learns exception hierarchy patterns from your codebase and flags inconsistencies';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  // ============================================================================
  // Learning Implementation
  // ============================================================================

  protected getConventionKeys(): Array<keyof ExceptionHierarchyConventions> {
    return ['baseErrorClass', 'classSuffix', 'usesCustomErrors', 'usesErrorFactories'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof ExceptionHierarchyConventions, ValueDistribution>
  ): void {
    const patterns = extractExceptionPatterns(context.content, context.file);

    if (patterns.length === 0) {return;}

    const baseClassDist = distributions.get('baseErrorClass')!;
    const suffixDist = distributions.get('classSuffix')!;
    const customErrorsDist = distributions.get('usesCustomErrors')!;
    const factoriesDist = distributions.get('usesErrorFactories')!;

    const hasCustomErrors = patterns.some(p => !p.isFactory);
    const hasFactories = patterns.some(p => p.isFactory);

    customErrorsDist.add(hasCustomErrors, context.file);
    factoriesDist.add(hasFactories, context.file);

    for (const pattern of patterns) {
      if (!pattern.isFactory) {
        suffixDist.add(pattern.suffix, context.file);

        // Track base classes that are extended
        if (pattern.baseClass && (pattern.baseClass.includes('Error') || pattern.baseClass.includes('Exception'))) {
          baseClassDist.add(pattern.baseClass, context.file);
        }
      }
    }
  }

  // ============================================================================
  // Detection Implementation
  // ============================================================================

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<ExceptionHierarchyConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const exceptionPatterns = extractExceptionPatterns(context.content, context.file);

    if (exceptionPatterns.length === 0) {
      return this.createEmptyResult();
    }

    // Get learned conventions
    const learnedBaseClass = conventions.conventions.baseErrorClass?.value;
    const learnedSuffix = conventions.conventions.classSuffix?.value;

    // Check suffix consistency
    if (learnedSuffix && learnedSuffix !== 'none') {
      for (const pattern of exceptionPatterns) {
        if (!pattern.isFactory && pattern.suffix !== learnedSuffix) {
          violations.push(this.createConventionViolation(
            pattern.file,
            pattern.line,
            pattern.column,
            'error class suffix',
            pattern.suffix || 'none',
            learnedSuffix,
            `Error class '${pattern.className}' should end with '${learnedSuffix}'`
          ));
        }
      }
    }

    // Check base class consistency
    if (learnedBaseClass) {
      for (const pattern of exceptionPatterns) {
        if (!pattern.isFactory && pattern.baseClass && pattern.baseClass !== learnedBaseClass) {
          // Only flag if extending a different custom base error
          if (pattern.baseClass !== 'Error' && pattern.baseClass !== 'Exception') {
            violations.push(this.createConventionViolation(
              pattern.file,
              pattern.line,
              pattern.column,
              'base error class',
              pattern.baseClass,
              learnedBaseClass,
              `Error class '${pattern.className}' extends '${pattern.baseClass}' but project uses '${learnedBaseClass}'`
            ));
          }
        }
      }
    }

    // Create pattern matches
    if (exceptionPatterns.length > 0) {
      const firstPattern = exceptionPatterns[0];
      if (firstPattern) {
        patterns.push({
          patternId: `${this.id}/exception-hierarchy`,
          location: {
            file: context.file,
            line: firstPattern.line,
            column: firstPattern.column,
          },
          confidence: 1.0,
          isOutlier: violations.length > 0,
        });
      }
    }

    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }

  // ============================================================================
  // Quick Fix
  // ============================================================================

  override generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createExceptionHierarchyLearningDetector(): ExceptionHierarchyLearningDetector {
  return new ExceptionHierarchyLearningDetector();
}
