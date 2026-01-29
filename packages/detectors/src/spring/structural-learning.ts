/**
 * Spring Structural Patterns Detector - LEARNING VERSION
 *
 * Learns structural patterns from the user's codebase:
 * - Stereotype annotation preferences (@Component, @Service, @Repository, @Controller)
 * - Component organization patterns
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

export type StereotypeType = 'Component' | 'Service' | 'Repository' | 'Controller' | 'RestController' | 'Configuration';

export interface SpringStructuralConventions {
  [key: string]: unknown;
  /** Preferred stereotype for service classes */
  serviceStereotype: StereotypeType;
  /** Whether @RestController is preferred over @Controller + @ResponseBody */
  usesRestController: boolean;
  /** Whether profiles are used for configuration */
  usesProfiles: boolean;
}

interface StructuralPatternInfo {
  stereotype: StereotypeType;
  isRestController: boolean;
  hasProfile: boolean;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractStructuralPatterns(content: string, file: string): StructuralPatternInfo[] {
  const results: StructuralPatternInfo[] = [];
  
  const keywords = SPRING_KEYWORD_GROUPS.structural.keywords;
  const stereotypes: StereotypeType[] = ['Component', 'Service', 'Repository', 'Controller', 'RestController', 'Configuration'];
  
  for (const keyword of keywords) {
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
      
      // Determine stereotype type
      let stereotype: StereotypeType = 'Component';
      for (const st of stereotypes) {
        if (keyword === st) {
          stereotype = st;
          break;
        }
      }
      
      // Check for RestController
      const isRestController = keyword === 'RestController';
      
      // Check for Profile annotation nearby
      const hasProfile = /@Profile\s*\(/.test(content.slice(Math.max(0, match.index - 200), match.index + 200));
      
      if (stereotypes.includes(keyword as StereotypeType)) {
        results.push({
          stereotype,
          isRestController,
          hasProfile,
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

export class SpringStructuralLearningDetector extends LearningDetector<SpringStructuralConventions> {
  readonly id = 'spring/structural-patterns-learning';
  readonly category = 'structural' as const;
  readonly subcategory = 'spring-structural';
  readonly name = 'Spring Structural Patterns Detector (Learning)';
  readonly description = 'Learns structural patterns from your Spring codebase';
  readonly supportedLanguages: Language[] = ['java'];

  protected getConventionKeys(): Array<keyof SpringStructuralConventions> {
    return ['serviceStereotype', 'usesRestController', 'usesProfiles'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof SpringStructuralConventions, ValueDistribution>
  ): void {
    if (context.language !== 'java') {return;}

    const patterns = extractStructuralPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const stereotypeDist = distributions.get('serviceStereotype')!;
    const restControllerDist = distributions.get('usesRestController')!;
    const profilesDist = distributions.get('usesProfiles')!;

    for (const pattern of patterns) {
      // Track stereotype usage
      if (pattern.stereotype === 'Service' || pattern.stereotype === 'Component') {
        stereotypeDist.add(pattern.stereotype, context.file);
      }
      
      // Track RestController vs Controller preference
      if (pattern.stereotype === 'RestController' || pattern.stereotype === 'Controller') {
        restControllerDist.add(pattern.isRestController, context.file);
      }
      
      // Track profile usage
      if (pattern.hasProfile) {
        profilesDist.add(true, context.file);
      }
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<SpringStructuralConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    if (context.language !== 'java') {
      return this.createEmptyResult();
    }

    const foundPatterns = extractStructuralPatterns(context.content, context.file);
    if (foundPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedRestController = conventions.conventions.usesRestController?.value;

    // Check for RestController consistency
    if (learnedRestController !== undefined) {
      for (const pattern of foundPatterns) {
        if (pattern.stereotype === 'Controller' && learnedRestController === true) {
          violations.push(this.createConventionViolation(
            context.file, pattern.line, pattern.column,
            'controller type', '@Controller', '@RestController',
            `Using @Controller but project prefers @RestController`
          ));
        } else if (pattern.stereotype === 'RestController' && learnedRestController === false) {
          violations.push(this.createConventionViolation(
            context.file, pattern.line, pattern.column,
            'controller type', '@RestController', '@Controller',
            `Using @RestController but project prefers @Controller`
          ));
        }
      }
    }

    if (foundPatterns.length > 0) {
      const first = foundPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/structural`,
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

export function createSpringStructuralLearningDetector(): SpringStructuralLearningDetector {
  return new SpringStructuralLearningDetector();
}
