/**
 * Input Sanitization Detector - LEARNING VERSION
 *
 * Learns input sanitization patterns from the user's codebase:
 * - Sanitization library preferences
 * - Validation patterns
 * - Escape function usage
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

export type SanitizationLibrary = 'dompurify' | 'xss' | 'validator' | 'sanitize-html' | 'custom';

export interface InputSanitizationConventions {
  [key: string]: unknown;
  library: SanitizationLibrary;
  usesEscaping: boolean;
  sanitizesOnInput: boolean;
}

interface SanitizationPatternInfo {
  library: SanitizationLibrary;
  isEscape: boolean;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractSanitizationPatterns(content: string, file: string): SanitizationPatternInfo[] {
  const results: SanitizationPatternInfo[] = [];

  const patterns: Array<{ regex: RegExp; library: SanitizationLibrary; isEscape: boolean }> = [
    { regex: /DOMPurify\.sanitize/g, library: 'dompurify', isEscape: false },
    { regex: /xss\s*\(|filterXSS/g, library: 'xss', isEscape: false },
    { regex: /validator\.\w+|isEmail|isURL|escape/g, library: 'validator', isEscape: true },
    { regex: /sanitizeHtml|sanitize-html/g, library: 'sanitize-html', isEscape: false },
    { regex: /escapeHtml|htmlEscape|encodeURIComponent/g, library: 'custom', isEscape: true },
  ];

  for (const { regex, library, isEscape } of patterns) {
    let match;
    while ((match = regex.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      results.push({
        library,
        isEscape,
        line,
        column,
        file,
      });
    }
  }

  return results;
}

// ============================================================================
// Learning Input Sanitization Detector
// ============================================================================

export class InputSanitizationLearningDetector extends LearningDetector<InputSanitizationConventions> {
  readonly id = 'security/input-sanitization';
  readonly category = 'security' as const;
  readonly subcategory = 'input-sanitization';
  readonly name = 'Input Sanitization Detector (Learning)';
  readonly description = 'Learns input sanitization patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof InputSanitizationConventions> {
    return ['library', 'usesEscaping', 'sanitizesOnInput'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof InputSanitizationConventions, ValueDistribution>
  ): void {
    const patterns = extractSanitizationPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const libraryDist = distributions.get('library')!;
    const escapeDist = distributions.get('usesEscaping')!;

    for (const pattern of patterns) {
      libraryDist.add(pattern.library, context.file);
      escapeDist.add(pattern.isEscape, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<InputSanitizationConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const sanitizationPatterns = extractSanitizationPatterns(context.content, context.file);
    if (sanitizationPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedLibrary = conventions.conventions.library?.value;

    // Check library consistency
    if (learnedLibrary && learnedLibrary !== 'custom') {
      for (const pattern of sanitizationPatterns) {
        if (pattern.library !== learnedLibrary && pattern.library !== 'custom') {
          violations.push(this.createConventionViolation(
            pattern.file, pattern.line, pattern.column,
            'sanitization library', pattern.library, learnedLibrary,
            `Using ${pattern.library} but project uses ${learnedLibrary}`
          ));
        }
      }
    }

    if (sanitizationPatterns.length > 0) {
      const first = sanitizationPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/sanitization`,
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

export function createInputSanitizationLearningDetector(): InputSanitizationLearningDetector {
  return new InputSanitizationLearningDetector();
}
