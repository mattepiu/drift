/**
 * Laravel Middleware Extractor
 *
 * Extracts Middleware class definitions and usages from Laravel code.
 *
 * @module auth/laravel/extractors/middleware-extractor
 */

import type {
  MiddlewareInfo,
  MiddlewareRegistration,
  MiddlewareUsage,
  MiddlewareGroup,
  MiddlewareExtractionResult,
} from '../types.js';

// ============================================================================
// Regex Patterns
// ============================================================================

/**
 * Middleware class definition
 */
const MIDDLEWARE_CLASS_PATTERN = /class\s+(\w+(?:Middleware)?)\s+(?:extends\s+(\w+))?\s*(?:implements\s+([\w,\s]+))?\s*\{/g;

/**
 * Handle method in middleware
 */
const HANDLE_METHOD_PATTERN = /public\s+function\s+handle\s*\(([^)]*)\)/;

/**
 * Terminate method in middleware
 */
const TERMINATE_METHOD_PATTERN = /public\s+function\s+terminate\s*\(/;

/**
 * Route middleware registration ($routeMiddleware)
 */
const ROUTE_MIDDLEWARE_PATTERN = /protected\s+\$routeMiddleware\s*=\s*\[([\s\S]*?)\];/g;

/**
 * Middleware groups ($middlewareGroups)
 */
const MIDDLEWARE_GROUPS_PATTERN = /protected\s+\$middlewareGroups\s*=\s*\[([\s\S]*?)\];/g;

/**
 * Global middleware ($middleware)
 */
const GLOBAL_MIDDLEWARE_PATTERN = /protected\s+\$middleware\s*=\s*\[([\s\S]*?)\];/g;

/**
 * Middleware alias mapping
 */
const MIDDLEWARE_ALIAS_PATTERN = /['"](\w+)['"]\s*=>\s*(\\?[A-Za-z][\w\\]*?)::class/g;

/**
 * Middleware in group
 */
const MIDDLEWARE_IN_GROUP_PATTERN = /['"](\w+)['"]\s*=>\s*\[([\s\S]*?)\]/g;

/**
 * Route::middleware() usage
 */
const ROUTE_MIDDLEWARE_USAGE_PATTERN = /(?:Route::|\->)middleware\s*\(\s*\[?([^\])]+)\]?\s*\)/g;

/**
 * ->middleware() chain on route
 */
const MIDDLEWARE_CHAIN_PATTERN = /->middleware\s*\(\s*['"]([^'"]+)['"](?::([^)]+))?\s*\)/g;

/**
 * Middleware in route group options
 */
