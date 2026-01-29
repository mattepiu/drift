/**
 * Drift LSP Server
 *
 * Main entry point for the Language Server Protocol implementation.
 * Creates and manages the LSP connection, registers handlers, and
 * coordinates between the editor and Drift core engine.
 *
 * @requirements 27.1 - THE LSP_Server SHALL implement the Language Server Protocol specification
 * @requirements 27.7 - THE LSP_Server SHALL respond to diagnostics within 200ms of file change
 */

import {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  DidChangeConfigurationNotification,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';


import { buildInitializeResult, clientSupportsConfiguration, clientSupportsWorkspaceFolders } from './capabilities.js';
import { createCodeActionsHandler } from './handlers/code-actions.js';
import { createCodeLensHandler } from './handlers/code-lens.js';
import { createCommandsHandler } from './handlers/commands.js';
import { createDiagnosticsHandler } from './handlers/diagnostics.js';
import { createDocumentSyncHandler } from './handlers/document-sync.js';
import { createHoverHandler } from './handlers/hover.js';
import { createInitializeHandler } from './handlers/initialize.js';

import type {
  Connection,
  InitializeParams,
  InitializeResult,
  TextDocumentChangeEvent,
} from 'vscode-languageserver';

// ============================================================================
// Types
// ============================================================================

/**
 * Server configuration options
 */
export interface ServerOptions {
  /** Workspace root path */
  workspaceRoot?: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Custom connection (for testing) */
  connection?: Connection;
}

/**
 * Server state
 */
export interface ServerState {
  /** Whether server has been initialized */
  initialized: boolean;
  /** Workspace folders */
  workspaceFolders: Array<{ uri: string; name: string }>;
  /** Client capabilities */
  hasConfigurationCapability: boolean;
  hasWorkspaceFolderCapability: boolean;
}

/**
 * Drift LSP Server interface
 */
export interface DriftServer {
  /** Start the server */
  start(): void;
  /** Stop the server */
  stop(): void;
  /** Get the LSP connection */
  getConnection(): Connection;
  /** Get the document manager */
  getDocuments(): TextDocuments<TextDocument>;
  /** Check if server is running */
  isRunning(): boolean;
}

// ============================================================================
// Logger
// ============================================================================

interface Logger {
  error(message: string): void;
  warn(message: string): void;
  info(message: string): void;
  debug(message: string): void;
}

function createLogger(connection: Connection, debug: boolean): Logger {
  return {
    error: (msg) => connection.console.error(`[drift-lsp] ${msg}`),
    warn: (msg) => connection.console.warn(`[drift-lsp] ${msg}`),
    info: (msg) => connection.console.info(`[drift-lsp] ${msg}`),
    debug: (msg) => {
      if (debug) {
        connection.console.log(`[drift-lsp] DEBUG: ${msg}`);
      }
    },
  };
}

// ============================================================================
// Server Factory
// ============================================================================

/**
 * Create a new Drift LSP server instance
 */
export function createDriftServer(options: ServerOptions = {}): DriftServer {
  // Create connection
  const connection = options.connection ?? createConnection(ProposedFeatures.all);

  // Create document manager
  const documents = new TextDocuments(TextDocument);

  // Create logger
  const logger = createLogger(connection, options.debug ?? false);

  // Server state
  const state: ServerState = {
    initialized: false,
    workspaceFolders: [],
    hasConfigurationCapability: false,
    hasWorkspaceFolderCapability: false,
  };

  // Track running state
  let isServerRunning = false;

  // Diagnostic timers for debouncing
  const diagnosticTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // ============================================================================
  // Initialize Handler
  // ============================================================================

  connection.onInitialize((params: InitializeParams): InitializeResult => {
    logger.info('Initializing Drift LSP server...');

    // Check client capabilities
    state.hasConfigurationCapability = clientSupportsConfiguration(
      params.capabilities as Record<string, unknown>
    );
    state.hasWorkspaceFolderCapability = clientSupportsWorkspaceFolders(
      params.capabilities as Record<string, unknown>
    );

    // Store workspace folders
    if (params.workspaceFolders) {
      state.workspaceFolders = params.workspaceFolders.map((f) => ({
        uri: f.uri,
        name: f.name,
      }));
    } else if (params.rootUri) {
      state.workspaceFolders = [{ uri: params.rootUri, name: 'workspace' }];
    }

    logger.info(`Workspace folders: ${state.workspaceFolders.map((f) => f.name).join(', ')}`);

    return buildInitializeResult();
  });

  connection.onInitialized(() => {
    logger.info('Drift LSP server initialized');
    state.initialized = true;

    // Register for configuration changes
    if (state.hasConfigurationCapability) {
      connection.client.register(DidChangeConfigurationNotification.type, undefined);
    }

    // Register for workspace folder changes
    if (state.hasWorkspaceFolderCapability) {
      connection.workspace.onDidChangeWorkspaceFolders((event) => {
        for (const removed of event.removed) {
          const idx = state.workspaceFolders.findIndex((f) => f.uri === removed.uri);
          if (idx !== -1) {
            state.workspaceFolders.splice(idx, 1);
          }
        }
        for (const added of event.added) {
          state.workspaceFolders.push({ uri: added.uri, name: added.name });
        }
        logger.info(`Workspace folders changed: +${event.added.length}, -${event.removed.length}`);
      });
    }
  });

  // ============================================================================
  // Shutdown Handlers
  // ============================================================================

  connection.onShutdown(() => {
    logger.info('Drift LSP server shutting down...');
    state.initialized = false;

    // Clear all diagnostic timers
    for (const timer of diagnosticTimers.values()) {
      clearTimeout(timer);
    }
    diagnosticTimers.clear();
  });

  connection.onExit(() => {
    logger.info('Drift LSP server exiting');
    isServerRunning = false;
  });

  // ============================================================================
  // Create Handlers
  // ============================================================================

  // Note: Initialize handler is created for potential future use but initialization
  // is currently handled inline in connection.onInitialize and connection.onInitialized
  createInitializeHandler(connection, state, logger);
  const diagnosticsHandler = createDiagnosticsHandler(connection, documents, state, logger);
  const documentSyncHandler = createDocumentSyncHandler(
    connection,
    documents,
    diagnosticsHandler,
    logger
  );
  const codeActionsHandler = createCodeActionsHandler(connection, documents, diagnosticsHandler, logger);
  const hoverHandler = createHoverHandler(connection, documents, diagnosticsHandler, logger);
  const codeLensHandler = createCodeLensHandler(connection, documents, diagnosticsHandler, logger);
  const commandsHandler = createCommandsHandler(connection, documents, diagnosticsHandler, logger);

  // ============================================================================
  // Register Handlers
  // ============================================================================

  function registerHandlers(): void {
    logger.debug('Registering LSP handlers...');

    // Document sync events
    documents.onDidChangeContent((event: TextDocumentChangeEvent<TextDocument>) => {
      documentSyncHandler.onDidChangeContent(event);
    });

    documents.onDidOpen((event) => {
      documentSyncHandler.onDidOpen(event.document);
    });

    documents.onDidSave((event) => {
      documentSyncHandler.onDidSave(event.document);
    });

    documents.onDidClose((event) => {
      documentSyncHandler.onDidClose(event.document);
    });

    // Code actions
    connection.onCodeAction(codeActionsHandler.onCodeAction);
    connection.onCodeActionResolve(codeActionsHandler.onCodeActionResolve);

    // Hover
    connection.onHover(hoverHandler.onHover);

    // Code lens
    connection.onCodeLens(codeLensHandler.onCodeLens);
    connection.onCodeLensResolve(codeLensHandler.onCodeLensResolve);

    // Commands
    connection.onExecuteCommand(commandsHandler.onExecuteCommand);

    // Start listening on documents
    documents.listen(connection);

    logger.debug('LSP handlers registered');
  }

  // ============================================================================
  // Server Interface
  // ============================================================================

  return {
    start(): void {
      if (isServerRunning) {
        logger.warn('Server already running');
        return;
      }

      logger.info('Starting Drift LSP server...');
      registerHandlers();
      connection.listen();
      isServerRunning = true;
    },

    stop(): void {
      if (!isServerRunning) {
        logger.warn('Server not running');
        return;
      }

      logger.info('Stopping Drift LSP server...');

      // Clear diagnostic timers
      for (const timer of diagnosticTimers.values()) {
        clearTimeout(timer);
      }
      diagnosticTimers.clear();

      connection.dispose();
      isServerRunning = false;
    },

    getConnection(): Connection {
      return connection;
    },

    getDocuments(): TextDocuments<TextDocument> {
      return documents;
    },

    isRunning(): boolean {
      return isServerRunning;
    },
  };
}

/**
 * Create and start a Drift LSP server
 */
export function startDriftServer(options: ServerOptions = {}): DriftServer {
  const server = createDriftServer(options);
  server.start();
  return server;
}
