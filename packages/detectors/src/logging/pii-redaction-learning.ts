/**
 * PII Redaction Detector - LEARNING VERSION
 *
 * Learns PII redaction patterns from the user's codebase:
 * - Redaction method (masking, hashing, removal)
 * - Field naming patterns for sensitive data
 * - Redaction library usage
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

export type RedactionMethod = 'mask' | 'hash' | 'remove' | 'truncate' | 'custom';
export type PIIFieldPattern = 'explicit' | 'regex' | 'allowlist' | 'denylist';

export interface PIIRedactionConventions {
  [key: string]: unknown;
  redactionMethod: RedactionMethod;
  fieldPattern: PIIFieldPattern;
  usesLibrary: boolean;
  libraryName: string | null;
  maskCharacter: string;
}

interface RedactionInfo {
  method: RedactionMethod;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

const REDACTION_PATTERNS = {
  mask: /(?:mask|redact|hide|obscure)\s*\(/gi,
  hash: /(?:hash|sha256|md5|bcrypt)\s*\(/gi,
  remove: /(?:omit|exclude|strip|remove)(?:PII|Sensitive|Personal)/gi,
  truncate: /(?:truncate|shorten|clip)\s*\(/gi,
};

const LIBRARY_PATTERNS = [
  { pattern: /import.*from\s+['"]pii-redactor['"]/i, name: 'pii-redactor' },
  { pattern: /import.*from\s+['"]@aws-sdk\/client-comprehend['"]/i, name: 'aws-comprehend' },
  { pattern: /import.*from\s+['"]dlp['"]/i, name: 'google-dlp' },
  { pattern: /import.*from\s+['"]presidio['"]/i, name: 'presidio' },
];

function extractRedactionPatterns(content: string, file: string): RedactionInfo[] {
  const patterns: RedactionInfo[] = [];
  
  for (const [method, regex] of Object.entries(REDACTION_PATTERNS)) {
    const re = new RegExp(regex.source, regex.flags);
    let match;
    while ((match = re.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;
      
      patterns.push({
        method: method as RedactionMethod,
        line: lineNumber,
        column,
        file,
      });
    }
  }
  
  return patterns;
}

function detectLibrary(content: string): string | null {
  for (const { pattern, name } of LIBRARY_PATTERNS) {
    if (pattern.test(content)) {return name;}
  }
  return null;
}

// ============================================================================
// Learning PII Redaction Detector
// ============================================================================

export class PIIRedactionLearningDetector extends LearningDetector<PIIRedactionConventions> {
  readonly id = 'logging/pii-redaction';
  readonly category = 'logging' as const;
  readonly subcategory = 'pii-redaction';
  readonly name = 'PII Redaction Detector (Learning)';
  readonly description = 'Learns PII redaction patterns from your codebase and flags inconsistencies';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof PIIRedactionConventions> {
    return ['redactionMethod', 'fieldPattern', 'usesLibrary', 'libraryName', 'maskCharacter'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof PIIRedactionConventions, ValueDistribution>
  ): void {
    const patterns = extractRedactionPatterns(context.content, context.file);
    const library = detectLibrary(context.content);
    
    const methodDist = distributions.get('redactionMethod')!;
    const libraryDist = distributions.get('usesLibrary')!;
    const libraryNameDist = distributions.get('libraryName')!;
    
    for (const pattern of patterns) {
      methodDist.add(pattern.method, context.file);
    }
    
    if (library) {
      libraryDist.add(true, context.file);
      libraryNameDist.add(library, context.file);
    }
    
    // Detect mask character
    const maskMatch = context.content.match(/['"](\*{3,}|X{3,}|#{3,})['"]/);
    if (maskMatch) {
      const maskDist = distributions.get('maskCharacter')!;
      maskDist.add(maskMatch[1]![0]!, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<PIIRedactionConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    const redactionPatterns = extractRedactionPatterns(context.content, context.file);
    const learnedMethod = conventions.conventions.redactionMethod?.value;
    
    for (const pattern of redactionPatterns) {
      if (learnedMethod && pattern.method !== learnedMethod) {
        violations.push(this.createConventionViolation(
          pattern.file,
          pattern.line,
          pattern.column,
          'PII redaction method',
          pattern.method,
          learnedMethod,
          `Using '${pattern.method}' but your project uses '${learnedMethod}' for PII redaction`
        ));
      }
      
      patterns.push({
        patternId: `${this.id}/${pattern.method}`,
        location: { file: context.file, line: pattern.line, column: pattern.column },
        confidence: 1.0,
        isOutlier: false,
      });
    }
    
    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }
}

export function createPIIRedactionLearningDetector(): PIIRedactionLearningDetector {
  return new PIIRedactionLearningDetector();
}
