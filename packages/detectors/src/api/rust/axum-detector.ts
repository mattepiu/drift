/**
 * Axum Framework Detector
 *
 * Detects Axum HTTP framework patterns in Rust code:
 * - Router definitions (Router::new().route())
 * - Handler functions
 * - Extractors (Path, Query, Json, State, etc.)
 * - Middleware/layers
 *
 * @requirements Rust Language Support
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export interface AxumRouteInfo {
  method: string;
  path: string;
  handler: string;
  line: number;
  column: number;
  hasExtractors: boolean;
  extractors: string[];
}

export interface AxumLayerInfo {
  name: string;
  line: number;
  column: number;
}

// ============================================================================
// Constants
// ============================================================================

const AXUM_HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'trace'] as const;

// ============================================================================
// Axum Detector Class
// ============================================================================

export class AxumDetector extends RegexDetector {
  readonly id = 'api/rust/axum-routes';
  readonly category = 'api' as const;
  readonly subcategory = 'routes';
  readonly name = 'Axum Route Detector';
  readonly description = 'Detects Axum HTTP framework route patterns in Rust code';
  readonly supportedLanguages: Language[] = ['rust'];

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }

  async detect(context: DetectionContext): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    // Skip non-Rust files
    if (!context.file.endsWith('.rs')) {
      return this.createResult(patterns, violations, 1.0);
    }

    // Check if this file uses Axum
    if (!this.usesAxum(context.content)) {
      return this.createResult(patterns, violations, 1.0);
    }

    // Detect Router::new().route() patterns
    const routes = this.detectRoutes(context.content, context.file);
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

    // Detect method router patterns (get(), post(), etc.)
    const methodRoutes = this.detectMethodRoutes(context.content, context.file);
    for (const route of methodRoutes) {
      patterns.push({
        patternId: `${this.id}/${route.method.toLowerCase()}`,
        location: {
          file: context.file,
          line: route.line,
          column: route.column,
        },
        confidence: 0.9,
        isOutlier: false,
      });
    }

    // Detect layer/middleware patterns
    const layerPatterns = this.detectLayers(context.content, context.file);
    patterns.push(...layerPatterns);

    // Detect extractor patterns
    const extractorPatterns = this.detectExtractors(context.content, context.file);
    patterns.push(...extractorPatterns);

    // Detect handler functions
    const handlerPatterns = this.detectHandlers(context.content, context.file);
    patterns.push(...handlerPatterns);

    return this.createResult(patterns, violations, this.calculateConfidence(patterns));
  }

  private usesAxum(content: string): boolean {
    return this.hasMatch(content, /use axum/) ||
           this.hasMatch(content, /axum::/) ||
           this.hasMatch(content, /Router::new\(\)/) ||
           this.hasMatch(content, /axum::\{[^}]*Router[^}]*\}/);
  }

  private detectRoutes(content: string, _file: string): AxumRouteInfo[] {
    const routes: AxumRouteInfo[] = [];

    // Pattern: .route("/path", get(handler))
    for (const method of AXUM_HTTP_METHODS) {
      const pattern = new RegExp(
        `\\.route\\s*\\(\\s*"([^"]+)"\\s*,\\s*${method}\\s*\\(\\s*(\\w+)\\s*\\)`,
        'g'
      );

      const matches = this.matchLines(content, pattern);
      for (const match of matches) {
        routes.push({
          method: method.toUpperCase(),
          path: match.captures[1] ?? '',
          handler: match.captures[2] ?? '',
          line: match.line,
          column: match.column,
          hasExtractors: false,
          extractors: [],
        });
      }
    }

    // Pattern: .route("/path", get(handler).post(handler2))
    const chainedPattern = /\.route\s*\(\s*"([^"]+)"\s*,\s*(\w+)\s*\(\s*(\w+)\s*\)(?:\.(\w+)\s*\(\s*(\w+)\s*\))?/g;
    const chainedMatches = this.matchLines(content, chainedPattern);

    for (const match of chainedMatches) {
      const path = match.captures[1] ?? '';
      const method1 = match.captures[2] ?? '';
      const handler1 = match.captures[3] ?? '';

      // Check if already added
      if (!routes.some(r => r.path === path && r.method === method1.toUpperCase())) {
        routes.push({
          method: method1.toUpperCase(),
          path,
          handler: handler1,
          line: match.line,
          column: match.column,
          hasExtractors: false,
          extractors: [],
        });
      }

      // Check for chained method
      if (match.captures[4] && match.captures[5]) {
        const method2 = match.captures[4];
        const handler2 = match.captures[5];
        if (!routes.some(r => r.path === path && r.method === method2.toUpperCase())) {
          routes.push({
            method: method2.toUpperCase(),
            path,
            handler: handler2,
            line: match.line,
            column: match.column,
            hasExtractors: false,
            extractors: [],
          });
        }
      }
    }

    return routes;
  }

  private detectMethodRoutes(content: string, _file: string): AxumRouteInfo[] {
    const routes: AxumRouteInfo[] = [];

    // Pattern: routing::get("/path").to(handler)
    for (const method of AXUM_HTTP_METHODS) {
      const pattern = new RegExp(
        `(?:routing::)?${method}\\s*\\(\\s*"([^"]+)"\\s*\\)`,
        'g'
      );

      const matches = this.matchLines(content, pattern);
      for (const match of matches) {
        routes.push({
          method: method.toUpperCase(),
          path: match.captures[1] ?? '',
          handler: '',
          line: match.line,
          column: match.column,
          hasExtractors: false,
          extractors: [],
        });
      }
    }

    return routes;
  }

  private detectLayers(content: string, file: string): PatternMatch[] {
    const patterns: PatternMatch[] = [];

    // Pattern: .layer(layer)
    const layerPattern = /\.layer\s*\(\s*([^)]+)\)/g;
    const matches = this.matchLines(content, layerPattern);

    for (const match of matches) {
      patterns.push({
        patternId: `${this.id}/layer`,
        location: {
          file,
          line: match.line,
          column: match.column,
        },
        confidence: 0.9,
        isOutlier: false,
      });
    }

    // Pattern: ServiceBuilder::new().layer()
    const serviceBuilderPattern = /ServiceBuilder::new\(\)(?:\s*\.layer\s*\([^)]+\))+/g;
    const sbMatches = this.matchLines(content, serviceBuilderPattern);

    for (const match of sbMatches) {
      patterns.push({
        patternId: `${this.id}/service-builder`,
        location: {
          file,
          line: match.line,
          column: match.column,
        },
        confidence: 0.9,
        isOutlier: false,
      });
    }

    // Common tower layers
    const towerLayers = [
      'TraceLayer', 'CorsLayer', 'CompressionLayer', 'TimeoutLayer',
      'RateLimitLayer', 'ConcurrencyLimitLayer',
    ];

    for (const layer of towerLayers) {
      const pattern = new RegExp(`${layer}::new\\(`, 'g');
      const layerMatches = this.matchLines(content, pattern);

      for (const match of layerMatches) {
        patterns.push({
          patternId: `${this.id}/layer/${layer.toLowerCase()}`,
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

  private detectExtractors(content: string, file: string): PatternMatch[] {
    const patterns: PatternMatch[] = [];

    // Common Axum extractors
    const extractorTypes = [
      'Path', 'Query', 'Json', 'Form', 'State', 'Extension',
      'TypedHeader', 'RawQuery', 'MatchedPath', 'OriginalUri',
      'ConnectInfo', 'Request', 'Parts', 'Body', 'Bytes', 'String',
    ];

    for (const extractor of extractorTypes) {
      // Pattern: extractor::Path<T> or Path<T>
      const pattern = new RegExp(`\\b(?:extract::)?${extractor}<[^>]+>`, 'g');
      const matches = this.matchLines(content, pattern);

      for (const match of matches) {
        patterns.push({
          patternId: `${this.id}/extractor/${extractor.toLowerCase()}`,
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

  private detectHandlers(content: string, file: string): PatternMatch[] {
    const patterns: PatternMatch[] = [];

    // Pattern: async fn handler_name(...) -> impl IntoResponse
    const handlerPattern = /async\s+fn\s+(\w+)\s*\([^)]*\)\s*->\s*(?:impl\s+)?IntoResponse/g;
    const matches = this.matchLines(content, handlerPattern);

    for (const match of matches) {
      patterns.push({
        patternId: `${this.id}/handler`,
        location: {
          file,
          line: match.line,
          column: match.column,
        },
        confidence: 0.85,
        isOutlier: false,
      });
    }

    // Pattern: async fn handler_name(...) -> Result<impl IntoResponse, ...>
    const resultHandlerPattern = /async\s+fn\s+(\w+)\s*\([^)]*\)\s*->\s*Result<[^>]*IntoResponse/g;
    const resultMatches = this.matchLines(content, resultHandlerPattern);

    for (const match of resultMatches) {
      patterns.push({
        patternId: `${this.id}/handler`,
        location: {
          file,
          line: match.line,
          column: match.column,
        },
        confidence: 0.85,
        isOutlier: false,
      });
    }

    // Pattern: async fn handler_name(...) -> Json<T>
    const jsonHandlerPattern = /async\s+fn\s+(\w+)\s*\([^)]*\)\s*->\s*Json<[^>]+>/g;
    const jsonMatches = this.matchLines(content, jsonHandlerPattern);

    for (const match of jsonMatches) {
      patterns.push({
        patternId: `${this.id}/handler/json`,
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

export function createAxumDetector(): AxumDetector {
  return new AxumDetector();
}
