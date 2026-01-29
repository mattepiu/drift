/**
 * XSS Prevention Detector - LEARNING VERSION
 *
 * Learns XSS prevention patterns from the user's codebase:
 * - Sanitization library usage
 * - Output encoding approach
 * - React/Vue/Angular patterns
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

import type { PatternMatch, Violation, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type SanitizationMethod = 'dompurify' | 'xss' | 'sanitize-html' | 'escape' | 'framework';
export type OutputEncoding = 'html-entities' | 'url-encode' | 'base64' | 'none';

export interface XSSPreventionConventions {
  [key: string]: unknown;
  sanitizationMethod: SanitizationMethod;
  outputEncoding: OutputEncoding;
  usesDangerouslySetInnerHTML: boolean;
  usesVHtml: boolean;
}

interface XSSPatternInfo {
  method: SanitizationMethod;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

const SANITIZATION_PATTERNS: Array<{ pattern: RegExp; method: SanitizationMethod }> = [
  { pattern: /import.*from\s+['"]dompurify['"]/i, method: 'dompurify' },
  { pattern: /import.*from\s+['"]xss['"]/i, method: 'xss' },
  { pattern: /import.*from\s+['"]sanitize-html['"]/i, method: 'sanitize-html' },
  { pattern: /escape(?:Html|XML|String)\s*\(/i, method: 'escape' },
];

const DANGEROUS_PATTERNS = {
  dangerouslySetInnerHTML: /dangerouslySetInnerHTML\s*=\s*\{/g,
  vHtml: /v-html\s*=/g,
  innerHTML: /\.innerHTML\s*=/g,
  documentWrite: /document\.write\s*\(/g,
};

function extractXSSPatterns(content: string, file: string): XSSPatternInfo[] {
  const patterns: XSSPatternInfo[] = [];
  
  for (const { pattern, method } of SANITIZATION_PATTERNS) {
    const match = pattern.exec(content);
    if (match) {
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;
      
      patterns.push({ method, line: lineNumber, column, file });
    }
  }
  
  return patterns;
}

function detectDangerousUsage(content: string): string[] {
  const dangerous: string[] = [];
  for (const [name, pattern] of Object.entries(DANGEROUS_PATTERNS)) {
    if (pattern.test(content)) {
      dangerous.push(name);
    }
  }
  return dangerous;
}

// ============================================================================
// Learning XSS Prevention Detector
// ============================================================================

export class XSSPreventionLearningDetector extends LearningDetector<XSSPreventionConventions> {
  readonly id = 'security/xss-prevention';
  readonly category = 'security' as const;
  readonly subcategory = 'xss-prevention';
  readonly name = 'XSS Prevention Detector (Learning)';
  readonly description = 'Learns XSS prevention patterns from your codebase and flags inconsistencies';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof XSSPreventionConventions> {
    return ['sanitizationMethod', 'outputEncoding', 'usesDangerouslySetInnerHTML', 'usesVHtml'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof XSSPreventionConventions, ValueDistribution>
  ): void {
    const patterns = extractXSSPatterns(context.content, context.file);
    const dangerous = detectDangerousUsage(context.content);
    
    const methodDist = distributions.get('sanitizationMethod')!;
    const dangerousDist = distributions.get('usesDangerouslySetInnerHTML')!;
    const vHtmlDist = distributions.get('usesVHtml')!;
    
    for (const pattern of patterns) {
      methodDist.add(pattern.method, context.file);
    }
    
    dangerousDist.add(dangerous.includes('dangerouslySetInnerHTML'), context.file);
    vHtmlDist.add(dangerous.includes('vHtml'), context.file);
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<XSSPreventionConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    const xssPatterns = extractXSSPatterns(context.content, context.file);
    const dangerous = detectDangerousUsage(context.content);
    const learnedMethod = conventions.conventions.sanitizationMethod?.value;
    
    // Check for inconsistent sanitization methods
    for (const pattern of xssPatterns) {
      if (learnedMethod && pattern.method !== learnedMethod) {
        violations.push(this.createConventionViolation(
          pattern.file,
          pattern.line,
          pattern.column,
          'XSS sanitization method',
          pattern.method,
          learnedMethod,
          `Using '${pattern.method}' but your project uses '${learnedMethod}'`
        ));
      }
      
      patterns.push({
        patternId: `${this.id}/${pattern.method}`,
        location: { file: context.file, line: pattern.line, column: pattern.column },
        confidence: 1.0,
        isOutlier: false,
      });
    }
    
    // Flag dangerous patterns without sanitization
    if (dangerous.length > 0 && xssPatterns.length === 0 && learnedMethod) {
      for (const [name, regex] of Object.entries(DANGEROUS_PATTERNS)) {
        const match = regex.exec(context.content);
        if (match) {
          const beforeMatch = context.content.slice(0, match.index);
          const lineNumber = beforeMatch.split('\n').length;
          const lastNewline = beforeMatch.lastIndexOf('\n');
          const column = match.index - lastNewline;
          
          violations.push(this.createConventionViolation(
            context.file,
            lineNumber,
            column,
            'XSS prevention',
            name,
            `${name} with ${learnedMethod}`,
            `Using ${name} without sanitization. Your project uses '${learnedMethod}'.`
          ));
        }
      }
    }
    
    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }
}

export function createXSSPreventionLearningDetector(): XSSPreventionLearningDetector {
  return new XSSPreventionLearningDetector();
}
