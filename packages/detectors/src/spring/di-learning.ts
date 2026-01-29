/**
 * Spring Dependency Injection Patterns Detector - LEARNING VERSION
 *
 * Learns DI patterns from the user's codebase:
 * - Injection style preferences (field, constructor, setter)
 * - Qualifier usage patterns
 * - Bean scope conventions
 *
 * @requirements DRIFT-CORE - Learn patterns from user's code, not enforce arbitrary rules
 */

import { SPRING_KEYWORD_GROUPS } from './keywords.js';
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

export type InjectionStyle = 'field' | 'constructor' | 'setter';
export type BeanScope = 'singleton' | 'prototype' | 'request' | 'session';

export interface SpringDIConventions {
  [key: string]: unknown;
  /** Preferred injection style */
  injectionStyle: InjectionStyle;
  /** Whether @Qualifier is used for disambiguation */
  usesQualifier: boolean;
  /** Whether Lombok's @RequiredArgsConstructor is used */
  usesLombokConstructor: boolean;
}

interface DIPatternInfo {
  injectionStyle: InjectionStyle;
  hasQualifier: boolean;
  usesLombok: boolean;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractDIPatterns(content: string, file: string): DIPatternInfo[] {
  const results: DIPatternInfo[] = [];
  
  const keywords = SPRING_KEYWORD_GROUPS.di.keywords;
  
  // Check for Lombok constructor injection
  const hasLombokConstructor = /@RequiredArgsConstructor\b/.test(content) || /@AllArgsConstructor\b/.test(content);
  
  for (const keyword of keywords) {
    if (keyword === 'Autowired' || keyword === 'Inject' || keyword === 'Resource') {
      const pattern = new RegExp(`@${keyword}\\b`, 'g');
      let match;
      while ((match = pattern.exec(content)) !== null) {
        // Skip imports
        const lineStart = content.lastIndexOf('\n', match.index) + 1;
        const lineEnd = content.indexOf('\n', match.index);
        const lineContent = content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
        if (lineContent.trim().startsWith('import ')) {continue;}
        
        const beforeMatch = content.slice(0, match.index);
        const line = beforeMatch.split('\n').length;
        const lastNewline = beforeMatch.lastIndexOf('\n');
        const column = match.index - lastNewline;
        
        // Determine injection style by looking at context
        let injectionStyle: InjectionStyle = 'field';
        
        // Look ahead to see if this is on a constructor or setter
        const nextLines = content.slice(match.index, Math.min(content.length, match.index + 300));
        
        if (/^\s*@\w+\s*\n?\s*(?:public|protected|private)?\s*\w+\s*\(/.test(nextLines)) {
          // Check if it's a constructor (class name matches method name)
          if (/\b\w+\s*\([^)]*\)\s*\{/.test(nextLines) && !/void|return/.test(nextLines.slice(0, 100))) {
            injectionStyle = 'constructor';
          }
        }
        
        if (/^\s*@\w+\s*\n?\s*(?:public|protected|private)?\s*void\s+set\w+\s*\(/.test(nextLines)) {
          injectionStyle = 'setter';
        }
        
        // Check for @Qualifier nearby
        const hasQualifier = /@Qualifier\s*\(/.test(content.slice(Math.max(0, match.index - 100), match.index + 100));
        
        results.push({
          injectionStyle,
          hasQualifier,
          usesLombok: false,
          line,
          column,
          file,
        });
      }
    }
  }

  // If Lombok constructor injection is used, add it as a pattern
  if (hasLombokConstructor) {
    const lombokPattern = /@(?:RequiredArgsConstructor|AllArgsConstructor)\b/g;
    let match;
    while ((match = lombokPattern.exec(content)) !== null) {
      const lineStart = content.lastIndexOf('\n', match.index) + 1;
      const lineContent = content.slice(lineStart, content.indexOf('\n', match.index));
      if (lineContent.trim().startsWith('import ')) {continue;}
      
      const beforeMatch = content.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;
      
      results.push({
        injectionStyle: 'constructor',
        hasQualifier: false,
        usesLombok: true,
        line,
        column,
        file,
      });
    }
  }
  
  return results;
}

// ============================================================================
// Learning Detector
// ============================================================================

export class SpringDILearningDetector extends LearningDetector<SpringDIConventions> {
  readonly id = 'spring/di-patterns-learning';
  readonly category = 'structural' as const;
  readonly subcategory = 'spring-di';
  readonly name = 'Spring DI Patterns Detector (Learning)';
  readonly description = 'Learns dependency injection patterns from your Spring codebase';
  readonly supportedLanguages: Language[] = ['java'];

  protected getConventionKeys(): Array<keyof SpringDIConventions> {
    return ['injectionStyle', 'usesQualifier', 'usesLombokConstructor'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof SpringDIConventions, ValueDistribution>
  ): void {
    if (context.language !== 'java') {return;}

    const patterns = extractDIPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const injectionStyleDist = distributions.get('injectionStyle')!;
    const qualifierDist = distributions.get('usesQualifier')!;
    const lombokDist = distributions.get('usesLombokConstructor')!;

    for (const pattern of patterns) {
      injectionStyleDist.add(pattern.injectionStyle, context.file);
      qualifierDist.add(pattern.hasQualifier, context.file);
      lombokDist.add(pattern.usesLombok, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<SpringDIConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    if (context.language !== 'java') {
      return this.createEmptyResult();
    }

    const foundPatterns = extractDIPatterns(context.content, context.file);
    if (foundPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedInjectionStyle = conventions.conventions.injectionStyle?.value;
    const learnedUsesLombok = conventions.conventions.usesLombokConstructor?.value;

    // Check for injection style consistency
    if (learnedInjectionStyle) {
      for (const pattern of foundPatterns) {
        if (pattern.injectionStyle !== learnedInjectionStyle) {
          // Special case: if project uses Lombok constructor injection, field injection is a violation
          if (learnedUsesLombok && pattern.injectionStyle === 'field') {
            violations.push(this.createConventionViolation(
              context.file, pattern.line, pattern.column,
              'injection style', 'field injection (@Autowired)', 'constructor injection (Lombok)',
              `Using field injection but project prefers Lombok constructor injection`
            ));
          } else if (!learnedUsesLombok) {
            violations.push(this.createConventionViolation(
              context.file, pattern.line, pattern.column,
              'injection style', pattern.injectionStyle, learnedInjectionStyle,
              `Using ${pattern.injectionStyle} injection but project prefers ${learnedInjectionStyle}`
            ));
          }
        }
      }
    }

    if (foundPatterns.length > 0) {
      const first = foundPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/di`,
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

export function createSpringDILearningDetector(): SpringDILearningDetector {
  return new SpringDILearningDetector();
}
