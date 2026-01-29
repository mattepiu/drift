/**
 * Spring API Patterns Detector - LEARNING VERSION
 *
 * Learns API patterns from the user's codebase:
 * - Request mapping style preferences (@GetMapping vs @RequestMapping)
 * - Response handling patterns (ResponseEntity vs direct return)
 * - Parameter binding conventions (@RequestBody, @PathVariable)
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

export type MappingStyle = 'specific' | 'generic';
export type ResponseStyle = 'responseEntity' | 'direct';

export interface SpringAPIConventions {
  [key: string]: unknown;
  /** Whether specific mappings (@GetMapping) or generic (@RequestMapping) are preferred */
  mappingStyle: MappingStyle;
  /** Whether ResponseEntity or direct return is preferred */
  responseStyle: ResponseStyle;
  /** Whether @RequestBody is consistently used for POST/PUT */
  usesRequestBody: boolean;
}

interface APIPatternInfo {
  mappingType: string;
  isSpecificMapping: boolean;
  usesResponseEntity: boolean;
  hasRequestBody: boolean;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractAPIPatterns(content: string, file: string): APIPatternInfo[] {
  const results: APIPatternInfo[] = [];
  
  const specificMappings = ['GetMapping', 'PostMapping', 'PutMapping', 'DeleteMapping', 'PatchMapping'];
  
  const keywords = SPRING_KEYWORD_GROUPS.api.keywords;
  
  for (const keyword of keywords) {
    // Only process mapping annotations
    if (!keyword.includes('Mapping')) {continue;}
    
    const pattern = new RegExp(`@${keyword}\\b`, 'g');
    let match;
    while ((match = pattern.exec(content)) !== null) {
      // Skip imports
      const lineStart = content.lastIndexOf('\n', match.index) + 1;
      const lineContent = content.slice(lineStart, content.indexOf('\n', match.index));
      if (lineContent.trim().startsWith('import ')) {continue;}
      
      const beforeMatch = content.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;
      
      // Check if specific or generic mapping
      const isSpecificMapping = specificMappings.includes(keyword);
      
      // Check for ResponseEntity in the method signature (look ahead ~500 chars)
      const methodContext = content.slice(match.index, Math.min(content.length, match.index + 500));
      const usesResponseEntity = /ResponseEntity\s*</.test(methodContext);
      
      // Check for @RequestBody in the method
      const hasRequestBody = /@RequestBody\b/.test(methodContext);
      
      results.push({
        mappingType: keyword,
        isSpecificMapping,
        usesResponseEntity,
        hasRequestBody,
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

export class SpringAPILearningDetector extends LearningDetector<SpringAPIConventions> {
  readonly id = 'spring/api-patterns-learning';
  readonly category = 'api' as const;
  readonly subcategory = 'spring-api';
  readonly name = 'Spring API Patterns Detector (Learning)';
  readonly description = 'Learns API patterns from your Spring codebase';
  readonly supportedLanguages: Language[] = ['java'];

  protected getConventionKeys(): Array<keyof SpringAPIConventions> {
    return ['mappingStyle', 'responseStyle', 'usesRequestBody'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof SpringAPIConventions, ValueDistribution>
  ): void {
    if (context.language !== 'java') {return;}

    const patterns = extractAPIPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const mappingStyleDist = distributions.get('mappingStyle')!;
    const responseStyleDist = distributions.get('responseStyle')!;
    const requestBodyDist = distributions.get('usesRequestBody')!;

    for (const pattern of patterns) {
      // Track mapping style preference
      const style: MappingStyle = pattern.isSpecificMapping ? 'specific' : 'generic';
      mappingStyleDist.add(style, context.file);
      
      // Track response style
      const responseStyle: ResponseStyle = pattern.usesResponseEntity ? 'responseEntity' : 'direct';
      responseStyleDist.add(responseStyle, context.file);
      
      // Track RequestBody usage for POST/PUT
      if (pattern.mappingType === 'PostMapping' || pattern.mappingType === 'PutMapping') {
        requestBodyDist.add(pattern.hasRequestBody, context.file);
      }
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<SpringAPIConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    if (context.language !== 'java') {
      return this.createEmptyResult();
    }

    const foundPatterns = extractAPIPatterns(context.content, context.file);
    if (foundPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedMappingStyle = conventions.conventions.mappingStyle?.value;
    const learnedResponseStyle = conventions.conventions.responseStyle?.value;

    // Check for mapping style consistency
    if (learnedMappingStyle) {
      for (const pattern of foundPatterns) {
        const currentStyle: MappingStyle = pattern.isSpecificMapping ? 'specific' : 'generic';
        if (currentStyle !== learnedMappingStyle) {
          const expected = learnedMappingStyle === 'specific' ? '@GetMapping/@PostMapping' : '@RequestMapping';
          const actual = pattern.isSpecificMapping ? '@GetMapping/@PostMapping' : '@RequestMapping';
          violations.push(this.createConventionViolation(
            context.file, pattern.line, pattern.column,
            'mapping style', actual, expected,
            `Using ${actual} but project prefers ${expected}`
          ));
        }
      }
    }

    // Check for response style consistency
    if (learnedResponseStyle) {
      for (const pattern of foundPatterns) {
        const currentStyle: ResponseStyle = pattern.usesResponseEntity ? 'responseEntity' : 'direct';
        if (currentStyle !== learnedResponseStyle) {
          violations.push(this.createConventionViolation(
            context.file, pattern.line, pattern.column,
            'response style', currentStyle, learnedResponseStyle,
            `Using ${currentStyle} return but project prefers ${learnedResponseStyle}`
          ));
        }
      }
    }

    if (foundPatterns.length > 0) {
      const first = foundPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/api`,
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

export function createSpringAPILearningDetector(): SpringAPILearningDetector {
  return new SpringAPILearningDetector();
}
