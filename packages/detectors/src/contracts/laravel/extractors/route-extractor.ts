/**
 * Laravel Route Extractor
 *
 * Extracts route definitions from Laravel route files.
 * Handles Route:: facade calls, route groups, and resource routes.
 *
 * @module contracts/laravel/extractors/route-extractor
 */

import type {
  LaravelRouteInfo,
  LaravelRouteGroup,
  LaravelHttpMethod,
  RouteParameter,
} from '../types.js';

// ============================================================================
// Regex Patterns
// ============================================================================

/**
 * Pattern to match Route::method() calls
 * Route::get('/path', [Controller::class, 'method'])
 * Route::get('/path', 'Controller@method')
 * Route::get('/path', function() {})
 */
const ROUTE_METHOD_PATTERN = /Route::(get|post|put|patch|delete|options|head|any|match)\s*\(\s*['"]([^'"]+)['"]\s*,\s*([^)]+)\)/gi;

/**
 * Pattern to match Route::resource() and Route::apiResource()
 */
const RESOURCE_ROUTE_PATTERN = /Route::(resource|apiResource)\s*\(\s*['"]([^'"]+)['"]\s*,\s*([^)]+)\)/gi;

/**
 * Pattern to match Route::group()
 */
const ROUTE_GROUP_PATTERN = /Route::group\s*\(\s*(\[[^\]]+\])\s*,\s*function\s*\([^)]*\)\s*\{/gi;

/**
 * Pattern to match middleware chain
 * Route::middleware(['auth', 'verified'])->
 */
// const MIDDLEWARE_CHAIN_PATTERN = /Route::middleware\s*\(\s*\[([^\]]+)\]\s*\)\s*->/gi;

/**
 * Pattern to match prefix chain
 * Route::prefix('api')->
 */
// const PREFIX_CHAIN_PATTERN = /Route::prefix\s*\(\s*['"]([^'"]+)['"]\s*\)\s*->/gi;

/**
 * Pattern to match ->name() chain
 */
const NAME_CHAIN_PATTERN = /->name\s*\(\s*['"]([^'"]+)['"]\s*\)/gi;

/**
 * Pattern to match ->middleware() chain
 */
const MIDDLEWARE_APPEND_PATTERN = /->middleware\s*\(\s*\[?([^\])]+)\]?\s*\)/gi;

/**
 * Pattern to match ->where() constraints
 */
