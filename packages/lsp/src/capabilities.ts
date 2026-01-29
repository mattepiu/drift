/**
 * LSP Server Capabilities
 *
 * Defines the capabilities that the Drift LSP server advertises to clients.
 * Based on the Language Server Protocol specification.
 *
 * @requirements 27.1 - THE LSP_Server SHALL implement the Language Server Protocol specification
 * @requirements 27.2 - THE LSP_Server SHALL support document synchronization
 * @requirements 27.3 - THE LSP_Server SHALL publish diagnostics for violations
 * @requirements 27.4 - THE LSP_Server SHALL provide code actions for quick fixes
 * @requirements 27.5 - THE LSP_Server SHALL provide hover information for violations
 * @requirements 27.6 - THE LSP_Server SHALL provide code lens for pattern information
 */

import {
  TextDocumentSyncKind,
  CodeActionKind,
} from 'vscode-languageserver';

import type { ServerCapabilities, InitializeResult } from 'vscode-languageserver';

// ============================================================================
// Server Information
// ============================================================================

/**
 * Server identification information
 */
export const SERVER_INFO = {
  name: 'drift-lsp',
  version: '0.0.1',
} as const;

// ============================================================================
// Command Definitions
// ============================================================================

/**
 * All Drift LSP commands
 * @requirements 28.1-28.9 - LSP Server Commands
 */
export const DRIFT_COMMANDS = {
  /** Approve a pattern for enforcement */
  APPROVE_PATTERN: 'drift.approvePattern',
  /** Ignore a pattern (don't enforce) */
  IGNORE_PATTERN: 'drift.ignorePattern',
  /** Ignore a single occurrence of a violation */
  IGNORE_ONCE: 'drift.ignoreOnce',
  /** Create a variant (intentional deviation) */
  CREATE_VARIANT: 'drift.createVariant',
  /** Request AI explanation for a violation */
  EXPLAIN_AI: 'drift.explainWithAI',
  /** Request AI-generated fix for a violation */
  FIX_AI: 'drift.fixWithAI',
  /** Rescan workspace for patterns and violations */
  RESCAN: 'drift.rescan',
  /** Show all discovered patterns */
  SHOW_PATTERNS: 'drift.showPatterns',
  /** Show all current violations */
  SHOW_VIOLATIONS: 'drift.showViolations',
} as const;

/**
 * Array of all command IDs for registration
 */
export const ALL_COMMANDS: readonly string[] = Object.values(DRIFT_COMMANDS);

// ============================================================================
// Code Action Kinds
// ============================================================================

/**
 * Supported code action kinds
 */
export const SUPPORTED_CODE_ACTION_KINDS = [
  CodeActionKind.QuickFix,
  CodeActionKind.Refactor,
  CodeActionKind.Source,
] as const;

// ============================================================================
// Server Capabilities Builder
// ============================================================================

/**
 * Build the full server capabilities object
 *
 * This defines what the Drift LSP server can do, following the spec:
 * - textDocumentSync: Document synchronization with incremental changes
 * - diagnosticProvider: Publish diagnostics for violations
 * - codeActionProvider: Quick fixes and refactoring actions
 * - hoverProvider: Show violation details on hover
 * - codeLensProvider: Inline pattern information
 * - executeCommandProvider: All drift.* commands
 * - workspace: Workspace folder support and file operations
 */
export function buildServerCapabilities(): ServerCapabilities {
  return {
    // Document synchronization
    // @requirements 27.2 - Support document synchronization (open, change, save, close)
    textDocumentSync: {
      openClose: true,
      change: TextDocumentSyncKind.Incremental,
      save: { includeText: true },
    },

    // Diagnostics (squiggly lines)
    // @requirements 27.3 - Publish diagnostics for violations
    diagnosticProvider: {
      interFileDependencies: true,
      workspaceDiagnostics: true,
    },

    // Code actions (quick fixes)
    // @requirements 27.4 - Provide code actions for quick fixes
    codeActionProvider: {
      codeActionKinds: [...SUPPORTED_CODE_ACTION_KINDS],
      resolveProvider: true,
    },

    // Hover information
    // @requirements 27.5 - Provide hover information for violations
    hoverProvider: true,

    // Code lens (inline actions)
    // @requirements 27.6 - Provide code lens for pattern information
    codeLensProvider: {
      resolveProvider: true,
    },

    // Commands
    // @requirements 28.1-28.9 - All drift.* commands
    executeCommandProvider: {
      commands: [...ALL_COMMANDS],
    },

    // Workspace features
    workspace: {
      workspaceFolders: {
        supported: true,
        changeNotifications: true,
      },
      fileOperations: {
        didCreate: { filters: [{ pattern: { glob: '**/*' } }] },
        didRename: { filters: [{ pattern: { glob: '**/*' } }] },
        didDelete: { filters: [{ pattern: { glob: '**/*' } }] },
      },
    },
  };
}

/**
 * Build the initialize result to send to the client
 */
export function buildInitializeResult(): InitializeResult {
  return {
    capabilities: buildServerCapabilities(),
    serverInfo: { ...SERVER_INFO },
  };
}

// ============================================================================
// Client Capability Helpers
// ============================================================================

/**
 * Check if client supports a specific capability path
 */
export function clientSupportsCapability(
  clientCapabilities: Record<string, unknown> | undefined,
  path: string
): boolean {
  if (!clientCapabilities) {
    return false;
  }

  const parts = path.split('.');
  let current: unknown = clientCapabilities;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return false;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current === true || (typeof current === 'object' && current !== null);
}

/**
 * Check if client supports workspace configuration
 */
export function clientSupportsConfiguration(
  clientCapabilities: Record<string, unknown> | undefined
): boolean {
  return clientSupportsCapability(clientCapabilities, 'workspace.configuration');
}

/**
 * Check if client supports workspace folders
 */
export function clientSupportsWorkspaceFolders(
  clientCapabilities: Record<string, unknown> | undefined
): boolean {
  return clientSupportsCapability(clientCapabilities, 'workspace.workspaceFolders');
}

/**
 * Check if client supports work done progress
 */
export function clientSupportsWorkDoneProgress(
  clientCapabilities: Record<string, unknown> | undefined
): boolean {
  return clientSupportsCapability(clientCapabilities, 'window.workDoneProgress');
}

/**
 * Check if client supports diagnostic related information
 */
export function clientSupportsDiagnosticRelatedInfo(
  clientCapabilities: Record<string, unknown> | undefined
): boolean {
  return clientSupportsCapability(
    clientCapabilities,
    'textDocument.publishDiagnostics.relatedInformation'
  );
}
