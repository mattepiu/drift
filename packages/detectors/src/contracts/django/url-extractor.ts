/**
 * Django URL Extractor
 *
 * Extracts URL patterns from Django urls.py files.
 * Handles path(), re_path(), and router registrations.
 *
 * @module contracts/django/url-extractor
 */

import type {
  DjangoURLPatternInfo,
  DjangoRouterInfo,
} from './types.js';

// ============================================
// Regex Patterns
// ============================================

/**
 * Pattern to match path() calls.
 */
const PATH_PATTERN = /path\s*\(\s*['"]([^'"]+)['"]\s*,\s*([^,)]+)(?:\s*,\s*name\s*=\s*['"]([^'"]+)['"])?\s*\)/g;

/**
 * Pattern to match re_path() calls.
 */
const RE_PATH_PATTERN = /re_path\s*\(\s*r?['"]([^'"]+)['"]\s*,\s*([^,)]+)(?:\s*,\s*name\s*=\s*['"]([^'"]+)['"])?\s*\)/g;

/**
 * Pattern to match router instantiation.
 */
const ROUTER_INIT_PATTERN = /(\w+)\s*=\s*(?:routers\.)?(\w+Router)\s*\(/g;

/**
 * Pattern to match router.register() calls.
 */
const ROUTER_REGISTER_PATTERN = /(\w+)\.register\s*\(\s*r?['"]([^'"]+)['"]\s*,\s*(\w+)(?:\s*,\s*basename\s*=\s*['"]([^'"]+)['"])?\s*\)/g;

/**
 * Pattern to match include() with router.urls.
 */
const ROUTER_INCLUDE_PATTERN = /path\s*\(\s*['"]([^'"]*)['"]\s*,\s*include\s*\(\s*(\w+)\.urls\s*\)\s*\)/g;

// ============================================
// URL Extractor Class
// ============================================

/**
 * Extracts Django URL patterns and router configurations.
 */
export class DjangoURLExtractor {
  /**
   * Extract all URL patterns from Python content.
   *
   * @param content - Python source code
   * @param file - File path
   * @returns Array of URL pattern information
   */
  extractURLPatterns(content: string, file: string): DjangoURLPatternInfo[] {
    const patterns: DjangoURLPatternInfo[] = [];

    // Extract path() patterns
    patterns.push(...this.extractPathPatterns(content, file));

    // Extract re_path() patterns
    patterns.push(...this.extractRePathPatterns(content, file));

    return patterns;
  }

  /**
   * Extract all router configurations from Python content.
   *
   * @param content - Python source code
   * @param file - File path
   * @returns Array of router information
   */
  extractRouters(content: string, file: string): DjangoRouterInfo[] {
    const routerMap = new Map<string, DjangoRouterInfo>();

    // Find router instantiations
    ROUTER_INIT_PATTERN.lastIndex = 0;
    let match;

    while ((match = ROUTER_INIT_PATTERN.exec(content)) !== null) {
      const routerName = match[1];
      const routerClass = match[2];

      if (!routerName || !routerClass) {continue;}

      const line = this.getLineNumber(content, match.index);

      routerMap.set(routerName, {
        routerName,
        routerClass,
        registrations: [],
        file,
        line,
      });
    }

    // Find router.register() calls
    ROUTER_REGISTER_PATTERN.lastIndex = 0;

    while ((match = ROUTER_REGISTER_PATTERN.exec(content)) !== null) {
      const routerName = match[1];
      const prefix = match[2];
      const viewsetClass = match[3];
      const basename = match[4] ?? null;

      if (!routerName || !prefix || !viewsetClass) {continue;}

      const line = this.getLineNumber(content, match.index);

      // Get or create router
      let router = routerMap.get(routerName);
      if (!router) {
        router = {
          routerName,
          routerClass: 'DefaultRouter',
          registrations: [],
          file,
          line,
        };
        routerMap.set(routerName, router);
      }

      router.registrations.push({
        prefix,
        viewsetClass,
        basename,
        line,
      });
    }

    return Array.from(routerMap.values());
  }

  /**
   * Generate URL patterns from router registrations.
   *
   * @param routers - Router information
   * @param basePrefix - Base URL prefix from include()
   * @param file - File path
   * @returns Generated URL patterns
   */
  generateRouterURLPatterns(
    routers: DjangoRouterInfo[],
    basePrefix: string,
    file: string
  ): DjangoURLPatternInfo[] {
    const patterns: DjangoURLPatternInfo[] = [];

    for (const router of routers) {
      for (const reg of router.registrations) {
        // Generate standard CRUD patterns
        const crudPatterns = this.generateCRUDPatterns(
          basePrefix,
          reg.prefix,
          reg.viewsetClass,
          reg.basename,
          file,
          reg.line
        );
        patterns.push(...crudPatterns);
      }
    }

    return patterns;
  }

  /**
   * Find router include prefix.
   *
   * @param content - Python source code
   * @param routerName - Router variable name
   * @returns Base prefix or empty string
   */
  findRouterIncludePrefix(content: string, routerName: string): string {
    ROUTER_INCLUDE_PATTERN.lastIndex = 0;

    let match;
    while ((match = ROUTER_INCLUDE_PATTERN.exec(content)) !== null) {
      const prefix = match[1];
      const router = match[2];

      if (router === routerName) {
        return prefix ?? '';
      }
    }

    return '';
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Extract path() patterns.
   */
  private extractPathPatterns(content: string, file: string): DjangoURLPatternInfo[] {
    const patterns: DjangoURLPatternInfo[] = [];

    PATH_PATTERN.lastIndex = 0;

    let match;
    while ((match = PATH_PATTERN.exec(content)) !== null) {
      const path = match[1];
      const view = match[2]?.trim();
      const urlName = match[3] ?? null;

      if (!path || !view) {continue;}

      const line = this.getLineNumber(content, match.index);

      patterns.push({
        path,
        normalizedPath: this.normalizePath(path),
        viewName: this.extractViewName(view),
        urlName,
        isRouter: false,
        basename: null,
        file,
        line,
      });
    }

    return patterns;
  }

  /**
   * Extract re_path() patterns.
   */
  private extractRePathPatterns(content: string, file: string): DjangoURLPatternInfo[] {
    const patterns: DjangoURLPatternInfo[] = [];

    RE_PATH_PATTERN.lastIndex = 0;

    let match;
    while ((match = RE_PATH_PATTERN.exec(content)) !== null) {
      const path = match[1];
      const view = match[2]?.trim();
      const urlName = match[3] ?? null;

      if (!path || !view) {continue;}

      const line = this.getLineNumber(content, match.index);

      patterns.push({
        path,
        normalizedPath: this.normalizeRegexPath(path),
        viewName: this.extractViewName(view),
        urlName,
        isRouter: false,
        basename: null,
        file,
        line,
      });
    }

    return patterns;
  }

  /**
   * Generate CRUD URL patterns for a ViewSet registration.
   */
  private generateCRUDPatterns(
    basePrefix: string,
    prefix: string,
    viewsetClass: string,
    basename: string | null,
    file: string,
    line: number
  ): DjangoURLPatternInfo[] {
    const patterns: DjangoURLPatternInfo[] = [];
    const fullPrefix = this.joinPaths(basePrefix, prefix);
    const base = basename ?? prefix.replace(/\/$/, '');

    // List endpoint: GET /prefix/
    patterns.push({
      path: `${fullPrefix}/`,
      normalizedPath: `/${fullPrefix}/`.replace(/\/+/g, '/'),
      viewName: viewsetClass,
      urlName: `${base}-list`,
      isRouter: true,
      basename: base,
      file,
      line,
    });

    // Detail endpoint: GET/PUT/PATCH/DELETE /prefix/{id}/
    patterns.push({
      path: `${fullPrefix}/<int:pk>/`,
      normalizedPath: `/${fullPrefix}/:pk/`.replace(/\/+/g, '/'),
      viewName: viewsetClass,
      urlName: `${base}-detail`,
      isRouter: true,
      basename: base,
      file,
      line,
    });

    return patterns;
  }

  /**
   * Normalize a Django path pattern to :param syntax.
   */
  private normalizePath(path: string): string {
    // Convert <type:name> to :name
    let normalized = path.replace(/<(?:\w+:)?(\w+)>/g, ':$1');

    // Ensure leading slash
    if (!normalized.startsWith('/')) {
      normalized = '/' + normalized;
    }

    return normalized;
  }

  /**
   * Normalize a regex path pattern to :param syntax.
   */
  private normalizeRegexPath(path: string): string {
    // Remove regex anchors
    let normalized = path.replace(/^\^/, '').replace(/\$$/, '');

    // Convert (?P<name>...) to :name
    normalized = normalized.replace(/\(\?P<(\w+)>[^)]+\)/g, ':$1');

    // Convert simple groups to :param
    normalized = normalized.replace(/\([^)]+\)/g, ':param');

    // Remove remaining regex syntax
    normalized = normalized.replace(/[\\?*+\[\]{}|]/g, '');

    // Ensure leading slash
    if (!normalized.startsWith('/')) {
      normalized = '/' + normalized;
    }

    return normalized;
  }

  /**
   * Extract view name from view expression.
   */
  private extractViewName(view: string): string {
    // Handle ViewSet.as_view({...})
    const asViewMatch = view.match(/(\w+)\.as_view/);
    if (asViewMatch?.[1]) {
      return asViewMatch[1];
    }

    // Handle simple view reference
    const simpleMatch = view.match(/^(\w+)$/);
    if (simpleMatch?.[1]) {
      return simpleMatch[1];
    }

    // Handle views.ViewName
    const dottedMatch = view.match(/\.(\w+)$/);
    if (dottedMatch?.[1]) {
      return dottedMatch[1];
    }

    return view;
  }

  /**
   * Join URL path segments.
   */
  private joinPaths(base: string, path: string): string {
    const cleanBase = base.replace(/\/$/, '');
    const cleanPath = path.replace(/^\//, '');
    return cleanBase ? `${cleanBase}/${cleanPath}` : cleanPath;
  }

  /**
   * Get line number from character offset.
   */
  private getLineNumber(content: string, offset: number): number {
    return content.substring(0, offset).split('\n').length;
  }
}
