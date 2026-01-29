/**
 * Error Propagation Detector - LEARNING VERSION
 *
 * Learns error propagation patterns from the user's codebase:
 * - Rethrow vs wrap patterns
 * - Error chain preservation
 * - Context enrichment approach
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

export type PropagationStyle = 'rethrow' | 'wrap' | 'transform' | 'suppress';
export type ChainPreservation = 'cause' | 'stack' | 'both' | 'none';

export interface ErrorPropagationConventions {
  [key: string]: unknown;
  propagationStyle: PropagationStyle;
  chainPreservation: ChainPreservation;
  addsContext: boolean;
  usesErrorCodes: boolean;
}

interface PropagationInfo {
  style: PropagationStyle;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

const PROPAGATION_PATTERNS = {
  rethrow: /throw\s+(?:err|error|e)\s*;/gi,
  wrap: /throw\s+new\s+\w+Error\s*\([^)]*,\s*(?:err|error|e|cause)/gi,
  transform: /throw\s+new\s+\w+Error\s*\([^)]*\)(?!\s*,)/gi,
  suppress: /catch\s*\([^)]*\)\s*\{\s*(?:\/\/|console\.(?:log|warn)|return)/gi,
};

function extractPropagationPatterns(content: string, file: string): PropagationInfo[] {
  const patterns: PropagationInfo[] = [];
  
  for (const [style, regex] of Object.entries(PROPAGATION_PATTERNS)) {
    const re = new RegExp(regex.source, regex.flags);
    let match;
    while ((match = re.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;
      
      patterns.push({
        style: style as PropagationStyle,
        line: lineNumber,
        column,
        file,
      });
    }
  }
  
  return patterns;
}

function detectChainPreservation(content: string): ChainPreservation | null {
  const hasCause = /cause:\s*(?:err|error|e)|,\s*\{\s*cause/.test(content);
  const hasStack = /\.stack\s*=|stack:\s*(?:err|error|e)\.stack/.test(content);
  
  if (hasCause && hasStack) {return 'both';}
  if (hasCause) {return 'cause';}
  if (hasStack) {return 'stack';}
  return null;
}

// ============================================================================
// Learning Error Propagation Detector
// ============================================================================

export class ErrorPropagationLearningDetector extends LearningDetector<ErrorPropagationConventions> {
  readonly id = 'errors/error-propagation';
  readonly category = 'errors' as const;
  readonly subcategory = 'error-propagation';
  readonly name = 'Error Propagation Detector (Learning)';
  readonly description = 'Learns error propagation patterns from your codebase and flags inconsistencies';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof ErrorPropagationConventions> {
    return ['propagationStyle', 'chainPreservation', 'addsContext', 'usesErrorCodes'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof ErrorPropagationConventions, ValueDistribution>
  ): void {
    const patterns = extractPropagationPatterns(context.content, context.file);
    const chainPreservation = detectChainPreservation(context.content);
    
    const styleDist = distributions.get('propagationStyle')!;
    const chainDist = distributions.get('chainPreservation')!;
    const contextDist = distributions.get('addsContext')!;
    const codesDist = distributions.get('usesErrorCodes')!;
    
    for (const pattern of patterns) {
      styleDist.add(pattern.style, context.file);
    }
    
    if (chainPreservation) {chainDist.add(chainPreservation, context.file);}
    
    const addsContext = /message:.*\+|`.*\$\{.*error|context:|metadata:/i.test(context.content);
    const usesErrorCodes = /code:\s*['"][A-Z_]+['"]|errorCode|ERROR_CODE/i.test(context.content);
    
    if (patterns.length > 0) {
      contextDist.add(addsContext, context.file);
      codesDist.add(usesErrorCodes, context.file);
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<ErrorPropagationConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    const propagationPatterns = extractPropagationPatterns(context.content, context.file);
    const learnedStyle = conventions.conventions.propagationStyle?.value;
    const learnedChain = conventions.conventions.chainPreservation?.value;
    
    for (const pattern of propagationPatterns) {
      if (learnedStyle && pattern.style !== learnedStyle && pattern.style !== 'suppress') {
        violations.push(this.createConventionViolation(
          pattern.file,
          pattern.line,
          pattern.column,
          'error propagation style',
          pattern.style,
          learnedStyle,
          `Using '${pattern.style}' but your project uses '${learnedStyle}'`
        ));
      }
      
      patterns.push({
        patternId: `${this.id}/${pattern.style}`,
        location: { file: context.file, line: pattern.line, column: pattern.column },
        confidence: 1.0,
        isOutlier: false,
      });
    }
    
    // Check chain preservation consistency
    const currentChain = detectChainPreservation(context.content);
    if (learnedChain && currentChain && learnedChain !== 'none' && currentChain === 'none') {
      const firstPattern = propagationPatterns[0];
      if (firstPattern) {
        violations.push(this.createConventionViolation(
          firstPattern.file,
          firstPattern.line,
          firstPattern.column,
          'error chain preservation',
          'none',
          learnedChain,
          `Error chain not preserved. Your project uses '${learnedChain}' preservation.`
        ));
      }
    }
    
    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }
}

export function createErrorPropagationLearningDetector(): ErrorPropagationLearningDetector {
  return new ErrorPropagationLearningDetector();
}
