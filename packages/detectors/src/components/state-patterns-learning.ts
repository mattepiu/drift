/**
 * State Patterns Detector - LEARNING VERSION
 *
 * Learns state management patterns from the user's codebase:
 * - State library preferences
 * - Local vs global state patterns
 * - State organization
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

export type StateLibrary = 'useState' | 'useReducer' | 'zustand' | 'redux' | 'jotai' | 'recoil' | 'context';

export interface StatePatternsConventions {
  [key: string]: unknown;
  preferredLibrary: StateLibrary;
  usesLocalState: boolean;
  usesGlobalState: boolean;
}

interface StatePatternInfo {
  library: StateLibrary;
  isGlobal: boolean;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractStatePatterns(content: string, file: string): StatePatternInfo[] {
  const results: StatePatternInfo[] = [];

  const patterns: Array<{ regex: RegExp; library: StateLibrary; isGlobal: boolean }> = [
    { regex: /useState\s*[<(]/g, library: 'useState', isGlobal: false },
    { regex: /useReducer\s*[<(]/g, library: 'useReducer', isGlobal: false },
    { regex: /useContext\s*\(/g, library: 'context', isGlobal: true },
    { regex: /create\s*\(\s*\([^)]*\)\s*=>/g, library: 'zustand', isGlobal: true },
    { regex: /useSelector|useDispatch|createSlice/g, library: 'redux', isGlobal: true },
    { regex: /atom\s*\(|useAtom\s*\(/g, library: 'jotai', isGlobal: true },
    { regex: /atom\s*\(|useRecoilState/g, library: 'recoil', isGlobal: true },
  ];

  for (const { regex, library, isGlobal } of patterns) {
    let match;
    while ((match = regex.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      results.push({
        library,
        isGlobal,
        line,
        column,
        file,
      });
    }
  }

  return results;
}

// ============================================================================
// Learning State Patterns Detector
// ============================================================================

export class StatePatternsLearningDetector extends LearningDetector<StatePatternsConventions> {
  readonly id = 'components/state-patterns';
  readonly category = 'components' as const;
  readonly subcategory = 'state-patterns';
  readonly name = 'State Patterns Detector (Learning)';
  readonly description = 'Learns state management patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof StatePatternsConventions> {
    return ['preferredLibrary', 'usesLocalState', 'usesGlobalState'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof StatePatternsConventions, ValueDistribution>
  ): void {
    const patterns = extractStatePatterns(context.content, context.file);
    if (patterns.length === 0) {return;}

    const libraryDist = distributions.get('preferredLibrary')!;
    const localDist = distributions.get('usesLocalState')!;
    const globalDist = distributions.get('usesGlobalState')!;

    let hasLocal = false;
    let hasGlobal = false;

    for (const pattern of patterns) {
      if (pattern.isGlobal) {
        libraryDist.add(pattern.library, context.file);
        hasGlobal = true;
      } else {
        hasLocal = true;
      }
    }

    localDist.add(hasLocal, context.file);
    globalDist.add(hasGlobal, context.file);
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<StatePatternsConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const statePatterns = extractStatePatterns(context.content, context.file);
    if (statePatterns.length === 0) {
      return this.createEmptyResult();
    }

    const learnedLibrary = conventions.conventions.preferredLibrary?.value;

    // Check global state library consistency
    if (learnedLibrary && learnedLibrary !== 'useState' && learnedLibrary !== 'useReducer') {
      for (const pattern of statePatterns) {
        if (pattern.isGlobal && pattern.library !== learnedLibrary && pattern.library !== 'context') {
          violations.push(this.createConventionViolation(
            pattern.file, pattern.line, pattern.column,
            'state library', pattern.library, learnedLibrary,
            `Using ${pattern.library} but project uses ${learnedLibrary} for global state`
          ));
        }
      }
    }

    if (statePatterns.length > 0) {
      const first = statePatterns[0]!;
      patterns.push({
        patternId: `${this.id}/state`,
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

export function createStatePatternsLearningDetector(): StatePatternsLearningDetector {
  return new StatePatternsLearningDetector();
}
