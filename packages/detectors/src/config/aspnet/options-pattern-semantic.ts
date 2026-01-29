/**
 * Options Pattern Detector for ASP.NET Core - SEMANTIC VERSION
 *
 * Truly language-agnostic detector that finds Options pattern usage
 * by looking for semantic concepts, not syntax.
 *
 * CONTEXT-AWARE: Filters out false positives by checking:
 * - File path context (Configuration/, Options/, etc.)
 * - Surrounding code context (IOptions imports, configuration patterns)
 * - Semantic disambiguation (IOptions vs other options)
 *
 * Detects Options pattern usage:
 * - IOptions<T> injection
 * - IOptionsSnapshot<T> for reloadable config
 * - IOptionsMonitor<T> for change notifications
 * - Options validation
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

/** File paths that indicate Options pattern / configuration code */
const OPTIONS_FILE_PATTERNS = [
  /config/i, /configuration/i, /options/i, /settings/i,
  /startup/i, /program/i, /extensions/i, /serviceextensions/i,
  /dependencyinjection/i, /di/i, /ioc/i,
];

/** File paths that indicate NON-Options pattern code (false positive sources) */
const NON_OPTIONS_FILE_PATTERNS = [
  /\.test\./i, /\.spec\./i, /tests\//i, /specs\//i,
  /mock/i, /fake/i, /stub/i,
  /\.d\.ts$/i, /\.d\.cs$/i,
];

/** Keywords in surrounding context that indicate Options pattern usage */
const OPTIONS_CONTEXT_KEYWORDS = [
  'ioptions', 'ioptionssnapshot', 'ioptionsmonitor', 'ioptionsfactory',
  'optionsbuilder', 'optionsvalidator', 'ivalidateoptions',
  'configure', 'configureoptions', 'postconfigure', 'postconfigureoptions',
  'validatedataannotations', 'validateonstart', 'validate',
  'addoptions', 'services.configure', 'builder.services',
  'appsettings', 'configuration', 'iconfiguration', 'getconfiguration',
  'getsection', 'bind', 'value', '.value',
  'microsoft.extensions.options', 'microsoft.extensions.configuration',
];

/** Keywords that indicate NON-Options pattern context usage */
const NON_OPTIONS_CONTEXT_KEYWORDS = [
  'commandlineoptions', 'parseroptions', 'compileroptions',
  'selectoptions', 'dropdownoptions', 'menuoptions',
  'dialogoptions', 'modaloptions', 'popupoptions',
  'httpclientoptions', 'jsonoptions', 'serializeroptions',
];

// ============================================================================
// Options Pattern Semantic Detector
// ============================================================================

export class OptionsPatternSemanticDetector extends SemanticDetector {
  readonly id = 'config/aspnet-options-pattern';
  readonly name = 'ASP.NET Options Pattern Detector';
  readonly description = 'Learns Options pattern usage from your ASP.NET Core codebase';
  readonly category = 'config' as const;
  readonly subcategory = 'configuration';

  // C# specific - Options pattern is an ASP.NET Core technology
  override readonly supportedLanguages: Language[] = ['csharp'];

  constructor() {
    super({
      minOccurrences: 2,
      dominanceThreshold: 0.3,
      minFiles: 1,
      includeComments: false,
      includeStrings: false,
    });
  }

  /**
   * Semantic keywords for Options pattern detection
   * These are C#-specific ASP.NET Core Options concepts
   */
  protected getSemanticKeywords(): string[] {
    return [
      // High-confidence Options pattern keywords
      'IOptions', 'IOptionsSnapshot', 'IOptionsMonitor', 'IOptionsFactory',
      'OptionsBuilder', 'OptionsValidator', 'IValidateOptions',
      'IConfigureOptions', 'IPostConfigureOptions', 'IConfigureNamedOptions',
      
      // Configuration methods
      'Configure', 'ConfigureOptions', 'PostConfigure', 'PostConfigureOptions',
      'ValidateDataAnnotations', 'ValidateOnStart', 'Validate',
      'AddOptions', 'BindConfiguration',
      
      // Options access patterns
      'Value', 'CurrentValue', 'Get', 'GetSection',
      
      // Common options class suffixes
      'Options', 'Settings', 'Configuration', 'Config',
    ];
  }

