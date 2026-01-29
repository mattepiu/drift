/**
 * Laravel Structural Patterns Detector - SEMANTIC VERSION
 *
 * Learns structural patterns from your Laravel codebase:
 * - Service container bindings and DI patterns
 * - Service provider patterns
 * - Facade usage patterns
 * - File organization conventions
 * - Namespace patterns
 */

import {
  SemanticDetector,
  type SemanticMatch,
  type UsagePattern,
} from '../../base/semantic-detector.js';

import type { Violation, Language } from 'driftdetect-core';

// ============================================================================
// Context Validation Patterns
// ============================================================================

const STRUCTURAL_FILE_PATTERNS = [
  /providers\//i, /services\//i, /repositories\//i,
  /contracts\//i, /interfaces\//i, /facades\//i,
  /bootstrap\//i, /app\.php$/i,
];

const STRUCTURAL_CONTEXT_KEYWORDS = [
  'illuminate\\support\\serviceprovider',
  'illuminate\\support\\facades',
  'illuminate\\contracts',
  'app()->bind', 'app()->singleton', 'app()->instance',
  '$this->app->bind', '$this->app->singleton',
  'register()', 'boot()', 'provides()',
];

// ============================================================================
// Laravel Structural Semantic Detector
// ============================================================================

export class LaravelStructuralSemanticDetector extends SemanticDetector {
  readonly id = 'structural/laravel-structural-semantic';
  readonly name = 'Laravel Structural Patterns Detector';
  readonly description = 'Learns structural and DI patterns from your Laravel codebase';
  readonly category = 'structural' as const;
  readonly subcategory = 'laravel';

  override readonly supportedLanguages: Language[] = ['php'];

  constructor() {
    super({
      minOccurrences: 2,
      dominanceThreshold: 0.3,
      minFiles: 1,
      includeComments: false,
      includeStrings: false,
    });
  }

  protected getSemanticKeywords(): string[] {
    return [
      // Service Provider patterns
      'ServiceProvider', 'register', 'boot', 'provides', 'bindings', 'singletons',
      'DeferrableProvider', 'defer',
      
      // Container bindings
      'bind', 'singleton', 'instance', 'scoped', 'extend',
      'when', 'needs', 'give', 'contextual',
      'make', 'resolve', 'app',
      
      // Facades
      'Facade', 'getFacadeAccessor', 'getFacadeRoot',
      'App', 'Cache', 'Config', 'DB', 'Event', 'File', 'Gate',
      'Hash', 'Log', 'Mail', 'Queue', 'Redis', 'Route', 'Session',
      'Storage', 'URL', 'Validator', 'View',
      
      // Contracts/Interfaces
      'Contract', 'Interface', 'implements',
      
      // Dependency injection
      'inject', 'constructor', '__construct',
      'TypeHint', 'autowire',
      
      // File organization
      'namespace', 'use', 'class', 'trait', 'interface',
      'App\\', 'App\\Http\\', 'App\\Models\\', 'App\\Services\\',
    ];
  }

  protected getSemanticCategory(): string {
    return 'structural';
  }

  protected override isRelevantMatch(match: SemanticMatch): boolean {
    const { file, lineContent, surroundingContext, keyword } = match;
    const contextLower = surroundingContext.toLowerCase();

    // High-confidence keywords
    const highConfidenceKeywords = [
      'ServiceProvider', 'Facade', 'bind', 'singleton',
      'register', 'boot', 'provides', 'getFacadeAccessor',
    ];
    
    if (highConfidenceKeywords.includes(keyword)) {
      return true;
    }

    // Skip comments
    if (/^\s*\/\//.test(lineContent) || /^\s*\/\*/.test(lineContent)) {
      return false;
    }

    // For ambiguous keywords, require structural context
    const ambiguousKeywords = ['app', 'make', 'resolve', 'class', 'interface', 'use'];
    if (ambiguousKeywords.includes(keyword.toLowerCase())) {
      const hasContext = STRUCTURAL_CONTEXT_KEYWORDS.some(k => contextLower.includes(k));
      if (!hasContext) {
        const inStructuralFile = STRUCTURAL_FILE_PATTERNS.some(p => p.test(file));
        if (!inStructuralFile) {return false;}
      }
    }

    return true;
  }

  protected createPatternViolation(
    match: SemanticMatch,
    dominantPattern: UsagePattern
  ): Violation {
    return {
      id: `${this.id}-${match.file}-${match.line}-${match.column}`,
      patternId: this.id,
      severity: 'warning',
      file: match.file,
      range: {
        start: { line: match.line - 1, character: match.column - 1 },
        end: { line: match.line - 1, character: match.column + match.matchedText.length - 1 },
      },
      message: `Inconsistent structural pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your Laravel project uses '${dominantPattern.contextType}' for structural patterns in ${dominantPattern.percentage.toFixed(0)}% of cases.`,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }
}

export function createLaravelStructuralSemanticDetector(): LaravelStructuralSemanticDetector {
  return new LaravelStructuralSemanticDetector();
}
