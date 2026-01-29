/**
 * Core Scanner Integration
 *
 * Connects the LSP diagnostics handler to driftdetect-core scanner
 * and driftdetect-detectors for pattern detection and violation generation.
 *
 * @requirements 27.3 - THE LSP_Server SHALL publish diagnostics for violations
 * @requirements 27.7 - THE LSP_Server SHALL respond to diagnostics within 200ms of file change
 */

import {
  PatternStore,
  Evaluator,
  ParserManager,
  TypeScriptParser,
  PythonParser,
  CSSParser,
  JSONParser,
  MarkdownParser,
  type Pattern,
  type PatternStoreConfig,
  type EvaluatorConfig,
} from 'driftdetect-core';
import { URI } from 'vscode-uri';

import { DEFAULT_CORE_INTEGRATION_CONFIG } from './types.js';

import type {
  CoreIntegrationConfig,
  ScanResult,
  ScanOptions,
  ScanError,
} from './types.js';
import type { ViolationInfo, PatternInfo } from '../types/lsp-types.js';

/**
 * Logger interface for the core scanner
 */
interface Logger {
  error(message: string): void;
  warn(message: string): void;
  info(message: string): void;
  debug(message: string): void;
}

/**
 * Core Scanner - Integrates driftdetect-core with LSP diagnostics
 *
 * This class bridges the LSP server with the core drift detection engine.
 * It manages the pattern store, parser manager, evaluator, and detector registry
 * to scan documents and generate violations.
 */
export class CoreScanner {
  private config: CoreIntegrationConfig;
  private logger: Logger;
  private patternStore: PatternStore | null = null;
  private parserManager: ParserManager | null = null;
  private evaluator: Evaluator | null = null;
  private initialized: boolean = false;
  private scanCache: Map<string, { violations: ViolationInfo[]; timestamp: number }> = new Map();
  private cacheTimeout: number = 5000; // 5 seconds cache

  constructor(config: Partial<CoreIntegrationConfig> = {}, logger: Logger) {
    this.config = { ...DEFAULT_CORE_INTEGRATION_CONFIG, ...config };
    this.logger = logger;
  }

  /**
   * Initialize the core scanner
   *
   * Sets up the pattern store, parser manager, evaluator, and detector registry.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.logger.info('Initializing core scanner...');

    try {
      // Initialize pattern store
      const storeConfig: Partial<PatternStoreConfig> = {
        rootDir: this.config.rootDir,
        validateSchema: this.config.validateSchema,
        trackHistory: this.config.trackHistory,
        autoSave: this.config.autoSave,
      };
      this.patternStore = new PatternStore(storeConfig);
      await this.patternStore.initialize();
      this.logger.info('Pattern store initialized');

      // Initialize parser manager with language parsers
      this.parserManager = new ParserManager();
      this.parserManager.registerParser(new TypeScriptParser());
      this.parserManager.registerParser(new PythonParser());
      this.parserManager.registerParser(new CSSParser());
      this.parserManager.registerParser(new JSONParser());
      this.parserManager.registerParser(new MarkdownParser());
      this.logger.info('Parser manager initialized');

      // Initialize evaluator
      const evaluatorConfig: EvaluatorConfig = {
        aiExplainAvailable: this.config.aiEnabled,
        aiFixAvailable: this.config.aiEnabled,
        minConfidence: this.config.minConfidence,
        projectRoot: this.config.rootDir,
      };
      this.evaluator = new Evaluator(evaluatorConfig);
      this.logger.info('Evaluator initialized');

      this.initialized = true;
      this.logger.info('Core scanner initialization complete');
    } catch (error) {
      this.logger.error(`Failed to initialize core scanner: ${error}`);
      throw error;
    }
  }

  /**
   * Check if the scanner is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the pattern store instance
   */
  getPatternStore(): PatternStore | null {
    return this.patternStore;
  }

  /**
   * Scan a document for violations
   *
   * @requirements 27.3 - Publish diagnostics for violations
   * @requirements 27.7 - Respond within 200ms
   */
  async scan(uri: string, content: string, options: ScanOptions = {}): Promise<ScanResult> {
    const startTime = Date.now();
    const errors: ScanError[] = [];
    const violations: ViolationInfo[] = [];
    let patterns: PatternInfo[] = [];

    // Check cache unless force rescan
    if (!options.force) {
      const cached = this.scanCache.get(uri);
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        this.logger.debug(`Using cached scan result for ${uri}`);
        return {
          uri,
          violations: cached.violations,
          patterns: [],
          duration: Date.now() - startTime,
          errors: [],
        };
      }
    }

    if (!this.initialized) {
      errors.push({
        message: 'Core scanner not initialized',
        code: 'NOT_INITIALIZED',
        recoverable: false,
      });
      return { uri, violations, patterns, duration: Date.now() - startTime, errors };
    }

