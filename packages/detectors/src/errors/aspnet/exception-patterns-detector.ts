/**
 * ASP.NET Core Exception Patterns Detector
 *
 * Detects exception handling patterns:
 * - Custom exception classes
 * - Global exception handling (IExceptionHandler, middleware)
 * - ProblemDetails responses
 * - Exception filters
 * - Try-catch patterns
 */

import { BaseDetector } from '../../base/base-detector.js';

import type { DetectionContext, DetectionResult } from '../../base/base-detector.js';
import type { PatternMatch, Violation, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export interface ExceptionPatternInfo {
  /** Type of exception pattern */
  type: 'custom-exception' | 'exception-handler' | 'exception-middleware' | 'exception-filter' | 'problem-details' | 'try-catch';
  /** Name of the exception/handler */
  name: string;
  /** Base exception type */
  baseType: string | null;
  /** Line number */
  line: number;
  /** File path */
  file: string;
}

export interface ExceptionAnalysis {
  /** All exception patterns found */
  patterns: ExceptionPatternInfo[];
  /** Custom exception classes */
  customExceptions: string[];
  /** Exception handlers */
  handlers: string[];
  /** Whether using global exception handling */
  hasGlobalHandler: boolean;
  /** Whether using ProblemDetails */
  usesProblemDetails: boolean;
  /** Potential issues */
  issues: string[];
  /** Confidence score */
  confidence: number;
}

// ============================================================================
// Detector Implementation
// ============================================================================

export class ExceptionPatternsDetector extends BaseDetector {
  readonly id = 'errors/aspnet-exception-patterns';
  readonly category = 'errors' as const;
  readonly subcategory = 'exception-handling';
  readonly name = 'ASP.NET Exception Patterns Detector';
  readonly description = 'Detects exception handling patterns in ASP.NET Core';
  readonly supportedLanguages: Language[] = ['csharp'];
  readonly detectionMethod = 'regex' as const;

  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;
    
    if (!this.isRelevantFile(content)) {
      return this.createEmptyResult();
    }

    const analysis = this.analyzeExceptionPatterns(content, file);
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    for (const pattern of analysis.patterns) {
      patterns.push({
        patternId: `${this.id}/${pattern.type}`,
        location: {
          file: pattern.file,
          line: pattern.line,
          column: 1,
        },
        confidence: analysis.confidence,
        isOutlier: false,
      });
    }

    violations.push(...this.detectViolations(analysis, content, file));

    return this.createResult(patterns, violations, analysis.confidence, {
      custom: {
        exceptionAnalysis: analysis,
      },
    });
  }

  private isRelevantFile(content: string): boolean {
    return (
      content.includes('Exception') ||
      content.includes('IExceptionHandler') ||
      content.includes('ProblemDetails') ||
      content.includes('UseExceptionHandler') ||
      content.includes('try') ||
      content.includes('catch')
    );
  }

  analyzeExceptionPatterns(content: string, file: string): ExceptionAnalysis {
    const patterns: ExceptionPatternInfo[] = [];
    const customExceptions: string[] = [];
    const handlers: string[] = [];
    const issues: string[] = [];
    let hasGlobalHandler = false;
    let usesProblemDetails = false;

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || '';
      const lineNum = i + 1;

      // Detect custom exception classes
      const exceptionMatch = line.match(/class\s+(\w+Exception)\s*:\s*(\w*Exception)/);
      if (exceptionMatch?.[1]) {
        customExceptions.push(exceptionMatch[1]);
        patterns.push({
          type: 'custom-exception',
          name: exceptionMatch[1],
          baseType: exceptionMatch[2] || 'Exception',
          line: lineNum,
          file,
        });
      }

      // Detect IExceptionHandler implementation (.NET 8+)
      if (line.includes('IExceptionHandler')) {
        hasGlobalHandler = true;
        const handlerMatch = line.match(/class\s+(\w+)\s*:\s*IExceptionHandler/);
        if (handlerMatch?.[1]) {
          handlers.push(handlerMatch[1]);
          patterns.push({
            type: 'exception-handler',
            name: handlerMatch[1],
            baseType: 'IExceptionHandler',
            line: lineNum,
            file,
          });
        }
      }

      // Detect exception middleware
      if (line.includes('UseExceptionHandler') || line.includes('ExceptionHandlerMiddleware')) {
        hasGlobalHandler = true;
        patterns.push({
          type: 'exception-middleware',
          name: 'ExceptionHandler',
          baseType: null,
          line: lineNum,
          file,
        });
      }

      // Detect exception filters
      const filterMatch = line.match(/class\s+(\w+)\s*:\s*(?:IExceptionFilter|ExceptionFilterAttribute)/);
      if (filterMatch?.[1]) {
        handlers.push(filterMatch[1]);
        patterns.push({
          type: 'exception-filter',
          name: filterMatch[1],
          baseType: 'IExceptionFilter',
          line: lineNum,
          file,
        });
      }

      // Detect ProblemDetails usage
      if (line.includes('ProblemDetails') || line.includes('ValidationProblemDetails')) {
        usesProblemDetails = true;
        patterns.push({
          type: 'problem-details',
          name: 'ProblemDetails',
          baseType: null,
          line: lineNum,
          file,
        });
      }

      // Detect try-catch blocks
      if (line.trim().startsWith('try')) {
        patterns.push({
          type: 'try-catch',
          name: 'try-catch',
          baseType: null,
          line: lineNum,
          file,
        });
      }

      // Detect empty catch blocks (potential issue)
      if (line.includes('catch') && i + 1 < lines.length) {
        const nextLine = lines[i + 1] || '';
        const nextNextLine = lines[i + 2] || '';
        if ((nextLine.trim() === '{' && nextNextLine.trim() === '}') ||
            line.includes('catch { }') || line.includes('catch {}')) {
          issues.push(`Empty catch block at line ${lineNum}`);
        }
      }

      // Detect catch-all without logging (potential issue)
      if (line.includes('catch (Exception') || line.includes('catch(Exception')) {
        // Look ahead for logging
        let hasLogging = false;
        for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
          const checkLine = lines[j] || '';
          if (checkLine.includes('Log') || checkLine.includes('_logger') || 
              checkLine.includes('Console.') || checkLine.includes('throw')) {
            hasLogging = true;
            break;
          }
          if (checkLine.includes('}')) {break;}
        }
        if (!hasLogging) {
          issues.push(`Catch-all exception without logging at line ${lineNum}`);
        }
      }
    }

    return {
      patterns,
      customExceptions,
      handlers,
      hasGlobalHandler,
      usesProblemDetails,
      issues,
      confidence: patterns.length > 0 ? 0.85 : 0,
    };
  }

  private detectViolations(analysis: ExceptionAnalysis, _content: string, file: string): Violation[] {
    const violations: Violation[] = [];

    for (const issue of analysis.issues) {
      const lineMatch = issue.match(/line (\d+)/);
      const lineNum = lineMatch ? parseInt(lineMatch[1] || '1', 10) : 1;

      violations.push({
        id: `${this.id}-${file}-${lineNum}-issue`,
        patternId: this.id,
        severity: issue.includes('Empty') ? 'warning' : 'info',
        file,
        range: {
          start: { line: lineNum - 1, character: 0 },
          end: { line: lineNum - 1, character: 100 },
        },
        message: issue,
        expected: issue.includes('Empty') ? 'Handle or log the exception' : 'Log the exception',
        actual: issue,
        explanation: issue.includes('Empty') 
          ? 'Empty catch blocks silently swallow exceptions, making debugging difficult.'
          : 'Catching all exceptions without logging can hide important errors.',
        aiExplainAvailable: true,
        aiFixAvailable: true,
        firstSeen: new Date(),
        occurrences: 1,
      });
    }

    return violations;
  }

  generateQuickFix(): null {
    return null;
  }
}

export function createExceptionPatternsDetector(): ExceptionPatternsDetector {
  return new ExceptionPatternsDetector();
}
