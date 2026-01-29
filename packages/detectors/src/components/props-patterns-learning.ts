/**
 * Props Patterns Detector - LEARNING VERSION
 *
 * Learns props patterns from the user's codebase:
 * - Props typing style (interface vs type)
 * - Props naming conventions
 * - Destructuring patterns
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

export type PropsTypingStyle = 'interface' | 'type' | 'inline';
export type PropsNamingSuffix = 'Props' | 'Properties' | 'none';

export interface PropsPatternsConventions {
  [key: string]: unknown;
  typingStyle: PropsTypingStyle;
  namingSuffix: PropsNamingSuffix;
  usesDestructuring: boolean;
  usesDefaultProps: boolean;
}

interface PropsPatternInfo {
  typingStyle: PropsTypingStyle;
  namingSuffix: PropsNamingSuffix;
  usesDestructuring: boolean;
  name: string;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractPropsPatterns(content: string, file: string): PropsPatternInfo[] {
  const results: PropsPatternInfo[] = [];

  // Interface props
  const interfacePattern = /interface\s+(\w+)(Props|Properties)?\s*\{/g;
  let match;
  while ((match = interfacePattern.exec(content)) !== null) {
    const name = match[1] || '';
    const suffix = match[2] as PropsNamingSuffix || 'none';
    
    // Only track if it looks like a props interface
    if (!suffix && !name.endsWith('Props') && !name.endsWith('Properties')) {continue;}

    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      typingStyle: 'interface',
      namingSuffix: suffix || (name.endsWith('Props') ? 'Props' : name.endsWith('Properties') ? 'Properties' : 'none'),
      usesDestructuring: false,
      name: name + (suffix || ''),
      line,
      column,
      file,
    });
  }

  // Type props
  const typePattern = /type\s+(\w+)(Props|Properties)?\s*=/g;
  while ((match = typePattern.exec(content)) !== null) {
    const name = match[1] || '';
    const suffix = match[2] as PropsNamingSuffix || 'none';
    
    if (!suffix && !name.endsWith('Props') && !name.endsWith('Properties')) {continue;}

    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      typingStyle: 'type',
      namingSuffix: suffix || (name.endsWith('Props') ? 'Props' : name.endsWith('Properties') ? 'Properties' : 'none'),
      usesDestructuring: false,
      name: name + (suffix || ''),
      line,
      column,
      file,
    });
  }

  // Check for destructuring in function params
  const destructurePattern = /function\s+\w+\s*\(\s*\{[^}]+\}\s*:/g;
  while ((match = destructurePattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      typingStyle: 'inline',
      namingSuffix: 'none',
      usesDestructuring: true,
      name: 'destructured',
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning Props Patterns Detector
// ============================================================================

export class PropsPatternsLearningDetector extends LearningDetector<PropsPatternsConventions> {
  readonly id = 'components/props-patterns';
  readonly category = 'components' as const;
  readonly subcategory = 'props-patterns';
  readonly name = 'Props Patterns Detector (Learning)';
  readonly description = 'Learns props patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof PropsPatternsConventions> {
    return ['typingStyle', 'namingSuffix', 'usesDestructuring', 'usesDefaultProps'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof PropsPatternsConventions, ValueDistribution>
  ): void {
    const patterns = extractPropsPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const typingDist = distributions.get('typingStyle')!;
    const namingDist = distributions.get('namingSuffix')!;
    const destructureDist = distributions.get('usesDestructuring')!;

    for (const pattern of patterns) {
      if (pattern.typingStyle !== 'inline') {
        typingDist.add(pattern.typingStyle, context.file);
        namingDist.add(pattern.namingSuffix, context.file);
      }
      destructureDist.add(pattern.usesDestructuring, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<PropsPatternsConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const propsPatterns = extractPropsPatterns(context.content, context.file);
    if (propsPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedTyping = conventions.conventions.typingStyle?.value;
    const learnedNaming = conventions.conventions.namingSuffix?.value;

    // Check typing style consistency
    if (learnedTyping) {
      for (const pattern of propsPatterns) {
        if (pattern.typingStyle !== 'inline' && pattern.typingStyle !== learnedTyping) {
          violations.push(this.createConventionViolation(
            pattern.file, pattern.line, pattern.column,
            'props typing', pattern.typingStyle, learnedTyping,
            `Props '${pattern.name}' uses ${pattern.typingStyle} but project uses ${learnedTyping}`
          ));
        }
      }
    }

    // Check naming suffix consistency
    if (learnedNaming && learnedNaming !== 'none') {
      for (const pattern of propsPatterns) {
        if (pattern.namingSuffix !== learnedNaming && pattern.typingStyle !== 'inline') {
          violations.push(this.createConventionViolation(
            pattern.file, pattern.line, pattern.column,
            'props naming', pattern.namingSuffix || 'none', learnedNaming,
            `Props '${pattern.name}' should end with '${learnedNaming}'`
          ));
        }
      }
    }

    if (propsPatterns.length > 0) {
      const first = propsPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/props`,
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

export function createPropsPatternsLearningDetector(): PropsPatternsLearningDetector {
  return new PropsPatternsLearningDetector();
}
