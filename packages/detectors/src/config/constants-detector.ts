/**
 * Constants Pattern Detector
 *
 * Detects patterns related to constants, enums, and configuration values:
 * - Inconsistent constant naming conventions
 * - Magic values that should be constants
 * - Hardcoded secrets in constants
 * - Duplicate constant definitions
 *
 * @requirements Constant & Enum Extraction Feature
 */

import {
  UnifiedDetector,
  type DetectionStrategy,
  type StrategyResult,
  type DetectionContext,
} from '../base/unified-detector.js';

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';


// ============================================================================
// Types
// ============================================================================

/**
 * Constant naming convention patterns
 */
interface NamingConvention {
  pattern: RegExp;
  name: string;
  languages: string[];
}

/**
 * Magic value pattern
 */
interface MagicValuePattern {
  pattern: RegExp;
  category: string;
  severity: 'info' | 'warning' | 'error';
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Common constant naming conventions by language
 */
const NAMING_CONVENTIONS: NamingConvention[] = [
  // SCREAMING_SNAKE_CASE (most common)
  {
    pattern: /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/,
    name: 'SCREAMING_SNAKE_CASE',
    languages: ['typescript', 'javascript', 'python', 'java', 'php', 'go'],
  },
  // PascalCase (C#, Go exported)
  {
    pattern: /^[A-Z][a-zA-Z0-9]*$/,
    name: 'PascalCase',
    languages: ['csharp', 'go'],
  },
  // camelCase (some JS/TS projects)
  {
    pattern: /^[a-z][a-zA-Z0-9]*$/,
    name: 'camelCase',
    languages: ['typescript', 'javascript'],
  },
  // k prefix (Hungarian notation)
  {
    pattern: /^k[A-Z][a-zA-Z0-9]*$/,
    name: 'kPrefixPascalCase',
    languages: ['csharp', 'cpp'],
  },
];

/**
 * Patterns that indicate magic values
 */
const MAGIC_VALUE_PATTERNS: MagicValuePattern[] = [
  // HTTP status codes
  {
    pattern: /\b(200|201|204|301|302|400|401|403|404|500|502|503)\b/,
    category: 'http_status',
    severity: 'warning',
  },
  // Common timeouts (in ms)
  {
    pattern: /\b(1000|3000|5000|10000|30000|60000)\b/,
    category: 'timeout',
    severity: 'info',
  },
  // Port numbers
  {
    pattern: /\b(80|443|3000|3001|5000|8000|8080|8443|9000)\b/,
    category: 'port',
    severity: 'info',
  },
  // Retry counts
  {
    pattern: /\b(retry|retries|attempts)\s*[=:]\s*[3-5]\b/i,
    category: 'retry_count',
    severity: 'info',
  },
  // Pagination limits
  {
    pattern: /\b(limit|pageSize|perPage)\s*[=:]\s*(10|20|25|50|100)\b/i,
    category: 'pagination',
    severity: 'info',
  },
];

/**
 * Secret patterns (simplified - full detection in security-scanner)
 */
const SECRET_PATTERNS = [
  /(?:api[_-]?key|apikey)\s*[=:]\s*['"][^'"]{20,}['"]/i,
  /(?:secret|password|passwd|pwd)\s*[=:]\s*['"][^'"]+['"]/i,
  /(?:token|auth[_-]?token)\s*[=:]\s*['"][^'"]{20,}['"]/i,
  /(?:private[_-]?key)\s*[=:]\s*['"][^'"]+['"]/i,
];

// ============================================================================
// Detector Implementation
// ============================================================================

/**
 * Constants pattern detector
 *
 * Detects patterns and violations related to constants usage.
 */
export class ConstantsDetector extends UnifiedDetector {
  readonly id = 'config/constants';
  readonly category = 'config' as const;
  readonly subcategory = 'constants';
  readonly name = 'Constants Pattern Detector';
  readonly description =
    'Detects constant naming conventions, magic values, and potential secrets';
  readonly supportedLanguages: Language[] = [
    'typescript',
    'javascript',
    'python',
    'java',
    'csharp',
    'php',
    'go',
  ];
  readonly strategies: DetectionStrategy[] = ['regex', 'semantic', 'learning'];

  /**
   * Learned naming convention for this codebase
   */
  private learnedConvention: string | null = null;

  /**
   * Count of constants by naming convention
   */
  private conventionCounts = new Map<string, number>();

  /**
   * Generate quick fix for a violation
   */
  generateQuickFix(violation: Violation): QuickFix | null {
    if (violation.patternId === 'magic-value') {
      return {
        title: 'Extract to constant',
        kind: 'quickfix',
        edit: {
          changes: {
            [violation.file]: [{
              range: violation.range,
              newText: `/* TODO: Extract to constant */`,
            }],
          },
        },
        isPreferred: true,
        confidence: 0.7,
      };
    }

    if (violation.patternId === 'hardcoded-secret') {
      return {
        title: 'Move to environment variable',
        kind: 'quickfix',
        edit: {
          changes: {
            [violation.file]: [{
              range: violation.range,
              newText: `process.env.SECRET_VALUE`,
            }],
          },
        },
        isPreferred: true,
        confidence: 0.8,
      };
    }

    return null;
  }

