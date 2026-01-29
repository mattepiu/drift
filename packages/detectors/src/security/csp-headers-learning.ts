/**
 * CSP Headers Detector - LEARNING VERSION
 *
 * Learns Content Security Policy patterns from the user's codebase:
 * - CSP directive patterns
 * - Nonce vs hash usage
 * - Report-only vs enforced
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

export type CSPMode = 'enforced' | 'report-only' | 'both';
export type ScriptSrcMethod = 'nonce' | 'hash' | 'unsafe-inline' | 'strict-dynamic' | 'self';

export interface CSPHeadersConventions {
  [key: string]: unknown;
  cspMode: CSPMode;
  scriptSrcMethod: ScriptSrcMethod;
  usesReportUri: boolean;
  usesFrameAncestors: boolean;
}

interface CSPInfo {
  mode: CSPMode;
  scriptMethod: ScriptSrcMethod | null;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

const CSP_PATTERNS = {
  enforced: /Content-Security-Policy['"]\s*:/gi,
  reportOnly: /Content-Security-Policy-Report-Only['"]\s*:/gi,
};

const SCRIPT_SRC_PATTERNS = {
  nonce: /'nonce-/gi,
  hash: /'sha256-|'sha384-|'sha512-/gi,
  unsafeInline: /'unsafe-inline'/gi,
  strictDynamic: /'strict-dynamic'/gi,
  self: /'self'/gi,
};

function extractCSPPatterns(content: string, file: string): CSPInfo[] {
  const patterns: CSPInfo[] = [];
  
  for (const [mode, regex] of Object.entries(CSP_PATTERNS)) {
    const re = new RegExp(regex.source, regex.flags);
    let match;
    while ((match = re.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;
      
      // Detect script-src method
      let scriptMethod: ScriptSrcMethod | null = null;
      for (const [method, pattern] of Object.entries(SCRIPT_SRC_PATTERNS)) {
        if (pattern.test(content)) {
          scriptMethod = method.replace(/([A-Z])/g, '-$1').toLowerCase() as ScriptSrcMethod;
          break;
        }
      }
      
      patterns.push({
        mode: mode === 'reportOnly' ? 'report-only' : 'enforced',
        scriptMethod,
        line: lineNumber,
        column,
        file,
      });
    }
  }
  
  return patterns;
}

// ============================================================================
// Learning CSP Headers Detector
// ============================================================================

export class CSPHeadersLearningDetector extends LearningDetector<CSPHeadersConventions> {
  readonly id = 'security/csp-headers';
  readonly category = 'security' as const;
  readonly subcategory = 'csp-headers';
  readonly name = 'CSP Headers Detector (Learning)';
  readonly description = 'Learns CSP header patterns from your codebase and flags inconsistencies';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof CSPHeadersConventions> {
    return ['cspMode', 'scriptSrcMethod', 'usesReportUri', 'usesFrameAncestors'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof CSPHeadersConventions, ValueDistribution>
  ): void {
    const patterns = extractCSPPatterns(context.content, context.file);
    
    const modeDist = distributions.get('cspMode')!;
    const scriptDist = distributions.get('scriptSrcMethod')!;
    const reportDist = distributions.get('usesReportUri')!;
    const frameDist = distributions.get('usesFrameAncestors')!;
    
    for (const pattern of patterns) {
      modeDist.add(pattern.mode, context.file);
      if (pattern.scriptMethod) {
        scriptDist.add(pattern.scriptMethod, context.file);
      }
    }
    
    const usesReportUri = /report-uri|report-to/i.test(context.content);
    const usesFrameAncestors = /frame-ancestors/i.test(context.content);
    
    if (patterns.length > 0) {
      reportDist.add(usesReportUri, context.file);
      frameDist.add(usesFrameAncestors, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<CSPHeadersConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    const cspPatterns = extractCSPPatterns(context.content, context.file);
    const learnedMode = conventions.conventions.cspMode?.value;
    const learnedScript = conventions.conventions.scriptSrcMethod?.value;
    
    for (const pattern of cspPatterns) {
      if (learnedMode && pattern.mode !== learnedMode && learnedMode !== 'both') {
        violations.push(this.createConventionViolation(
          pattern.file,
          pattern.line,
          pattern.column,
          'CSP mode',
          pattern.mode,
          learnedMode,
          `Using '${pattern.mode}' CSP but your project uses '${learnedMode}'`
        ));
      }
      
      if (learnedScript && pattern.scriptMethod && pattern.scriptMethod !== learnedScript) {
        violations.push(this.createConventionViolation(
          pattern.file,
          pattern.line,
          pattern.column,
          'script-src method',
          pattern.scriptMethod,
          learnedScript,
          `Using '${pattern.scriptMethod}' but your project uses '${learnedScript}'`
        ));
      }
      
      patterns.push({
        patternId: `${this.id}/${pattern.mode}`,
        location: { file: context.file, line: pattern.line, column: pattern.column },
        confidence: 1.0,
        isOutlier: false,
      });
    }
    
    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }
}

export function createCSPHeadersLearningDetector(): CSPHeadersLearningDetector {
  return new CSPHeadersLearningDetector();
}
