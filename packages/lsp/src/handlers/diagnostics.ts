/**
 * Diagnostics Handler
 *
 * Publishes diagnostics (squiggly lines) for pattern violations.
 * Manages diagnostic state and provides incremental updates.
 * Integrates with driftdetect-core scanner for pattern detection.
 *
 * @requirements 27.3 - THE LSP_Server SHALL publish diagnostics for violations
 * @requirements 27.7 - THE LSP_Server SHALL respond to diagnostics within 200ms of file change
 */

import { DiagnosticSeverity } from 'vscode-languageserver';

import { CoreScanner, PatternStoreAdapter, type CoreIntegrationConfig } from '../integration/index.js';

import type { ViolationInfo } from '../types/lsp-types.js';
import type { Violation, Severity } from 'driftdetect-core';
import type { Connection, Diagnostic, TextDocuments } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';


// ============================================================================
// Types
// ============================================================================

interface ServerState {
  initialized: boolean;
  workspaceFolders: Array<{ uri: string; name: string }>;
}

interface Logger {
  error(message: string): void;
  warn(message: string): void;
  info(message: string): void;
  debug(message: string): void;
}

/**
 * Extended diagnostic with Drift-specific data
 */
export interface ViolationDiagnostic extends Diagnostic {
  data?: {
    violationId: string;
    patternId: string;
    file: string;
    hasQuickFix: boolean;
    aiExplainAvailable: boolean;
    aiFixAvailable: boolean;
  };
}

/**
 * Diagnostics handler interface
 */
export interface DiagnosticsHandler {
  /** Publish diagnostics for a document */
  publishDiagnostics(uri: string): Promise<void>;
  /** Clear diagnostics for a document */
  clearDiagnostics(uri: string): void;
  /** Clear all diagnostics */
  clearAllDiagnostics(): void;
  /** Get diagnostics for a document */
  getDiagnostics(uri: string): ViolationDiagnostic[];
  /** Get diagnostic at a specific position */
  getDiagnosticAtPosition(
    uri: string,
    line: number,
    character: number
  ): ViolationDiagnostic | undefined;
  /** Get all violations for a document */
  getViolations(uri: string): Violation[];
  /** Schedule a diagnostic update with debouncing */
  scheduleUpdate(uri: string, delayMs?: number): void;
  /** Cancel a scheduled update */
  cancelUpdate(uri: string): void;
  /** Get the core scanner instance */
  getCoreScanner(): CoreScanner | null;
  /** Get the pattern store adapter instance */
  getPatternStoreAdapter(): PatternStoreAdapter | null;
  /** Initialize the core integration */
  initializeCoreIntegration(config?: Partial<CoreIntegrationConfig>): Promise<void>;
}

// ============================================================================
// Constants
// ============================================================================

/** Default delay before publishing diagnostics (ms) */
const DEFAULT_DIAGNOSTIC_DELAY = 200;

/** Maximum diagnostics per file */
const MAX_DIAGNOSTICS_PER_FILE = 100;

// ============================================================================
// Severity Mapping
// ============================================================================

/**
 * Map Drift severity to LSP DiagnosticSeverity
 */
function mapSeverity(severity: Severity): DiagnosticSeverity {
  switch (severity) {
    case 'error':
      return DiagnosticSeverity.Error;
    case 'warning':
      return DiagnosticSeverity.Warning;
    case 'info':
      return DiagnosticSeverity.Information;
    case 'hint':
      return DiagnosticSeverity.Hint;
    default:
      return DiagnosticSeverity.Warning;
  }
}

// ============================================================================
// Handler Factory
// ============================================================================

/**
 * Create the diagnostics handler
 */
