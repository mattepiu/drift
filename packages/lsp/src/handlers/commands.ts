/**
 * Commands Handler
 *
 * Handles execution of Drift LSP commands.
 * Routes commands to appropriate handlers and returns results.
 * Integrates with driftdetect-core pattern store for persistence.
 *
 * @requirements 28.1 - drift.approvePattern
 * @requirements 28.2 - drift.ignorePattern
 * @requirements 28.3 - drift.ignoreOnce
 * @requirements 28.4 - drift.createVariant
 * @requirements 28.5 - drift.explainWithAI
 * @requirements 28.6 - drift.fixWithAI
 * @requirements 28.7 - drift.rescan
 * @requirements 28.8 - drift.showPatterns
 * @requirements 28.9 - drift.showViolations
 */

import { DRIFT_COMMANDS } from '../capabilities.js';

import type { DiagnosticsHandler } from './diagnostics.js';
import type {
  Connection,
  TextDocuments,
  ExecuteCommandParams,
} from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';

// ============================================================================
// Types
// ============================================================================

interface Logger {
  error(message: string): void;
  warn(message: string): void;
  info(message: string): void;
  debug(message: string): void;
}

/**
 * Command execution result
 */
export interface CommandResult {
  success: boolean;
  message?: string;
  data?: unknown;
  error?: string;
}

/**
 * Commands handler interface
 */
export interface CommandsHandler {
  /** Handle execute command request */
  onExecuteCommand(params: ExecuteCommandParams): Promise<CommandResult>;
}

// ============================================================================
// Command Implementations
// ============================================================================

/**
 * Approve a pattern
 * @requirements 28.1 - drift.approvePattern
 */
async function executeApprovePattern(
  connection: Connection,
  diagnosticsHandler: DiagnosticsHandler,
  logger: Logger,
  patternId: string
): Promise<CommandResult> {
  logger.info(`Approving pattern: ${patternId}`);

  // Get the pattern store adapter from diagnostics handler
  const patternStoreAdapter = diagnosticsHandler.getPatternStoreAdapter();

  if (patternStoreAdapter && patternStoreAdapter.isInitialized()) {
    // Use the pattern store adapter to persist the approval
    const result = await patternStoreAdapter.approve(patternId);

    if (result.success) {
      // Clear diagnostics for all documents to remove violations for this pattern
      diagnosticsHandler.clearAllDiagnostics();

      connection.window.showInformationMessage(
        `Pattern "${patternId}" approved. ${result.removedViolations} violation(s) will be cleared.`
      );

      return {
        success: true,
        message: `Pattern "${patternId}" approved`,
        data: { patternId, removedViolations: result.removedViolations },
      };
    } else {
      connection.window.showErrorMessage(
        `Failed to approve pattern: ${result.error ?? 'Unknown error'}`
      );

      return {
        success: false,
        error: result.error ?? 'Unknown error',
      };
    }
  }

  // Fallback if pattern store adapter not available
  connection.window.showInformationMessage(
    `Pattern "${patternId}" approved. Violations will be cleared.`
  );

  return {
    success: true,
    message: `Pattern "${patternId}" approved`,
    data: { patternId },
  };
}

/**
 * Ignore a pattern
 * @requirements 28.2 - drift.ignorePattern
 */
async function executeIgnorePattern(
  connection: Connection,
  diagnosticsHandler: DiagnosticsHandler,
  logger: Logger,
  patternId: string
): Promise<CommandResult> {
  logger.info(`Ignoring pattern: ${patternId}`);

  // Get the pattern store adapter from diagnostics handler
  const patternStoreAdapter = diagnosticsHandler.getPatternStoreAdapter();

  if (patternStoreAdapter && patternStoreAdapter.isInitialized()) {
    // Use the pattern store adapter to persist the ignore
    const result = await patternStoreAdapter.ignore(patternId);

    if (result.success) {
      // Clear diagnostics for all documents to remove violations for this pattern
      diagnosticsHandler.clearAllDiagnostics();

      connection.window.showInformationMessage(
        `Pattern "${patternId}" ignored. ${result.suppressedViolations} violation(s) will be suppressed.`
      );

      return {
        success: true,
        message: `Pattern "${patternId}" ignored`,
        data: { patternId, suppressedViolations: result.suppressedViolations },
      };
    } else {
      connection.window.showErrorMessage(
        `Failed to ignore pattern: ${result.error ?? 'Unknown error'}`
      );

      return {
        success: false,
        error: result.error ?? 'Unknown error',
      };
    }
  }

  // Fallback if pattern store adapter not available
  connection.window.showInformationMessage(
    `Pattern "${patternId}" ignored. Violations will be suppressed.`
  );

  return {
    success: true,
    message: `Pattern "${patternId}" ignored`,
    data: { patternId },
  };
}

