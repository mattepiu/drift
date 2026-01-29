/**
 * Laravel Query Builder Extractor
 *
 * Extracts query builder usages from Laravel code.
 *
 * @module data-access/laravel/extractors/query-builder-extractor
 */

import { RAW_QUERY_METHODS } from '../types.js';

import type {
  QueryBuilderUsage,
  QueryMethod,
  RawQueryUsage,
  QueryBuilderExtractionResult,
} from '../types.js';

// ============================================================================
// Regex Patterns
// ============================================================================

/**
 * Model query start
 */
const MODEL_QUERY_PATTERN = /([A-Z]\w+)::(query|where|find|all|first|get|create|update|delete|with|select)\s*\(/g;

/**
 * DB facade query
 */
const DB_QUERY_PATTERN = /DB::(table|select|insert|update|delete|statement)\s*\(\s*['"]([^'"]+)['"]/g;

/**
 * Query builder method chain
 */
const QUERY_METHOD_PATTERN = /->(where|orWhere|whereIn|whereNotIn|whereBetween|whereNull|whereNotNull|whereDate|whereMonth|whereYear|whereTime|whereColumn|whereExists|whereRaw|orWhereRaw|select|selectRaw|addSelect|distinct|from|join|leftJoin|rightJoin|crossJoin|orderBy|orderByDesc|orderByRaw|groupBy|groupByRaw|having|havingRaw|skip|take|limit|offset|forPage|with|load|loadMissing|withCount|has|whereHas|doesntHave|whereDoesntHave|withTrashed|onlyTrashed|first|firstOrFail|find|findOrFail|get|pluck|value|count|max|min|avg|sum|exists|doesntExist|chunk|chunkById|cursor|lazy|each|paginate|simplePaginate|cursorPaginate|create|insert|insertOrIgnore|insertGetId|update|updateOrInsert|upsert|delete|forceDelete|restore|increment|decrement|touch)\s*\(/g;

/**
 * Raw query methods
 */
const RAW_QUERY_USAGE_PATTERN = /DB::(select|insert|update|delete|statement)\s*\(\s*['"]([^'"]+)['"]/g;

/**
 * selectRaw, whereRaw, etc.
 */
const RAW_METHOD_PATTERN = /->(selectRaw|whereRaw|orWhereRaw|havingRaw|orderByRaw|groupByRaw)\s*\(\s*['"]([^'"]+)['"]/g;

/**
 * Eager loading with()
 */
const EAGER_LOAD_PATTERN = /->(with|load|loadMissing)\s*\(\s*\[?([^\])]+)\]?\s*\)/g;

// ============================================================================
// Query Builder Extractor
// ============================================================================

/**
 * Extracts query builder usages
 */
export class QueryBuilderExtractor {
  /**
   * Extract all query builder usages from content
   */
  extract(content: string, file: string): QueryBuilderExtractionResult {
    const queries = this.extractQueries(content, file);
    const rawQueries = this.extractRawQueries(content, file);

    const confidence = this.calculateConfidence(queries, rawQueries);

    return {
      queries,
      rawQueries,
      confidence,
    };
  }

  /**
   * Check if content contains query builder patterns
   */
  hasQueries(content: string): boolean {
    return (
      content.includes('::query()') ||
      content.includes('::where(') ||
      content.includes('DB::') ||
      content.includes('->get()') ||
      content.includes('->first()')
    );
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Extract query builder usages
   */
  private extractQueries(content: string, file: string): QueryBuilderUsage[] {
    const queries: QueryBuilderUsage[] = [];

    // Model queries
    MODEL_QUERY_PATTERN.lastIndex = 0;
    let match;
    while ((match = MODEL_QUERY_PATTERN.exec(content)) !== null) {
      const target = match[1] || '';
      const line = this.getLineNumber(content, match.index);

      // Extract the full query chain
      const queryChain = this.extractQueryChain(content, match.index);
      const methods = this.extractMethods(queryChain, line);
      const eagerLoads = this.extractEagerLoads(queryChain);
      const isRaw = this.hasRawMethods(queryChain);

      queries.push({
        target,
        methods,
        isRaw,
        hasEagerLoading: eagerLoads.length > 0,
        eagerLoads,
        file,
        line,
      });
    }

    // DB facade queries
    DB_QUERY_PATTERN.lastIndex = 0;
    while ((match = DB_QUERY_PATTERN.exec(content)) !== null) {
      const method = match[1] || '';
      const target = match[2] || '';
      const line = this.getLineNumber(content, match.index);

      // Extract the full query chain
      const queryChain = this.extractQueryChain(content, match.index);
      const methods = this.extractMethods(queryChain, line);

      queries.push({
        target,
        methods: [{ name: method, arguments: [target], line }, ...methods],
        isRaw: ['select', 'insert', 'update', 'delete', 'statement'].includes(method),
        hasEagerLoading: false,
        eagerLoads: [],
        file,
        line,
      });
    }

    return queries;
  }

  /**
   * Extract raw query usages
   */
  private extractRawQueries(content: string, file: string): RawQueryUsage[] {
    const rawQueries: RawQueryUsage[] = [];

    // DB::select/insert/update/delete/statement
    RAW_QUERY_USAGE_PATTERN.lastIndex = 0;
    let match;
    while ((match = RAW_QUERY_USAGE_PATTERN.exec(content)) !== null) {
      const type = match[1] as RawQueryUsage['type'];
      const sql = match[2] || null;
      const line = this.getLineNumber(content, match.index);

      // Check if bindings are used
      const afterSql = content.substring(match.index, match.index + 500);
      const hasBindings = afterSql.includes('[') && afterSql.includes(']');

      rawQueries.push({
        type,
        sql,
        hasBindings,
        file,
        line,
      });
    }

    // selectRaw, whereRaw, etc.
    RAW_METHOD_PATTERN.lastIndex = 0;
    while ((match = RAW_METHOD_PATTERN.exec(content)) !== null) {
      const method = match[1] || '';
      const sql = match[2] || null;
      const line = this.getLineNumber(content, match.index);

      // Determine type from method name
      let type: RawQueryUsage['type'] = 'select';
      if (method.includes('where') || method.includes('having')) {
        type = 'select';
      } else if (method.includes('order') || method.includes('group')) {
        type = 'select';
      }

      // Check if bindings are used
      const afterSql = content.substring(match.index, match.index + 500);
      const hasBindings = afterSql.includes('[') && afterSql.includes(']');

      rawQueries.push({
        type,
        sql,
        hasBindings,
        file,
        line,
      });
    }

    return rawQueries;
  }

  /**
   * Extract query chain from starting position
   */
  private extractQueryChain(content: string, startIndex: number): string {
    // Find the end of the query chain (semicolon or closing paren at depth 0)
    let depth = 0;
    let i = startIndex;
    let inString = false;
    let stringChar = '';

    while (i < content.length) {
      const char = content[i];

      // Handle strings
      if ((char === '"' || char === "'") && content[i - 1] !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
      }

      if (!inString) {
        if (char === '(') {depth++;}
        else if (char === ')') {depth--;}
        else if (char === ';' && depth === 0) {break;}
        else if (char === '\n' && depth === 0 && i > startIndex + 10) {
          // Check if next line continues the chain
          const nextChars = content.substring(i + 1, i + 20).trim();
          if (!nextChars.startsWith('->')) {break;}
        }
      }

      i++;
    }

    return content.substring(startIndex, i);
  }

  /**
   * Extract methods from query chain
   */
  private extractMethods(queryChain: string, baseLine: number): QueryMethod[] {
    const methods: QueryMethod[] = [];
    QUERY_METHOD_PATTERN.lastIndex = 0;

    let match;
    while ((match = QUERY_METHOD_PATTERN.exec(queryChain)) !== null) {
      const name = match[1] || '';
      const line = baseLine + this.getLineNumber(queryChain.substring(0, match.index), 0);

      // Extract arguments (simplified)
      const argsStart = match.index + match[0].length;
      const args = this.extractArguments(queryChain, argsStart);

      methods.push({
        name,
        arguments: args,
        line,
      });
    }

    return methods;
  }

  /**
   * Extract eager loads from query chain
   */
  private extractEagerLoads(queryChain: string): string[] {
    const eagerLoads: string[] = [];
    EAGER_LOAD_PATTERN.lastIndex = 0;

    let match;
    while ((match = EAGER_LOAD_PATTERN.exec(queryChain)) !== null) {
      const relationsStr = match[2] || '';
      const relations = relationsStr
        .split(',')
        .map(r => r.trim().replace(/['"]/g, ''))
        .filter(Boolean);
      eagerLoads.push(...relations);
    }

    return eagerLoads;
  }

  /**
   * Check if query chain has raw methods
   */
  private hasRawMethods(queryChain: string): boolean {
    return RAW_QUERY_METHODS.some(method => queryChain.includes(`->${method}(`));
  }

  /**
   * Extract arguments from position
   */
  private extractArguments(content: string, startIndex: number): string[] {
    let depth = 1;
    let i = startIndex;
    let argStart = startIndex;
    const args: string[] = [];

    while (i < content.length && depth > 0) {
      const char = content[i];

      if (char === '(') {depth++;}
      else if (char === ')') {
        depth--;
        if (depth === 0) {
          const arg = content.substring(argStart, i).trim();
          if (arg) {args.push(arg);}
        }
      } else if (char === ',' && depth === 1) {
        const arg = content.substring(argStart, i).trim();
        if (arg) {args.push(arg);}
        argStart = i + 1;
      }

      i++;
    }

    return args;
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(
    queries: QueryBuilderUsage[],
    rawQueries: RawQueryUsage[]
  ): number {
    if (queries.length === 0 && rawQueries.length === 0) {
      return 0;
    }

    let confidence = 0.5;

    if (queries.length > 0) {confidence += 0.3;}
    if (rawQueries.length > 0) {confidence += 0.2;}

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
 * Create a new query builder extractor
 */
export function createQueryBuilderExtractor(): QueryBuilderExtractor {
  return new QueryBuilderExtractor();
}
