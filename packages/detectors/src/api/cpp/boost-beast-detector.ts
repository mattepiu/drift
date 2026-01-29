/**
 * Boost.Beast Framework Detector
 *
 * Detects Boost.Beast HTTP/WebSocket patterns in C++ code:
 * - HTTP server/client patterns
 * - WebSocket connections
 * - Async operations with Boost.Asio
 *
 * @license Apache-2.0
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Boost.Beast Detector Class
// ============================================================================

export class BoostBeastDetector extends RegexDetector {
  readonly id = 'api/cpp/boost-beast';
  readonly category = 'api' as const;
  readonly subcategory = 'http';
  readonly name = 'Boost.Beast Detector';
  readonly description = 'Detects Boost.Beast HTTP/WebSocket patterns in C++ code';
  readonly supportedLanguages: Language[] = ['cpp'];

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }

  async detect(context: DetectionContext): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    if (!this.isCppFile(context.file)) {
      return this.createResult(patterns, violations, 1.0);
    }

    if (!this.usesBoostBeast(context.content)) {
      return this.createResult(patterns, violations, 1.0);
    }

    // Detect HTTP patterns
    this.detectHttpPatterns(context.content, context.file, patterns);

    // Detect WebSocket patterns
    this.detectWebSocketPatterns(context.content, context.file, patterns);

    // Detect async patterns
    this.detectAsyncPatterns(context.content, context.file, patterns);

    // Detect SSL/TLS patterns
    this.detectSslPatterns(context.content, context.file, patterns);

    return this.createResult(patterns, violations, this.calculateConfidence(patterns));
  }

  private isCppFile(file: string): boolean {
    return /\.(cpp|cc|cxx|hpp|hh|hxx|h)$/.test(file);
  }

  private usesBoostBeast(content: string): boolean {
    return content.includes('boost::beast') ||
           content.includes('#include <boost/beast') ||
           content.includes('namespace beast = boost::beast');
  }

  private detectHttpPatterns(content: string, file: string, patterns: PatternMatch[]): void {
    // HTTP request types
    const requestPattern = /beast::http::request\s*<\s*([^>]+)\s*>/g;
    for (const match of this.matchLines(content, requestPattern)) {
      patterns.push({
        patternId: `${this.id}/http-request`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.95,
        isOutlier: false,
      });
    }

    // HTTP response types
    const responsePattern = /beast::http::response\s*<\s*([^>]+)\s*>/g;
    for (const match of this.matchLines(content, responsePattern)) {
      patterns.push({
        patternId: `${this.id}/http-response`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.95,
        isOutlier: false,
      });
    }

    // HTTP verbs
    const verbPattern = /beast::http::verb::(\w+)/g;
    for (const match of this.matchLines(content, verbPattern)) {
      patterns.push({
        patternId: `${this.id}/http-verb/${match.captures[1]?.toLowerCase() ?? 'unknown'}`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.9,
        isOutlier: false,
      });
    }

    // HTTP read/write operations
    const readPattern = /beast::http::(?:async_)?read\s*\(/g;
    for (const match of this.matchLines(content, readPattern)) {
      patterns.push({
        patternId: `${this.id}/http-read`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.9,
        isOutlier: false,
      });
    }

    const writePattern = /beast::http::(?:async_)?write\s*\(/g;
    for (const match of this.matchLines(content, writePattern)) {
      patterns.push({
        patternId: `${this.id}/http-write`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.9,
        isOutlier: false,
      });
    }
  }

  private detectWebSocketPatterns(content: string, file: string, patterns: PatternMatch[]): void {
    // WebSocket stream
    const wsStreamPattern = /beast::websocket::stream\s*<\s*([^>]+)\s*>/g;
    for (const match of this.matchLines(content, wsStreamPattern)) {
      patterns.push({
        patternId: `${this.id}/websocket-stream`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.95,
        isOutlier: false,
      });
    }

    // WebSocket accept/handshake
    const acceptPattern = /\.(?:async_)?accept\s*\(/g;
    for (const match of this.matchLines(content, acceptPattern)) {
      if (content.includes('websocket')) {
        patterns.push({
          patternId: `${this.id}/websocket-accept`,
          location: { file, line: match.line, column: match.column },
          confidence: 0.85,
          isOutlier: false,
        });
      }
    }

    // WebSocket read/write
    const wsReadPattern = /\.(?:async_)?read\s*\(\s*buffer/g;
    for (const match of this.matchLines(content, wsReadPattern)) {
      patterns.push({
        patternId: `${this.id}/websocket-read`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.85,
        isOutlier: false,
      });
    }

    const wsWritePattern = /\.(?:async_)?write\s*\(\s*(?:net::)?buffer/g;
    for (const match of this.matchLines(content, wsWritePattern)) {
      patterns.push({
        patternId: `${this.id}/websocket-write`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.85,
        isOutlier: false,
      });
    }
  }

  private detectAsyncPatterns(content: string, file: string, patterns: PatternMatch[]): void {
    // io_context
    const ioContextPattern = /(?:net|asio)::io_context\s+\w+/g;
    for (const match of this.matchLines(content, ioContextPattern)) {
      patterns.push({
        patternId: `${this.id}/io-context`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.9,
        isOutlier: false,
      });
    }

    // async_connect
    const asyncConnectPattern = /(?:net|asio)::async_connect\s*\(/g;
    for (const match of this.matchLines(content, asyncConnectPattern)) {
      patterns.push({
        patternId: `${this.id}/async-connect`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.9,
        isOutlier: false,
      });
    }

    // Coroutine patterns (C++20)
    const coroPattern = /(?:net|asio)::(?:awaitable|use_awaitable|co_spawn)/g;
    for (const match of this.matchLines(content, coroPattern)) {
      patterns.push({
        patternId: `${this.id}/coroutine`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.9,
        isOutlier: false,
      });
    }
  }

  private detectSslPatterns(content: string, file: string, patterns: PatternMatch[]): void {
    // SSL context
    const sslContextPattern = /(?:ssl|asio::ssl)::context\s+\w+/g;
    for (const match of this.matchLines(content, sslContextPattern)) {
      patterns.push({
        patternId: `${this.id}/ssl-context`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.95,
        isOutlier: false,
      });
    }

    // SSL stream
    const sslStreamPattern = /(?:ssl|asio::ssl)::stream\s*<\s*([^>]+)\s*>/g;
    for (const match of this.matchLines(content, sslStreamPattern)) {
      patterns.push({
        patternId: `${this.id}/ssl-stream`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.95,
        isOutlier: false,
      });
    }

    // Handshake
    const handshakePattern = /\.(?:async_)?handshake\s*\(/g;
    for (const match of this.matchLines(content, handshakePattern)) {
      patterns.push({
        patternId: `${this.id}/ssl-handshake`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.85,
        isOutlier: false,
      });
    }
  }

  private calculateConfidence(patterns: PatternMatch[]): number {
    if (patterns.length === 0) {return 1.0;}
    return patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length;
  }
}

export function createBoostBeastDetector(): BoostBeastDetector {
  return new BoostBeastDetector();
}