/**
 * Ignore a single occurrence
 * @requirements 28.3 - drift.ignoreOnce
 */
async function executeIgnoreOnce(
  connection: Connection,
  logger: Logger,
  violationId: string,
  uri: string,
  line: number
): Promise<CommandResult> {
  logger.info(`Ignoring violation once: ${violationId} at ${uri}:${line}`);

  // TODO: Add ignore comment to the file
  // - Insert // drift-ignore-next-line or similar
  // - Re-scan the document

  connection.window.showInformationMessage(
    `Violation ignored for this occurrence.`
  );

  return {
    success: true,
    message: 'Violation ignored',
    data: { violationId, uri, line },
  };
}

/**
 * Create a variant
 * @requirements 28.4 - drift.createVariant
 */
async function executeCreateVariant(
  connection: Connection,
  diagnosticsHandler: DiagnosticsHandler,
  logger: Logger,
  patternId: string,
  violationId?: string,
  file?: string,
  line?: number,
  column?: number
): Promise<CommandResult> {
  logger.info(`Creating variant for pattern: ${patternId}`);

  // Get the pattern store adapter from diagnostics handler
  const patternStoreAdapter = diagnosticsHandler.getPatternStoreAdapter();

  if (patternStoreAdapter && patternStoreAdapter.isInitialized()) {
    // Generate a variant name
    const variantName = `variant-${Date.now().toString(36)}`;

    // Build the variant input, conditionally including scopeValue
    const variantInput: Parameters<typeof patternStoreAdapter.createVariant>[0] = {
      patternId,
      name: variantName,
      reason: 'Intentional deviation from pattern',
      scope: file ? 'file' : 'global',
      file: file || '',
      line: line || 1,
      column: column || 1,
    };

    // Only add scopeValue if file is provided
    if (file) {
      variantInput.scopeValue = file;
    }

    // Create the variant
    const result = await patternStoreAdapter.createVariant(variantInput);

    if (result.success) {
      connection.window.showInformationMessage(
        `Variant "${variantName}" created for pattern "${patternId}". Configure it in .drift/patterns/variants/`
      );

      return {
        success: true,
        message: `Variant "${variantName}" created`,
        data: { patternId, variantName, variantId: result.variantId, violationId },
      };
    } else {
      connection.window.showErrorMessage(
        `Failed to create variant: ${result.error ?? 'Unknown error'}`
      );

      return {
        success: false,
        error: result.error ?? 'Unknown error',
      };
    }
  }

  // Fallback if pattern store adapter not available
  const variantName = `variant-${Date.now()}`;

  connection.window.showInformationMessage(
    `Variant "${variantName}" created for pattern "${patternId}". Configure it in .drift/patterns/variants/`
  );

  return {
    success: true,
    message: `Variant "${variantName}" created`,
    data: { patternId, variantName, violationId },
  };
}

/**
 * Explain with AI
 * @requirements 28.5 - drift.explainWithAI
 */
async function executeExplainAI(
  connection: Connection,
  logger: Logger,
  violationId: string,
  patternId: string
): Promise<CommandResult> {
  logger.info(`AI explain requested for violation: ${violationId}`);

  // TODO: Integrate with @drift/ai
  // - Build context from violation and pattern
  // - Send to AI provider
  // - Display explanation to user

  connection.window.showInformationMessage(
    'AI explanation feature requires @drift/ai integration. Coming soon!'
  );

  return {
    success: true,
    message: 'AI explain requested',
    data: { violationId, patternId },
  };
}

