/**
 * Dependency Injection Registration Semantic Detector for ASP.NET Core
 *
 * Learns DI registration patterns from the codebase:
 * - AddScoped<T>() / AddTransient<T>() / AddSingleton<T>()
 * - Extension method registration
 * - Assembly scanning
 * - Keyed services (.NET 8+)
 * - Factory registrations
 *
 * Uses semantic learning to understand how DI is configured
 * and detect inconsistencies.
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

/** File paths that typically contain DI registration code */
const DI_FILE_PATTERNS = [
  /startup/i, /program/i, /serviceextension/i, /registration/i,
  /module/i, /installer/i, /composition/i, /bootstrap/i,
  /dependencyinjection/i, /ioc/i, /container/i,
];

/** Keywords in surrounding context that indicate DI usage */
const DI_CONTEXT_KEYWORDS = [
  'iservicecollection', 'servicecollection', 'addscoped', 'addtransient',
  'addsingleton', 'addkeyedscoped', 'addkeyedtransient', 'addkeyedsingleton',
  'services', 'builder', 'configure', 'register', 'inject',
  'dependency', 'container', 'resolve', 'getservice', 'getrequiredservice',
];

// ============================================================================
// DI Registration Semantic Detector
// ============================================================================

export class DIRegistrationSemanticDetector extends SemanticDetector {
  readonly id = 'structural/aspnet-di-registration';
  readonly name = 'ASP.NET DI Registration Detector';
  readonly description = 'Learns dependency injection registration patterns in ASP.NET Core';
  readonly category = 'structural' as const;
  readonly subcategory = 'dependency-injection';

  // C# specific
  override readonly supportedLanguages: Language[] = ['csharp'];

  constructor() {
    super({
      minOccurrences: 3,
      dominanceThreshold: 0.3,
      minFiles: 1, // DI registration often in single file
      includeComments: false,
      includeStrings: false,
    });
  }

  /**
   * Semantic keywords for DI registration detection
   */
  protected getSemanticKeywords(): string[] {
    return [
      // Lifetime registrations
      'AddScoped', 'AddTransient', 'AddSingleton',
      // Keyed services (.NET 8+)
      'AddKeyedScoped', 'AddKeyedTransient', 'AddKeyedSingleton',
      // Service collection
      'IServiceCollection', 'ServiceCollection',
      // Extension methods
      'TryAddScoped', 'TryAddTransient', 'TryAddSingleton',
      // Resolution
      'GetService', 'GetRequiredService',
      // Common patterns
      'services', 'builder',
    ];
  }

  protected getSemanticCategory(): string {
    return 'structural';
  }

  /**
   * Context-aware filtering for DI registration patterns
   */
  protected override isRelevantMatch(match: SemanticMatch): boolean {
    const { lineContent, keyword, surroundingContext, file } = match;
    const lineLower = lineContent.toLowerCase();
    const contextLower = surroundingContext.toLowerCase();

    // Skip if it's in a string literal
    if (/["'].*Add(?:Scoped|Transient|Singleton).*["']/.test(lineContent)) {
      return false;
    }

    // Skip if it's a comment
    if (/^\s*\/\//.test(lineContent) && !lineContent.includes('///')) {
      return false;
    }

    // High-confidence: actual DI registration calls
    if (/\.Add(?:Scoped|Transient|Singleton)</.test(lineContent)) {
      return true;
    }

    // Keyed services
    if (/\.AddKeyed(?:Scoped|Transient|Singleton)/.test(lineContent)) {
      return true;
    }

    // Try* variants
    if (/\.TryAdd(?:Scoped|Transient|Singleton)/.test(lineContent)) {
      return true;
    }

    // Extension method pattern for DI
    if (/public\s+static\s+\w+\s+Add\w+\s*\(\s*this\s+IServiceCollection/.test(lineContent)) {
      return true;
    }

    // Factory registration with lambda
    if (/\.Add(?:Scoped|Transient|Singleton)\s*\(.*=>/.test(lineContent)) {
      return true;
    }

    // IServiceCollection parameter
    if (/IServiceCollection\s+\w+/.test(lineContent)) {
      return true;
    }

    // Check file path for DI patterns
    for (const pattern of DI_FILE_PATTERNS) {
      if (pattern.test(file)) {
        const hasDIContext = DI_CONTEXT_KEYWORDS.some(k => contextLower.includes(k));
        if (hasDIContext) {
          return true;
        }
      }
    }

    // Check for DI context in surrounding code
    const hasDIContext = DI_CONTEXT_KEYWORDS.some(k => contextLower.includes(k));
    return hasDIContext && lineLower.includes(keyword.toLowerCase());
  }

  /**
   * Create violation for inconsistent DI registration pattern
   */
  protected createPatternViolation(
    match: SemanticMatch,
    dominantPattern: UsagePattern
  ): Violation {
    return {
      id: `${this.id}-${match.file}-${match.line}-${match.column}`,
      patternId: this.id,
      severity: 'info',
      file: match.file,
      range: {
        start: { line: match.line - 1, character: match.column - 1 },
        end: { line: match.line - 1, character: match.column + match.matchedText.length - 1 },
      },
      message: `Inconsistent DI registration pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your project uses '${dominantPattern.contextType}' for DI registration in ${(dominantPattern.percentage * 100).toFixed(0)}% of cases ` +
        `(${dominantPattern.count} occurrences across ${dominantPattern.files.length} files). ` +
        `This usage of '${match.contextType}' is inconsistent with the established pattern.\n\n` +
        `Consistent DI registration patterns improve maintainability and make it easier to understand service lifetimes.\n\n` +
        `Examples of the dominant pattern:\n${dominantPattern.examples.slice(0, 3).map(e => `  • ${e}`).join('\n')}`,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }
}

export function createDIRegistrationSemanticDetector(): DIRegistrationSemanticDetector {
  return new DIRegistrationSemanticDetector();
}
