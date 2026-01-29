/**
 * Fiber Framework Detector
 *
 * Detects Fiber HTTP framework patterns in Go code:
 * - Route definitions (Get, Post, Put, Delete, Patch)
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

export interface FiberRouteInfo {
  method: string;
  path: string;
  handler: string;
  line: number;
  column: number;
  groupPrefix?: string;
}

export interface FiberGroupInfo {
  prefix: string;
  variable: string;
  line: number;
  column: number;
}

// ============================================================================
// Constants
// ============================================================================

// Fiber uses PascalCase method names
const FIBER_HTTP_METHODS = ['Get', 'Post', 'Put', 'Delete', 'Patch', 'Head', 'Options', 'All'] as const;


// ============================================================================
// Fiber Detector Class
// ============================================================================

export class FiberDetector extends RegexDetector {
  readonly id = 'api/go/fiber-routes';
  readonly category = 'api' as const;
  readonly subcategory = 'routes';
  readonly name = 'Fiber Route Detector';
  readonly description = 'Detects Fiber HTTP framework route patterns in Go code';
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

    if (!this.usesFiber(context.content)) {
      return this.createResult(patterns, violations, 1.0);
    }

    const groups = this.detectRouteGroups(context.content);
    const routes = this.detectRoutes(context.content);

    for (const route of routes) {
      patterns.push({
        patternId: `${this.id}/${route.method.toLowerCase()}`,
        location: { file: context.file, line: route.line, column: route.column },
        confidence: 0.95,
        isOutlier: false,
      });
    }

    for (const group of groups) {
      patterns.push({
        patternId: `${this.id}/group`,
        location: { file: context.file, line: group.line, column: group.column },
        confidence: 0.9,
        isOutlier: false,
      });
    }

    const middlewarePatterns = this.detectMiddleware(context.content, context.file);
    patterns.push(...middlewarePatterns);

    return this.createResult(patterns, violations, this.calculateConfidence(patterns));
  }

  private usesFiber(content: string): boolean {
    return this.hasMatch(content, /github\.com\/gofiber\/fiber/) ||
           this.hasMatch(content, /\*fiber\.Ctx/) ||
           this.hasMatch(content, /fiber\.New\(\)/);
  }


  private detectRoutes(content: string): FiberRouteInfo[] {
    const routes: FiberRouteInfo[] = [];

    for (const method of FIBER_HTTP_METHODS) {
      const pattern = new RegExp(`(\\w+)\\.(${method})\\s*\\(\\s*"([^"]+)"\\s*,\\s*([\\w.]+)`, 'g');
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

    return routes;
  }

  private detectRouteGroups(content: string): FiberGroupInfo[] {
    const groups: FiberGroupInfo[] = [];
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
    const usePattern = /(\w+)\.Use\s*\(\s*([^)]+)\)/g;
    const matches = this.matchLines(content, usePattern);

    for (const match of matches) {
      const middlewares = match.captures[2]?.split(',').map(m => m.trim()) ?? [];
      for (const middleware of middlewares) {
        if (middleware.startsWith('"') || middleware.startsWith("'")) {continue;}
        patterns.push({
          patternId: `${this.id}/middleware`,
          location: { file, line: match.line, column: match.column },
          confidence: 0.9,
          isOutlier: false,
        });
      }
    }

    return patterns;
  }

  private calculateConfidence(patterns: PatternMatch[]): number {
    if (patterns.length === 0) {return 1.0;}
    return patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length;
  }
}

export function createFiberDetector(): FiberDetector {
  return new FiberDetector();
}
