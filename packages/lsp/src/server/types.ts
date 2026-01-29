/**
 * Server Types - Core types for the LSP server
 *
 * These types define the server context, state, and interfaces
 * used throughout the LSP implementation.
 */

import type {
  DriftDiagnostic,
  ServerState,
  ServerConfiguration,
  PatternInfo,
  ViolationInfo,
  DocumentState,
} from '../types/lsp-types.js';
import type { Connection, TextDocuments } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';

// ============================================================================
// Logger Interface
// ============================================================================

/**
 * Logger interface for server logging
 */
export interface Logger {
  error(message: string): void;
  warn(message: string): void;
  info(message: string): void;
  debug(message: string): void;
}

// ============================================================================
// Server Context
// ============================================================================

/**
 * Server context passed to handlers and commands
 */
export interface ServerContext {
  /** LSP connection */
  connection: Connection;
  /** Document manager */
  documents: TextDocuments<TextDocument>;
  /** Server state */
  state: ServerState;
  /** Logger instance */
  logger: Logger;
  /** Server configuration */
  configuration: ServerConfiguration;
}

// ============================================================================
// Document Scanner Interface
// ============================================================================

/**
 * Document scanner interface for scanning documents for violations
 */
export interface DocumentScanner {
  /** Scan a document for violations */
  scan(uri: string): Promise<ViolationInfo[]>;
  /** Invalidate cache for a document */
  invalidate(uri: string): void;
  /** Clear all cached scan results */
  clearCache(): void;
  /** Check if a document is cached */
  isCached(uri: string): boolean;
}

// ============================================================================
// Diagnostic Publisher Interface
// ============================================================================

/**
 * Diagnostic publisher interface for publishing diagnostics
 */
export interface DiagnosticPublisher {
  /** Publish diagnostics for a document */
  publish(uri: string): Promise<void>;
  /** Clear diagnostics for a document */
  clear(uri: string): void;
  /** Clear all diagnostics */
  clearAll(): void;
  /** Get diagnostics for a document */
  get(uri: string): DriftDiagnostic[];
}

// ============================================================================
// Pattern Store Interface
// ============================================================================

/**
 * Pattern store interface for managing patterns
 */
export interface PatternStore {
  /** Get a pattern by ID */
  get(patternId: string): PatternInfo | undefined;
  /** Get all patterns */
  getAll(): PatternInfo[];
  /** Add or update a pattern */
  set(pattern: PatternInfo): void;
  /** Remove a pattern */
  delete(patternId: string): boolean;
  /** Check if a pattern exists */
  has(patternId: string): boolean;
  /** Get patterns by category */
  getByCategory(category: string): PatternInfo[];
  /** Approve a pattern */
  approve(patternId: string): Promise<void>;
  /** Ignore a pattern */
  ignore(patternId: string): Promise<void>;
}

// ============================================================================
// Violation Store Interface
// ============================================================================

/**
 * Violation store interface for managing violations
 */
export interface ViolationStore {
  /** Get violations for a document */
  get(uri: string): ViolationInfo[];
  /** Set violations for a document */
  set(uri: string, violations: ViolationInfo[]): void;
  /** Add a violation */
  add(uri: string, violation: ViolationInfo): void;
  /** Remove a violation */
  remove(uri: string, violationId: string): boolean;
  /** Clear violations for a document */
  clear(uri: string): void;
  /** Clear all violations */
  clearAll(): void;
  /** Get all violations */
  getAll(): Map<string, ViolationInfo[]>;
}

// ============================================================================
// Handler Interfaces
// ============================================================================

/**
 * Initialize handler interface
 */
export interface InitializeHandler {
  onInitialize(): void;
  onInitialized(): void;
}

/**
 * Document sync handler interface
 */
export interface DocumentSyncHandler {
  onDidOpen(document: TextDocument): void;
  onDidChangeContent(document: TextDocument): void;
  onDidSave(document: TextDocument): void;
  onDidClose(document: TextDocument): void;
}

/**
 * Diagnostics handler interface
 */
export interface DiagnosticsHandler {
  publishDiagnostics(uri: string): Promise<void>;
  clearDiagnostics(uri: string): void;
  clearAllDiagnostics(): void;
  getDiagnostics(uri: string): DriftDiagnostic[];
  getDiagnosticAtPosition(uri: string, line: number, character: number): DriftDiagnostic | undefined;
  getViolations(uri: string): ViolationInfo[];
  scheduleUpdate(uri: string, delayMs?: number): void;
  cancelUpdate(uri: string): void;
}

// ============================================================================
// Command Result
// ============================================================================

/**
 * Result of executing a command
 */
export interface CommandResult {
  success: boolean;
  message?: string;
  data?: unknown;
  error?: string;
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export type {
  DriftDiagnostic,
  ServerState,
  ServerConfiguration,
  PatternInfo,
  ViolationInfo,
  DocumentState,
};