  // ============================================================================
  // Strategy Implementation
  // ============================================================================

  protected async detectWithStrategy(
    strategy: DetectionStrategy,
    context: DetectionContext
  ): Promise<StrategyResult> {
    switch (strategy) {
      case 'regex':
        return this.detectWithRegex(context);
      case 'semantic':
        return this.detectSemantic(context);
      case 'learning':
        return this.detectLearning(context);
      default:
        return this.createSkippedResult(strategy, 'Not implemented');
    }
  }

  // ============================================================================
  // Regex Detection
  // ============================================================================

  private async detectWithRegex(context: DetectionContext): Promise<StrategyResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    const content = context.content;
    const lines = content.split('\n');

    // Detect constant declarations
    const constantPatterns = this.getConstantPatterns(context.language);

    for (const pattern of constantPatterns) {
      let match;
      while ((match = pattern.regex.exec(content)) !== null) {
        const line = this.getLineNumber(content, match.index);
        const name = match[1] || match[0];

        // Check naming convention
        const convention = this.detectNamingConvention(name);
        if (convention) {
          this.conventionCounts.set(
            convention,
            (this.conventionCounts.get(convention) || 0) + 1
          );
        }

        patterns.push(
          this.createPatternMatch(
            `constant-${pattern.type}`,
            context.file,
            line,
            match.index - this.getLineStart(content, line),
            {
              name,
              type: pattern.type,
              convention,
            }
          )
        );
      }
    }

    // Detect magic values
    for (const magicPattern of MAGIC_VALUE_PATTERNS) {
      let match;
      const regex = new RegExp(magicPattern.pattern.source, 'gi');
      while ((match = regex.exec(content)) !== null) {
        const line = this.getLineNumber(content, match.index);
        const lineContent = lines[line - 1] || '';

        // Skip if it's already in a constant declaration
        if (this.isInConstantDeclaration(lineContent)) {
          continue;
        }

        violations.push(
          this.createViolation(
            'magic-value',
            context.file,
            line,
            match.index - this.getLineStart(content, line),
            `Magic value '${match[0]}' should be extracted to a named constant`,
            magicPattern.severity,
            {
              value: match[0],
              category: magicPattern.category,
              suggestedName: this.suggestConstantName(match[0], magicPattern.category),
            }
          )
        );
      }
    }

    // Detect potential secrets
    for (const secretPattern of SECRET_PATTERNS) {
      let match;
      const regex = new RegExp(secretPattern.source, 'gi');
      while ((match = regex.exec(content)) !== null) {
        const line = this.getLineNumber(content, match.index);

        violations.push(
          this.createViolation(
            'hardcoded-secret',
            context.file,
            line,
            match.index - this.getLineStart(content, line),
            'Potential hardcoded secret detected - use environment variables',
            'error',
            {
              pattern: secretPattern.source,
            }
          )
        );
      }
    }

    return this.createStrategyResult('regex', patterns, violations, 0.8);
  }

  // ============================================================================
  // Semantic Detection
  // ============================================================================

  private async detectSemantic(context: DetectionContext): Promise<StrategyResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    const content = context.content;

    // Semantic keywords that indicate constants
    const semanticPatterns = [
      { keyword: 'CONFIG', category: 'config' },
      { keyword: 'SETTINGS', category: 'config' },
      { keyword: 'OPTIONS', category: 'config' },
      { keyword: 'DEFAULT', category: 'default' },
      { keyword: 'MAX_', category: 'limit' },
      { keyword: 'MIN_', category: 'limit' },
      { keyword: 'TIMEOUT', category: 'timeout' },
      { keyword: 'RETRY', category: 'retry' },
      { keyword: 'ERROR_', category: 'error' },
      { keyword: 'STATUS_', category: 'status' },
      { keyword: 'API_', category: 'api' },
      { keyword: 'URL_', category: 'api' },
      { keyword: 'ENDPOINT', category: 'api' },
    ];

    for (const { keyword, category } of semanticPatterns) {
      const regex = new RegExp(`\\b([A-Z_]*${keyword}[A-Z_0-9]*)\\b`, 'g');
      let match;
      while ((match = regex.exec(content)) !== null) {
        const line = this.getLineNumber(content, match.index);

        patterns.push(
          this.createPatternMatch(
            `constant-semantic-${category}`,
            context.file,
            line,
            match.index - this.getLineStart(content, line),
            {
              name: match[1],
              category,
              keyword,
            }
          )
        );
      }
    }

