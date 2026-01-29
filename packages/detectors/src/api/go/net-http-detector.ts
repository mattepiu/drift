/**
 * net/http Standard Library Detector
 *
 * Detects Go standard library HTTP patterns:
 * - http.HandleFunc patterns
 * - http.Handle patterns
 * - http.ServeMux usage
 * - Handler interface implementations
 *
 * @requirements Go Language Support - Phase 8
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export interface NetHttpRouteInfo {
  path: string;
  handler: string;
  type: 'HandleFunc' | 'Handle' | 'ServeMux';
  line: number;
  column: number;
}

export interface HandlerImplementation {
  structName: string;
  line: number;
  column: number;
}


// ============================================================================
// Net/HTTP Detector Class
// ============================================================================

export class NetHttpDetector extends RegexDetector {
  readonly id = 'api/go/net-http-routes';
  readonly category = 'api' as const;
  readonly subcategory = 'routes';
  readonly name = 'net/http Route Detector';
  readonly description = 'Detects Go standard library HTTP patterns';
  readonly supportedLanguages: Language[] = ['go'];

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }

  async detect(context: DetectionContext): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    if (!context.file.endsWith('.go')) {
      return this.createResult(patterns, violations, 1.0);
    }

    if (!this.usesNetHttp(context.content)) {
      return this.createResult(patterns, violations, 1.0);
    }

    const routes = this.detectRoutes(context.content);
    const handlers = this.detectHandlerImplementations(context.content);

    for (const route of routes) {
      patterns.push({
        patternId: `${this.id}/${route.type.toLowerCase()}`,
        location: { file: context.file, line: route.line, column: route.column },
        confidence: 0.9,
        isOutlier: false,
      });
    }

    for (const handler of handlers) {
      patterns.push({
        patternId: `${this.id}/handler-impl`,
        location: { file: context.file, line: handler.line, column: handler.column },
        confidence: 0.85,
        isOutlier: false,
      });
    }

    const middlewarePatterns = this.detectMiddleware(context.content, context.file);
    patterns.push(...middlewarePatterns);

    return this.createResult(patterns, violations, this.calculateConfidence(patterns));
  }

  private usesNetHttp(content: string): boolean {
    return this.hasMatch(content, /net\/http/) ||
           this.hasMatch(content, /http\.HandleFunc/) ||
           this.hasMatch(content, /http\.Handle/) ||
           this.hasMatch(content, /http\.ServeMux/) ||
           this.hasMatch(content, /http\.Handler/);
  }


  private detectRoutes(content: string): NetHttpRouteInfo[] {
    const routes: NetHttpRouteInfo[] = [];

    const handleFuncPattern = /http\.HandleFunc\s*\(\s*"([^"]+)"\s*,\s*([\w.]+)/g;
    const handleFuncMatches = this.matchLines(content, handleFuncPattern);
    for (const match of handleFuncMatches) {
      routes.push({
        path: match.captures[1] ?? '',
        handler: match.captures[2] ?? '',
        type: 'HandleFunc',
        line: match.line,
        column: match.column,
      });
    }

    const handlePattern = /http\.Handle\s*\(\s*"([^"]+)"\s*,\s*([\w.&{}]+)/g;
    const handleMatches = this.matchLines(content, handlePattern);
    for (const match of handleMatches) {
      routes.push({
        path: match.captures[1] ?? '',
        handler: match.captures[2] ?? '',
        type: 'Handle',
        line: match.line,
        column: match.column,
      });
    }

    const muxHandleFuncPattern = /(\w+)\.HandleFunc\s*\(\s*"([^"]+)"\s*,\s*([\w.]+)/g;
    const muxHandleFuncMatches = this.matchLines(content, muxHandleFuncPattern);
    for (const match of muxHandleFuncMatches) {
      if (match.captures[1] !== 'http') {
        routes.push({
          path: match.captures[2] ?? '',
          handler: match.captures[3] ?? '',
          type: 'ServeMux',
          line: match.line,
          column: match.column,
        });
      }
    }

    const muxHandlePattern = /(\w+)\.Handle\s*\(\s*"([^"]+)"\s*,\s*([\w.&{}]+)/g;
    const muxHandleMatches = this.matchLines(content, muxHandlePattern);
    for (const match of muxHandleMatches) {
      if (match.captures[1] !== 'http') {
        routes.push({
          path: match.captures[2] ?? '',
          handler: match.captures[3] ?? '',
          type: 'ServeMux',
          line: match.line,
          column: match.column,
        });
      }
    }

    return routes;
  }


  private detectHandlerImplementations(content: string): HandlerImplementation[] {
    const handlers: HandlerImplementation[] = [];

    const serveHttpPattern = /func\s+\(\s*\w+\s+\*?(\w+)\s*\)\s+ServeHTTP\s*\(/g;
    const matches = this.matchLines(content, serveHttpPattern);
    for (const match of matches) {
      handlers.push({
        structName: match.captures[1] ?? '',
        line: match.line,
        column: match.column,
      });
    }

    return handlers;
  }

  private detectMiddleware(content: string, file: string): PatternMatch[] {
    const patterns: PatternMatch[] = [];

    const middlewarePattern = /func\s+(\w+)\s*\(\s*next\s+http\.Handler\s*\)\s*http\.Handler/g;
    const matches = this.matchLines(content, middlewarePattern);
    for (const match of matches) {
      patterns.push({
        patternId: `${this.id}/middleware`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.9,
        isOutlier: false,
      });
    }

    const handlerFuncMiddlewarePattern = /func\s+(\w+)\s*\(\s*next\s+http\.HandlerFunc\s*\)\s*http\.HandlerFunc/g;
    const handlerFuncMatches = this.matchLines(content, handlerFuncMiddlewarePattern);
    for (const match of handlerFuncMatches) {
      patterns.push({
        patternId: `${this.id}/middleware`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.9,
        isOutlier: false,
      });
    }

    return patterns;
  }

  private calculateConfidence(patterns: PatternMatch[]): number {
    if (patterns.length === 0) {return 1.0;}
    return patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length;
  }
}

export function createNetHttpDetector(): NetHttpDetector {
  return new NetHttpDetector();
}
