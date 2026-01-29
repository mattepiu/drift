/**
 * README Structure Detector - LEARNING VERSION
 *
 * Learns README structure patterns from the user's codebase:
 * - Section ordering
 * - Required sections
 * - Badge usage
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

export type ReadmeSection = 'installation' | 'usage' | 'api' | 'contributing' | 'license';

export interface ReadmeStructureConventions {
  [key: string]: unknown;
  requiredSections: ReadmeSection[];
  usesBadges: boolean;
  usesTableOfContents: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

const SECTION_PATTERNS: Array<{ pattern: RegExp; section: ReadmeSection }> = [
  { pattern: /##?\s*Installation/i, section: 'installation' },
  { pattern: /##?\s*Usage/i, section: 'usage' },
  { pattern: /##?\s*API/i, section: 'api' },
  { pattern: /##?\s*Contributing/i, section: 'contributing' },
  { pattern: /##?\s*License/i, section: 'license' },
];

function detectReadmeSections(content: string): ReadmeSection[] {
  const sections: ReadmeSection[] = [];
  for (const { pattern, section } of SECTION_PATTERNS) {
    if (pattern.test(content)) {sections.push(section);}
  }
  return sections;
}

// ============================================================================
// Learning README Structure Detector
// ============================================================================

export class ReadmeStructureLearningDetector extends LearningDetector<ReadmeStructureConventions> {
  readonly id = 'documentation/readme-structure';
  readonly category = 'documentation' as const;
  readonly subcategory = 'readme-structure';
  readonly name = 'README Structure Detector (Learning)';
  readonly description = 'Learns README structure patterns from your codebase';
  readonly supportedLanguages: Language[] = ['markdown' as Language];

  protected getConventionKeys(): Array<keyof ReadmeStructureConventions> {
    return ['requiredSections', 'usesBadges', 'usesTableOfContents'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof ReadmeStructureConventions, ValueDistribution>
  ): void {
    if (!/README\.md$/i.test(context.file)) {return;}
    
    const sections = detectReadmeSections(context.content);
    const badgeDist = distributions.get('usesBadges')!;
    const tocDist = distributions.get('usesTableOfContents')!;
    const sectionsDist = distributions.get('requiredSections')!;
    
    for (const section of sections) {
      sectionsDist.add(section, context.file);
    }
    
    const hasBadges = /\[!\[|badge|shield\.io/i.test(context.content);
    const hasToc = /##?\s*Table\s+of\s+Contents|<!-- TOC -->/i.test(context.content);
    
    badgeDist.add(hasBadges, context.file);
    tocDist.add(hasToc, context.file);
  }

  protected async detectWithConventions(
    context: DetectionContext,
    _conventions: LearningResult<ReadmeStructureConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    if (!/README\.md$/i.test(context.file)) {
      return this.createEmptyResult();
    }
    
    patterns.push({
      patternId: `${this.id}/readme`,
      location: { file: context.file, line: 1, column: 1 },
      confidence: 1.0, isOutlier: false,
    });
    
    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }
}

export function createReadmeStructureLearningDetector(): ReadmeStructureLearningDetector {
  return new ReadmeStructureLearningDetector();
}
