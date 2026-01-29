/**
 * Code Lens Handler
 *
 * Provides code lens (inline actions) for pattern information.
 * Shows violation counts, pattern names, and quick actions.
 *
 * @requirements 27.6 - THE LSP_Server SHALL provide code lens for pattern information
 */

import { DRIFT_COMMANDS } from '../capabilities.js';

import type { DiagnosticsHandler, ViolationDiagnostic } from './diagnostics.js';
import type {
  Connection,
  TextDocuments,
  CodeLens,
  CodeLensParams,
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
 * Code lens handler interface
 */
export interface CodeLensHandler {
  /** Handle code lens request */
  onCodeLens(params: CodeLensParams): CodeLens[] | null;
  /** Handle code lens resolve request */
  onCodeLensResolve(codeLens: CodeLens): CodeLens;
}

/**
 * Code lens data for deferred resolution
 */
interface CodeLensData {
  type: 'summary' | 'pattern' | 'violation';
  uri: string;
  patternId?: string;
  violationCount?: number;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Group diagnostics by pattern ID
 */
function groupByPattern(
  diagnostics: ViolationDiagnostic[]
): Map<string, ViolationDiagnostic[]> {
  const groups = new Map<string, ViolationDiagnostic[]>();

  for (const diagnostic of diagnostics) {
    const patternId = diagnostic.data?.patternId ?? 'unknown';
    const group = groups.get(patternId) ?? [];
    group.push(diagnostic);
    groups.set(patternId, group);
  }

  return groups;
}

/**
 * Count diagnostics by severity
 */
function countBySeverity(diagnostics: ViolationDiagnostic[]): {
  errors: number;
  warnings: number;
  info: number;
  hints: number;
} {
  let errors = 0;
  let warnings = 0;
  let info = 0;
  let hints = 0;

  for (const d of diagnostics) {
    switch (d.severity) {
      case 1:
        errors++;
        break;
      case 2:
        warnings++;
        break;
      case 3:
        info++;
        break;
      case 4:
        hints++;
        break;
    }
  }

  return { errors, warnings, info, hints };
}

/**
 * Format violation count for display
 */
function formatViolationCount(count: number): string {
  return count === 1 ? '1 violation' : `${count} violations`;
}

// ============================================================================
// Handler Factory
// ============================================================================

/**
 * Create the code lens handler
 */
export function createCodeLensHandler(
  _connection: Connection,
  _documents: TextDocuments<TextDocument>,
  diagnosticsHandler: DiagnosticsHandler,
  logger: Logger
): CodeLensHandler {
  return {
    onCodeLens(params: CodeLensParams): CodeLens[] | null {
      const uri = params.textDocument.uri;

      logger.debug(`Code lens request for ${uri}`);

      // Get diagnostics for this document
      const diagnostics = diagnosticsHandler.getDiagnostics(uri);

      if (diagnostics.length === 0) {
        return null;
      }

      const codeLenses: CodeLens[] = [];

      // Document summary code lens at the top
      const counts = countBySeverity(diagnostics);
      const parts: string[] = [];

      if (counts.errors > 0) {
        parts.push(`${counts.errors} error${counts.errors === 1 ? '' : 's'}`);
      }
      if (counts.warnings > 0) {
        parts.push(`${counts.warnings} warning${counts.warnings === 1 ? '' : 's'}`);
      }

      const summaryTitle = `📊 Drift: ${formatViolationCount(diagnostics.length)}${parts.length > 0 ? ` (${parts.join(', ')})` : ''}`;

      codeLenses.push({
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
        },
        command: {
          title: summaryTitle,
          command: DRIFT_COMMANDS.SHOW_VIOLATIONS,
          arguments: [uri],
        },
        data: {
          type: 'summary',
          uri,
          violationCount: diagnostics.length,
        } as CodeLensData,
      });

      // Group diagnostics by pattern
      const patternGroups = groupByPattern(diagnostics);

      // Create code lens for each pattern group
      for (const [patternId, patternDiagnostics] of patternGroups) {
        if (patternDiagnostics.length === 0) {
          continue;
        }

        const firstDiagnostic = patternDiagnostics[0];
        if (!firstDiagnostic) {
          continue;
        }

        const count = patternDiagnostics.length;

        // Pattern summary at first occurrence
        codeLenses.push({
          range: firstDiagnostic.range,
          command: {
            title: `⚠️ ${formatViolationCount(count)}: ${patternId}`,
            command: DRIFT_COMMANDS.SHOW_VIOLATIONS,
            arguments: [uri, patternId],
          },
          data: {
            type: 'pattern',
            uri,
            patternId,
            violationCount: count,
          } as CodeLensData,
        });

        // Individual violation code lenses (limit to avoid clutter)
        if (count <= 5) {
          for (let i = 1; i < patternDiagnostics.length; i++) {
            const diagnostic = patternDiagnostics[i];
            if (!diagnostic) {
              continue;
            }
            codeLenses.push({
              range: diagnostic.range,
              command: {
                title: `💡 ${diagnostic.message}`,
                command: DRIFT_COMMANDS.SHOW_VIOLATIONS,
                arguments: [uri, patternId, diagnostic.data?.violationId],
              },
              data: {
                type: 'violation',
                uri,
                patternId,
              } as CodeLensData,
            });
          }
        }
      }

      logger.debug(`Generated ${codeLenses.length} code lenses`);

      return codeLenses;
    },

    onCodeLensResolve(codeLens: CodeLens): CodeLens {
      logger.debug('Resolving code lens');

      // Code lenses are already resolved with commands
      // This handler is for deferred resolution if needed

      return codeLens;
    },
  };
}
