/**
 * Qt Network Framework Detector
 *
 * Detects Qt Network HTTP patterns in C++ code:
 * - QNetworkAccessManager requests
 * - QNetworkReply handling
 * - REST API patterns
 * - WebSocket connections
 *
 * @license Apache-2.0
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export interface QtNetworkRequest {
  method: string;
  line: number;
  column: number;
  hasCallback: boolean;
  isAsync: boolean;
}

// ============================================================================
// Qt Network Detector Class
// ============================================================================

export class QtNetworkDetector extends RegexDetector {
  readonly id = 'api/cpp/qt-network';
  readonly category = 'api' as const;
  readonly subcategory = 'http-client';
  readonly name = 'Qt Network Detector';
  readonly description = 'Detects Qt Network HTTP patterns in C++ code';
  readonly supportedLanguages: Language[] = ['cpp'];

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }

  async detect(context: DetectionContext): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    // Skip non-C++ files
    if (!this.isCppFile(context.file)) {
      return this.createResult(patterns, violations, 1.0);
    }

    // Check if this file uses Qt Network
    if (!this.usesQtNetwork(context.content)) {
      return this.createResult(patterns, violations, 1.0);
    }

    // Detect QNetworkAccessManager patterns
    this.detectNetworkManager(context.content, context.file, patterns);

    // Detect HTTP request methods
    this.detectHttpRequests(context.content, context.file, patterns);

    // Detect reply handling
    this.detectReplyHandling(context.content, context.file, patterns);

    // Detect WebSocket patterns
    this.detectWebSocket(context.content, context.file, patterns);

    return this.createResult(patterns, violations, this.calculateConfidence(patterns));
  }

  private isCppFile(file: string): boolean {
    return /\.(cpp|cc|cxx|hpp|hh|hxx|h)$/.test(file);
  }

  private usesQtNetwork(content: string): boolean {
    return content.includes('QNetworkAccessManager') ||
           content.includes('QNetworkRequest') ||
           content.includes('QNetworkReply') ||
           content.includes('#include <QNetwork') ||
           content.includes('#include <QtNetwork');
  }


  private detectNetworkManager(content: string, file: string, patterns: PatternMatch[]): void {
    // QNetworkAccessManager creation
    const managerPattern = /QNetworkAccessManager\s*\*?\s*(\w+)\s*(?:=\s*new\s+QNetworkAccessManager|;)/g;
    const matches = this.matchLines(content, managerPattern);

    for (const match of matches) {
      patterns.push({
        patternId: `${this.id}/manager`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.95,
        isOutlier: false,
      });
    }
  }

  private detectHttpRequests(content: string, file: string, patterns: PatternMatch[]): void {
    // GET requests
    const getPattern = /->get\s*\(\s*QNetworkRequest/g;
    for (const match of this.matchLines(content, getPattern)) {
      patterns.push({
        patternId: `${this.id}/get`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.95,
        isOutlier: false,
      });
    }

    // POST requests
    const postPattern = /->post\s*\(\s*QNetworkRequest/g;
    for (const match of this.matchLines(content, postPattern)) {
      patterns.push({
        patternId: `${this.id}/post`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.95,
        isOutlier: false,
      });
    }

    // PUT requests
    const putPattern = /->put\s*\(\s*QNetworkRequest/g;
    for (const match of this.matchLines(content, putPattern)) {
      patterns.push({
        patternId: `${this.id}/put`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.95,
        isOutlier: false,
      });
    }

    // DELETE requests
    const deletePattern = /->deleteResource\s*\(\s*QNetworkRequest/g;
    for (const match of this.matchLines(content, deletePattern)) {
      patterns.push({
        patternId: `${this.id}/delete`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.95,
        isOutlier: false,
      });
    }

    // Custom verb requests
    const customPattern = /->sendCustomRequest\s*\(/g;
    for (const match of this.matchLines(content, customPattern)) {
      patterns.push({
        patternId: `${this.id}/custom`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.9,
        isOutlier: false,
      });
    }
  }

  private detectReplyHandling(content: string, file: string, patterns: PatternMatch[]): void {
    // Signal-slot connections for reply
    const connectPattern = /connect\s*\([^,]+,\s*&QNetworkReply::(finished|error|downloadProgress)/g;
    for (const match of this.matchLines(content, connectPattern)) {
      patterns.push({
        patternId: `${this.id}/reply-handler`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.9,
        isOutlier: false,
      });
    }

    // Lambda connections
    const lambdaPattern = /connect\s*\([^,]+,\s*&QNetworkReply::\w+[^)]*\)\s*,\s*\[/g;
    for (const match of this.matchLines(content, lambdaPattern)) {
      patterns.push({
        patternId: `${this.id}/reply-lambda`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.9,
        isOutlier: false,
      });
    }
  }

  private detectWebSocket(content: string, file: string, patterns: PatternMatch[]): void {
    // QWebSocket usage
    const wsPattern = /QWebSocket\s*\*?\s*\w+/g;
    for (const match of this.matchLines(content, wsPattern)) {
      patterns.push({
        patternId: `${this.id}/websocket`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.95,
        isOutlier: false,
      });
    }

    // WebSocket connections
    const wsConnectPattern = /->open\s*\(\s*QUrl/g;
    for (const match of this.matchLines(content, wsConnectPattern)) {
      patterns.push({
        patternId: `${this.id}/websocket-connect`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.9,
        isOutlier: false,
      });
    }
  }

  private calculateConfidence(patterns: PatternMatch[]): number {
    if (patterns.length === 0) {return 1.0;}
    return patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length;
  }
}

export function createQtNetworkDetector(): QtNetworkDetector {
  return new QtNetworkDetector();
}