    try {
      // Parse the document
      const filePath = this.uriToPath(uri);
      const language = this.getLanguageFromUri(uri);

      this.logger.debug(`Scanning ${filePath} (${language})`);

      // Get AST if parser is available
      let ast = null;
      if (this.parserManager && language) {
        try {
          const parseResult = this.parserManager.parse(content, language);
          if (parseResult.success && parseResult.ast) {
            ast = parseResult.ast;
          }
        } catch (parseError) {
          this.logger.warn(`Parse error for ${uri}: ${parseError}`);
          errors.push({
            message: `Parse error: ${parseError}`,
            code: 'PARSE_ERROR',
            recoverable: true,
          });
        }
      }

      // Get approved patterns to evaluate against
      const approvedPatterns = this.patternStore?.getApproved() ?? [];

      // Filter patterns by options
      let patternsToEvaluate: Pattern[] = approvedPatterns;
      if (options.categories && options.categories.length > 0) {
        patternsToEvaluate = patternsToEvaluate.filter((p: Pattern) =>
          options.categories!.includes(p.category)
        );
      }
      if (options.patternIds && options.patternIds.length > 0) {
        patternsToEvaluate = patternsToEvaluate.filter((p: Pattern) =>
          options.patternIds!.includes(p.id)
        );
      }

      // Evaluate patterns against the document
      if (this.evaluator && patternsToEvaluate.length > 0) {
        const evaluationInput = {
          file: filePath,
          content,
          ast,
          language: language || 'unknown',
        };

        const results = this.evaluator.evaluateAll(evaluationInput, patternsToEvaluate);

        // Convert evaluation results to ViolationInfo
        for (const result of results) {
          for (const violation of result.violations) {
            // Apply minimum confidence filter
            const minConf = options.minConfidence ?? this.config.minConfidence;
            const pattern = patternsToEvaluate.find((p: Pattern) => p.id === violation.patternId);
            if (pattern && pattern.confidence.score >= minConf) {
              violations.push(this.violationToInfo(violation, uri));
            }
          }
        }
      }

      // Pattern discovery would be handled by detectors
      // For now, we just return the violations from approved patterns
      patterns = [];

      // Cache the result
      this.scanCache.set(uri, { violations, timestamp: Date.now() });

      const duration = Date.now() - startTime;
      this.logger.debug(`Scan complete for ${uri}: ${violations.length} violations in ${duration}ms`);

      // Warn if we exceeded the 200ms target
      if (duration > 200) {
        this.logger.warn(`Scan latency exceeded 200ms target: ${duration}ms for ${uri}`);
      }

      return { uri, violations, patterns, duration, errors };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Scan error for ${uri}: ${errorMessage}`);
      errors.push({
        message: errorMessage,
        code: 'SCAN_ERROR',
        recoverable: true,
      });
      return { uri, violations, patterns, duration: Date.now() - startTime, errors };
    }
  }

  /**
   * Invalidate cache for a document
   */
  invalidateCache(uri: string): void {
    this.scanCache.delete(uri);
  }

  /**
   * Clear all cached scan results
   */
  clearCache(): void {
    this.scanCache.clear();
  }

  /**
   * Convert a driftdetect-core Violation to ViolationInfo
   */
  private violationToInfo(
    violation: import('driftdetect-core').Violation,
    uri: string
  ): ViolationInfo {
    return {
      id: violation.id,
      patternId: violation.patternId,
      message: violation.message,
      severity: violation.severity,
      file: uri,
      range: violation.range,
      expected: violation.expected,
      actual: violation.actual,
      explanation: violation.explanation,
      quickFix: violation.quickFix
        ? {
            title: violation.quickFix.title,
            isPreferred: violation.quickFix.isPreferred,
            confidence: violation.quickFix.confidence,
          }
        : undefined,
      aiExplainAvailable: violation.aiExplainAvailable,
      aiFixAvailable: violation.aiFixAvailable,
    };
  }

  /**
   * Convert a URI to a file path
   */
  private uriToPath(uri: string): string {
    try {
      return URI.parse(uri).fsPath;
    } catch {
      // If URI parsing fails, assume it's already a path
      return uri;
    }
  }

  /**
   * Get the language from a URI based on file extension
   */
  private getLanguageFromUri(uri: string): string | null {
    const ext = uri.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'js':
      case 'jsx':
      case 'mjs':
      case 'cjs':
        return 'javascript';
      case 'py':
        return 'python';
      case 'css':
      case 'scss':
      case 'sass':
      case 'less':
        return 'css';
      case 'json':
        return 'json';
      case 'yaml':
      case 'yml':
        return 'yaml';
      case 'md':
      case 'markdown':
        return 'markdown';
      default:
        return null;
    }
  }

  /**
   * Shutdown the core scanner
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down core scanner...');

    // Save pattern store if auto-save is enabled
    if (this.patternStore && this.config.autoSave) {
      try {
        await this.patternStore.saveAll();
      } catch (error) {
        this.logger.error(`Error saving pattern store: ${error}`);
      }
    }

    this.scanCache.clear();
    this.initialized = false;
    this.logger.info('Core scanner shutdown complete');
  }
}

/**
 * Create a core scanner instance
 */
export function createCoreScanner(
  config: Partial<CoreIntegrationConfig> = {},
  logger: Logger
): CoreScanner {
  return new CoreScanner(config, logger);
}
