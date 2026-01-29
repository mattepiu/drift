/**
 * Scan command handlers
 * 
 * Single responsibility: Handle scan-related commands.
 */

import * as vscode from 'vscode';

import { DRIFT_COMMANDS } from '../command-definitions.js';

import type { ConnectionManager } from '../../client/index.js';
import type { EventBus } from '../../infrastructure/event-bus.js';
import type { StateManager } from '../../state/index.js';
import type { NotificationService } from '../../ui/notifications/notification-service.js';
import type { CommandRouter, CommandContext } from '../command-router.js';


/**
 * Create scan command handlers
 */
export function createScanHandlers(
  router: CommandRouter,
  connectionManager: ConnectionManager,
  stateManager: StateManager,
  notifications: NotificationService,
  eventBus: EventBus
): void {
  // Rescan workspace command
  router.register({
    id: DRIFT_COMMANDS.rescan,
    showProgress: true,
    progressTitle: 'Scanning workspace...',
    handler: async (ctx: CommandContext) => {
      const client = connectionManager.getClient();
      if (!client) {
        throw new Error('Not connected to server');
      }

      // Update state to scanning
      stateManager.update(draft => {
        draft.workspace.scanning = true;
      });

      eventBus.emit('scan:started', { files: 0 });

      try {
        ctx.progress?.report({ message: 'Analyzing patterns...' });

        const result = await client.sendRequest<{
          patterns: number;
          violations: number;
          duration: number;
        }>('drift/rescan');

        // Update state with results
        stateManager.update(draft => {
          draft.workspace.scanning = false;
          draft.workspace.lastScanTime = Date.now();
          draft.patterns.total = result.patterns;
          draft.violations.total = result.violations;
        });

        eventBus.emit('scan:completed', {
          duration: result.duration,
          patterns: result.patterns,
          violations: result.violations,
        });

        await notifications.info(
          `Scan complete: ${String(result.patterns)} patterns, ${String(result.violations)} violations`
        );
      } catch (error) {
        stateManager.update(draft => {
          draft.workspace.scanning = false;
        });
        throw error;
      }
    },
  });

  // Scan current file command
  router.register({
    id: DRIFT_COMMANDS.scanFile,
    handler: async (_ctx: CommandContext) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        await notifications.warning('No file is currently open.');
        return;
      }

      const client = connectionManager.getClient();
      if (!client) {
        throw new Error('Not connected to server');
      }

      const uri = editor.document.uri.toString();

      await notifications.withProgress('Scanning file...', async (progress) => {
        progress.report({ message: editor.document.fileName });

        await client.sendRequest('drift/scanFile', { uri });

        await notifications.info('File scan complete.');
      });
    },
  });
}
