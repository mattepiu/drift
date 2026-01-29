/**
 * Document Sync Handler
 *
 * Handles document synchronization events: open, change, save, close.
 * Triggers diagnostic updates when documents change.
 *
 * @requirements 27.2 - THE LSP_Server SHALL support document synchronization (open, change, save, close)
 * @requirements 27.7 - THE LSP_Server SHALL respond to diagnostics within 200ms of file change
 */

import type { DiagnosticsHandler } from './diagnostics.js';
import type { Connection, TextDocuments, TextDocumentChangeEvent } from 'vscode-languageserver';
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
 * Document sync handler interface
 */
export interface DocumentSyncHandler {
  /** Handle document open */
  onDidOpen(document: TextDocument): void;
  /** Handle document content change */
  onDidChangeContent(event: TextDocumentChangeEvent<TextDocument>): void;
  /** Handle document save */
  onDidSave(document: TextDocument): void;
  /** Handle document close */
  onDidClose(document: TextDocument): void;
}

// ============================================================================
// Handler Factory
// ============================================================================

/**
 * Create the document sync handler
 */
export function createDocumentSyncHandler(
  _connection: Connection,
  _documents: TextDocuments<TextDocument>,
  diagnosticsHandler: DiagnosticsHandler,
  logger: Logger
): DocumentSyncHandler {
  return {
    onDidOpen(document: TextDocument): void {
      const uri = document.uri;
      logger.debug(`Document opened: ${uri}`);

      // Publish diagnostics immediately for newly opened documents
      diagnosticsHandler.scheduleUpdate(uri, 0);
    },

    onDidChangeContent(event: TextDocumentChangeEvent<TextDocument>): void {
      const document = event.document;
      const uri = document.uri;

      logger.debug(`Document changed: ${uri} (v${document.version})`);

      // Schedule diagnostic update with debouncing
      // This ensures we meet the 200ms latency requirement while
      // avoiding excessive updates during rapid typing
      diagnosticsHandler.scheduleUpdate(uri);
    },

    onDidSave(document: TextDocument): void {
      const uri = document.uri;
      logger.debug(`Document saved: ${uri}`);

      // Publish diagnostics immediately on save
      diagnosticsHandler.publishDiagnostics(uri);
    },

    onDidClose(document: TextDocument): void {
      const uri = document.uri;
      logger.debug(`Document closed: ${uri}`);

      // Cancel any pending updates
      diagnosticsHandler.cancelUpdate(uri);

      // Clear diagnostics for closed document
      diagnosticsHandler.clearDiagnostics(uri);
    },
  };
}
