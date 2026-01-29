/**
 * Spring Configuration Patterns Detector - LEARNING VERSION
 *
 * Learns configuration patterns from the user's codebase:
 * - Property binding style (@Value vs @ConfigurationProperties)
 * - Configuration class organization
 * - Profile usage patterns
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

export type PropertyBindingStyle = 'value' | 'configurationProperties';
export type DefaultValueStyle = 'inline' | 'separate' | 'none';

export interface SpringConfigConventions {
  [key: string]: unknown;
  /** Preferred property binding style */
  propertyBindingStyle: PropertyBindingStyle;
  /** Whether default values are provided inline in @Value */
  defaultValueStyle: DefaultValueStyle;
  /** Whether @Validated is used with @ConfigurationProperties */
  usesValidation: boolean;
}

interface ConfigPatternInfo {
  bindingStyle: PropertyBindingStyle;
  hasDefaultValue: boolean;
  hasValidation: boolean;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractConfigPatterns(content: string, file: string): ConfigPatternInfo[] {
  const results: ConfigPatternInfo[] = [];
  
  const keywords = SPRING_KEYWORD_GROUPS.config.keywords;
  
  for (const keyword of keywords) {
    if (keyword === 'Value' || keyword === 'ConfigurationProperties') {
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
        
        // Determine binding style
        const bindingStyle: PropertyBindingStyle = keyword === 'Value' ? 'value' : 'configurationProperties';
        
        // Check for default value in @Value annotation
        let hasDefaultValue = false;
        if (keyword === 'Value') {
          // Look for pattern like @Value("${prop:default}")
          const valueContext = content.slice(match.index, Math.min(content.length, match.index + 200));
          hasDefaultValue = /\$\{[^}]+:[^}]+\}/.test(valueContext);
        }
        
        // Check for @Validated nearby (for @ConfigurationProperties)
        let hasValidation = false;
        if (keyword === 'ConfigurationProperties') {
          const classContext = content.slice(Math.max(0, match.index - 200), match.index + 50);
          hasValidation = /@Validated\b/.test(classContext);
        }
        
        results.push({
          bindingStyle,
          hasDefaultValue,
          hasValidation,
          line,
          column,
          file,
        });
      }
    }
  }
  
  return results;
}

// ============================================================================
// Learning Detector
// ============================================================================

export class SpringConfigLearningDetector extends LearningDetector<SpringConfigConventions> {
  readonly id = 'spring/config-patterns-learning';
  readonly category = 'config' as const;
  readonly subcategory = 'spring-config';
  readonly name = 'Spring Config Patterns Detector (Learning)';
  readonly description = 'Learns configuration patterns from your Spring codebase';
  readonly supportedLanguages: Language[] = ['java'];

  protected getConventionKeys(): Array<keyof SpringConfigConventions> {
    return ['propertyBindingStyle', 'defaultValueStyle', 'usesValidation'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof SpringConfigConventions, ValueDistribution>
  ): void {
    if (context.language !== 'java') {return;}

    const patterns = extractConfigPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const bindingStyleDist = distributions.get('propertyBindingStyle')!;
    const defaultValueDist = distributions.get('defaultValueStyle')!;
    const validationDist = distributions.get('usesValidation')!;

    for (const pattern of patterns) {
      bindingStyleDist.add(pattern.bindingStyle, context.file);
      
      if (pattern.bindingStyle === 'value') {
        const defaultStyle: DefaultValueStyle = pattern.hasDefaultValue ? 'inline' : 'none';
        defaultValueDist.add(defaultStyle, context.file);
      }
      
      if (pattern.bindingStyle === 'configurationProperties') {
        validationDist.add(pattern.hasValidation, context.file);
      }
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<SpringConfigConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    if (context.language !== 'java') {
      return this.createEmptyResult();
    }

    const foundPatterns = extractConfigPatterns(context.content, context.file);
    if (foundPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedBindingStyle = conventions.conventions.propertyBindingStyle?.value;
    const learnedDefaultStyle = conventions.conventions.defaultValueStyle?.value;
    const learnedUsesValidation = conventions.conventions.usesValidation?.value;

    // Check for property binding style consistency
    if (learnedBindingStyle) {
      for (const pattern of foundPatterns) {
        if (pattern.bindingStyle !== learnedBindingStyle) {
          const expected = learnedBindingStyle === 'value' ? '@Value' : '@ConfigurationProperties';
          const actual = pattern.bindingStyle === 'value' ? '@Value' : '@ConfigurationProperties';
          violations.push(this.createConventionViolation(
            context.file, pattern.line, pattern.column,
            'property binding', actual, expected,
            `Using ${actual} but project prefers ${expected}`
          ));
        }
      }
    }

    // Check for default value style consistency (only for @Value)
    if (learnedDefaultStyle && learnedDefaultStyle !== 'none') {
      for (const pattern of foundPatterns) {
        if (pattern.bindingStyle === 'value' && !pattern.hasDefaultValue && learnedDefaultStyle === 'inline') {
          violations.push(this.createConventionViolation(
            context.file, pattern.line, pattern.column,
            'default value', 'no default', 'inline default',
            `@Value without default value but project prefers inline defaults`
          ));
        }
      }
    }

    // Check for validation usage with @ConfigurationProperties
    if (learnedUsesValidation === true) {
      for (const pattern of foundPatterns) {
        if (pattern.bindingStyle === 'configurationProperties' && !pattern.hasValidation) {
          violations.push(this.createConventionViolation(
            context.file, pattern.line, pattern.column,
            'validation', 'no @Validated', '@Validated',
            `@ConfigurationProperties without @Validated but project uses validation`
          ));
        }
      }
    }

    if (foundPatterns.length > 0) {
      const first = foundPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/config`,
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

export function createSpringConfigLearningDetector(): SpringConfigLearningDetector {
  return new SpringConfigLearningDetector();
}
