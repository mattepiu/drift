/**
 * Chi Router Detector
 *
 * Detects Chi router patterns in Go code:
 * - Route definitions (Get, Post, Put, Delete, Patch)
 * - Route groups and subrouters
 * - Middleware usage
 * - URL parameters
 *
 * @requirements Go Language Support - Phase 8
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export interface ChiRouteInfo {
  method: string;
  path: string;
  handler: string;
  line: number;
  column: number;
}

export interface ChiGroupInfo {
  prefix: string;
  line: number;
  column: number;
}

// ============================================================================
// Constants
// ============================================================================

const CHI_HTTP_METHODS = ['Get', 'Post', 'Put', 'Delete', 'Patch', 'Head', 'Options', 'Connect', 'Trace'] as const;


// ============================================================================
// Chi Detector Class
// ============================================================================

export class ChiDetector extends RegexDetector {
  readonly id = 'api/go/chi-routes';
  readonly category = 'api' as const;
  readonly subcategory = 'routes';
  readonly name = 'Chi Route Detector';
  readonly description = 'Detects Chi router patterns in Go code';
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

    if (!this.usesChi(context.content)) {
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

  private usesChi(content: string): boolean {
    return this.hasMatch(content, /github\.com\/go-chi\/chi/) ||
           this.hasMatch(content, /chi\.NewRouter\(\)/) ||
           this.hasMatch(content, /chi\.Router/);
  }


  private detectRoutes(content: string): ChiRouteInfo[] {
    const routes: ChiRouteInfo[] = [];

    for (const method of CHI_HTTP_METHODS) {
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

    const methodPattern = /(\w+)\.Method\s*\(\s*http\.Method(\w+)\s*,\s*"([^"]+)"\s*,\s*([\w.]+)/g;
    const methodMatches = this.matchLines(content, methodPattern);
    for (const match of methodMatches) {
      routes.push({
        method: match.captures[2] ?? 'UNKNOWN',
        path: match.captures[3] ?? '',
        handler: match.captures[4] ?? '',
        line: match.line,
        column: match.column,
      });
    }

    const handlePattern = /(\w+)\.Handle\s*\(\s*"([^"]+)"\s*,\s*([\w.]+)/g;
    const handleMatches = this.matchLines(content, handlePattern);
    for (const match of handleMatches) {
      routes.push({
        method: 'ANY',
        path: match.captures[2] ?? '',
        handler: match.captures[3] ?? '',
        line: match.line,
        column: match.column,
      });
    }

    return routes;
  }

  private detectRouteGroups(content: string): ChiGroupInfo[] {
    const groups: ChiGroupInfo[] = [];

    const routePattern = /(\w+)\.Route\s*\(\s*"([^"]+)"/g;
    const matches = this.matchLines(content, routePattern);
    for (const match of matches) {
      groups.push({ prefix: match.captures[2] ?? '', line: match.line, column: match.column });
    }

    const groupPattern = /(\w+)\.Group\s*\(\s*func/g;
    const groupMatches = this.matchLines(content, groupPattern);
    for (const match of groupMatches) {
      groups.push({ prefix: '', line: match.line, column: match.column });
    }

    const mountPattern = /(\w+)\.Mount\s*\(\s*"([^"]+)"/g;
    const mountMatches = this.matchLines(content, mountPattern);
    for (const match of mountMatches) {
      groups.push({ prefix: match.captures[2] ?? '', line: match.line, column: match.column });
    }

    return groups;
  }


  private detectMiddleware(content: string, file: string): PatternMatch[] {
    const patterns: PatternMatch[] = [];

    const usePattern = /(\w+)\.Use\s*\(\s*([^)]+)\)/g;
    const matches = this.matchLines(content, usePattern);
    for (const match of matches) {
      patterns.push({
        patternId: `${this.id}/middleware`,
        location: { file, line: match.line, column: match.column },
        confidence: 0.9,
        isOutlier: false,
      });
    }

    const withPattern = /(\w+)\.With\s*\(\s*([^)]+)\)/g;
    const withMatches = this.matchLines(content, withPattern);
    for (const match of withMatches) {
      patterns.push({
        patternId: `${this.id}/inline-middleware`,
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

export function createChiDetector(): ChiDetector {
  return new ChiDetector();
}
