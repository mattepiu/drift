/**
 * Echo Framework Detector
 *
 * Detects Echo HTTP framework patterns in Go code:
 * - Route definitions (GET, POST, PUT, DELETE, PATCH)
 * - Route groups
 * - Middleware usage
 * - Parameter extraction
 *
 * @requirements Go Language Support - Phase 8
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export interface EchoRouteInfo {
  method: string;
  path: string;
  handler: string;
  line: number;
  column: number;
  groupPrefix?: string;
}

export interface EchoGroupInfo {
  prefix: string;
  variable: string;
  line: number;
  column: number;
}

// ============================================================================
// Constants
// ============================================================================

const ECHO_HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'CONNECT', 'TRACE'] as const;

// ============================================================================
// Echo Detector Class
// ============================================================================

export class EchoDetector extends RegexDetector {
  readonly id = 'api/go/echo-routes';
  readonly category = 'api' as const;
  readonly subcategory = 'routes';
  readonly name = 'Echo Route Detector';
  readonly description = 'Detects Echo HTTP framework route patterns in Go code';
  readonly supportedLanguages: Language[] = ['go'];

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }

  async detect(context: DetectionContext): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    // Skip non-Go files
    if (!context.file.endsWith('.go')) {
      return this.createResult(patterns, violations, 1.0);
    }

    // Check if this file uses Echo
    if (!this.usesEcho(context.content)) {
      return this.createResult(patterns, violations, 1.0);
    }

    // Detect route groups first (for context)
    const groups = this.detectRouteGroups(context.content, context.file);
    
    // Detect routes
    const routes = this.detectRoutes(context.content, context.file);

    // Create patterns for routes
    for (const route of routes) {
      patterns.push({
        patternId: `${this.id}/${route.method.toLowerCase()}`,
        location: {
          file: context.file,
          line: route.line,
          column: route.column,
        },
        confidence: 0.95,
        isOutlier: false,
      });
    }

    // Create patterns for groups
    for (const group of groups) {
      patterns.push({
        patternId: `${this.id}/group`,
        location: {
          file: context.file,
          line: group.line,
          column: group.column,
        },
        confidence: 0.9,
        isOutlier: false,
      });
    }

    // Detect middleware patterns
    const middlewarePatterns = this.detectMiddleware(context.content, context.file);
    patterns.push(...middlewarePatterns);

    return this.createResult(patterns, violations, this.calculateConfidence(patterns));
  }

  private usesEcho(content: string): boolean {
    return this.hasMatch(content, /github\.com\/labstack\/echo/) ||
           this.hasMatch(content, /echo\.Context/) ||
           this.hasMatch(content, /echo\.New\(\)/);
  }

  private detectRoutes(content: string, _file: string): EchoRouteInfo[] {
    const routes: EchoRouteInfo[] = [];

    // Pattern: e.GET("/path", handler) or router.GET("/path", handler)
    for (const method of ECHO_HTTP_METHODS) {
      const pattern = new RegExp(
        `(\\w+)\\.(${method})\\s*\\(\\s*"([^"]+)"\\s*,\\s*([\\w.]+)`,
        'g'
      );

      const matches = this.matchLines(content, pattern);
      for (const match of matches) {
        routes.push({
          method: match.captures[2] ?? method,
          path: match.captures[3] ?? '',
          handler: match.captures[4] ?? '',
          line: match.line,
          column: match.column,
        });
      }
    }

    // Pattern: e.Add(method, path, handler)
    const addPattern = /(\w+)\.Add\s*\(\s*"?(\w+)"?\s*,\s*"([^"]+)"\s*,\s*([\w.]+)/g;
    const addMatches = this.matchLines(content, addPattern);
    
    for (const match of addMatches) {
      routes.push({
        method: match.captures[2] ?? 'UNKNOWN',
        path: match.captures[3] ?? '',
        handler: match.captures[4] ?? '',
        line: match.line,
        column: match.column,
      });
    }

    return routes;
  }

  private detectRouteGroups(content: string, _file: string): EchoGroupInfo[] {
    const groups: EchoGroupInfo[] = [];

    // Pattern: api := e.Group("/api")
    const groupPattern = /(\w+)\s*:?=\s*(\w+)\.Group\s*\(\s*"([^"]+)"/g;
    const matches = this.matchLines(content, groupPattern);

    for (const match of matches) {
      groups.push({
        variable: match.captures[1] ?? '',
        prefix: match.captures[3] ?? '',
        line: match.line,
        column: match.column,
      });
    }

    return groups;
  }

  private detectMiddleware(content: string, file: string): PatternMatch[] {
    const patterns: PatternMatch[] = [];

    // Pattern: e.Use(middleware)
    const usePattern = /(\w+)\.Use\s*\(\s*([^)]+)\)/g;
    const matches = this.matchLines(content, usePattern);

    for (const match of matches) {
      const middlewares = match.captures[2]?.split(',').map(m => m.trim()) ?? [];
      
      for (const _middleware of middlewares) {
        patterns.push({
          patternId: `${this.id}/middleware`,
          location: {
            file,
            line: match.line,
            column: match.column,
          },
          confidence: 0.9,
          isOutlier: false,
        });
      }
    }

    // Pattern: e.Pre(middleware) - pre-middleware
    const prePattern = /(\w+)\.Pre\s*\(\s*([^)]+)\)/g;
    const preMatches = this.matchLines(content, prePattern);

    for (const match of preMatches) {
      patterns.push({
        patternId: `${this.id}/pre-middleware`,
        location: {
          file,
          line: match.line,
          column: match.column,
        },
        confidence: 0.9,
        isOutlier: false,
      });
    }

    return patterns;
  }

  private calculateConfidence(patterns: PatternMatch[]): number {
    if (patterns.length === 0) {return 1.0;}
    const avgConfidence = patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length;
    return avgConfidence;
  }
}

export function createEchoDetector(): EchoDetector {
  return new EchoDetector();
}
