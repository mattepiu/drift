/**
 * Laravel Config Patterns Detector - SEMANTIC VERSION
 *
 * Learns configuration patterns from your Laravel codebase:
 * - Environment variable usage
 * - Config file patterns
 * - Feature flags
 * - Service configuration
 * - Cache configuration
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

const CONFIG_FILE_PATTERNS = [
  /config\//i, /\.env/i, /bootstrap\//i,
  /providers\//i, /serviceprovider/i,
];

const CONFIG_CONTEXT_KEYWORDS = [
  'illuminate\\support\\facades\\config',
  'config(', 'env(', 'config::',
  'config_path', 'base_path', 'storage_path',
  'app_env', 'app_debug', 'app_key',
];

// ============================================================================
// Laravel Config Semantic Detector
// ============================================================================

export class LaravelConfigSemanticDetector extends SemanticDetector {
  readonly id = 'config/laravel-config-semantic';
  readonly name = 'Laravel Config Patterns Detector';
  readonly description = 'Learns configuration patterns from your Laravel codebase';
  readonly category = 'config' as const;
  readonly subcategory = 'laravel';

  override readonly supportedLanguages: Language[] = ['php'];

  constructor() {
    super({
      minOccurrences: 2,
      dominanceThreshold: 0.3,
      minFiles: 1,
      includeComments: false,
      includeStrings: true, // Config keys are often strings
    });
  }

  protected getSemanticKeywords(): string[] {
    return [
      // Config facade/helper
      'Config', 'config', 'env',
      
      // Config methods
      'get', 'set', 'has', 'all',
      'prepend', 'push',
      
      // Environment
      'APP_ENV', 'APP_DEBUG', 'APP_KEY', 'APP_URL',
      'DB_CONNECTION', 'DB_HOST', 'DB_PORT', 'DB_DATABASE',
      'CACHE_DRIVER', 'SESSION_DRIVER', 'QUEUE_CONNECTION',
      'MAIL_MAILER', 'REDIS_HOST', 'AWS_',
      
      // Config files
      'app', 'auth', 'broadcasting', 'cache', 'cors',
      'database', 'filesystems', 'hashing', 'logging',
      'mail', 'queue', 'services', 'session', 'view',
      
      // Feature flags
      'feature', 'flag', 'enabled', 'disabled',
      'Feature', 'active', 'inactive',
      
      // Paths
      'config_path', 'base_path', 'app_path', 'storage_path',
      'resource_path', 'public_path', 'database_path',
      
      // Publishing
      'publishes', 'publishesMigrations', 'publishesViews',
      'mergeConfigFrom', 'loadRoutesFrom', 'loadViewsFrom',
      'loadMigrationsFrom', 'loadTranslationsFrom',
    ];
  }

  protected getSemanticCategory(): string {
    return 'config';
  }

  protected override isRelevantMatch(match: SemanticMatch): boolean {
    const { file, lineContent, surroundingContext, keyword } = match;
    const contextLower = surroundingContext.toLowerCase();

    // High-confidence keywords
    const highConfidenceKeywords = [
      'Config', 'config', 'env', 'config_path',
      'mergeConfigFrom', 'publishes', 'APP_ENV',
    ];
    
    if (highConfidenceKeywords.includes(keyword)) {
      // Verify it's Laravel config context
      if (keyword === 'config' && !lineContent.includes('config(') && !lineContent.includes('Config::')) {
        return false;
      }
      return true;
    }

    // Skip comments
    if (/^\s*\/\//.test(lineContent) || /^\s*\/\*/.test(lineContent)) {
      return false;
    }

    // For ambiguous keywords, require config context
    const ambiguousKeywords = ['get', 'set', 'has', 'all', 'app', 'enabled', 'disabled'];
    if (ambiguousKeywords.includes(keyword.toLowerCase())) {
      const hasContext = CONFIG_CONTEXT_KEYWORDS.some(k => contextLower.includes(k));
      if (!hasContext) {
        const inConfigFile = CONFIG_FILE_PATTERNS.some(p => p.test(file));
        if (!inConfigFile) {return false;}
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
      message: `Inconsistent config pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your Laravel project uses '${dominantPattern.contextType}' for configuration in ${dominantPattern.percentage.toFixed(0)}% of cases.`,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }
}

export function createLaravelConfigSemanticDetector(): LaravelConfigSemanticDetector {
  return new LaravelConfigSemanticDetector();
}
