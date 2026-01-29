/**
 * Violation command handlers
 * 
 * Single responsibility: Handle violation-related commands.
 */

import * as vscode from 'vscode';

import { DRIFT_COMMANDS } from '../command-definitions.js';

import type { ConnectionManager } from '../../client/index.js';
import type { NotificationService } from '../../ui/notifications/notification-service.js';
import type { CommandRouter, CommandContext } from '../command-router.js';


/**
 * Create violation command handlers
 */
export function createViolationHandlers(
  router: CommandRouter,
  connectionManager: ConnectionManager,
  notifications: NotificationService
): void {
  // Show violations command
  router.register({
    id: DRIFT_COMMANDS.showViolations,
    handler: async (_ctx: CommandContext) => {
      // Focus the violations tree view
      await vscode.commands.executeCommand('drift.violations.focus');
    },
  });

  // Ignore once command
  router.register({
    id: DRIFT_COMMANDS.ignoreOnce,
    handler: async (ctx: CommandContext) => {
      const client = connectionManager.getClient();
      if (!client) {
        throw new Error('Not connected to server');
      }

      const violationId = ctx.args[0] as string | undefined;
      const uri = ctx.args[1] as string | undefined;
      const line = ctx.args[2] as number | undefined;

      if (violationId === null || violationId === '' || uri === null || uri === '' || line === undefined) {
        // Try to get from current editor position
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          await notifications.warning('No violation selected.');
          return;
        }

        const position = editor.selection.active;
        const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
        const driftDiagnostic = diagnostics.find(
          d => d.source === 'drift' && d.range.contains(position)
        );

        if (!driftDiagnostic) {
          await notifications.warning('No Drift violation at cursor position.');
          return;
        }

        // Extract violation ID from diagnostic data
        interface DiagnosticData {
          violationId?: string;
        }
        const data = (driftDiagnostic as vscode.Diagnostic & { data?: DiagnosticData }).data;
        if (data?.violationId === null || data?.violationId === undefined) {
          await notifications.warning('Cannot identify violation.');
          return;
        }

        await client.sendRequest('drift/violations/ignoreOnce', {
          violationId: data.violationId,
          uri: editor.document.uri.toString(),
          line: driftDiagnostic.range.start.line,
        });
      } else {
        await client.sendRequest('drift/violations/ignoreOnce', {
          violationId,
          uri,
          line,
        });
      }

      await notifications.info('Violation ignored for this occurrence.');
    },
  });

  // Quick fix command
  router.register({
    id: DRIFT_COMMANDS.quickFix,
    handler: async (_ctx: CommandContext) => {
      // Trigger VS Code's built-in quick fix
      await vscode.commands.executeCommand('editor.action.quickFix');
    },
  });
}
