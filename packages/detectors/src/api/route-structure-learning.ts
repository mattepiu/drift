/**
 * Route Structure Detector - LEARNING VERSION
 *
 * Learns route URL structure patterns from the user's codebase:
 * - URL casing convention (kebab-case, camelCase, snake_case)
 * - Resource naming convention (plural vs singular)
 * - API versioning patterns
 * - Route nesting depth
 *
 * Flags violations only when code deviates from the PROJECT'S established patterns.
 *
 * @requirements DRIFT-CORE - Learn patterns from user's code, not enforce arbitrary rules
 */

import {
  LearningDetector,
  ValueDistribution,
  type DetectionContext,
  type DetectionResult,
  type LearningResult,
} from '../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

/**
 * URL casing convention types
 */
export type UrlCasingConvention =
  | 'kebab-case'
  | 'camelCase'
  | 'snake_case'
  | 'lowercase';

/**
 * Resource naming convention
 */
export type ResourceNamingConvention = 'plural' | 'singular' | 'mixed';

/**
 * Conventions this detector learns
 */
export interface RouteConventions {
  [key: string]: unknown;
  /** URL segment casing convention */
  urlCasing: UrlCasingConvention;
  
  /** Resource naming convention (plural/singular) */
  resourceNaming: ResourceNamingConvention;
  
  /** Whether API versioning is used */
  usesVersioning: boolean;
  
  /** API version prefix pattern (e.g., "/api/v1", "/v1") */
  versionPrefix: string | null;
  
  /** Maximum nesting depth observed */
  maxNestingDepth: number;
}

/**
 * Route pattern info extracted from code
 */