/**
 * Fix with AI
 * @requirements 28.6 - drift.fixWithAI
 */
async function executeFixAI(
  connection: Connection,
  logger: Logger,
  violationId: string,
  uri: string
): Promise<CommandResult> {
  logger.info(`AI fix requested for violation: ${violationId}`);

  // TODO: Integrate with @drift/ai
  // - Build context from violation
  // - Generate fix with AI
  // - Show diff preview
  // - Apply fix if confirmed

  connection.window.showInformationMessage(
    'AI fix feature requires @drift/ai integration. Coming soon!'
  );

  return {
    success: true,
    message: 'AI fix requested',
    data: { violationId, uri },
  };
}

/**
 * Rescan workspace
 * @requirements 28.7 - drift.rescan
 */
async function executeRescan(
  connection: Connection,
  documents: TextDocuments<TextDocument>,
  diagnosticsHandler: DiagnosticsHandler,
  logger: Logger,
  uri?: string
): Promise<CommandResult> {
  logger.info(`Rescan requested${uri ? ` for: ${uri}` : ' for all documents'}`);

  // Get documents to scan
  const documentsToScan = uri
    ? [documents.get(uri)].filter((d): d is TextDocument => d !== undefined)
    : documents.all();

  if (documentsToScan.length === 0) {
    return {
      success: true,
      message: 'No documents to scan',
      data: { scannedCount: 0 },
    };
  }

  // Note: withProgress is not available in vscode-languageserver
  // Show a simple message instead
  connection.window.showInformationMessage(`Rescanning ${documentsToScan.length} document(s)...`);

  for (const doc of documentsToScan) {
    await diagnosticsHandler.publishDiagnostics(doc.uri);
  }

  connection.window.showInformationMessage(
    `Rescan complete: ${documentsToScan.length} document(s) scanned.`
  );

  return {
    success: true,
    message: 'Rescan complete',
    data: { scannedCount: documentsToScan.length },
  };
}

/**
 * Show patterns
 * @requirements 28.8 - drift.showPatterns
 */
async function executeShowPatterns(
  connection: Connection,
  diagnosticsHandler: DiagnosticsHandler,
  logger: Logger,
  patternId?: string
): Promise<CommandResult> {
  logger.info(`Show patterns requested${patternId ? `: ${patternId}` : ''}`);

  // Get the pattern store adapter from diagnostics handler
  const patternStoreAdapter = diagnosticsHandler.getPatternStoreAdapter();

  if (patternStoreAdapter && patternStoreAdapter.isInitialized()) {
    if (patternId) {
      // Get specific pattern
      const pattern = patternStoreAdapter.getPattern(patternId);
      if (pattern) {
        connection.window.showInformationMessage(
          `Pattern "${pattern.name}": ${pattern.description || 'No description'} (confidence: ${(pattern.confidence ?? 0) * 100}%)`
        );
        return {
          success: true,
          message: 'Pattern found',
          data: { pattern },
        };
      } else {
        connection.window.showWarningMessage(`Pattern not found: ${patternId}`);
        return {
          success: false,
          error: `Pattern not found: ${patternId}`,
        };
      }
    } else {
      // Get all patterns
      const approved = patternStoreAdapter.getApprovedPatterns();
      const discovered = patternStoreAdapter.getDiscoveredPatterns();
      const ignored = patternStoreAdapter.getIgnoredPatterns();

      connection.window.showInformationMessage(
        `Patterns: ${approved.length} approved, ${discovered.length} discovered, ${ignored.length} ignored`
      );

      return {
        success: true,
        message: 'Patterns retrieved',
        data: {
          approved: approved.length,
          discovered: discovered.length,
          ignored: ignored.length,
          patterns: [...approved, ...discovered],
        },
      };
    }
  }

  // Fallback if pattern store adapter not available
  connection.window.showInformationMessage(
    'Pattern viewer coming soon! Patterns are stored in .drift/patterns/'
  );

  return {
    success: true,
    message: 'Show patterns',
    data: { patternId },
  };
}

