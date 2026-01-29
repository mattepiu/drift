/**
 * Connection command handlers
 * 
 * Single responsibility: Handle connection-related commands.
 */

import { DRIFT_COMMANDS } from '../command-definitions.js';

import type { ConnectionManager } from '../../client/index.js';
import type { StateManager } from '../../state/index.js';
import type { NotificationService } from '../../ui/notifications/notification-service.js';
import type { CommandRouter, CommandContext } from '../command-router.js';


/**
 * Create connection command handlers
 */
export function createConnectionHandlers(
  router: CommandRouter,
  connectionManager: ConnectionManager,
  stateManager: StateManager,
  notifications: NotificationService
): void {
  // Reconnect command
  router.register({
    id: DRIFT_COMMANDS.reconnect,
    handler: async (_ctx: CommandContext) => {
      await notifications.withProgress('Reconnecting...', async (progress) => {
        progress.report({ message: 'Disconnecting...' });
        await connectionManager.disconnect();
        
        progress.report({ message: 'Connecting...' });
        await connectionManager.connect();
      });
    },
  });

  // Show status command
  router.register({
    id: DRIFT_COMMANDS.showStatus,
    handler: async (_ctx: CommandContext) => {
      const state = stateManager.getState();
      const { connection, patterns, violations, workspace } = state;

      const items = [
        `Connection: ${connection.status}`,
        `Server Version: ${connection.serverVersion ?? 'Unknown'}`,
        `Patterns: ${String(patterns.total)}`,
        `Violations: ${String(violations.total)}`,
        `Last Scan: ${workspace.lastScanTime !== null ? new Date(workspace.lastScanTime).toLocaleString() : 'Never'}`,
      ];

      await notifications.info(items.join('\n'), [], { detail: 'Drift Status' });
    },
  });

  // Show error command
  router.register({
    id: DRIFT_COMMANDS.showError,
    handler: async (_ctx: CommandContext) => {
      const state = stateManager.getState();
      const error = state.connection.lastError;

      if (error !== null && error !== '') {
        await notifications.error(error, [
          { title: 'Retry', command: DRIFT_COMMANDS.reconnect },
          { title: 'Show Logs', command: 'drift.showLogs' },
        ]);
      } else {
        await notifications.info('No errors to display.');
      }
    },
  });
}