const WHERE_PATTERN = /->where\s*\(\s*['"](\w+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/gi;

/**
 * Pattern to extract route parameters from URI
 */
const PARAM_PATTERN = /\{(\w+)(\?)?\}/g;

/**
 * Pattern to match controller array syntax
 * [Controller::class, 'method']
 */
const CONTROLLER_ARRAY_PATTERN = /\[\s*([A-Z]\w+)::class\s*,\s*['"](\w+)['"]\s*\]/;

/**
 * Pattern to match controller string syntax
 * 'Controller@method'
 */
const CONTROLLER_STRING_PATTERN = /['"]([A-Z]\w+)@(\w+)['"]/;

// ============================================================================
// Route Extractor
// ============================================================================

/**
 * Extracts Laravel route definitions
 */
export class RouteExtractor {
  /**
   * Extract all routes from content
   *
   * @param content - PHP source code
   * @param file - File path
   * @returns Array of extracted routes
   */
  extract(content: string, file: string): LaravelRouteInfo[] {
    const routes: LaravelRouteInfo[] = [];

    // Extract simple routes
    routes.push(...this.extractSimpleRoutes(content, file));

    // Extract resource routes
    routes.push(...this.extractResourceRoutes(content, file));

    return routes;
  }

  /**
   * Extract route groups
   *
   * @param content - PHP source code
   * @param file - File path
   * @returns Array of route groups
   */
  extractGroups(content: string, _file: string): LaravelRouteGroup[] {
    const groups: LaravelRouteGroup[] = [];
    ROUTE_GROUP_PATTERN.lastIndex = 0;

    let match;
    while ((match = ROUTE_GROUP_PATTERN.exec(content)) !== null) {
      const optionsStr = match[1] || '';
      const line = this.getLineNumber(content, match.index);

      const group: LaravelRouteGroup = {
        prefix: this.extractGroupOption(optionsStr, 'prefix'),
        middleware: this.extractGroupMiddleware(optionsStr),
        namespace: this.extractGroupOption(optionsStr, 'namespace'),
        as: this.extractGroupOption(optionsStr, 'as'),
        routes: [], // Would need to parse nested content
        line,
      };

      groups.push(group);
    }

    return groups;
  }

  /**
   * Check if content contains Laravel routes
   */
  hasRoutes(content: string): boolean {
    return content.includes('Route::') && (
      /Route::(get|post|put|patch|delete|resource|apiResource)/i.test(content)
    );
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Extract simple route definitions
   */
  private extractSimpleRoutes(content: string, file: string): LaravelRouteInfo[] {
    const routes: LaravelRouteInfo[] = [];
    ROUTE_METHOD_PATTERN.lastIndex = 0;

    let match;
    while ((match = ROUTE_METHOD_PATTERN.exec(content)) !== null) {
      const method = match[1]?.toUpperCase() as LaravelHttpMethod;
      const uri = match[2] || '';
      const handlerStr = match[3] || '';
      const line = this.getLineNumber(content, match.index);

      // Parse handler
      const { controller, action, isClosure } = this.parseHandler(handlerStr);

      // Extract route parameters
      const parameters = this.extractParameters(uri);

      // Look for chained methods after this route
      const afterRoute = content.substring(match.index + match[0].length, match.index + match[0].length + 500);
      const name = this.extractChainedName(afterRoute);
      const middleware = this.extractChainedMiddleware(afterRoute);
      const whereConstraints = this.extractWhereConstraints(afterRoute);

      // Handle Route::any and Route::match
      let methods: LaravelHttpMethod[];
      if (method === 'ANY' as string) {
        methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
      } else if (method === 'MATCH' as string) {
        methods = this.extractMatchMethods(handlerStr);
      } else {
        methods = [method];
      }

      routes.push({
        methods,
        uri,
        controller: controller || null,
        action,
        isClosure,
        name,
        middleware,
        prefix: null, // Would need group context
        parameters,
        whereConstraints,
        file,
        line,
      });
    }

    return routes;
  }

  /**
   * Extract resource route definitions
   */
  private extractResourceRoutes(content: string, file: string): LaravelRouteInfo[] {
    const routes: LaravelRouteInfo[] = [];
    RESOURCE_ROUTE_PATTERN.lastIndex = 0;

    let match;
    while ((match = RESOURCE_ROUTE_PATTERN.exec(content)) !== null) {
      const resourceType = match[1]; // 'resource' or 'apiResource'
      const uri = match[2] || '';
      const controllerStr = match[3] || '';
      const line = this.getLineNumber(content, match.index);

      // Extract controller name
      const controllerMatch = controllerStr.match(/([A-Z]\w+)(?:::class)?/);
      const controller = controllerMatch ? controllerMatch[1] : null;

      // Generate routes for resource actions
      const isApi = resourceType === 'apiResource';
      const actions = isApi
        ? ['index', 'store', 'show', 'update', 'destroy']
        : ['index', 'create', 'store', 'show', 'edit', 'update', 'destroy'];

      const methodMap: Record<string, LaravelHttpMethod> = {
        index: 'GET',
        create: 'GET',
        store: 'POST',
        show: 'GET',
        edit: 'GET',
        update: 'PUT',
        destroy: 'DELETE',
      };

      for (const action of actions) {
        const isDetail = ['show', 'edit', 'update', 'destroy'].includes(action);
        const actionUri = isDetail ? `${uri}/{${this.singularize(uri)}}` : uri;
        const method = methodMap[action];

        if (method) {
          routes.push({
            methods: [method],
            uri: actionUri,
            controller: controller || null,
            action,
            isClosure: false,
            name: `${uri}.${action}`,
            middleware: [],
            prefix: null,
            parameters: isDetail ? [{ name: this.singularize(uri), optional: false, constraint: null }] : [],
            whereConstraints: {},
            file,
            line,
          });
        }
      }
    }

    return routes;
  }

  /**
   * Parse route handler
   */
  private parseHandler(handlerStr: string): {
    controller: string | null;
    action: string | null;
    isClosure: boolean;
  } {
    // Check for array syntax [Controller::class, 'method']
    const arrayMatch = handlerStr.match(CONTROLLER_ARRAY_PATTERN);
    if (arrayMatch) {
      return {
        controller: arrayMatch[1] || null,
        action: arrayMatch[2] || null,
        isClosure: false,
      };
    }

    // Check for string syntax 'Controller@method'
    const stringMatch = handlerStr.match(CONTROLLER_STRING_PATTERN);
    if (stringMatch) {
      return {
        controller: stringMatch[1] || null,
        action: stringMatch[2] || null,
        isClosure: false,
      };
    }

    // Check for closure
    if (handlerStr.includes('function') || handlerStr.includes('fn')) {
      return {
        controller: null,
        action: null,
        isClosure: true,
      };
    }

    return {
      controller: null,
      action: null,
      isClosure: false,
    };
  }

  /**
   * Extract route parameters from URI
   */
  private extractParameters(uri: string): RouteParameter[] {
    const params: RouteParameter[] = [];
    PARAM_PATTERN.lastIndex = 0;

    let match;
    while ((match = PARAM_PATTERN.exec(uri)) !== null) {
      params.push({
        name: match[1] || '',
        optional: match[2] === '?',
        constraint: null,
      });
    }

    return params;
  }

  /**
   * Extract chained ->name() value
   */
  private extractChainedName(afterRoute: string): string | null {
    NAME_CHAIN_PATTERN.lastIndex = 0;
    const match = NAME_CHAIN_PATTERN.exec(afterRoute);
    return match ? match[1] || null : null;
  }

  /**
   * Extract chained ->middleware() values
   */
  private extractChainedMiddleware(afterRoute: string): string[] {
    const middleware: string[] = [];
    MIDDLEWARE_APPEND_PATTERN.lastIndex = 0;

    let match;
    while ((match = MIDDLEWARE_APPEND_PATTERN.exec(afterRoute)) !== null) {
      const middlewareStr = match[1] || '';
      const items = middlewareStr.split(',').map(m => m.trim().replace(/['"]/g, '')).filter(Boolean);
      middleware.push(...items);
    }

    return middleware;
  }

  /**
   * Extract ->where() constraints
   */
  private extractWhereConstraints(afterRoute: string): Record<string, string> {
    const constraints: Record<string, string> = {};
    WHERE_PATTERN.lastIndex = 0;

    let match;
    while ((match = WHERE_PATTERN.exec(afterRoute)) !== null) {
      if (match[1] && match[2]) {
        constraints[match[1]] = match[2];
      }
    }

    return constraints;
  }

  /**
   * Extract methods from Route::match()
   */
  private extractMatchMethods(handlerStr: string): LaravelHttpMethod[] {
    const methodsMatch = handlerStr.match(/\[\s*['"]([^'"]+)['"]/);
    if (methodsMatch) {
      return methodsMatch[1]?.split(/['"]\s*,\s*['"]/).map(m => m.toUpperCase() as LaravelHttpMethod) || [];
    }
    return ['GET'];
  }

  /**
   * Extract group option value
   */
  private extractGroupOption(optionsStr: string, key: string): string | null {
    const pattern = new RegExp(`['"]${key}['"]\\s*=>\\s*['"]([^'"]+)['"]`);
    const match = optionsStr.match(pattern);
    return match ? match[1] || null : null;
  }

  /**
   * Extract middleware from group options
   */
  private extractGroupMiddleware(optionsStr: string): string[] {
    const pattern = /['"]middleware['"]\s*=>\s*\[([^\]]+)\]/;
    const match = optionsStr.match(pattern);
    if (match) {
      return match[1]?.split(',').map(m => m.trim().replace(/['"]/g, '')).filter(Boolean) || [];
    }
    return [];
  }

  /**
   * Simple singularize (basic implementation)
   */
  private singularize(word: string): string {
    if (word.endsWith('ies')) {return word.slice(0, -3) + 'y';}
    if (word.endsWith('es')) {return word.slice(0, -2);}
    if (word.endsWith('s')) {return word.slice(0, -1);}
    return word;
  }

  /**
   * Get line number from character offset
   */
  private getLineNumber(content: string, offset: number): number {
    return content.substring(0, offset).split('\n').length;
  }
}

/**
 * Create a new route extractor instance
 */
export function createRouteExtractor(): RouteExtractor {
  return new RouteExtractor();
}
