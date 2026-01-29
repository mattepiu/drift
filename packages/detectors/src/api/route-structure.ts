/**
 * Route Structure Detector - URL pattern detection
 *
 * Detects route URL structure patterns including:
 * - RESTful URL patterns (e.g., /api/v1/users, /api/v1/users/:id)
 * - Next.js App Router patterns (e.g., /app/api/.../route.ts)
 * - Next.js Pages Router patterns (e.g., /pages/api/....ts)
 * - Express-style route patterns (e.g., router.get('/users/:id'))
 * - URL versioning patterns (e.g., /v1/, /v2/)
 * - Resource naming conventions (plural vs singular)
 * - Nested resource patterns (e.g., /users/:userId/posts/:postId)
 * - Query parameter patterns
 *
 * Flags violations:
 * - Inconsistent URL casing (mixing kebab-case and camelCase)
 * - Inconsistent resource naming (mixing plural and singular)
 * - Missing API versioning
 * - Deeply nested routes (more than 3 levels)
 * - Non-RESTful URL patterns
 *
 * @requirements 10.1 - THE API_Detector SHALL detect route URL structure patterns
 */

import { RegexDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

/**
 * Types of route patterns detected
 */
export type RoutePatternType =
  | 'restful-route'
  | 'nextjs-app-router'
  | 'nextjs-pages-router'
  | 'express-route'
  | 'versioned-api'
  | 'nested-resource'
  | 'parameterized-route';

/**
 * Types of route violations detected
 */
export type RouteViolationType =
  | 'inconsistent-casing'
  | 'inconsistent-naming'
  | 'missing-versioning'
  | 'deeply-nested'
  | 'non-restful';


/**
 * URL casing convention types
 */
export type UrlCasingConvention =
  | 'kebab-case'
  | 'camelCase'
  | 'snake_case'
  | 'lowercase';

/**
 * Information about a detected route pattern
 */
export interface RoutePatternInfo {
  type: RoutePatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  routePath?: string | undefined;
  httpMethod?: string | undefined;
  parameters?: string[] | undefined;
  context?: string | undefined;
}

/**
 * Information about a detected route violation
 */
export interface RouteViolationInfo {
  type: RouteViolationType;
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  value: string;
  issue: string;
  suggestedFix?: string | undefined;
  lineContent: string;
}

/**
 * Analysis of route patterns in a file
 */
export interface RouteStructureAnalysis {
  routePatterns: RoutePatternInfo[];
  violations: RouteViolationInfo[];
  usesRestfulPatterns: boolean;
  usesVersioning: boolean;
  detectedCasing: UrlCasingConvention | null;
  usesPluralResources: boolean;
  patternAdherenceConfidence: number;
}


// ============================================================================
// Constants
// ============================================================================

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

export const EXPRESS_ROUTE_PATTERNS = [
  // TypeScript/JavaScript patterns
  /(?:router|app)\.(get|post|put|patch|delete|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
  /\.route\s*\(\s*['"`]([^'"`]+)['"`]\)/gi,
  // Python patterns - FastAPI, Flask, Django
  /@(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
  /@app\.route\s*\(\s*['"`]([^'"`]+)['"`]/gi,
  /path\s*\(\s*['"`]([^'"`]+)['"`]/gi,
] as const;

export const NEXTJS_APP_ROUTER_PATTERN = /\/app\/(?:api\/)?(?:[^/]+\/)*route\.(ts|js|tsx|jsx)$/;

export const NEXTJS_PAGES_ROUTER_PATTERN = /\/pages\/api\/(?:[^/]+\/)*[^/]+\.(ts|js|tsx|jsx)$/;

export const RESTFUL_URL_PATTERNS = [
  /\/api\/v\d+\/[a-z][a-z0-9-]*/gi,
  /\/v\d+\/[a-z][a-z0-9-]*/gi,
  /\/[a-z][a-z0-9-]*(?:\/:[a-z][a-z0-9]*)?/gi,
] as const;

export const API_VERSIONING_PATTERNS = [
  /\/api\/v(\d+)\//gi,
  /\/v(\d+)\//gi,
  /['"`](?:Accept-Version|X-API-Version)['"`]/gi,
] as const;

export const ROUTE_PARAMETER_PATTERNS = {
  express: /:([a-zA-Z][a-zA-Z0-9]*)/g,
  nextjsDynamic: /\[([a-zA-Z][a-zA-Z0-9]*)\]/g,
  nextjsCatchAll: /\[\.\.\.([a-zA-Z][a-zA-Z0-9]*)\]/g,
  nextjsOptionalCatchAll: /\[\[\.\.\.([a-zA-Z][a-zA-Z0-9]*)\]\]/g,
} as const;

export const PLURAL_RESOURCES = new Set([
  'users', 'posts', 'comments', 'articles', 'products', 'orders',
  'items', 'categories', 'tags', 'files', 'images', 'documents',
  'messages', 'notifications', 'events', 'tasks', 'projects',
  'teams', 'members', 'roles', 'permissions', 'settings',
  'accounts', 'profiles', 'sessions', 'tokens', 'keys',
  'logs', 'metrics', 'reports', 'analytics', 'dashboards',
]);

export const SINGULAR_RESOURCES = new Set([
  'user', 'post', 'comment', 'article', 'product', 'order',
  'item', 'category', 'tag', 'file', 'image', 'document',
  'message', 'notification', 'event', 'task', 'project',
  'team', 'member', 'role', 'permission', 'setting',
  'account', 'profile', 'session', 'token', 'key',
  'log', 'metric', 'report', 'analytic', 'dashboard',
]);

export const MAX_NESTING_DEPTH = 4;

export const EXCLUDED_FILE_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /\.stories\.[jt]sx?$/,
  /\.d\.ts$/,
  /node_modules\//,
];


// ============================================================================
// Helper Functions
// ============================================================================

export function shouldExcludeFile(filePath: string): boolean {
  return EXCLUDED_FILE_PATTERNS.some(pattern => pattern.test(filePath));
}

export function detectCasing(segment: string): UrlCasingConvention {
  if (segment.startsWith(':') || segment.startsWith('[')) {
    return 'lowercase';
  }
  if (segment.includes('-')) {
    return 'kebab-case';
  }
  if (segment.includes('_')) {
    return 'snake_case';
  }
  if (/[A-Z]/.test(segment) && /[a-z]/.test(segment)) {
    return 'camelCase';
  }
  return 'lowercase';
}

export function isPlural(resource: string): boolean {
  const normalized = resource.toLowerCase().replace(/[-_]/g, '');
  return PLURAL_RESOURCES.has(normalized) || normalized.endsWith('s');
}

export function isSingular(resource: string): boolean {
  const normalized = resource.toLowerCase().replace(/[-_]/g, '');
  return SINGULAR_RESOURCES.has(normalized);
}

export function toPlural(singular: string): string {
  if (singular.endsWith('y') && !/[aeiou]y$/.test(singular)) {
    return singular.slice(0, -1) + 'ies';
  }
  if (singular.endsWith('s') || singular.endsWith('x') || singular.endsWith('ch') || singular.endsWith('sh')) {
    return singular + 'es';
  }
  return singular + 's';
}

export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
}

export function calculateNestingDepth(routePath: string): number {
  const segments = routePath.replace(/^\//, '').split('/').filter(Boolean);
  let depth = 0;
  for (const segment of segments) {
    if (/^v\d+$/.test(segment) || segment === 'api') {
      continue;
    }
    if (segment.startsWith(':') || segment.startsWith('[')) {
      continue;
    }
    depth++;
  }
  return depth;
}

export function extractRouteParameters(routePath: string): string[] {
  const params: string[] = [];
  let match;
  const expressRegex = new RegExp(ROUTE_PARAMETER_PATTERNS.express.source, 'g');
  while ((match = expressRegex.exec(routePath)) !== null) {
    if (match[1]) {params.push(match[1]);}
  }
  const nextjsRegex = new RegExp(ROUTE_PARAMETER_PATTERNS.nextjsDynamic.source, 'g');
  while ((match = nextjsRegex.exec(routePath)) !== null) {
    if (match[1]) {params.push(match[1]);}
  }
  return params;
}


function isInsideComment(content: string, index: number): boolean {
  const beforeIndex = content.slice(0, index);
  const lastNewline = beforeIndex.lastIndexOf('\n');
  const currentLine = beforeIndex.slice(lastNewline + 1);
  if (currentLine.includes('//')) {
    const commentStart = currentLine.indexOf('//');
    const positionInLine = index - lastNewline - 1;
    if (positionInLine > commentStart) {
      return true;
    }
  }
  const lastBlockCommentStart = beforeIndex.lastIndexOf('/*');
  const lastBlockCommentEnd = beforeIndex.lastIndexOf('*/');
  if (lastBlockCommentStart > lastBlockCommentEnd) {
    return true;
  }
  return false;
}

export function detectExpressRoutes(content: string, file: string): RoutePatternInfo[] {
  const results: RoutePatternInfo[] = [];
  const lines = content.split('\n');

  for (const pattern of EXPRESS_ROUTE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {
        continue;
      }
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;
      const httpMethod = match[1]?.toUpperCase();
      const routePath = match[2] || match[1];
      results.push({
        type: 'express-route',
        file,
        line: lineNumber,
        column,
        matchedText: match[0],
        routePath,
        httpMethod,
        parameters: extractRouteParameters(routePath || ''),
        context: lines[lineNumber - 1] || '',
      });
    }
  }
  return results;
}


export function detectNextjsAppRouterPatterns(content: string, file: string): RoutePatternInfo[] {
  const results: RoutePatternInfo[] = [];
  if (!NEXTJS_APP_ROUTER_PATTERN.test(file)) {
    return results;
  }
  const routeMatch = file.match(/\/app(\/(?:api\/)?[^/]+(?:\/[^/]+)*?)\/route\.[jt]sx?$/);
  if (routeMatch?.[1]) {
    const routePath = routeMatch[1];
    results.push({
      type: 'nextjs-app-router',
      file,
      line: 1,
      column: 1,
      matchedText: file,
      routePath,
      parameters: extractRouteParameters(routePath),
      context: `Next.js App Router: ${routePath}`,
    });
  }
  const httpMethodPattern = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/gi;
  const lines = content.split('\n');
  let match;
  while ((match = httpMethodPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const lineNumber = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;
    results.push({
      type: 'nextjs-app-router',
      file,
      line: lineNumber,
      column,
      matchedText: match[0],
      httpMethod: match[1]?.toUpperCase(),
      context: lines[lineNumber - 1] || '',
    });
  }
  return results;
}

export function detectNextjsPagesRouterPatterns(_content: string, file: string): RoutePatternInfo[] {
  const results: RoutePatternInfo[] = [];
  if (!NEXTJS_PAGES_ROUTER_PATTERN.test(file)) {
    return results;
  }
  const routeMatch = file.match(/\/pages\/api(\/[^.]+)\.[jt]sx?$/);
  if (routeMatch?.[1]) {
    const routePath = '/api' + routeMatch[1];
    results.push({
      type: 'nextjs-pages-router',
      file,
      line: 1,
      column: 1,
      matchedText: file,
      routePath,
      parameters: extractRouteParameters(routePath),
      context: `Next.js Pages Router: ${routePath}`,
    });
  }
  return results;
}


export function detectVersioningPatterns(content: string, file: string): RoutePatternInfo[] {
  const results: RoutePatternInfo[] = [];
  const lines = content.split('\n');
  for (const pattern of API_VERSIONING_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (isInsideComment(content, match.index)) {
        continue;
      }
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;
      results.push({
        type: 'versioned-api',
        file,
        line: lineNumber,
        column,
        matchedText: match[0],
        context: lines[lineNumber - 1] || '',
      });
    }
  }
  return results;
}

export function detectUrlLiterals(content: string, file: string): RoutePatternInfo[] {
  const results: RoutePatternInfo[] = [];
  const lines = content.split('\n');
  const urlPattern = /['"`](\/(?:api\/)?[a-zA-Z][a-zA-Z0-9/_:-]*(?:\?[^'"`]*)?)['"`]/g;
  let match;
  while ((match = urlPattern.exec(content)) !== null) {
    if (isInsideComment(content, match.index)) {
      continue;
    }
    const routePath = match[1];
    if (!routePath) {continue;}
    if (!routePath.includes('/api/') && !routePath.startsWith('/v') && !routePath.includes(':')) {
      continue;
    }
    const beforeMatch = content.slice(0, match.index);
    const lineNumber = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = match.index - lastNewline;
    results.push({
      type: 'restful-route',
      file,
      line: lineNumber,
      column,
      matchedText: match[0],
      routePath,
      parameters: extractRouteParameters(routePath),
      context: lines[lineNumber - 1] || '',
    });
  }
  return results;
}


export function detectCasingViolations(
  routePatterns: RoutePatternInfo[],
  file: string
): RouteViolationInfo[] {
  const violations: RouteViolationInfo[] = [];
  const casingCounts: Record<UrlCasingConvention, number> = {
    'kebab-case': 0,
    'camelCase': 0,
    'snake_case': 0,
    'lowercase': 0,
  };
  for (const pattern of routePatterns) {
    if (!pattern.routePath) {continue;}
    const segments = pattern.routePath.split('/').filter(Boolean);
    for (const segment of segments) {
      // Skip path parameters entirely - they follow language conventions, not URL conventions
      if (segment.startsWith(':') || segment.startsWith('[') || 
          segment.startsWith('{') || /^v\d+$/.test(segment) || segment === 'api') {
        continue;
      }
      const casing = detectCasing(segment);
      casingCounts[casing]++;
    }
  }
  
  // Combine kebab-case and lowercase counts since they're compatible
  // (kebab-case IS lowercase, just with hyphens for multi-word segments)
  const lowercaseCompatible = casingCounts['lowercase'] + casingCounts['kebab-case'];
  
  let dominantCasing: UrlCasingConvention = 'kebab-case';
  let maxCount = lowercaseCompatible;
  
  // Only flag camelCase or snake_case if they're more common than lowercase/kebab-case
  if (casingCounts['camelCase'] > maxCount) {
    maxCount = casingCounts['camelCase'];
    dominantCasing = 'camelCase';
  }
  if (casingCounts['snake_case'] > maxCount) {
    maxCount = casingCounts['snake_case'];
    dominantCasing = 'snake_case';
  }
  
  // If lowercase/kebab-case is dominant, don't flag either as violations
  if (dominantCasing === 'kebab-case') {
    // Only flag camelCase and snake_case as violations
    for (const pattern of routePatterns) {
      if (!pattern.routePath) {continue;}
      const segments = pattern.routePath.split('/').filter(Boolean);
      for (const segment of segments) {
        // Skip path parameters entirely
        if (segment.startsWith(':') || segment.startsWith('[') || 
            segment.startsWith('{') || /^v\d+$/.test(segment) || segment === 'api') {
          continue;
        }
        const casing = detectCasing(segment);
        // Only flag camelCase and snake_case, not lowercase vs kebab-case
        if (casing === 'camelCase' || casing === 'snake_case') {
          violations.push({
            type: 'inconsistent-casing',
            file,
            line: pattern.line,
            column: pattern.column,
            endLine: pattern.line,
            endColumn: pattern.column + pattern.matchedText.length,
            value: segment,
            issue: `URL segment '${segment}' uses ${casing} but project uses kebab-case/lowercase`,
            suggestedFix: toKebabCase(segment),
            lineContent: pattern.context || '',
          });
        }
      }
    }
  } else {
    // If camelCase or snake_case is dominant, flag everything else
    for (const pattern of routePatterns) {
      if (!pattern.routePath) {continue;}
      const segments = pattern.routePath.split('/').filter(Boolean);
      for (const segment of segments) {
        if (segment.startsWith(':') || segment.startsWith('[') || 
            segment.startsWith('{') || /^v\d+$/.test(segment) || segment === 'api') {
          continue;
        }
        const casing = detectCasing(segment);
        if (casing !== dominantCasing && casing !== 'lowercase') {
          violations.push({
            type: 'inconsistent-casing',
            file,
            line: pattern.line,
            column: pattern.column,
            endLine: pattern.line,
            endColumn: pattern.column + pattern.matchedText.length,
            value: segment,
            issue: `URL segment '${segment}' uses ${casing} but project uses ${dominantCasing}`,
            suggestedFix: toKebabCase(segment),
            lineContent: pattern.context || '',
          });
        }
      }
    }
  }
  return violations;
}


export function detectNamingViolations(
  routePatterns: RoutePatternInfo[],
  file: string
): RouteViolationInfo[] {
  const violations: RouteViolationInfo[] = [];
  let pluralCount = 0;
  let singularCount = 0;
  for (const pattern of routePatterns) {
    if (!pattern.routePath) {continue;}
    const segments = pattern.routePath.split('/').filter(Boolean);
    for (const segment of segments) {
      if (segment.startsWith(':') || segment.startsWith('[') || 
          /^v\d+$/.test(segment) || segment === 'api') {
        continue;
      }
      if (isPlural(segment)) {
        pluralCount++;
      } else if (isSingular(segment)) {
        singularCount++;
      }
    }
  }
  const usePlural = pluralCount >= singularCount;
  for (const pattern of routePatterns) {
    if (!pattern.routePath) {continue;}
    const segments = pattern.routePath.split('/').filter(Boolean);
    for (const segment of segments) {
      if (segment.startsWith(':') || segment.startsWith('[') || 
          /^v\d+$/.test(segment) || segment === 'api') {
        continue;
      }
      if (usePlural && isSingular(segment)) {
        violations.push({
          type: 'inconsistent-naming',
          file,
          line: pattern.line,
          column: pattern.column,
          endLine: pattern.line,
          endColumn: pattern.column + pattern.matchedText.length,
          value: segment,
          issue: `Resource '${segment}' should use plural form for RESTful consistency`,
          suggestedFix: toPlural(segment),
          lineContent: pattern.context || '',
        });
      }
    }
  }
  return violations;
}

/**
 * Routes that are exempt from versioning requirements
 * These are typically framework-provided routes or special endpoints
 */
const VERSIONING_EXEMPT_ROUTES = new Set([
  '/api/docs',
  '/api/redoc',
  '/api/openapi.json',
  '/api/swagger',
  '/api/health',
  '/api/healthz',
  '/api/ready',
  '/api/readyz',
  '/api/metrics',
  '/health',
  '/healthz',
  '/ready',
  '/readyz',
  '/metrics',
]);

export function detectMissingVersioning(
  routePatterns: RoutePatternInfo[],
  file: string
): RouteViolationInfo[] {
  const violations: RouteViolationInfo[] = [];
  const hasVersioning = routePatterns.some(p => 
    p.type === 'versioned-api' || 
    (p.routePath && /\/v\d+\//.test(p.routePath))
  );
  if (hasVersioning) {
    for (const pattern of routePatterns) {
      if (!pattern.routePath) {continue;}
      
      // Skip if already versioned
      if (/\/v\d+\//.test(pattern.routePath)) {
        continue;
      }
      
      // Skip if it's a version prefix assignment (e.g., prefix="/api/v1")
      if (/\/api\/v\d+$/.test(pattern.routePath)) {
        continue;
      }
      
      // Skip non-API routes
      if (!pattern.routePath.includes('/api/')) {
        continue;
      }
      
      // Skip exempt routes (docs, health checks, etc.)
      if (VERSIONING_EXEMPT_ROUTES.has(pattern.routePath)) {
        continue;
      }
      
      // Skip if the context shows this is a router prefix assignment
      if (pattern.context && /prefix\s*=/.test(pattern.context)) {
        continue;
      }
      
      violations.push({
        type: 'missing-versioning',
        file,
        line: pattern.line,
        column: pattern.column,
        endLine: pattern.line,
        endColumn: pattern.column + pattern.matchedText.length,
        value: pattern.routePath,
        issue: `API route '${pattern.routePath}' is missing version prefix`,
        suggestedFix: pattern.routePath.replace('/api/', '/api/v1/'),
        lineContent: pattern.context || '',
      });
    }
  }
  return violations;
}


export function detectDeepNestingViolations(
  routePatterns: RoutePatternInfo[],
  file: string
): RouteViolationInfo[] {
  const violations: RouteViolationInfo[] = [];
  for (const pattern of routePatterns) {
    if (!pattern.routePath) {continue;}
    const depth = calculateNestingDepth(pattern.routePath);
    if (depth > MAX_NESTING_DEPTH) {
      violations.push({
        type: 'deeply-nested',
        file,
        line: pattern.line,
        column: pattern.column,
        endLine: pattern.line,
        endColumn: pattern.column + pattern.matchedText.length,
        value: pattern.routePath,
        issue: `Route '${pattern.routePath}' has ${depth} levels of nesting (max ${MAX_NESTING_DEPTH})`,
        suggestedFix: 'Consider flattening the route structure or using query parameters',
        lineContent: pattern.context || '',
      });
    }
  }
  return violations;
}

export function analyzeRouteStructure(content: string, file: string): RouteStructureAnalysis {
  if (shouldExcludeFile(file)) {
    return {
      routePatterns: [],
      violations: [],
      usesRestfulPatterns: false,
      usesVersioning: false,
      detectedCasing: null,
      usesPluralResources: false,
      patternAdherenceConfidence: 1.0,
    };
  }
  const expressRoutes = detectExpressRoutes(content, file);
  const nextjsAppRoutes = detectNextjsAppRouterPatterns(content, file);
  const nextjsPagesRoutes = detectNextjsPagesRouterPatterns(content, file);
  const versioningPatterns = detectVersioningPatterns(content, file);
  const urlLiterals = detectUrlLiterals(content, file);
  const routePatterns = [
    ...expressRoutes,
    ...nextjsAppRoutes,
    ...nextjsPagesRoutes,
    ...versioningPatterns,
    ...urlLiterals,
  ];
  const casingViolations = detectCasingViolations(routePatterns, file);
  const namingViolations = detectNamingViolations(routePatterns, file);
  const versioningViolations = detectMissingVersioning(routePatterns, file);
  const nestingViolations = detectDeepNestingViolations(routePatterns, file);
  const violations = [
    ...casingViolations,
    ...namingViolations,
    ...versioningViolations,
    ...nestingViolations,
  ];

  const usesRestfulPatterns = routePatterns.some(p => 
    p.type === 'restful-route' || p.type === 'express-route'
  );
  const usesVersioning = versioningPatterns.length > 0 || 
    routePatterns.some(p => p.routePath && /\/v\d+\//.test(p.routePath));
  const casingCounts: Record<UrlCasingConvention, number> = {
    'kebab-case': 0,
    'camelCase': 0,
    'snake_case': 0,
    'lowercase': 0,
  };
  for (const pattern of routePatterns) {
    if (!pattern.routePath) {continue;}
    const segments = pattern.routePath.split('/').filter(Boolean);
    for (const segment of segments) {
      if (!segment.startsWith(':') && !segment.startsWith('[') && 
          !/^v\d+$/.test(segment) && segment !== 'api') {
        casingCounts[detectCasing(segment)]++;
      }
    }
  }
  let detectedCasing: UrlCasingConvention | null = null;
  let maxCasingCount = 0;
  for (const [casing, count] of Object.entries(casingCounts)) {
    if (count > maxCasingCount) {
      maxCasingCount = count;
      detectedCasing = casing as UrlCasingConvention;
    }
  }
  let pluralCount = 0;
  let singularCount = 0;
  for (const pattern of routePatterns) {
    if (!pattern.routePath) {continue;}
    const segments = pattern.routePath.split('/').filter(Boolean);
    for (const segment of segments) {
      if (isPlural(segment)) {pluralCount++;}
      else if (isSingular(segment)) {singularCount++;}
    }
  }
  const usesPluralResources = pluralCount >= singularCount;
  const hasPatterns = routePatterns.length > 0;
  const hasViolations = violations.length > 0;
  let patternAdherenceConfidence = 1.0;
  if (hasPatterns && hasViolations) {
    patternAdherenceConfidence = Math.max(0, 1 - (violations.length / routePatterns.length));
  } else if (!hasPatterns) {
    patternAdherenceConfidence = 0.5;
  }
  return {
    routePatterns,
    violations,
    usesRestfulPatterns,
    usesVersioning,
    detectedCasing,
    usesPluralResources,
    patternAdherenceConfidence,
  };
}


// ============================================================================
// Route Structure Detector Class
// ============================================================================

export class RouteStructureDetector extends RegexDetector {
  readonly id = 'api/route-structure';
  readonly category = 'api' as const;
  readonly subcategory = 'route-structure';
  readonly name = 'Route Structure Detector';
  readonly description = 'Detects route URL structure patterns and flags inconsistencies';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    const analysis = analyzeRouteStructure(context.content, context.file);
    if (analysis.usesRestfulPatterns) {
      patterns.push(this.createRestfulPattern(context.file, analysis));
    }
    if (analysis.usesVersioning) {
      patterns.push(this.createVersioningPattern(context.file, analysis));
    }
    const routeTypes = new Set(analysis.routePatterns.map(p => p.type));
    for (const routeType of routeTypes) {
      const firstOfType = analysis.routePatterns.find(p => p.type === routeType);
      if (firstOfType) {
        patterns.push({
          patternId: `${this.id}/${routeType}`,
          location: {
            file: context.file,
            line: firstOfType.line,
            column: firstOfType.column,
          },
          confidence: 1.0,
          isOutlier: false,
        });
      }
    }
    for (const violation of analysis.violations) {
      violations.push(this.createViolation(violation));
    }
    return this.createResult(patterns, violations, analysis.patternAdherenceConfidence);
  }

  private createRestfulPattern(file: string, analysis: RouteStructureAnalysis): PatternMatch {
    const restfulPatterns = analysis.routePatterns.filter(
      p => p.type === 'restful-route' || p.type === 'express-route'
    );
    const firstPattern = restfulPatterns[0];
    return {
      patternId: `${this.id}/restful`,
      location: {
        file,
        line: firstPattern?.line || 1,
        column: firstPattern?.column || 1,
      },
      confidence: 1.0,
      isOutlier: false,
    };
  }

  private createVersioningPattern(file: string, analysis: RouteStructureAnalysis): PatternMatch {
    const versionedPatterns = analysis.routePatterns.filter(p => p.type === 'versioned-api');
    const firstPattern = versionedPatterns[0];
    return {
      patternId: `${this.id}/versioning`,
      location: {
        file,
        line: firstPattern?.line || 1,
        column: firstPattern?.column || 1,
      },
      confidence: 1.0,
      isOutlier: false,
    };
  }


  private createViolation(info: RouteViolationInfo): Violation {
    const violation: Violation = {
      id: `${this.id}-${info.file}-${info.line}-${info.column}`,
      patternId: this.id,
      severity: info.type === 'deeply-nested' ? 'warning' : 'info',
      file: info.file,
      range: {
        start: { line: info.line - 1, character: info.column - 1 },
        end: { line: info.endLine - 1, character: info.endColumn - 1 },
      },
      message: info.issue,
      explanation: this.getExplanation(info.type),
      expected: info.suggestedFix || 'Follow established route patterns',
      actual: info.value,
      aiExplainAvailable: true,
      aiFixAvailable: !!info.suggestedFix,
      firstSeen: new Date(),
      occurrences: 1,
    };
    if (info.suggestedFix) {
      const quickFix = this.createQuickFixForViolation(info);
      if (quickFix) {
        violation.quickFix = quickFix;
      }
    }
    return violation;
  }

  private getExplanation(type: RouteViolationType): string {
    const explanations: Record<RouteViolationType, string> = {
      'inconsistent-casing': 
        'Consistent URL casing improves API discoverability and reduces errors. ' +
        'Choose one convention (kebab-case is recommended) and use it throughout.',
      'inconsistent-naming': 
        'RESTful APIs should use plural nouns for resource collections (e.g., /users, /posts). ' +
        'This makes the API more intuitive and follows REST conventions.',
      'missing-versioning': 
        'API versioning allows you to make breaking changes without affecting existing clients. ' +
        'Use URL path versioning (e.g., /api/v1/) for consistency.',
      'deeply-nested': 
        'Deeply nested routes are harder to understand and maintain. ' +
        'Consider flattening the structure or using query parameters for filtering.',
      'non-restful': 
        'RESTful URL patterns use nouns for resources and HTTP methods for actions. ' +
        'Avoid verbs in URLs (e.g., use DELETE /users/:id instead of POST /users/:id/delete).',
    };
    return explanations[type] || 'Follow established route structure patterns for consistency.';
  }


  private createQuickFixForViolation(info: RouteViolationInfo): QuickFix | undefined {
    if (!info.suggestedFix) {
      return undefined;
    }
    return {
      title: `Fix: ${info.suggestedFix}`,
      kind: 'quickfix',
      edit: {
        changes: {
          [info.file]: [
            {
              range: {
                start: { line: info.line - 1, character: info.column - 1 },
                end: { line: info.endLine - 1, character: info.endColumn - 1 },
              },
              newText: info.lineContent.replace(info.value, info.suggestedFix),
            },
          ],
        },
      },
      isPreferred: true,
      confidence: 0.7,
      preview: `Replace '${info.value}' with '${info.suggestedFix}'`,
    };
  }

  generateQuickFix(violation: Violation): QuickFix | null {
    if (!violation.patternId.startsWith('api/route-structure')) {
      return null;
    }
    if (violation.expected && violation.expected !== 'Follow established route patterns') {
      return {
        title: `Fix: ${violation.expected}`,
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
        confidence: 0.7,
        preview: `Replace '${violation.actual}' with '${violation.expected}'`,
      };
    }
    return null;
  }
}

export function createRouteStructureDetector(): RouteStructureDetector {
  return new RouteStructureDetector();
}
