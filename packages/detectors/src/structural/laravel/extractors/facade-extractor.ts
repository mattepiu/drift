/**
 * Laravel Facade Extractor
 *
 * Extracts facade definitions from Laravel code.
 * Facades provide a static interface to classes in the service container.
 *
 * @module structural/laravel/extractors/facade-extractor
 */

import type { FacadeInfo } from '../types.js';

// ============================================================================
// Regex Patterns
// ============================================================================

/**
 * Facade class definition
 */
const FACADE_CLASS_PATTERN = /class\s+(\w+)\s+extends\s+(?:Illuminate\\Support\\Facades\\)?Facade\s*\{/g;

/**
 * getFacadeAccessor method
 */
const ACCESSOR_METHOD_PATTERN = /protected\s+static\s+function\s+getFacadeAccessor\s*\(\s*\)\s*(?::\s*string)?\s*\{[^}]*return\s+['"]([^'"]+)['"]/;

/**
 * Facade usage pattern
 */
const FACADE_USAGE_PATTERN = /([A-Z]\w+)::(\w+)\s*\(/g;

/**
 * Common Laravel facades
 */
const LARAVEL_FACADES = [
  'App', 'Artisan', 'Auth', 'Blade', 'Broadcast', 'Bus', 'Cache', 'Config',
  'Cookie', 'Crypt', 'Date', 'DB', 'Event', 'File', 'Gate', 'Hash', 'Http',
  'Lang', 'Log', 'Mail', 'Notification', 'Password', 'Queue', 'RateLimiter',
  'Redirect', 'Redis', 'Request', 'Response', 'Route', 'Schema', 'Session',
  'Storage', 'URL', 'Validator', 'View',
];

// ============================================================================
// Extraction Result
// ============================================================================

/**
 * Facade extraction result
 */
export interface FacadeExtractionResult {
  /** Custom facade definitions */
  facades: FacadeInfo[];
  /** Facade usages */
  usages: FacadeUsageInfo[];
  /** Confidence score */
  confidence: number;
}

/**
 * Facade usage info
 */
export interface FacadeUsageInfo {
  /** Facade name */
  facade: string;
  /** Method called */
  method: string;
  /** Whether it's a Laravel built-in facade */
  isBuiltIn: boolean;
  /** Line number */
  line: number;
}

// ============================================================================
// Facade Extractor
// ============================================================================

/**
 * Extracts Laravel facade definitions and usages
 */
export class FacadeExtractor {
  /**
   * Extract all facades from content
   */
  extract(content: string, file: string): FacadeExtractionResult {
    const facades = this.extractFacadeDefinitions(content, file);
    const usages = this.extractFacadeUsages(content, file);
    const confidence = facades.length > 0 || usages.length > 0 ? 0.9 : 0;

    return {
      facades,
      usages,
      confidence,
    };
  }

  /**
   * Check if content contains facades
   */
  hasFacades(content: string): boolean {
    return (
      content.includes('extends Facade') ||
      content.includes('getFacadeAccessor') ||
      LARAVEL_FACADES.some(f => content.includes(`${f}::`))
    );
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Extract custom facade definitions
   */
  private extractFacadeDefinitions(content: string, file: string): FacadeInfo[] {
    const facades: FacadeInfo[] = [];
    FACADE_CLASS_PATTERN.lastIndex = 0;

    let match;
    while ((match = FACADE_CLASS_PATTERN.exec(content)) !== null) {
      const name = match[1] || '';
      const line = this.getLineNumber(content, match.index);

      // Extract class body
      const classBody = this.extractClassBody(content, match.index + match[0].length);

      // Extract accessor
      const accessorMatch = classBody.match(ACCESSOR_METHOD_PATTERN);
      const accessor = accessorMatch ? accessorMatch[1] || '' : '';

      // Extract namespace
      const namespace = this.extractNamespace(content);

      facades.push({
        name,
        fqn: namespace ? `${namespace}\\${name}` : name,
        accessor,
        file,
        line,
      });
    }

    return facades;
  }

  /**
   * Extract facade usages
   */
  private extractFacadeUsages(content: string, _file: string): FacadeUsageInfo[] {
    const usages: FacadeUsageInfo[] = [];
    FACADE_USAGE_PATTERN.lastIndex = 0;

    let match;
    while ((match = FACADE_USAGE_PATTERN.exec(content)) !== null) {
      const facade = match[1] || '';
      const method = match[2] || '';
      const line = this.getLineNumber(content, match.index);

      // Skip non-facade static calls (e.g., Model::find)
      if (this.isLikelyFacade(facade, content)) {
        usages.push({
          facade,
          method,
          isBuiltIn: LARAVEL_FACADES.includes(facade),
          line,
        });
      }
    }

    return usages;
  }

  /**
   * Check if a class name is likely a facade
   */
  private isLikelyFacade(name: string, content: string): boolean {
    // Built-in Laravel facades
    if (LARAVEL_FACADES.includes(name)) {return true;}

    // Check if it's imported from Facades namespace
    if (content.includes(`use Illuminate\\Support\\Facades\\${name}`)) {return true;}
    if (content.includes(`use App\\Facades\\${name}`)) {return true;}

    // Check for common facade patterns
    if (content.includes(`${name}::fake(`)) {return true;}

    return false;
  }

  /**
   * Extract namespace
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
   * Get line number from offset
   */
  private getLineNumber(content: string, offset: number): number {
    return content.substring(0, offset).split('\n').length;
  }
}

/**
 * Create a new facade extractor
 */
export function createFacadeExtractor(): FacadeExtractor {
  return new FacadeExtractor();
}