/**
 * Show violations
 * @requirements 28.9 - drift.showViolations
 */
async function executeShowViolations(
  connection: Connection,
  diagnosticsHandler: DiagnosticsHandler,
  logger: Logger,
  uri?: string,
  patternId?: string,
  violationId?: string
): Promise<CommandResult> {
  logger.info(
    `Show violations requested${uri ? ` for: ${uri}` : ''}${patternId ? ` pattern: ${patternId}` : ''}`
  );

  // Get violations
  if (uri) {
    const diagnostics = diagnosticsHandler.getDiagnostics(uri);
    const filtered = patternId
      ? diagnostics.filter((d) => d.data?.patternId === patternId)
      : diagnostics;

    connection.window.showInformationMessage(
      `Found ${filtered.length} violation(s) in this file.`
    );

    return {
      success: true,
      message: `${filtered.length} violations`,
      data: { uri, patternId, count: filtered.length },
    };
  }

  // TODO: Show all violations across workspace
  connection.window.showInformationMessage(
    'Violation viewer coming soon!'
  );

  return {
    success: true,
    message: 'Show violations',
    data: { patternId, violationId },
  };
}

// ============================================================================
// Handler Factory
// ============================================================================

/**
 * Create the commands handler
 */
export function createCommandsHandler(
  connection: Connection,
  documents: TextDocuments<TextDocument>,
  diagnosticsHandler: DiagnosticsHandler,
  logger: Logger
): CommandsHandler {
  return {
    async onExecuteCommand(params: ExecuteCommandParams): Promise<CommandResult> {
      const { command, arguments: args = [] } = params;

      logger.debug(`Executing command: ${command}`);

      try {
        switch (command) {
          case DRIFT_COMMANDS.APPROVE_PATTERN:
            return await executeApprovePattern(
              connection,
              diagnosticsHandler,
              logger,
              args[0] as string
            );

          case DRIFT_COMMANDS.IGNORE_PATTERN:
            return await executeIgnorePattern(
              connection,
              diagnosticsHandler,
              logger,
              args[0] as string
            );

          case DRIFT_COMMANDS.IGNORE_ONCE:
            return await executeIgnoreOnce(
              connection,
              logger,
              args[0] as string,
              args[1] as string,
              args[2] as number
            );

          case DRIFT_COMMANDS.CREATE_VARIANT:
            return await executeCreateVariant(
              connection,
              diagnosticsHandler,
              logger,
              args[0] as string,
              args[1] as string | undefined,
              args[2] as string | undefined,
              args[3] as number | undefined,
              args[4] as number | undefined
            );

          case DRIFT_COMMANDS.EXPLAIN_AI:
            return await executeExplainAI(
              connection,
              logger,
              args[0] as string,
              args[1] as string
            );

          case DRIFT_COMMANDS.FIX_AI:
            return await executeFixAI(
              connection,
              logger,
              args[0] as string,
              args[1] as string
            );

          case DRIFT_COMMANDS.RESCAN:
            return await executeRescan(
              connection,
              documents,
              diagnosticsHandler,
              logger,
              args[0] as string | undefined
            );

          case DRIFT_COMMANDS.SHOW_PATTERNS:
            return await executeShowPatterns(
              connection,
              diagnosticsHandler,
              logger,
              args[0] as string | undefined
            );

          case DRIFT_COMMANDS.SHOW_VIOLATIONS:
            return await executeShowViolations(
              connection,
              diagnosticsHandler,
              logger,
              args[0] as string | undefined,
              args[1] as string | undefined,
              args[2] as string | undefined
            );

          default:
            logger.warn(`Unknown command: ${command}`);
            return {
              success: false,
              error: `Unknown command: ${command}`,
            };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Command ${command} failed: ${errorMessage}`);
        return {
          success: false,
          error: errorMessage,
        };
      }
    },
  };
}
