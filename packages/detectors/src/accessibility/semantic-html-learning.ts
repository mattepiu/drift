/**
 * Semantic HTML Detector - LEARNING VERSION
 *
 * Learns semantic HTML patterns from the user's codebase:
 * - Landmark usage patterns
 * - Semantic element preferences
 * - Component wrapper patterns
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

export type SemanticElement = 'header' | 'nav' | 'main' | 'footer' | 'article' | 'section' | 'aside';
export type LandmarkUsage = 'native' | 'aria-role' | 'mixed';

export interface SemanticHtmlConventions {
  [key: string]: unknown;
  landmarkUsage: LandmarkUsage;
  usesHeader: boolean;
  usesNav: boolean;
  usesMain: boolean;
  usesFooter: boolean;
}

interface SemanticInfo {
  element: SemanticElement;
  isNative: boolean;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

const SEMANTIC_PATTERNS: Array<{ pattern: RegExp; element: SemanticElement; native: boolean }> = [
  { pattern: /<header[\s>]/gi, element: 'header', native: true },
  { pattern: /<nav[\s>]/gi, element: 'nav', native: true },
  { pattern: /<main[\s>]/gi, element: 'main', native: true },
  { pattern: /<footer[\s>]/gi, element: 'footer', native: true },
  { pattern: /<article[\s>]/gi, element: 'article', native: true },
  { pattern: /<section[\s>]/gi, element: 'section', native: true },
  { pattern: /<aside[\s>]/gi, element: 'aside', native: true },
  { pattern: /role=["']banner["']/gi, element: 'header', native: false },
  { pattern: /role=["']navigation["']/gi, element: 'nav', native: false },
  { pattern: /role=["']main["']/gi, element: 'main', native: false },
  { pattern: /role=["']contentinfo["']/gi, element: 'footer', native: false },
];

function extractSemanticPatterns(content: string, file: string): SemanticInfo[] {
  const patterns: SemanticInfo[] = [];
  
  for (const { pattern, element, native } of SEMANTIC_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = re.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;
      
      patterns.push({ element, isNative: native, line: lineNumber, column, file });
    }
  }
  
  return patterns;
}

// ============================================================================
// Learning Semantic HTML Detector
// ============================================================================

export class SemanticHtmlLearningDetector extends LearningDetector<SemanticHtmlConventions> {
  readonly id = 'accessibility/semantic-html';
  readonly category = 'accessibility' as const;
  readonly subcategory = 'semantic-html';
  readonly name = 'Semantic HTML Detector (Learning)';
  readonly description = 'Learns semantic HTML patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof SemanticHtmlConventions> {
    return ['landmarkUsage', 'usesHeader', 'usesNav', 'usesMain', 'usesFooter'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof SemanticHtmlConventions, ValueDistribution>
  ): void {
    const patterns = extractSemanticPatterns(context.content, context.file);
    
    const landmarkDist = distributions.get('landmarkUsage')!;
    const headerDist = distributions.get('usesHeader')!;
    const navDist = distributions.get('usesNav')!;
    const mainDist = distributions.get('usesMain')!;
    const footerDist = distributions.get('usesFooter')!;
    
    const hasNative = patterns.some(p => p.isNative);
    const hasAria = patterns.some(p => !p.isNative);
    
    if (hasNative && hasAria) {landmarkDist.add('mixed', context.file);}
    else if (hasNative) {landmarkDist.add('native', context.file);}
    else if (hasAria) {landmarkDist.add('aria-role', context.file);}
    
    headerDist.add(patterns.some(p => p.element === 'header'), context.file);
    navDist.add(patterns.some(p => p.element === 'nav'), context.file);
    mainDist.add(patterns.some(p => p.element === 'main'), context.file);
    footerDist.add(patterns.some(p => p.element === 'footer'), context.file);
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<SemanticHtmlConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    const semanticPatterns = extractSemanticPatterns(context.content, context.file);
    const learnedUsage = conventions.conventions.landmarkUsage?.value;
    
    for (const pattern of semanticPatterns) {
      const currentUsage = pattern.isNative ? 'native' : 'aria-role';
      if (learnedUsage && learnedUsage !== 'mixed' && currentUsage !== learnedUsage) {
        violations.push(this.createConventionViolation(
          pattern.file, pattern.line, pattern.column,
          'landmark usage', currentUsage, learnedUsage,
          `Using ${currentUsage} but your project uses ${learnedUsage}`
        ));
      }
      
      patterns.push({
        patternId: `${this.id}/${pattern.element}`,
        location: { file: context.file, line: pattern.line, column: pattern.column },
        confidence: 1.0, isOutlier: false,
      });
    }
    
    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }
}

export function createSemanticHtmlLearningDetector(): SemanticHtmlLearningDetector {
  return new SemanticHtmlLearningDetector();
}
