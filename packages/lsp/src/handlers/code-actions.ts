/**
 * Code Actions Handler
 *
 * Provides code actions (quick fixes) for pattern violations.
 * Supports quick fixes, refactoring actions, and source actions.
 *
 * @requirements 27.4 - THE LSP_Server SHALL provide code actions for quick fixes
 */

import { CodeActionKind } from 'vscode-languageserver';

import { DRIFT_COMMANDS } from '../capabilities.js';

import type { DiagnosticsHandler, ViolationDiagnostic } from './diagnostics.js';
import type {
  Connection,
  TextDocuments,
  CodeAction,
  CodeActionParams,
  Range,
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
 * Code actions handler interface
 */
export interface CodeActionsHandler {
  /** Handle code action request */
  onCodeAction(params: CodeActionParams): CodeAction[] | null;
  /** Handle code action resolve request */
  onCodeActionResolve(codeAction: CodeAction): CodeAction;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if two ranges overlap
 */
function rangesOverlap(a: Range, b: Range): boolean {
  // a ends before b starts
  if (a.end.line < b.start.line) {
    return false;
  }
  if (a.end.line === b.start.line && a.end.character < b.start.character) {
    return false;
  }

  // b ends before a starts
  if (b.end.line < a.start.line) {
    return false;
  }
  if (b.end.line === a.start.line && b.end.character < a.start.character) {
    return false;
  }

  return true;
}

// ============================================================================
// Handler Factory
// ============================================================================

/**
 * Create the code actions handler
 */
export function createCodeActionsHandler(
  _connection: Connection,
  _documents: TextDocuments<TextDocument>,
  diagnosticsHandler: DiagnosticsHandler,
  logger: Logger
): CodeActionsHandler {
  /**
   * Create code actions for a diagnostic
   */
  function createActionsForDiagnostic(
    diagnostic: ViolationDiagnostic,
    uri: string
  ): CodeAction[] {
    const actions: CodeAction[] = [];
    const data = diagnostic.data;

    if (!data) {
      return actions;
    }

    const { violationId, patternId, hasQuickFix, aiExplainAvailable, aiFixAvailable } = data;

    // Quick fix action (if available)
    if (hasQuickFix) {
      actions.push({
        title: 'Fix this violation',
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        isPreferred: true,
        // Edit will be resolved in onCodeActionResolve
        data: {
          type: 'quickfix',
          violationId,
          patternId,
          uri,
        },
      });
    }

    // Approve pattern action
    actions.push({
      title: `Approve pattern: ${patternId}`,
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      command: {
        title: 'Approve Pattern',
        command: DRIFT_COMMANDS.APPROVE_PATTERN,
        arguments: [patternId],
      },
    });

    // Ignore pattern action
    actions.push({
      title: `Ignore pattern: ${patternId}`,
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      command: {
        title: 'Ignore Pattern',
        command: DRIFT_COMMANDS.IGNORE_PATTERN,
        arguments: [patternId],
      },
    });

    // Ignore this occurrence
    actions.push({
      title: 'Ignore this occurrence',
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      command: {
        title: 'Ignore Once',
        command: DRIFT_COMMANDS.IGNORE_ONCE,
        arguments: [violationId, uri, diagnostic.range.start.line],
      },
    });

    // Create variant action
    actions.push({
      title: `Create variant for: ${patternId}`,
      kind: CodeActionKind.Refactor,
      diagnostics: [diagnostic],
      command: {
        title: 'Create Variant',
        command: DRIFT_COMMANDS.CREATE_VARIANT,
        arguments: [patternId, violationId],
      },
    });

    // AI explain action (if available)
    if (aiExplainAvailable) {
      actions.push({
        title: 'Explain with AI',
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        command: {
          title: 'Explain with AI',
          command: DRIFT_COMMANDS.EXPLAIN_AI,
          arguments: [violationId, patternId],
        },
      });
    }

    // AI fix action (if available)
    if (aiFixAvailable) {
      actions.push({
        title: 'Fix with AI',
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        command: {
          title: 'Fix with AI',
          command: DRIFT_COMMANDS.FIX_AI,
          arguments: [violationId, uri],
        },
      });
    }

    return actions;
  }

  return {
    onCodeAction(params: CodeActionParams): CodeAction[] | null {
      const uri = params.textDocument.uri;
      const requestRange = params.range;

      logger.debug(`Code action request for ${uri} at ${requestRange.start.line}:${requestRange.start.character}`);

      // Get diagnostics for this document
      const diagnostics = diagnosticsHandler.getDiagnostics(uri);

      if (diagnostics.length === 0) {
        return null;
      }

      // Find diagnostics that overlap with the request range
      const relevantDiagnostics = diagnostics.filter((d) =>
        rangesOverlap(d.range, requestRange)
      );

      if (relevantDiagnostics.length === 0) {
        return null;
      }

      // Generate code actions for each relevant diagnostic
      const actions: CodeAction[] = [];

      for (const diagnostic of relevantDiagnostics) {
        const diagnosticActions = createActionsForDiagnostic(diagnostic, uri);
        actions.push(...diagnosticActions);
      }

      logger.debug(`Generated ${actions.length} code actions`);

      return actions;
    },

    onCodeActionResolve(codeAction: CodeAction): CodeAction {
      logger.debug(`Resolving code action: ${codeAction.title}`);

      // If the code action has data, resolve the edit
      if (codeAction.data) {
        const data = codeAction.data as {
          type: string;
          violationId: string;
          patternId: string;
          uri: string;
        };

        if (data.type === 'quickfix') {
          // TODO: Get the actual quick fix from the violation
          // and populate the edit field
          const violations = diagnosticsHandler.getViolations(data.uri);
          const violation = violations.find((v) => v.id === data.violationId);

          if (violation?.quickFix) {
            codeAction.edit = {
              changes: violation.quickFix.edit.changes,
            };
          }
        }
      }

      return codeAction;
    },
  };
}
