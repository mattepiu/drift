/**
 * Component Structure Detector - LEARNING VERSION
 *
 * Learns component structure patterns from the user's codebase:
 * - Component definition style (function vs class)
 * - Export patterns (default vs named)
 * - Props typing patterns
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

export type ComponentStyle = 'function' | 'arrow-function' | 'class';
export type ExportStyle = 'default' | 'named' | 'both';

export interface ComponentStructureConventions {
  [key: string]: unknown;
  componentStyle: ComponentStyle;
  exportStyle: ExportStyle;
  usesPropsInterface: boolean;
  usesForwardRef: boolean;
}

interface ComponentPatternInfo {
  style: ComponentStyle;
  exportStyle: ExportStyle;
  hasPropsInterface: boolean;
  hasForwardRef: boolean;
  name: string;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractComponentPatterns(content: string, file: string): ComponentPatternInfo[] {
  const results: ComponentPatternInfo[] = [];

  // Function components
  const funcPattern = /export\s+(default\s+)?function\s+([A-Z]\w*)\s*\(/g;
  let match;
  while ((match = funcPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      style: 'function',
      exportStyle: match[1] ? 'default' : 'named',
      hasPropsInterface: /Props\s*[)>]/.test(content.slice(match.index, match.index + 200)),
      hasForwardRef: false,
      name: match[2] || '',
      line,
      column,
      file,
    });
  }

  // Arrow function components
  const arrowPattern = /export\s+(default\s+)?const\s+([A-Z]\w*)\s*[=:][^=]*=>\s*[({]/g;
  while ((match = arrowPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      style: 'arrow-function',
      exportStyle: match[1] ? 'default' : 'named',
      hasPropsInterface: /Props\s*[)>]/.test(content.slice(match.index, match.index + 200)),
      hasForwardRef: /forwardRef/.test(content.slice(match.index, match.index + 100)),
      name: match[2] || '',
      line,
      column,
      file,
    });
  }

  // Class components
  const classPattern = /export\s+(default\s+)?class\s+([A-Z]\w*)\s+extends\s+(?:React\.)?Component/g;
  while ((match = classPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;

    results.push({
      style: 'class',
      exportStyle: match[1] ? 'default' : 'named',
      hasPropsInterface: true,
      hasForwardRef: false,
      name: match[2] || '',
      line,
      column,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning Component Structure Detector
// ============================================================================

export class ComponentStructureLearningDetector extends LearningDetector<ComponentStructureConventions> {
  readonly id = 'components/component-structure';
  readonly category = 'components' as const;
  readonly subcategory = 'component-structure';
  readonly name = 'Component Structure Detector (Learning)';
  readonly description = 'Learns component structure patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof ComponentStructureConventions> {
    return ['componentStyle', 'exportStyle', 'usesPropsInterface', 'usesForwardRef'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof ComponentStructureConventions, ValueDistribution>
  ): void {
    const patterns = extractComponentPatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const styleDist = distributions.get('componentStyle')!;
    const exportDist = distributions.get('exportStyle')!;
    const propsDist = distributions.get('usesPropsInterface')!;
    const forwardRefDist = distributions.get('usesForwardRef')!;

    for (const pattern of patterns) {
      styleDist.add(pattern.style, context.file);
      exportDist.add(pattern.exportStyle, context.file);
      propsDist.add(pattern.hasPropsInterface, context.file);
      forwardRefDist.add(pattern.hasForwardRef, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<ComponentStructureConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const componentPatterns = extractComponentPatterns(context.content, context.file);
    if (componentPatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedStyle = conventions.conventions.componentStyle?.value;
    const learnedExport = conventions.conventions.exportStyle?.value;

    // Check style consistency
    if (learnedStyle) {
      for (const pattern of componentPatterns) {
        if (pattern.style !== learnedStyle) {
          violations.push(this.createConventionViolation(
            pattern.file, pattern.line, pattern.column,
            'component style', pattern.style, learnedStyle,
            `Component '${pattern.name}' uses ${pattern.style} but project uses ${learnedStyle}`
          ));
        }
      }
    }

    // Check export style consistency
    if (learnedExport && learnedExport !== 'both') {
      for (const pattern of componentPatterns) {
        if (pattern.exportStyle !== learnedExport) {
          violations.push(this.createConventionViolation(
            pattern.file, pattern.line, pattern.column,
            'export style', pattern.exportStyle, learnedExport,
            `Component '${pattern.name}' uses ${pattern.exportStyle} export but project uses ${learnedExport}`
          ));
        }
      }
    }

    if (componentPatterns.length > 0) {
      const first = componentPatterns[0]!;
      patterns.push({
        patternId: `${this.id}/component`,
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

export function createComponentStructureLearningDetector(): ComponentStructureLearningDetector {
  return new ComponentStructureLearningDetector();
}