export function createDiagnosticsHandler(
  connection: Connection,
  documents: TextDocuments<TextDocument>,
  state: ServerState,
  logger: Logger
): DiagnosticsHandler {
  // Store diagnostics by document URI
  const diagnosticsMap = new Map<string, ViolationDiagnostic[]>();

  // Store violations by document URI
  const violationsMap = new Map<string, Violation[]>();

  // Timers for debounced updates
  const updateTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // Core integration instances
  let coreScanner: CoreScanner | null = null;
  let patternStoreAdapter: PatternStoreAdapter | null = null;

  /**
   * Convert a ViolationInfo to an LSP Diagnostic
   */
  function violationInfoToDiagnostic(violation: ViolationInfo): ViolationDiagnostic {
    return {
      range: violation.range,
      severity: mapSeverity(violation.severity as Severity),
      code: violation.patternId,
      source: 'drift',
      message: violation.message,
      data: {
        violationId: violation.id,
        patternId: violation.patternId,
        file: violation.file,
        hasQuickFix: violation.quickFix !== undefined,
        aiExplainAvailable: violation.aiExplainAvailable ?? false,
        aiFixAvailable: violation.aiFixAvailable ?? false,
      },
    };
  }

  /**
   * Convert ViolationInfo to Violation for backward compatibility
   */
  function violationInfoToViolation(info: ViolationInfo): Violation {
    const violation: Violation = {
      id: info.id,
      patternId: info.patternId,
      severity: info.severity as Severity,
      file: info.file,
      range: info.range,
      message: info.message,
      expected: info.expected ?? '',
      actual: info.actual ?? '',
      aiExplainAvailable: info.aiExplainAvailable ?? false,
      aiFixAvailable: info.aiFixAvailable ?? false,
      firstSeen: new Date(),
      occurrences: 1,
    };

    // Add optional properties only if defined
    if (info.explanation !== undefined) {
      violation.explanation = info.explanation;
    }
    if (info.quickFix) {
      violation.quickFix = {
        title: info.quickFix.title,
        kind: 'quickfix',
        edit: { changes: {} },
        isPreferred: info.quickFix.isPreferred,
        confidence: info.quickFix.confidence,
      };
    }

    return violation;
  }

  /**
   * Scan a document for violations using the core scanner
   */
  async function scanDocument(document: TextDocument): Promise<ViolationInfo[]> {
    const uri = document.uri;
    const content = document.getText();

    logger.debug(`Scanning document: ${uri} (${content.length} chars)`);

    // If core scanner is initialized, use it
    if (coreScanner && coreScanner.isInitialized()) {
      const result = await coreScanner.scan(uri, content);

      // Filter violations by variants if pattern store adapter is available
      let violations = result.violations;
      if (patternStoreAdapter && patternStoreAdapter.isInitialized()) {
        violations = patternStoreAdapter.filterViolationsByVariants(violations);
      }

      return violations;
    }

    // Fallback: return empty array if core scanner not initialized
    logger.debug('Core scanner not initialized, returning empty violations');
    return [];
  }

  return {
    async publishDiagnostics(uri: string): Promise<void> {
      if (!state.initialized) {
        logger.debug('Server not initialized, skipping diagnostics');
        return;
      }

      const document = documents.get(uri);
      if (!document) {
        logger.debug(`Document not found: ${uri}`);
        return;
      }

      const startTime = Date.now();

      try {
        // Scan for violations using core scanner
        const violationInfos = await scanDocument(document);

        // Convert ViolationInfo to Violation for backward compatibility
        const violations = violationInfos.map(violationInfoToViolation);
        violationsMap.set(uri, violations);

        // Convert to diagnostics
        const diagnostics = violationInfos
          .slice(0, MAX_DIAGNOSTICS_PER_FILE)
          .map(violationInfoToDiagnostic);

        diagnosticsMap.set(uri, diagnostics);

        // Publish to client
        connection.sendDiagnostics({
          uri,
          version: document.version,
          diagnostics,
        });

        const elapsed = Date.now() - startTime;
        logger.debug(`Published ${diagnostics.length} diagnostics for ${uri} in ${elapsed}ms`);

        // Warn if we exceeded the 200ms target
        if (elapsed > 200) {
          logger.warn(`Diagnostic latency exceeded 200ms target: ${elapsed}ms`);
        }
      } catch (error) {
        logger.error(`Error publishing diagnostics for ${uri}: ${error}`);
      }
    },

    clearDiagnostics(uri: string): void {
      diagnosticsMap.delete(uri);
      violationsMap.delete(uri);
      connection.sendDiagnostics({ uri, diagnostics: [] });
      logger.debug(`Cleared diagnostics for ${uri}`);
    },

    clearAllDiagnostics(): void {
      for (const uri of diagnosticsMap.keys()) {
        connection.sendDiagnostics({ uri, diagnostics: [] });
      }
      diagnosticsMap.clear();
      violationsMap.clear();
      logger.debug('Cleared all diagnostics');
    },

    getDiagnostics(uri: string): ViolationDiagnostic[] {
      return diagnosticsMap.get(uri) ?? [];
    },

    getDiagnosticAtPosition(
      uri: string,
      line: number,
      character: number
    ): ViolationDiagnostic | undefined {
      const diagnostics = diagnosticsMap.get(uri) ?? [];

      return diagnostics.find((d) => {
        const { start, end } = d.range;

        // Check if position is within range
        if (line < start.line || line > end.line) {
          return false;
        }
        if (line === start.line && character < start.character) {
          return false;
        }
        if (line === end.line && character > end.character) {
          return false;
        }

        return true;
      });
    },

    getViolations(uri: string): Violation[] {
      return violationsMap.get(uri) ?? [];
    },

    scheduleUpdate(uri: string, delayMs: number = DEFAULT_DIAGNOSTIC_DELAY): void {
      // Cancel any existing timer
      const existingTimer = updateTimers.get(uri);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Schedule new update
      const timer = setTimeout(() => {
        updateTimers.delete(uri);
        this.publishDiagnostics(uri);
      }, delayMs);

      updateTimers.set(uri, timer);
    },

    cancelUpdate(uri: string): void {
      const timer = updateTimers.get(uri);
      if (timer) {
        clearTimeout(timer);
        updateTimers.delete(uri);
      }
    },

    getCoreScanner(): CoreScanner | null {
      return coreScanner;
    },

    getPatternStoreAdapter(): PatternStoreAdapter | null {
      return patternStoreAdapter;
    },

    async initializeCoreIntegration(config?: Partial<CoreIntegrationConfig>): Promise<void> {
      logger.info('Initializing core integration...');

      // Determine root directory from workspace folders
      const rootDir = state.workspaceFolders[0]?.uri
        ? state.workspaceFolders[0].uri.replace('file://', '')
        : '.';

      const integrationConfig: Partial<CoreIntegrationConfig> = {
        rootDir,
        ...config,
      };

      try {
        // Initialize core scanner
        coreScanner = new CoreScanner(integrationConfig, logger);
        await coreScanner.initialize();

        // Initialize pattern store adapter
        patternStoreAdapter = new PatternStoreAdapter(integrationConfig, logger);
        await patternStoreAdapter.initialize();

        logger.info('Core integration initialized successfully');
      } catch (error) {
        logger.error(`Failed to initialize core integration: ${error}`);
        // Don't throw - allow LSP to continue without core integration
      }
    },
  };
}
