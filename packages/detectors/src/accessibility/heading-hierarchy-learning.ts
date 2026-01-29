/**
 * Heading Hierarchy Detector - LEARNING VERSION
 *
 * Learns heading hierarchy patterns from the user's codebase:
 * - Heading component usage
 * - Level management approach
 * - Semantic heading patterns
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

export type HeadingStyle = 'native' | 'component' | 'mixed';
export type HeadingComponent = 'Heading' | 'Typography' | 'Text' | 'custom';

export interface HeadingHierarchyConventions {
  [key: string]: unknown;
  headingStyle: HeadingStyle;
  headingComponent: HeadingComponent | null;
  usesLevelProp: boolean;
  maxLevel: number;
}

interface HeadingInfo {
  level: number;
  isNative: boolean;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

const NATIVE_HEADING_PATTERN = /<h([1-6])[\s>]/gi;
const COMPONENT_PATTERNS = [
  /<Heading\s+level=\{?(\d)\}?/gi,
  /<Typography\s+variant=["']h(\d)["']/gi,
  /<Text\s+as=["']h(\d)["']/gi,
];

function extractHeadingPatterns(content: string, file: string): HeadingInfo[] {
  const headings: HeadingInfo[] = [];
  
  // Native headings
  const nativeRe = new RegExp(NATIVE_HEADING_PATTERN.source, NATIVE_HEADING_PATTERN.flags);
  let match;
  while ((match = nativeRe.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const lineNumber = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;
    headings.push({ level: parseInt(match[1]!, 10), isNative: true, line: lineNumber, column, file });
  }
  
  // Component headings
  for (const pattern of COMPONENT_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    while ((match = re.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;
      headings.push({ level: parseInt(match[1]!, 10), isNative: false, line: lineNumber, column, file });
    }
  }
  
  return headings;
}

// ============================================================================
// Learning Heading Hierarchy Detector
// ============================================================================

export class HeadingHierarchyLearningDetector extends LearningDetector<HeadingHierarchyConventions> {
  readonly id = 'accessibility/heading-hierarchy';
  readonly category = 'accessibility' as const;
  readonly subcategory = 'heading-hierarchy';
  readonly name = 'Heading Hierarchy Detector (Learning)';
  readonly description = 'Learns heading hierarchy patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof HeadingHierarchyConventions> {
    return ['headingStyle', 'headingComponent', 'usesLevelProp', 'maxLevel'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof HeadingHierarchyConventions, ValueDistribution>
  ): void {
    const headings = extractHeadingPatterns(context.content, context.file);
    
    const styleDist = distributions.get('headingStyle')!;
    const levelDist = distributions.get('maxLevel')!;
    const levelPropDist = distributions.get('usesLevelProp')!;
    
    const hasNative = headings.some(h => h.isNative);
    const hasComponent = headings.some(h => !h.isNative);
    
    if (hasNative && hasComponent) {styleDist.add('mixed', context.file);}
    else if (hasNative) {styleDist.add('native', context.file);}
    else if (hasComponent) {styleDist.add('component', context.file);}
    
    for (const heading of headings) {
      levelDist.add(heading.level, context.file);
    }
    
    const usesLevelProp = /level=\{?\d\}?/i.test(context.content);
    levelPropDist.add(usesLevelProp, context.file);
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<HeadingHierarchyConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    const headings = extractHeadingPatterns(context.content, context.file);
    const learnedStyle = conventions.conventions.headingStyle?.value;
    
    for (const heading of headings) {
      const currentStyle = heading.isNative ? 'native' : 'component';
      if (learnedStyle && learnedStyle !== 'mixed' && currentStyle !== learnedStyle) {
        violations.push(this.createConventionViolation(
          heading.file, heading.line, heading.column,
          'heading style', currentStyle, learnedStyle,
          `Using ${currentStyle} headings but your project uses ${learnedStyle}`
        ));
      }
      
      patterns.push({
        patternId: `${this.id}/h${heading.level}`,
        location: { file: context.file, line: heading.line, column: heading.column },
        confidence: 1.0, isOutlier: false,
      });
    }
    
    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }
}

export function createHeadingHierarchyLearningDetector(): HeadingHierarchyLearningDetector {
  return new HeadingHierarchyLearningDetector();
}