interface RouteInfo {
  path: string;
  method?: string | undefined;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Detect casing of a URL segment
 */
function detectCasing(segment: string): UrlCasingConvention {
  // Skip parameters and special segments
  if (segment.startsWith(':') || segment.startsWith('[') || segment.startsWith('{')) {
    return 'lowercase';
  }
  if (/^v\d+$/.test(segment) || segment === 'api') {
    return 'lowercase';
  }
  
  if (segment.includes('-')) {return 'kebab-case';}
  if (segment.includes('_')) {return 'snake_case';}
  if (/[A-Z]/.test(segment) && /[a-z]/.test(segment)) {return 'camelCase';}
  return 'lowercase';
}

/**
 * Check if a word is plural
 */
function isPlural(word: string): boolean {
  const normalized = word.toLowerCase().replace(/[-_]/g, '');
  // Common plural endings
  if (normalized.endsWith('ies')) {return true;}
  if (normalized.endsWith('es') && !normalized.endsWith('ss')) {return true;}
  if (normalized.endsWith('s') && !normalized.endsWith('ss') && !normalized.endsWith('us')) {return true;}
  return false;
}

/**
 * Calculate nesting depth of a route
 */
function calculateNestingDepth(routePath: string): number {
  const segments = routePath.replace(/^\//, '').split('/').filter(Boolean);
  let depth = 0;
  for (const segment of segments) {
    // Skip version prefixes and 'api'
    if (/^v\d+$/.test(segment) || segment === 'api') {continue;}
    // Skip parameters
    if (segment.startsWith(':') || segment.startsWith('[') || segment.startsWith('{')) {continue;}
    depth++;
  }
  return depth;
}

/**
 * Extract route paths from content
 */
function extractRoutes(content: string, file: string): RouteInfo[] {
  const routes: RouteInfo[] = [];
  
  // Express/Koa style routes
  const expressPatterns = [
    /(?:router|app)\.(get|post|put|patch|delete|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    /\.route\s*\(\s*['"`]([^'"`]+)['"`]\)/gi,
  ];
  
  // FastAPI/Flask style routes (Python)
  const pythonPatterns = [
    /@(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    /@app\.route\s*\(\s*['"`]([^'"`]+)['"`]/gi,
  ];
  
  // URL literals that look like API routes
  const urlLiteralPattern = /['"`](\/(?:api\/)?[a-zA-Z][a-zA-Z0-9/_:-]*)['"`]/g;
  
  const allPatterns = [...expressPatterns, ...pythonPatterns, urlLiteralPattern];
  
  for (const pattern of allPatterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;
      
      // Extract path (could be in different capture groups)
      const path = match[2] || match[1];
      if (!path?.startsWith('/')) {continue;}
      
      // Skip if it doesn't look like an API route
      if (!path.includes('/api/') && !path.startsWith('/v') && !path.includes(':') && !path.includes('[')) {
        continue;
      }
      
      routes.push({
        path,
        method: match[1]?.toUpperCase(),
        line: lineNumber,
        column,
        file,
      });
    }
  }
  
  return routes;
}

/**
 * Convert to kebab-case
 */
function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
}

/**
 * Convert to plural
 */
function toPlural(singular: string): string {
  if (singular.endsWith('y') && !/[aeiou]y$/.test(singular)) {
    return singular.slice(0, -1) + 'ies';
  }
  if (singular.endsWith('s') || singular.endsWith('x') || singular.endsWith('ch') || singular.endsWith('sh')) {
    return singular + 'es';
  }
  return singular + 's';
}

// ============================================================================
// Learning Route Structure Detector
// ============================================================================

export class RouteStructureLearningDetector extends LearningDetector<RouteConventions> {
  readonly id = 'api/route-structure';
  readonly category = 'api' as const;
  readonly subcategory = 'route-structure';
  readonly name = 'Route Structure Detector (Learning)';
  readonly description = 'Learns route URL patterns from your codebase and flags inconsistencies';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  // ============================================================================
  // Learning Implementation
  // ============================================================================

  protected getConventionKeys(): Array<keyof RouteConventions> {
    return ['urlCasing', 'resourceNaming', 'usesVersioning', 'versionPrefix', 'maxNestingDepth'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof RouteConventions, ValueDistribution>
  ): void {
    const routes = extractRoutes(context.content, context.file);
    
    if (routes.length === 0) {return;}
    
    const casingDist = distributions.get('urlCasing')!;
    const namingDist = distributions.get('resourceNaming')!;
    const versioningDist = distributions.get('usesVersioning')!;
    const versionPrefixDist = distributions.get('versionPrefix')!;
    const nestingDist = distributions.get('maxNestingDepth')!;
    
    for (const route of routes) {
      const segments = route.path.split('/').filter(Boolean);
      
      // Track versioning
      const hasVersioning = /\/v\d+\//.test(route.path);
      versioningDist.add(hasVersioning, context.file);
      
      if (hasVersioning) {
        const versionMatch = route.path.match(/(\/api\/v\d+|\/v\d+)/);
        if (versionMatch) {
          versionPrefixDist.add(versionMatch[1], context.file);
        }
      }
      
      // Track nesting depth
      const depth = calculateNestingDepth(route.path);
      nestingDist.add(depth, context.file);
      
      // Analyze each segment
      for (const segment of segments) {
        // Skip special segments
        if (segment.startsWith(':') || segment.startsWith('[') || segment.startsWith('{')) {continue;}
        if (/^v\d+$/.test(segment) || segment === 'api') {continue;}
        
        // Track casing
        const casing = detectCasing(segment);
        if (casing !== 'lowercase') {
          casingDist.add(casing, context.file);
        } else {
          // Lowercase is compatible with kebab-case
          casingDist.add('kebab-case', context.file);
        }
        
        // Track plural/singular
        if (isPlural(segment)) {
          namingDist.add('plural', context.file);
        } else if (segment.length > 2) {
          namingDist.add('singular', context.file);
        }
      }
    }
  }

  // ============================================================================
  // Detection Implementation
  // ============================================================================

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<RouteConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    const routes = extractRoutes(context.content, context.file);
    
    if (routes.length === 0) {
      return this.createEmptyResult();
    }
    
    // Get learned conventions
    const learnedCasing = conventions.conventions.urlCasing?.value;
    const learnedNaming = conventions.conventions.resourceNaming?.value;
    const learnedVersioning = conventions.conventions.usesVersioning?.value;
    const learnedMaxDepth = conventions.conventions.maxNestingDepth?.value;
    
    for (const route of routes) {
      const segments = route.path.split('/').filter(Boolean);
      
      // Check versioning consistency
      if (learnedVersioning === true) {
        const hasVersioning = /\/v\d+\//.test(route.path);
        if (!hasVersioning && route.path.includes('/api/')) {
          // Only flag if this looks like an API route that should be versioned
          violations.push(this.createConventionViolation(
            route.file,
            route.line,
            route.column,
            'API versioning',
            'unversioned',
            'versioned (e.g., /api/v1/...)',
            `Route '${route.path}' is missing version prefix. Your project uses versioned APIs.`
          ));
        }
      }
      
      // Check nesting depth
      if (learnedMaxDepth !== undefined) {
        const depth = calculateNestingDepth(route.path);
        // Allow some flexibility - flag if significantly deeper than learned max
        if (depth > learnedMaxDepth + 1) {
          violations.push(this.createConventionViolation(
            route.file,
            route.line,
            route.column,
            'route nesting',
            `${depth} levels`,
            `${learnedMaxDepth} levels or less`,
            `Route '${route.path}' has ${depth} levels of nesting. Your project typically uses ${learnedMaxDepth} or fewer.`
          ));
        }
      }
      
      // Check each segment
      for (const segment of segments) {
        // Skip special segments
        if (segment.startsWith(':') || segment.startsWith('[') || segment.startsWith('{')) {continue;}
        if (/^v\d+$/.test(segment) || segment === 'api') {continue;}
        
        // Check casing
        if (learnedCasing && learnedCasing !== 'lowercase') {
          const segmentCasing = detectCasing(segment);
          if (segmentCasing !== learnedCasing && segmentCasing !== 'lowercase') {
            violations.push(this.createConventionViolation(
              route.file,
              route.line,
              route.column,
              'URL casing',
              segment,
              toKebabCase(segment),
              `URL segment '${segment}' uses ${segmentCasing} but your project uses ${learnedCasing}`
            ));
          }
        }
        
        // Check naming (plural/singular)
        if (learnedNaming === 'plural' && !isPlural(segment) && segment.length > 2) {
          violations.push(this.createConventionViolation(
            route.file,
            route.line,
            route.column,
            'resource naming',
            segment,
            toPlural(segment),
            `Resource '${segment}' should use plural form. Your project uses plural resource names.`
          ));
        }
      }
    }
    
    // Create pattern matches for detected routes
    if (routes.length > 0) {
      const firstRoute = routes[0];
      if (firstRoute) {
        patterns.push({
          patternId: `${this.id}/routes`,
          location: {
            file: context.file,
            line: firstRoute.line,
            column: firstRoute.column,
          },
          confidence: 1.0,
          isOutlier: violations.length > 0,
        });
      }
    }
    
    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }

  // ============================================================================
  // Quick Fix
  // ============================================================================

  override generateQuickFix(violation: Violation): QuickFix | null {
    if (!violation.expected || violation.expected === violation.actual) {
      return null;
    }
    
    return {
      title: `Change to '${violation.expected}'`,
      kind: 'quickfix',
      edit: {
        changes: {
          [violation.file]: [
            {
              range: violation.range,
              newText: violation.expected,
            },
          ],
        },
      },
      isPreferred: true,
      confidence: 0.8,
      preview: `Replace '${violation.actual}' with '${violation.expected}'`,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createRouteStructureLearningDetector(): RouteStructureLearningDetector {
  return new RouteStructureLearningDetector();
}
