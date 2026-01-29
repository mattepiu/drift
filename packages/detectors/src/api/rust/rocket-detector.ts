/**
 * Rocket Framework Detector
 *
 * Detects Rocket web framework patterns in Rust code.
 * 
 * Patterns detected:
 * - Route attributes (#[get], #[post], etc.)
 * - Request guards
 * - Fairings (middleware)
 * - Managed state
 * - Form handling
 * - JSON responses
 */

import type { PatternCategory } from 'driftdetect-core';

/**
 * Pattern match for Rust detectors
 */
export interface RustPatternMatch {
  id: string;
  name: string;
  category: PatternCategory;
  file: string;
  line: number;
  column: number;
  context: string;
  confidence: number;
  framework: string;
}

export interface RocketDetectorOptions {
  includeGuards?: boolean;
  includeFairings?: boolean;
}

export interface RocketRoute {
  method: string;
  path: string;
  handler: string;
  file: string;
  line: number;
  guards: string[];
  responseType?: string;
}

export interface RocketFairing {
  name: string;
  file: string;
  line: number;
  hooks: string[];
}

export interface RocketDetectionResult {
  routes: RocketRoute[];
  fairings: RocketFairing[];
  guards: RustPatternMatch[];
  managedState: RustPatternMatch[];
  patterns: RustPatternMatch[];
}

/**
 * Detect Rocket framework patterns
 */
