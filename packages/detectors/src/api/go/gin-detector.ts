/**
 * Gin Framework Detector
 *
 * Detects Gin HTTP framework patterns in Go code:
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

export interface GinRouteInfo {
  method: string;
  path: string;
  handler: string;
  line: number;
  column: number;
  hasMiddleware: boolean;
  groupPrefix?: string;
}

export interface GinGroupInfo {
  prefix: string;
  variable: string;
  line: number;
  column: number;
}

// ============================================================================
// Constants
// ============================================================================

const GIN_HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'Any'] as const;

// ============================================================================
// Gin Detector Class
// ============================================================================

export class GinDetector extends RegexDetector {
  readonly id = 'api/go/gin-routes';
  readonly category = 'api' as const;
  readonly subcategory = 'routes';
  readonly name = 'Gin Route Detector';
  readonly description = 'Detects Gin HTTP framework route patterns in Go code';
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

    // Check if this file uses Gin
    if (!this.usesGin(context.content)) {
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

  private usesGin(content: string): boolean {
    return this.hasMatch(content, /github\.com\/gin-gonic\/gin/) ||
           this.hasMatch(content, /\*gin\.Context/) ||
           this.hasMatch(content, /gin\.Default\(\)/) ||
           this.hasMatch(content, /gin\.New\(\)/);
  }

  private detectRoutes(content: string, _file: string): GinRouteInfo[] {
    const routes: GinRouteInfo[] = [];

    // Pattern: router.GET("/path", handler) or r.GET("/path", handler)
    for (const method of GIN_HTTP_METHODS) {
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
          hasMiddleware: this.hasMiddlewareInRoute(match.match),
        });
      }
    }

    // Pattern with multiple handlers (middleware): r.GET("/path", middleware, handler)
    const multiHandlerPattern = /(\w+)\.(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|Any)\s*\(\s*"([^"]+)"\s*,\s*([^)]+)\)/g;
    const multiMatches = this.matchLines(content, multiHandlerPattern);
    
    for (const match of multiMatches) {
      const handlers = match.captures[4]?.split(',').map(h => h.trim()) ?? [];
      if (handlers.length > 1) {
        // Update existing route or add new one with middleware flag
        const existingRoute = routes.find(r => 
          r.line === match.line && r.method === match.captures[2]
        );
        if (existingRoute) {
          existingRoute.hasMiddleware = true;
        }
      }
    }

    return routes;
  }

  private detectRouteGroups(content: string, _file: string): GinGroupInfo[] {
    const groups: GinGroupInfo[] = [];

    // Pattern: api := r.Group("/api")
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

    // Pattern: r.Use(middleware)
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

    return patterns;
  }

  private hasMiddlewareInRoute(routeMatch: string): boolean {
    // Count commas to detect multiple handlers
    const commaCount = (routeMatch.match(/,/g) ?? []).length;
    return commaCount > 1;
  }

  private calculateConfidence(patterns: PatternMatch[]): number {
    if (patterns.length === 0) {return 1.0;}
    const avgConfidence = patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length;
    return avgConfidence;
  }
}

export function createGinDetector(): GinDetector {
  return new GinDetector();
}
