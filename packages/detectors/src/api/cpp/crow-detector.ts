/**
 * Crow Framework Detector
 *
 * Detects Crow HTTP framework patterns in C++ code:
 * - Route definitions (CROW_ROUTE)
 * - Blueprint usage
 * - Middleware
 * - WebSocket handlers
 *
 * @license Apache-2.0
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export interface CrowRouteInfo {
  method: string;
  path: string;
  line: number;
  column: number;
  hasParams: boolean;
}

// ============================================================================
// Crow Detector Class
// ============================================================================

export class CrowDetector extends RegexDetector {
  readonly id = 'api/cpp/crow';
  readonly category = 'api' as const;
  readonly subcategory = 'routes';
  readonly name = 'Crow Framework Detector';
  readonly description = 'Detects Crow HTTP framework route patterns in C++ code';
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

    if (!this.usesCrow(context.content)) {
      return this.createResult(patterns, violations, 1.0);
    }

    // Detect CROW_ROUTE macro
    this.detectCrowRoutes(context.content, context.file, patterns);

    // Detect crow::App usage
    this.detectAppUsage(context.content, context.file, patterns);

    // Detect middleware
    this.detectMiddleware(context.content, context.file, patterns);

    // Detect WebSocket
    this.detectWebSocket(context.content, context.file, patterns);

    // Detect blueprints
    this.detectBlueprints(context.content, context.file, patterns);

    return this.createResult(patterns, violations, this.calculateConfidence(patterns));
  }

  private isCppFile(file: string): boolean {
    return /\.(cpp|cc|cxx|hpp|hh|hxx|h)$/.test(file);
  }

  private usesCrow(content: string): boolean {
    return content.includes('crow::') ||
           content.includes('#include "crow') ||
           content.includes('#include <crow') ||
           content.includes('CROW_ROUTE') ||
           content.includes('CROW_BP_ROUTE');
  }

  private detectCrowRoutes(content: string, file: string, patterns: PatternMatch[]): void {
    // CROW_ROUTE(app, "/path")
    const routePattern = /CROW_ROUTE\s*\(\s*\w+\s*,\s*"([^"]+)"\s*\)/g;
    for (const match of this.matchLines(content, routePattern)) {
      patterns.push({
        patternId: `${this.id}/route`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.95,
        isOutlier: false,
      });
    }

    // CROW_BP_ROUTE (blueprint routes)
    const bpRoutePattern = /CROW_BP_ROUTE\s*\(\s*\w+\s*,\s*"([^"]+)"\s*\)/g;
    for (const match of this.matchLines(content, bpRoutePattern)) {
      patterns.push({
        patternId: `${this.id}/blueprint-route`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.95,
        isOutlier: false,
      });
    }

    // Method chaining: .methods(crow::HTTPMethod::GET)
    const methodPattern = /\.methods\s*\(\s*crow::HTTPMethod::(\w+)/g;
    for (const match of this.matchLines(content, methodPattern)) {
      patterns.push({
        patternId: `${this.id}/method/${match.captures[1]?.toLowerCase() ?? 'unknown'}`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.9,
        isOutlier: false,
      });
    }
  }

  private detectAppUsage(content: string, file: string, patterns: PatternMatch[]): void {
    // crow::SimpleApp or crow::App<>
    const appPattern = /crow::(SimpleApp|App\s*<[^>]*>)\s+\w+/g;
    for (const match of this.matchLines(content, appPattern)) {
      patterns.push({
        patternId: `${this.id}/app`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.95,
        isOutlier: false,
      });
    }

    // app.port().multithreaded().run()
    const runPattern = /\.port\s*\(\s*\d+\s*\)[^;]*\.run\s*\(\s*\)/g;
    for (const match of this.matchLines(content, runPattern)) {
      patterns.push({
        patternId: `${this.id}/server-start`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.95,
        isOutlier: false,
      });
    }
  }

  private detectMiddleware(content: string, file: string, patterns: PatternMatch[]): void {
    // crow::App<crow::CORSHandler>
    const middlewarePattern = /crow::App\s*<\s*([^>]+)\s*>/g;
    for (const match of this.matchLines(content, middlewarePattern)) {
      const middlewares = match.captures[1]?.split(',') ?? [];
      for (const mw of middlewares) {
        if (mw.trim()) {
          patterns.push({
            patternId: `${this.id}/middleware`,
            location: { file, line: match.line, column: match.column },
            confidence: 0.9,
            isOutlier: false,
          });
        }
      }
    }
  }

  private detectWebSocket(content: string, file: string, patterns: PatternMatch[]): void {
    // CROW_WEBSOCKET_ROUTE
    const wsPattern = /CROW_WEBSOCKET_ROUTE\s*\(\s*\w+\s*,\s*"([^"]+)"\s*\)/g;
    for (const match of this.matchLines(content, wsPattern)) {
      patterns.push({
        patternId: `${this.id}/websocket`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.95,
        isOutlier: false,
      });
    }

    // .onopen, .onmessage, .onclose handlers
    const handlerPattern = /\.(onopen|onmessage|onclose|onerror)\s*\(\s*\[/g;
    for (const match of this.matchLines(content, handlerPattern)) {
      patterns.push({
        patternId: `${this.id}/websocket-handler`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.9,
        isOutlier: false,
      });
    }
  }

  private detectBlueprints(content: string, file: string, patterns: PatternMatch[]): void {
    // crow::Blueprint
    const bpPattern = /crow::Blueprint\s+\w+/g;
    for (const match of this.matchLines(content, bpPattern)) {
      patterns.push({
        patternId: `${this.id}/blueprint`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.95,
        isOutlier: false,
      });
    }

    // app.register_blueprint
    const registerPattern = /\.register_blueprint\s*\(/g;
    for (const match of this.matchLines(content, registerPattern)) {
      patterns.push({
        patternId: `${this.id}/blueprint-register`,
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

export function createCrowDetector(): CrowDetector {
  return new CrowDetector();
}
