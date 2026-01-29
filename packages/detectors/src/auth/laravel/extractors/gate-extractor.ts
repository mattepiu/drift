/**
 * Laravel Gate Extractor
 *
 * Extracts Gate definitions and checks from Laravel code.
 *
 * @module auth/laravel/extractors/gate-extractor
 */

import type {
  GateDefinition,
  GateCheck,
  GateHook,
  GateExtractionResult,
  GateParameter,
} from '../types.js';

// ============================================================================
// Regex Patterns
// ============================================================================

/**
 * Gate::define('ability', callback)
 */
const GATE_DEFINE_PATTERN = /Gate::define\s*\(\s*['"]([^'"]+)['"]\s*,\s*([^)]+(?:\([^)]*\)[^)]*)*)\)/g;

/**
 * Gate::before/after
 */
const GATE_HOOK_PATTERN = /Gate::(before|after)\s*\(\s*([^)]+(?:\([^)]*\)[^)]*)*)\)/g;

/**
 * Gate::allows/denies/check
 */
const GATE_CHECK_PATTERN = /Gate::(allows|denies|check)\s*\(\s*['"]([^'"]+)['"](?:\s*,\s*([^)]+))?\)/g;

/**
 * $this->authorize() or authorize()
 */
const AUTHORIZE_PATTERN = /(?:\$this->)?authorize\s*\(\s*['"]([^'"]+)['"](?:\s*,\s*([^)]+))?\)/g;

/**
 * @can directive in Blade
 */
const CAN_DIRECTIVE_PATTERN = /@can\s*\(\s*['"]([^'"]+)['"](?:\s*,\s*([^)]+))?\)/g;

/**
 * Gate::can/cannot
 */
const GATE_CAN_PATTERN = /Gate::(can|cannot)\s*\(\s*['"]([^'"]+)['"](?:\s*,\s*([^)]+))?\)/g;

/**
 * $user->can/cannot
 */
const USER_CAN_PATTERN = /\$\w+->(?:can|cannot)\s*\(\s*['"]([^'"]+)['"](?:\s*,\s*([^)]+))?\)/g;

// ============================================================================
// Gate Extractor
// ============================================================================

/**
 * Extracts Laravel Gate definitions and checks
 */
export class GateExtractor {
  /**
   * Extract all gate-related patterns from content
   */
  extract(content: string, file: string): GateExtractionResult {
    const definitions = this.extractDefinitions(content, file);
    const checks = this.extractChecks(content, file);
    const hooksArray = this.extractHooks(content, file);

    // Group hooks by type
    const hooks = {
      before: hooksArray.filter(h => h.type === 'before'),
      after: hooksArray.filter(h => h.type === 'after'),
    };

    const confidence = this.calculateConfidence(definitions, checks, hooksArray);

    return {
      definitions,
      checks,
      hooks,
      confidence,
    };
  }

