/**
 * Actix-web Framework Detector
 *
 * Detects Actix-web HTTP framework patterns in Rust code:
 * - Route definitions (#[get], #[post], etc.)
 * - App configuration (App::new().route())
 * - Middleware usage
 * - Extractors (Path, Query, Json, etc.)
 *
 * @requirements Rust Language Support
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export interface ActixRouteInfo {
  method: string;
  path: string;
  handler: string;
  line: number;
  column: number;
  hasExtractors: boolean;
  extractors: string[];
}

export interface ActixMiddlewareInfo {
  name: string;
  line: number;
  column: number;
}

// ============================================================================
// Constants
// ============================================================================

const ACTIX_HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'trace'] as const;

// ============================================================================
// Actix Detector Class
// ============================================================================

export class ActixDetector extends RegexDetector {
  readonly id = 'api/rust/actix-routes';
  readonly category = 'api' as const;
  readonly subcategory = 'routes';
  readonly name = 'Actix-web Route Detector';
  readonly description = 'Detects Actix-web HTTP framework route patterns in Rust code';
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

    // Check if this file uses Actix-web
    if (!this.usesActix(context.content)) {
      return this.createResult(patterns, violations, 1.0);
    }

    // Detect attribute-based routes
    const attributeRoutes = this.detectAttributeRoutes(context.content, context.file);
    for (const route of attributeRoutes) {
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

    // Detect App::new().route() patterns
    const appRoutes = this.detectAppRoutes(context.content, context.file);
    for (const route of appRoutes) {
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

    // Detect middleware patterns
    const middlewarePatterns = this.detectMiddleware(context.content, context.file);
    patterns.push(...middlewarePatterns);

    // Detect extractor patterns
    const extractorPatterns = this.detectExtractors(context.content, context.file);
    patterns.push(...extractorPatterns);

    return this.createResult(patterns, violations, this.calculateConfidence(patterns));
  }

  private usesActix(content: string): boolean {
    return this.hasMatch(content, /actix_web/) ||
           this.hasMatch(content, /use actix/) ||
           this.hasMatch(content, /#\[(get|post|put|delete|patch)\s*\(/) ||
           this.hasMatch(content, /HttpServer::new/) ||
           this.hasMatch(content, /App::new\(\)/);
  }

  private detectAttributeRoutes(content: string, _file: string): ActixRouteInfo[] {
    const routes: ActixRouteInfo[] = [];

    // Pattern: #[get("/path")] async fn handler() { }
    for (const method of ACTIX_HTTP_METHODS) {
      const pattern = new RegExp(
        `#\\[${method}\\s*\\(\\s*"([^"]+)"[^)]*\\)\\]\\s*(?:pub\\s+)?(?:async\\s+)?fn\\s+(\\w+)\\s*\\(([^)]*)\\)`,
        'g'
      );

      const matches = this.matchLines(content, pattern);
      for (const match of matches) {
        const path = match.captures[1] ?? '';
        const handler = match.captures[2] ?? '';
        const params = match.captures[3] ?? '';
        const extractors = this.parseExtractors(params);

        routes.push({
          method: method.toUpperCase(),
          path,
          handler,
          line: match.line,
          column: match.column,
          hasExtractors: extractors.length > 0,
          extractors,
        });
      }
    }

    // Pattern: #[route("/path", method = "GET")]
    const routePattern = /#\[route\s*\(\s*"([^"]+)"\s*,\s*method\s*=\s*"(\w+)"[^)]*\)\]\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*\(([^)]*)\)/g;
    const routeMatches = this.matchLines(content, routePattern);

    for (const match of routeMatches) {
      const path = match.captures[1] ?? '';
      const method = match.captures[2] ?? 'GET';
      const handler = match.captures[3] ?? '';
      const params = match.captures[4] ?? '';
      const extractors = this.parseExtractors(params);

      routes.push({
        method: method.toUpperCase(),
        path,
        handler,
        line: match.line,
        column: match.column,
        hasExtractors: extractors.length > 0,
        extractors,
      });
    }

    return routes;
  }

  private detectAppRoutes(content: string, _file: string): ActixRouteInfo[] {
    const routes: ActixRouteInfo[] = [];

    // Pattern: .route("/path", web::get().to(handler))
    const routePattern = /\.route\s*\(\s*"([^"]+)"\s*,\s*web::(\w+)\(\)\.to\((\w+)\)/g;
    const matches = this.matchLines(content, routePattern);

    for (const match of matches) {
      routes.push({
        method: (match.captures[2] ?? 'get').toUpperCase(),
        path: match.captures[1] ?? '',
        handler: match.captures[3] ?? '',
        line: match.line,
        column: match.column,
        hasExtractors: false,
        extractors: [],
      });
    }

    // Pattern: .service(web::resource("/path").route(web::get().to(handler)))
    const servicePattern = /web::resource\s*\(\s*"([^"]+)"\s*\)\.route\s*\(\s*web::(\w+)\(\)\.to\((\w+)\)/g;
    const serviceMatches = this.matchLines(content, servicePattern);

    for (const match of serviceMatches) {
      routes.push({
        method: (match.captures[2] ?? 'get').toUpperCase(),
        path: match.captures[1] ?? '',
        handler: match.captures[3] ?? '',
        line: match.line,
        column: match.column,
        hasExtractors: false,
        extractors: [],
      });
    }

    return routes;
  }

  private detectMiddleware(content: string, file: string): PatternMatch[] {
    const patterns: PatternMatch[] = [];

    // Pattern: .wrap(middleware)
    const wrapPattern = /\.wrap\s*\(\s*([^)]+)\)/g;
    const matches = this.matchLines(content, wrapPattern);

    for (const match of matches) {
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

    // Pattern: .wrap_fn(|req, srv| { ... })
    const wrapFnPattern = /\.wrap_fn\s*\(/g;
    const wrapFnMatches = this.matchLines(content, wrapFnPattern);

    for (const match of wrapFnMatches) {
      patterns.push({
        patternId: `${this.id}/middleware-fn`,
        location: {
          file,
          line: match.line,
          column: match.column,
        },
        confidence: 0.85,
        isOutlier: false,
      });
    }

    return patterns;
  }

  private detectExtractors(content: string, file: string): PatternMatch[] {
    const patterns: PatternMatch[] = [];

    // Common Actix extractors
    const extractorTypes = [
      'Path', 'Query', 'Json', 'Form', 'Data', 'HttpRequest',
      'Payload', 'Bytes', 'String', 'Header', 'Cookie',
    ];

    for (const extractor of extractorTypes) {
      const pattern = new RegExp(`\\b(web::)?${extractor}<[^>]+>`, 'g');
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

  private parseExtractors(params: string): string[] {
    const extractors: string[] = [];
    const extractorTypes = [
      'Path', 'Query', 'Json', 'Form', 'Data', 'HttpRequest',
      'Payload', 'Bytes', 'String', 'Header', 'Cookie',
    ];

    for (const extractor of extractorTypes) {
      if (params.includes(extractor)) {
        extractors.push(extractor);
      }
    }

    return extractors;
  }

  private calculateConfidence(patterns: PatternMatch[]): number {
    if (patterns.length === 0) {return 1.0;}
    const avgConfidence = patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length;
    return avgConfidence;
  }
}

export function createActixDetector(): ActixDetector {
  return new ActixDetector();
}