export function detectRocketPatterns(
  source: string,
  filePath: string,
  options: RocketDetectorOptions = {}
): RocketDetectionResult {
  const routes: RocketRoute[] = [];
  const fairings: RocketFairing[] = [];
  const guards: RustPatternMatch[] = [];
  const managedState: RustPatternMatch[] = [];
  const patterns: RustPatternMatch[] = [];

  // Detect route attributes
  const routePattern = /#\[(get|post|put|delete|patch|head|options)\s*\(\s*"([^"]+)"(?:\s*,\s*([^)]+))?\s*\)\]/gi;
  let match;
  
  while ((match = routePattern.exec(source)) !== null) {
    const method = match[1]?.toUpperCase() ?? 'GET';
    const path = match[2] ?? '/';
    const line = getLineNumber(source, match.index);
    
    // Find handler function
    const afterAttr = source.slice(match.index + match[0].length);
    const handlerMatch = afterAttr.match(/(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/);
    const handler = handlerMatch?.[1] ?? 'unknown';

    // Extract guards from function parameters
    const fnMatch = afterAttr.match(/fn\s+\w+\s*\(([^)]*)\)/);
    const fnParams = fnMatch?.[1] ?? '';
    const extractedGuards = extractGuards(fnParams);

    routes.push({
      method,
      path,
      handler,
      file: filePath,
      line,
      guards: extractedGuards,
    });

    patterns.push({
      id: `rocket-route-${filePath}:${line}`,
      name: 'rocket-route',
      category: 'api' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: `${method} ${path} -> ${handler}`,
      confidence: 0.95,
      framework: 'rocket',
    });
  }

  // Detect request guards
  if (options.includeGuards !== false) {
    const guardPattern = /#\[rocket::async_trait\]\s*impl\s*<'r>\s*FromRequest<'r>\s*for\s+(\w+)/g;
    while ((match = guardPattern.exec(source)) !== null) {
      const guardName = match[1] ?? 'unknown';
      const line = getLineNumber(source, match.index);

      guards.push({
        id: `rocket-guard-${filePath}:${line}`,
        name: 'rocket-request-guard',
        category: 'auth' as PatternCategory,
        file: filePath,
        line,
        column: 0,
        context: `Request guard: ${guardName}`,
        confidence: 0.9,
        framework: 'rocket',
      });
    }
  }

  // Detect fairings (middleware)
  if (options.includeFairings !== false) {
    const fairingPattern = /impl\s+Fairing\s+for\s+(\w+)/g;
    while ((match = fairingPattern.exec(source)) !== null) {
      const fairingName = match[1] ?? 'unknown';
      const line = getLineNumber(source, match.index);

      // Find fairing hooks
      const afterImpl = source.slice(match.index);
      const hooks: string[] = [];
      if (afterImpl.includes('on_ignite')) {hooks.push('on_ignite');}
      if (afterImpl.includes('on_liftoff')) {hooks.push('on_liftoff');}
      if (afterImpl.includes('on_request')) {hooks.push('on_request');}
      if (afterImpl.includes('on_response')) {hooks.push('on_response');}
      if (afterImpl.includes('on_shutdown')) {hooks.push('on_shutdown');}

      fairings.push({
        name: fairingName,
        file: filePath,
        line,
        hooks,
      });

      patterns.push({
        id: `rocket-fairing-${filePath}:${line}`,
        name: 'rocket-fairing',
        category: 'api' as PatternCategory,
        file: filePath,
        line,
        column: 0,
        context: `Fairing: ${fairingName} (${hooks.join(', ')})`,
        confidence: 0.9,
        framework: 'rocket',
      });
    }
  }

  // Detect managed state
  const statePattern = /\.manage\s*\(\s*([^)]+)\s*\)/g;
  while ((match = statePattern.exec(source)) !== null) {
    const stateExpr = match[1]?.trim() ?? '';
    const line = getLineNumber(source, match.index);

    managedState.push({
      id: `rocket-state-${filePath}:${line}`,
      name: 'rocket-managed-state',
      category: 'config' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: `Managed state: ${stateExpr}`,
      confidence: 0.85,
      framework: 'rocket',
    });
  }

  // Detect JSON responses
  const jsonPattern = /Json\s*<\s*([^>]+)\s*>/g;
  while ((match = jsonPattern.exec(source)) !== null) {
    const jsonType = match[1]?.trim() ?? '';
    const line = getLineNumber(source, match.index);

    patterns.push({
      id: `rocket-json-${filePath}:${line}`,
      name: 'rocket-json-response',
      category: 'api' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: `JSON response: ${jsonType}`,
      confidence: 0.8,
      framework: 'rocket',
    });
  }

  // Detect form handling
  const formPattern = /Form\s*<\s*([^>]+)\s*>/g;
  while ((match = formPattern.exec(source)) !== null) {
    const formType = match[1]?.trim() ?? '';
    const line = getLineNumber(source, match.index);

    patterns.push({
      id: `rocket-form-${filePath}:${line}`,
      name: 'rocket-form-handling',
      category: 'api' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: `Form handling: ${formType}`,
      confidence: 0.8,
      framework: 'rocket',
    });
  }

  return {
    routes,
    fairings,
    guards,
    managedState,
    patterns,
  };
}

/**
 * Extract guards from function parameters
 */
function extractGuards(params: string): string[] {
  const guards: string[] = [];
  
  // Common Rocket guards
  const guardTypes = [
    'State', 'Cookies', 'ContentType', 'Accept', 'Origin',
    'Host', 'RawStr', 'CookieJar', 'Flash', 'Shutdown',
  ];

  for (const guardType of guardTypes) {
    if (params.includes(guardType)) {
      guards.push(guardType);
    }
  }

  // Custom guards (types that implement FromRequest)
  const customGuardPattern = /(\w+)\s*:/g;
  let match;
  while ((match = customGuardPattern.exec(params)) !== null) {
    const paramName = match[1];
    if (paramName && !['self', 'mut'].includes(paramName)) {
      // Check if it looks like a guard (PascalCase, not a primitive)
      if (/^[A-Z]/.test(paramName) && !guardTypes.includes(paramName)) {
        guards.push(paramName);
      }
    }
  }

  return guards;
}

/**
 * Get line number from character index
 */
function getLineNumber(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

/**
 * Check if source uses Rocket framework
 */
export function isRocketProject(source: string): boolean {
  return source.includes('rocket::') ||
         source.includes('use rocket') ||
         source.includes('#[rocket::main]') ||
         source.includes('#[launch]');
}