  /**
   * Check if content contains gate patterns
   */
  hasGates(content: string): boolean {
    return (
      content.includes('Gate::') ||
      content.includes('->authorize(') ||
      content.includes('@can(')
    );
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Extract Gate::define() calls
   */
  private extractDefinitions(content: string, file: string): GateDefinition[] {
    const definitions: GateDefinition[] = [];
    GATE_DEFINE_PATTERN.lastIndex = 0;

    let match;
    while ((match = GATE_DEFINE_PATTERN.exec(content)) !== null) {
      const name = match[1] || '';
      const callback = match[2] || '';
      const line = this.getLineNumber(content, match.index);

      const { callbackType, className, methodName } = this.parseCallback(callback);
      const parameters = this.extractParameters(callback);

      definitions.push({
        name,
        callbackType,
        className,
        methodName,
        parameters,
        file,
        line,
      });
    }

    return definitions;
  }

  /**
   * Extract gate checks
   */
  private extractChecks(content: string, file: string): GateCheck[] {
    const checks: GateCheck[] = [];

    // Gate::allows/denies/check
    GATE_CHECK_PATTERN.lastIndex = 0;
    let match;
    while ((match = GATE_CHECK_PATTERN.exec(content)) !== null) {
      const method = match[1] as 'allows' | 'denies' | 'check';
      const ability = match[2] || '';
      const args = match[3] ? this.parseArguments(match[3]) : [];

      checks.push({
        method,
        type: method,
        ability,
        arguments: args,
        file,
        line: this.getLineNumber(content, match.index),
      });
    }

    // Gate::can/cannot
    GATE_CAN_PATTERN.lastIndex = 0;
    while ((match = GATE_CAN_PATTERN.exec(content)) !== null) {
      const method = match[1] as 'can' | 'cannot';
      const ability = match[2] || '';
      const args = match[3] ? this.parseArguments(match[3]) : [];

      checks.push({
        method,
        type: method,
        ability,
        arguments: args,
        file,
        line: this.getLineNumber(content, match.index),
      });
    }

    // $this->authorize()
    AUTHORIZE_PATTERN.lastIndex = 0;
    while ((match = AUTHORIZE_PATTERN.exec(content)) !== null) {
      const ability = match[1] || '';
      const args = match[2] ? this.parseArguments(match[2]) : [];

      checks.push({
        method: 'authorize',
        type: 'authorize',
        ability,
        arguments: args,
        file,
        line: this.getLineNumber(content, match.index),
      });
    }

    // @can directive
    CAN_DIRECTIVE_PATTERN.lastIndex = 0;
    while ((match = CAN_DIRECTIVE_PATTERN.exec(content)) !== null) {
      const ability = match[1] || '';
      const args = match[2] ? this.parseArguments(match[2]) : [];

      checks.push({
        method: 'can',
        type: 'can',
        ability,
        arguments: args,
        file,
        line: this.getLineNumber(content, match.index),
      });
    }

    // $user->can/cannot
    USER_CAN_PATTERN.lastIndex = 0;
    while ((match = USER_CAN_PATTERN.exec(content)) !== null) {
      const ability = match[1] || '';
      const args = match[2] ? this.parseArguments(match[2]) : [];

      checks.push({
        method: 'can',
        type: 'can',
        ability,
        arguments: args,
        file,
        line: this.getLineNumber(content, match.index),
      });
    }

    return checks;
  }

  /**
   * Extract Gate::before/after hooks
   */
  private extractHooks(content: string, file: string): GateHook[] {
    const hooks: GateHook[] = [];
    GATE_HOOK_PATTERN.lastIndex = 0;

    let match;
    while ((match = GATE_HOOK_PATTERN.exec(content)) !== null) {
      const type = match[1] as 'before' | 'after';
      const callback = match[2] || '';

      hooks.push({
        type,
        callbackType: callback.includes('function') || callback.includes('fn') ? 'closure' : 'class',
        file,
        line: this.getLineNumber(content, match.index),
      });
    }

    return hooks;
  }

  /**
   * Parse callback to determine type
   */
  private parseCallback(callback: string): {
    callbackType: 'closure' | 'class' | 'invokable';
    className: string | null;
    methodName: string | null;
  } {
    const trimmed = callback.trim();

    // Closure: function() or fn()
    if (trimmed.includes('function') || trimmed.startsWith('fn')) {
      return { callbackType: 'closure', className: null, methodName: null };
    }

    // Class array: [ClassName::class, 'method']
    const classArrayMatch = trimmed.match(/\[\s*([A-Z]\w+)::class\s*,\s*['"](\w+)['"]\s*\]/);
    if (classArrayMatch) {
      return {
        callbackType: 'class',
        className: classArrayMatch[1] || null,
        methodName: classArrayMatch[2] || null,
      };
    }

    // Invokable: ClassName::class
    const invokableMatch = trimmed.match(/([A-Z]\w+)::class/);
    if (invokableMatch) {
      return {
        callbackType: 'invokable',
        className: invokableMatch[1] || null,
        methodName: '__invoke',
      };
    }

    return { callbackType: 'closure', className: null, methodName: null };
  }

  /**
   * Extract parameters from callback
   */
  private extractParameters(callback: string): GateParameter[] {
    const params: GateParameter[] = [];

    // Match function parameters
    const paramMatch = callback.match(/function\s*\(([^)]*)\)/);
    if (paramMatch?.[1]) {
      const paramStr = paramMatch[1];
      const paramParts = paramStr.split(',');

      for (const part of paramParts) {
        const trimmed = part.trim();
        if (!trimmed) {continue;}

        // Match type hint and variable name
        const match = trimmed.match(/(?:(\??\w+(?:\|\w+)*)\s+)?\$(\w+)/);
        if (match) {
          params.push({
            name: match[2] || '',
            type: match[1] || null,
          });
        }
      }
    }

    return params;
  }

  /**
   * Parse arguments string into array
   */
  private parseArguments(argsStr: string): string[] {
    return argsStr
      .split(',')
      .map(arg => arg.trim())
      .filter(Boolean);
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(
    definitions: GateDefinition[],
    checks: GateCheck[],
    hooks: GateHook[]
  ): number {
    if (definitions.length === 0 && checks.length === 0 && hooks.length === 0) {
      return 0;
    }

    let confidence = 0.5;

    if (definitions.length > 0) {confidence += 0.2;}
    if (checks.length > 0) {confidence += 0.2;}
    if (hooks.length > 0) {confidence += 0.1;}

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
 * Create a new gate extractor
 */
export function createGateExtractor(): GateExtractor {
  return new GateExtractor();
}
