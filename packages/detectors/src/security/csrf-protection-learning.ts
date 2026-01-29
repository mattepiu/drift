/**
 * CSRF Protection Detector - LEARNING VERSION
 *
 * Learns CSRF protection patterns from the user's codebase:
 * - CSRF library preferences
 * - Token handling patterns
 * - Header conventions
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

export type CSRFLibrary = 'csurf' | 'csrf-csrf' | 'lusca' | 'custom';
export type CSRFTokenLocation = 'header' | 'body' | 'cookie';

export interface CSRFProtectionConventions {
  [key: string]: unknown;
  library: CSRFLibrary;
  tokenLocation: CSRFTokenLocation;
  headerName: string | null;
}

interface CSRFPatternInfo {
  library: CSRFLibrary;
  tokenLocation: CSRFTokenLocation | null;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractCSRFPatterns(content: string, file: string): CSRFPatternInfo[] {
  const results: CSRFPatternInfo[] = [];

  const patterns: Array<{ regex: RegExp; library: CSRFLibrary }> = [
    { regex: /csurf\s*\(|require\s*\(\s*['"]csurf['"]\)/g, library: 'csurf' },
    { regex: /doubleCsrf|csrf-csrf/g, library: 'csrf-csrf' },
    { regex: /lusca\.csrf|lusca\s*\(/g, library: 'lusca' },
    { regex: /csrfToken|_csrf|x-csrf-token/gi, library: 'custom' },
  ];

  for (const { regex, library } of patterns) {
    let match;
    while ((match = regex.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      let tokenLocation: CSRFTokenLocation | null = null;
      if (/x-csrf|header/i.test(content)) {tokenLocation = 'header';}
      else if (/body\._csrf|req\.body/i.test(content)) {tokenLocation = 'body';}
      else if (/cookie/i.test(content)) {tokenLocation = 'cookie';}

      results.push({
        library,
        tokenLocation,
        line,
        column,
        file,
      });
    }
  }

  return results;
}

// ============================================================================
// Learning CSRF Protection Detector
// ============================================================================

export class CSRFProtectionLearningDetector extends LearningDetector<CSRFProtectionConventions> {
  readonly id = 'security/csrf-protection';
  readonly category = 'security' as const;
  readonly subcategory = 'csrf-protection';
  readonly name = 'CSRF Protection Detector (Learning)';
  readonly description = 'Learns CSRF protection patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof CSRFProtectionConventions> {
    return ['library', 'tokenLocation', 'headerName'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof CSRFProtectionConventions, ValueDistribution>
  ): void {
    const patterns = extractCSRFPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const libraryDist = distributions.get('library')!;
    const locationDist = distributions.get('tokenLocation')!;

    for (const pattern of patterns) {
      if (pattern.library !== 'custom') {
        libraryDist.add(pattern.library, context.file);
      }
      if (pattern.tokenLocation) {
        locationDist.add(pattern.tokenLocation, context.file);
      }
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<CSRFProtectionConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const csrfPatterns = extractCSRFPatterns(context.content, context.file);
    if (csrfPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedLibrary = conventions.conventions.library?.value;

    if (learnedLibrary) {
      for (const pattern of csrfPatterns) {
        if (pattern.library !== learnedLibrary && pattern.library !== 'custom') {
          violations.push(this.createConventionViolation(
            pattern.file, pattern.line, pattern.column,
            'CSRF library', pattern.library, learnedLibrary,
            `Using ${pattern.library} but project uses ${learnedLibrary}`
          ));
        }
      }
    }

    if (csrfPatterns.length > 0) {
      const first = csrfPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/csrf`,
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

export function createCSRFProtectionLearningDetector(): CSRFProtectionLearningDetector {
  return new CSRFProtectionLearningDetector();
}