const GROUP_MIDDLEWARE_PATTERN = /['"]middleware['"]\s*=>\s*\[?([^\]]+)\]?/g;

// ============================================================================
// Middleware Extractor
// ============================================================================

/**
 * Extracts Laravel Middleware definitions and usages
 */
export class MiddlewareExtractor {
  /**
   * Extract all middleware-related patterns from content
   */
  extract(content: string, file: string): MiddlewareExtractionResult {
    const middlewares = this.extractMiddlewares(content, file);
    const registrations = this.extractRegistrations(content, file);
    const groups = this.extractGroups(content, file);
    const usages = this.extractUsages(content, file);

    const confidence = this.calculateConfidence(middlewares, registrations, usages);

    return {
      middlewares,
      registrations,
      groups,
      usages,
      confidence,
    };
  }

  /**
   * Check if content contains middleware patterns
   */
  hasMiddleware(content: string): boolean {
    return (
      content.includes('Middleware') ||
      content.includes('$routeMiddleware') ||
      content.includes('$middlewareGroups') ||
      content.includes('->middleware(') ||
      // Check for handle method signature (middleware pattern)
      /function\s+handle\s*\([^)]*Request[^)]*\$request[^)]*,\s*[^)]*Closure[^)]*\$next/.test(content)
    );
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Extract Middleware class definitions
   */
  private extractMiddlewares(content: string, file: string): MiddlewareInfo[] {
    const middlewares: MiddlewareInfo[] = [];

    // Only process if this looks like a middleware file
    if (!this.isMiddlewareFile(content)) {
      return middlewares;
    }

    MIDDLEWARE_CLASS_PATTERN.lastIndex = 0;

    let match;
    while ((match = MIDDLEWARE_CLASS_PATTERN.exec(content)) !== null) {
      const name = match[1] || '';
      const line = this.getLineNumber(content, match.index);

      // Extract namespace
      const namespace = this.extractNamespace(content);

      // Extract class body
      const classBody = this.extractClassBody(content, match.index + match[0].length);

      // Check for handle method
      const handleMatch = classBody.match(HANDLE_METHOD_PATTERN);
      const hasHandle = !!handleMatch;
      const handleParameters = handleMatch ? this.parseHandleParams(handleMatch[1] || '') : [];

      // Check for terminate method
      const hasTerminate = TERMINATE_METHOD_PATTERN.test(classBody);

      middlewares.push({
        name,
        fqn: namespace ? `${namespace}\\${name}` : name,
        namespace,
        hasHandle,
        hasTerminate,
        handleParameters,
        file,
        line,
      });
    }

    return middlewares;
  }

  /**
   * Extract middleware registrations
   */
  private extractRegistrations(content: string, file: string): MiddlewareRegistration[] {
    const registrations: MiddlewareRegistration[] = [];

    // Route middleware ($routeMiddleware)
    ROUTE_MIDDLEWARE_PATTERN.lastIndex = 0;
    let match;
    while ((match = ROUTE_MIDDLEWARE_PATTERN.exec(content)) !== null) {
      const arrayContent = match[1] || '';
      const arrayLine = this.getLineNumber(content, match.index);

      MIDDLEWARE_ALIAS_PATTERN.lastIndex = 0;
      let aliasMatch;
      while ((aliasMatch = MIDDLEWARE_ALIAS_PATTERN.exec(arrayContent)) !== null) {
        registrations.push({
          alias: aliasMatch[1] || '',
          middlewareClass: aliasMatch[2] || '',
          type: 'route',
          groupName: null,
          file,
          line: arrayLine + this.getLineNumber(arrayContent.substring(0, aliasMatch.index), 0),
        });
      }
    }

    // Middleware groups ($middlewareGroups)
    MIDDLEWARE_GROUPS_PATTERN.lastIndex = 0;
    while ((match = MIDDLEWARE_GROUPS_PATTERN.exec(content)) !== null) {
      const groupsContent = match[1] || '';
      const groupsLine = this.getLineNumber(content, match.index);

      MIDDLEWARE_IN_GROUP_PATTERN.lastIndex = 0;
      let groupMatch;
      while ((groupMatch = MIDDLEWARE_IN_GROUP_PATTERN.exec(groupsContent)) !== null) {
        const groupName = groupMatch[1] || '';
        const middlewareList = groupMatch[2] || '';

        // Extract each middleware in the group
        const middlewareItems = middlewareList.match(/([A-Z][\w\\]+)(?:::class)?/g) || [];
        for (const item of middlewareItems) {
          registrations.push({
            alias: item.replace('::class', ''),
            middlewareClass: item.replace('::class', ''),
            type: 'group',
            groupName,
            file,
            line: groupsLine + this.getLineNumber(groupsContent.substring(0, groupMatch.index), 0),
          });
        }
      }
    }

    // Global middleware ($middleware)
    GLOBAL_MIDDLEWARE_PATTERN.lastIndex = 0;
    while ((match = GLOBAL_MIDDLEWARE_PATTERN.exec(content)) !== null) {
      const arrayContent = match[1] || '';
      const arrayLine = this.getLineNumber(content, match.index);

      const middlewareItems = arrayContent.match(/([A-Z][\w\\]+)(?:::class)?/g) || [];
      for (const item of middlewareItems) {
        registrations.push({
          alias: item.replace('::class', ''),
          middlewareClass: item.replace('::class', ''),
          type: 'global',
          groupName: null,
          file,
          line: arrayLine,
        });
      }
    }

    return registrations;
  }

  /**
   * Extract middleware usages
   */
  private extractUsages(content: string, file: string): MiddlewareUsage[] {
    const usages: MiddlewareUsage[] = [];

    // Route::middleware() and ->middleware()
    ROUTE_MIDDLEWARE_USAGE_PATTERN.lastIndex = 0;
    let match;
    while ((match = ROUTE_MIDDLEWARE_USAGE_PATTERN.exec(content)) !== null) {
      const middlewareStr = match[1] || '';
      const line = this.getLineNumber(content, match.index);

      const middlewareItems = this.parseMiddlewareList(middlewareStr);
      const middlewareNames = middlewareItems.map(item => item.name);
      
      // Create a single usage with all middlewares
      if (middlewareNames.length > 0) {
        usages.push({
          middleware: middlewareNames[0] || '',
          middlewares: middlewareNames,
          parameters: middlewareItems[0]?.parameters || [],
          file,
          line,
        });
      }
    }

    // ->middleware('name:param') chain
    MIDDLEWARE_CHAIN_PATTERN.lastIndex = 0;
    while ((match = MIDDLEWARE_CHAIN_PATTERN.exec(content)) !== null) {
      const middleware = match[1] || '';
      const params = match[2] || '';
      const line = this.getLineNumber(content, match.index);

      usages.push({
        middleware,
        middlewares: [middleware],
        parameters: params ? params.split(',').map(p => p.trim()) : [],
        file,
        line,
      });
    }

    // Middleware in route group options
    GROUP_MIDDLEWARE_PATTERN.lastIndex = 0;
    while ((match = GROUP_MIDDLEWARE_PATTERN.exec(content)) !== null) {
      const middlewareStr = match[1] || '';
      const line = this.getLineNumber(content, match.index);

      const middlewareItems = this.parseMiddlewareList(middlewareStr);
      const middlewareNames = middlewareItems.map(item => item.name);
      
      if (middlewareNames.length > 0) {
        usages.push({
          middleware: middlewareNames[0] || '',
          middlewares: middlewareNames,
          parameters: middlewareItems[0]?.parameters || [],
          file,
          line,
        });
      }
    }

    return usages;
  }

  /**
   * Extract middleware groups
   */
  private extractGroups(content: string, file: string): MiddlewareGroup[] {
    const groups: MiddlewareGroup[] = [];

    MIDDLEWARE_GROUPS_PATTERN.lastIndex = 0;
    let match;
    while ((match = MIDDLEWARE_GROUPS_PATTERN.exec(content)) !== null) {
      const groupsContent = match[1] || '';
      const groupsLine = this.getLineNumber(content, match.index);

      MIDDLEWARE_IN_GROUP_PATTERN.lastIndex = 0;
      let groupMatch;
      while ((groupMatch = MIDDLEWARE_IN_GROUP_PATTERN.exec(groupsContent)) !== null) {
        const groupName = groupMatch[1] || '';
        const middlewareList = groupMatch[2] || '';

        // Extract each middleware in the group
        const middlewareItems = middlewareList.match(/([A-Z][\w\\]+)(?:::class)?|['"]([^'"]+)['"]/g) || [];
        const middlewares = middlewareItems.map(item => 
          item.replace('::class', '').replace(/['"]/g, '')
        );

        groups.push({
          name: groupName,
          middlewares,
          file,
          line: groupsLine + this.getLineNumber(groupsContent.substring(0, groupMatch.index), 0),
        });
      }
    }

    return groups;
  }

  /**
   * Check if content is a middleware file
   */
  private isMiddlewareFile(content: string): boolean {
    return (
      content.includes('function handle') &&
      (content.includes('$request') || content.includes('Request'))
    );
  }

  /**
   * Parse handle method parameters
   */
  private parseHandleParams(paramsStr: string): string[] {
    return paramsStr
      .split(',')
      .map(p => {
        const match = p.trim().match(/\$(\w+)/);
        return match ? match[1] || '' : '';
      })
      .filter(Boolean);
  }

  /**
   * Parse middleware list string
   */
  private parseMiddlewareList(middlewareStr: string): Array<{ name: string; parameters: string[] }> {
    const items: Array<{ name: string; parameters: string[] }> = [];
    const parts = middlewareStr.split(',');

    for (const part of parts) {
      const trimmed = part.trim().replace(/['"]/g, '');
      if (!trimmed) {continue;}

      // Handle middleware:param1,param2 format
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0) {
        items.push({
          name: trimmed.substring(0, colonIndex),
          parameters: trimmed.substring(colonIndex + 1).split(',').map(p => p.trim()),
        });
      } else {
        items.push({
          name: trimmed,
          parameters: [],
        });
      }
    }

    return items;
  }

  /**
   * Extract namespace from content
   */
  private extractNamespace(content: string): string | null {
    const match = content.match(/namespace\s+([\w\\]+)\s*;/);
    return match ? match[1] || null : null;
  }

  /**
   * Extract class body
   */
  private extractClassBody(content: string, startIndex: number): string {
    let depth = 1;
    let i = startIndex;

    while (i < content.length && depth > 0) {
      if (content[i] === '{') {depth++;}
      else if (content[i] === '}') {depth--;}
      i++;
    }

    return content.substring(startIndex, i - 1);
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(
    middlewares: MiddlewareInfo[],
    registrations: MiddlewareRegistration[],
    usages: MiddlewareUsage[]
  ): number {
    if (middlewares.length === 0 && registrations.length === 0 && usages.length === 0) {
      return 0;
    }

    let confidence = 0.5;

    if (middlewares.length > 0) {confidence += 0.2;}
    if (registrations.length > 0) {confidence += 0.2;}
    if (usages.length > 0) {confidence += 0.1;}

    return Math.min(confidence, 1.0);
  }

  /**
   * Get line number from offset
   */
  private getLineNumber(content: string, offset: number): number {
    return content.substring(0, offset).split('\n').length;
  }
}

/**
 * Create a new middleware extractor
 */
export function createMiddlewareExtractor(): MiddlewareExtractor {
  return new MiddlewareExtractor();
}
