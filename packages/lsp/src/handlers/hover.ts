/**
 * Hover Handler
 *
 * Provides hover information for pattern violations.
 * Shows violation details, pattern information, and available actions.
 *
 * @requirements 27.5 - THE LSP_Server SHALL provide hover information for violations
 */

import type { DiagnosticsHandler, ViolationDiagnostic } from './diagnostics.js';
import type {
  Connection,
  TextDocuments,
  Hover,
  HoverParams,
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
 * Hover handler interface
 */
export interface HoverHandler {
  /** Handle hover request */
  onHover(params: HoverParams): Hover | null;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get severity icon for display
 */
function getSeverityIcon(severity: number | undefined): string {
  switch (severity) {
    case 1: // Error
      return '🔴';
    case 2: // Warning
      return '🟡';
    case 3: // Information
      return '🔵';
    case 4: // Hint
      return '💡';
    default:
      return '⚪';
  }
}

/**
 * Get severity name for display
 */
function getSeverityName(severity: number | undefined): string {
  switch (severity) {
    case 1:
      return 'Error';
    case 2:
      return 'Warning';
    case 3:
      return 'Info';
    case 4:
      return 'Hint';
    default:
      return 'Unknown';
  }
}

/**
 * Generate hover content for a diagnostic
 */
function generateHoverContent(diagnostic: ViolationDiagnostic): string {
  const lines: string[] = [];
  const data = diagnostic.data;

  // Header with severity icon
  const icon = getSeverityIcon(diagnostic.severity);
  const severityName = getSeverityName(diagnostic.severity);
  lines.push(`## ${icon} Drift Violation (${severityName})`);
  lines.push('');

  // Message
  lines.push(`**Message:** ${diagnostic.message}`);
  lines.push('');

  // Pattern information
  if (data) {
    lines.push(`**Pattern:** \`${data.patternId}\``);
    lines.push('');
  }

  // Divider
  lines.push('---');
  lines.push('');

  // Available actions
  lines.push('### Available Actions');
  lines.push('');

  if (data?.hasQuickFix) {
    lines.push('- 💡 **Quick Fix** available');
  }

  lines.push('- ✅ **Approve** this pattern');
  lines.push('- 🚫 **Ignore** this pattern');
  lines.push('- 📝 **Create Variant** for intentional deviation');

  if (data?.aiExplainAvailable) {
    lines.push('- 🤖 **Explain with AI**');
  }

  if (data?.aiFixAvailable) {
    lines.push('- 🔧 **Fix with AI**');
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('*Use Quick Fix (Ctrl+.) to see available actions*');

  return lines.join('\n');
}

// ============================================================================
// Handler Factory
// ============================================================================

/**
 * Create the hover handler
 */
export function createHoverHandler(
  _connection: Connection,
  _documents: TextDocuments<TextDocument>,
  diagnosticsHandler: DiagnosticsHandler,
  logger: Logger
): HoverHandler {
  return {
    onHover(params: HoverParams): Hover | null {
      const uri = params.textDocument.uri;
      const position = params.position;

      logger.debug(`Hover request at ${uri}:${position.line}:${position.character}`);

      // Find diagnostic at this position
      const diagnostic = diagnosticsHandler.getDiagnosticAtPosition(
        uri,
        position.line,
        position.character
      );

      if (!diagnostic) {
        // No violation at this position
        return null;
      }

      // Generate hover content
      const content = generateHoverContent(diagnostic);

      return {
        contents: {
          kind: 'markdown',
          value: content,
        },
        range: diagnostic.range,
      };
    },
  };
}