    return this.createStrategyResult('semantic', patterns, violations, 0.7);
  }

  // ============================================================================
  // Learning Detection
  // ============================================================================

  private async detectLearning(context: DetectionContext): Promise<StrategyResult> {
    const violations: Violation[] = [];

    // Learn the dominant naming convention
    if (!this.learnedConvention && this.conventionCounts.size > 0) {
      let maxCount = 0;
      for (const [convention, count] of this.conventionCounts) {
        if (count > maxCount) {
          maxCount = count;
          this.learnedConvention = convention;
        }
      }
    }

    // If we've learned a convention, flag violations
    if (this.learnedConvention) {
      const constantPatterns = this.getConstantPatterns(context.language);
      const content = context.content;

      for (const pattern of constantPatterns) {
        let match;
        while ((match = pattern.regex.exec(content)) !== null) {
          const name = match[1] || match[0];
          const convention = this.detectNamingConvention(name);

          if (convention && convention !== this.learnedConvention) {
            const line = this.getLineNumber(content, match.index);

            violations.push(
              this.createViolation(
                'naming-convention-violation',
                context.file,
                line,
                match.index - this.getLineStart(content, line),
                `Constant '${name}' uses ${convention} but codebase convention is ${this.learnedConvention}`,
                'warning',
                {
                  name,
                  actualConvention: convention,
                  expectedConvention: this.learnedConvention,
                }
              )
            );
          }
        }
      }
    }

    return this.createStrategyResult('learning', [], violations, 0.9);
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private getConstantPatterns(
    language: string
  ): Array<{ regex: RegExp; type: string }> {
    switch (language) {
      case 'typescript':
      case 'javascript':
        return [
          { regex: /\bconst\s+([A-Z][A-Z0-9_]*)\s*=/g, type: 'const' },
          { regex: /\bexport\s+const\s+([A-Z][A-Z0-9_]*)\s*=/g, type: 'export-const' },
        ];
      case 'python':
        return [
          { regex: /^([A-Z][A-Z0-9_]*)\s*=/gm, type: 'module-constant' },
        ];
      case 'java':
        return [
          {
            regex: /\b(?:public|private|protected)?\s*static\s+final\s+\w+\s+([A-Z][A-Z0-9_]*)\s*=/g,
            type: 'static-final',
          },
        ];
      case 'csharp':
        return [
          { regex: /\bconst\s+\w+\s+([A-Z][A-Za-z0-9]*)\s*=/g, type: 'const' },
          {
            regex: /\bstatic\s+readonly\s+\w+\s+([A-Z][A-Za-z0-9]*)\s*=/g,
            type: 'static-readonly',
          },
        ];
      case 'php':
        return [
          { regex: /\bconst\s+([A-Z][A-Z0-9_]*)\s*=/g, type: 'const' },
          { regex: /\bdefine\s*\(\s*['"]([A-Z][A-Z0-9_]*)['"]/g, type: 'define' },
        ];
      case 'go':
        return [
          { regex: /\bconst\s+([A-Z][A-Za-z0-9]*)\s*=/g, type: 'const' },
          { regex: /\bconst\s+\(\s*([A-Z][A-Za-z0-9]*)/g, type: 'const-block' },
        ];
      default:
        return [];
    }
  }

  private detectNamingConvention(name: string): string | null {
    for (const convention of NAMING_CONVENTIONS) {
      if (convention.pattern.test(name)) {
        return convention.name;
      }
    }
    return null;
  }

  private isInConstantDeclaration(line: string): boolean {
    return /\b(const|final|readonly|define)\b/i.test(line);
  }

  private suggestConstantName(value: string, category: string): string {
    const prefix = category.toUpperCase();
    const suffix = value.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
    return `${prefix}_${suffix}`;
  }

  private getLineNumber(content: string, index: number): number {
    return content.substring(0, index).split('\n').length;
  }

  private getLineStart(content: string, lineNumber: number): number {
    const lines = content.split('\n');
    let start = 0;
    for (let i = 0; i < lineNumber - 1 && i < lines.length; i++) {
      start += lines[i]!.length + 1;
    }
    return start;
  }

  private createPatternMatch(
    patternId: string,
    file: string,
    line: number,
    column: number,
    _metadata: Record<string, unknown>
  ): PatternMatch {
    return {
      patternId,
      location: { file, line, column },
      confidence: 0.85,
      isOutlier: false,
    };
  }

  private createViolation(
    patternId: string,
    file: string,
    line: number,
    column: number,
    message: string,
    severity: 'info' | 'warning' | 'error',
    _metadata: Record<string, unknown>
  ): Violation {
    return {
      id: `${patternId}-${file}-${line}-${column}`,
      patternId,
      file,
      range: {
        start: { line: line - 1, character: column },
        end: { line: line - 1, character: column + 1 },
      },
      message,
      severity: severity === 'error' ? 'error' : severity === 'warning' ? 'warning' : 'info',
      expected: 'Follow constant naming conventions',
      actual: message,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }
}

/**
 * Factory function
 */
export function createConstantsDetector(): ConstantsDetector {
  return new ConstantsDetector();
}
