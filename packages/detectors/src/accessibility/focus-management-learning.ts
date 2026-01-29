/**
 * Focus Management Detector - LEARNING VERSION
 *
 * Learns focus management patterns from the user's codebase:
 * - Focus trap implementation
 * - Focus ring styling
 * - Focus restoration patterns
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

export type FocusTrapMethod = 'focus-trap' | 'react-focus-lock' | 'custom' | 'none';
export type FocusRingStyle = 'outline' | 'ring' | 'shadow' | 'custom';

export interface FocusManagementConventions {
  [key: string]: unknown;
  focusTrapMethod: FocusTrapMethod;
  focusRingStyle: FocusRingStyle;
  usesFocusVisible: boolean;
  restoresFocus: boolean;
}

interface FocusInfo {
  method: FocusTrapMethod | FocusRingStyle;
  type: 'trap' | 'ring';
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

const FOCUS_TRAP_PATTERNS: Array<{ pattern: RegExp; method: FocusTrapMethod }> = [
  { pattern: /import.*from\s+['"]focus-trap['"]/i, method: 'focus-trap' },
  { pattern: /import.*from\s+['"]react-focus-lock['"]/i, method: 'react-focus-lock' },
  { pattern: /useFocusTrap|FocusTrap/gi, method: 'custom' },
];

const FOCUS_RING_PATTERNS: Array<{ pattern: RegExp; style: FocusRingStyle }> = [
  { pattern: /focus:outline|outline-\d|:focus\s*\{[^}]*outline/gi, style: 'outline' },
  { pattern: /focus:ring|ring-\d|focus-ring/gi, style: 'ring' },
  { pattern: /focus:shadow|:focus\s*\{[^}]*box-shadow/gi, style: 'shadow' },
];

function extractFocusPatterns(content: string, file: string): FocusInfo[] {
  const patterns: FocusInfo[] = [];
  
  for (const { pattern, method } of FOCUS_TRAP_PATTERNS) {
    const match = pattern.exec(content);
    if (match) {
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;
      patterns.push({ method, type: 'trap', line: lineNumber, column, file });
    }
  }
  
  for (const { pattern, style } of FOCUS_RING_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = re.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;
      patterns.push({ method: style, type: 'ring', line: lineNumber, column, file });
    }
  }
  
  return patterns;
}

// ============================================================================
// Learning Focus Management Detector
// ============================================================================

export class FocusManagementLearningDetector extends LearningDetector<FocusManagementConventions> {
  readonly id = 'accessibility/focus-management';
  readonly category = 'accessibility' as const;
  readonly subcategory = 'focus-management';
  readonly name = 'Focus Management Detector (Learning)';
  readonly description = 'Learns focus management patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof FocusManagementConventions> {
    return ['focusTrapMethod', 'focusRingStyle', 'usesFocusVisible', 'restoresFocus'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof FocusManagementConventions, ValueDistribution>
  ): void {
    const patterns = extractFocusPatterns(context.content, context.file);
    
    const trapDist = distributions.get('focusTrapMethod')!;
    const ringDist = distributions.get('focusRingStyle')!;
    const visibleDist = distributions.get('usesFocusVisible')!;
    const restoreDist = distributions.get('restoresFocus')!;
    
    for (const pattern of patterns) {
      if (pattern.type === 'trap') {trapDist.add(pattern.method, context.file);}
      else {ringDist.add(pattern.method, context.file);}
    }
    
    const usesFocusVisible = /focus-visible|:focus-visible/i.test(context.content);
    const restoresFocus = /restoreFocus|returnFocus|previousFocus/i.test(context.content);
    
    visibleDist.add(usesFocusVisible, context.file);
    restoreDist.add(restoresFocus, context.file);
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<FocusManagementConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    const focusPatterns = extractFocusPatterns(context.content, context.file);
    const learnedTrap = conventions.conventions.focusTrapMethod?.value;
    const learnedRing = conventions.conventions.focusRingStyle?.value;
    
    for (const pattern of focusPatterns) {
      if (pattern.type === 'trap' && learnedTrap && pattern.method !== learnedTrap) {
        violations.push(this.createConventionViolation(
          pattern.file, pattern.line, pattern.column,
          'focus trap method', pattern.method as string, learnedTrap,
          `Using '${pattern.method}' but your project uses '${learnedTrap}'`
        ));
      }
      
      if (pattern.type === 'ring' && learnedRing && pattern.method !== learnedRing) {
        violations.push(this.createConventionViolation(
          pattern.file, pattern.line, pattern.column,
          'focus ring style', pattern.method as string, learnedRing,
          `Using '${pattern.method}' but your project uses '${learnedRing}'`
        ));
      }
      
      patterns.push({
        patternId: `${this.id}/${pattern.type}`,
        location: { file: context.file, line: pattern.line, column: pattern.column },
        confidence: 1.0, isOutlier: false,
      });
    }
    
    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }
}

export function createFocusManagementLearningDetector(): FocusManagementLearningDetector {
  return new FocusManagementLearningDetector();
}