  protected getSemanticCategory(): string {
    return 'config';
  }

  /**
   * Context-aware filtering to eliminate false positives
   */
  protected override isRelevantMatch(match: SemanticMatch): boolean {
    const { file, lineContent, surroundingContext, keyword } = match;
    const contextLower = surroundingContext.toLowerCase();
    const lineLower = lineContent.toLowerCase();

    // Skip test files
    for (const pattern of NON_OPTIONS_FILE_PATTERNS) {
      if (pattern.test(file)) {
        return false;
      }
    }

    // High-confidence keywords always match (ASP.NET Options specific)
    const highConfidenceKeywords = [
      'IOptions', 'IOptionsSnapshot', 'IOptionsMonitor', 'IOptionsFactory',
      'OptionsBuilder', 'OptionsValidator', 'IValidateOptions',
      'IConfigureOptions', 'IPostConfigureOptions', 'IConfigureNamedOptions',
      'ValidateDataAnnotations', 'ValidateOnStart', 'BindConfiguration',
    ];
    if (highConfidenceKeywords.some(k => keyword.toLowerCase() === k.toLowerCase())) {
      return true;
    }

    // For ambiguous keywords like "Options", "Settings", "Configure", apply context validation
    
    // Check for NON-Options pattern context indicators
    for (const nonOptionsKeyword of NON_OPTIONS_CONTEXT_KEYWORDS) {
      if (lineLower.includes(nonOptionsKeyword.toLowerCase())) {
        return false;
      }
    }

    // Check file path for Options patterns (strong positive signal)
    for (const pattern of OPTIONS_FILE_PATTERNS) {
      if (pattern.test(file)) {
        return true;
      }
    }

    // Check surrounding context for Options pattern keywords
    const optionsContextScore = OPTIONS_CONTEXT_KEYWORDS.filter(k => 
      contextLower.includes(k.toLowerCase())
    ).length;
    const nonOptionsContextScore = NON_OPTIONS_CONTEXT_KEYWORDS.filter(k => 
      contextLower.includes(k.toLowerCase())
    ).length;

    // Require positive Options context for ambiguous keywords
    if (optionsContextScore === 0 && nonOptionsContextScore === 0) {
      // No clear context - check for common C# Options patterns
      if (/IOptions<\w+>/i.test(lineContent)) {return true;}
      if (/IOptionsSnapshot<\w+>/i.test(lineContent)) {return true;}
      if (/IOptionsMonitor<\w+>/i.test(lineContent)) {return true;}
      if (/\.Configure<\w+>/i.test(lineContent)) {return true;}
      if (/class\s+\w+Options\s*[:{]/i.test(lineContent)) {return true;}
      if (/class\s+\w+Settings\s*[:{]/i.test(lineContent)) {return true;}
    }

    return optionsContextScore > nonOptionsContextScore;
  }

  /**
   * Create violation for inconsistent Options pattern
   */
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
      message: `Inconsistent Options pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your project uses '${dominantPattern.contextType}' for Options pattern in ${dominantPattern.percentage.toFixed(0)}% of cases ` +
        `(${dominantPattern.count} occurrences across ${dominantPattern.files.length} files). ` +
        `This usage of '${match.contextType}' is inconsistent with the established pattern.\n\n` +
        `Examples of the dominant pattern:\n${dominantPattern.examples.slice(0, 3).map(e => `  • ${e}`).join('\n')}`,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }
}

export function createOptionsPatternSemanticDetector(): OptionsPatternSemanticDetector {
  return new OptionsPatternSemanticDetector();
}
