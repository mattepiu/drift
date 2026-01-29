/**
 * Pattern command handlers
 * 
 * Single responsibility: Handle pattern-related commands.
 */

import * as vscode from 'vscode';

import { DRIFT_COMMANDS } from '../command-definitions.js';

import type { ConnectionManager } from '../../client/index.js';
import type { NotificationService } from '../../ui/notifications/notification-service.js';
import type { CommandRouter, CommandContext } from '../command-router.js';


/**
 * Pattern quick pick item with id
 */
interface PatternQuickPickItem extends vscode.QuickPickItem {
  id: string;
}

/**
 * Create pattern command handlers
 */
export function createPatternHandlers(
  router: CommandRouter,
  connectionManager: ConnectionManager,
  notifications: NotificationService
): void {
  // Show patterns command
  router.register({
    id: DRIFT_COMMANDS.showPatterns,
    handler: async (_ctx: CommandContext) => {
      // Focus the patterns tree view
      await vscode.commands.executeCommand('drift.patterns.focus');
    },
  });

  // Approve pattern command
  router.register({
    id: DRIFT_COMMANDS.approvePattern,
    handler: async (ctx: CommandContext) => {
      const client = connectionManager.getClient();
      if (!client) {
        throw new Error('Not connected to server');
      }

      const patternId = ctx.args[0] as string | undefined;
      
      if (patternId === null || patternId === '') {
        // Show pattern picker
        const patterns = await client.sendRequest<Array<{ id: string; name: string }>>(
          'drift/patterns/list',
          { status: 'discovered' }
        );

        if (patterns.length === 0) {
          await notifications.info('No patterns to approve.');
          return;
        }

        const items: PatternQuickPickItem[] = patterns.map((p: { id: string; name: string }) => ({
          label: p.name,
          description: p.id,
          id: p.id,
        }));

        const selected = await notifications.quickPick(items, { title: 'Select Pattern to Approve' });

        if (!selected) {return;}

        await client.sendRequest('drift/patterns/approve', { id: selected.id });
        await notifications.info(`Pattern "${selected.label}" approved.`);
      } else {
        await client.sendRequest('drift/patterns/approve', { id: patternId });
        await notifications.info(`Pattern approved.`);
      }
    },
  });

  // Ignore pattern command
  router.register({
    id: DRIFT_COMMANDS.ignorePattern,
    handler: async (ctx: CommandContext) => {
      const client = connectionManager.getClient();
      if (!client) {
        throw new Error('Not connected to server');
      }

      const patternId = ctx.args[0] as string | undefined;

      if (patternId === null || patternId === '') {
        // Show pattern picker
        const patterns = await client.sendRequest<Array<{ id: string; name: string }>>(
          'drift/patterns/list',
          { status: 'discovered' }
        );

        if (patterns.length === 0) {
          await notifications.info('No patterns to ignore.');
          return;
        }

        const items: PatternQuickPickItem[] = patterns.map((p: { id: string; name: string }) => ({
          label: p.name,
          description: p.id,
          id: p.id,
        }));

        const selected = await notifications.quickPick(items, { title: 'Select Pattern to Ignore' });

        if (!selected) {return;}

        await client.sendRequest('drift/patterns/ignore', { id: selected.id });
        await notifications.info(`Pattern "${selected.label}" ignored.`);
      } else {
        await client.sendRequest('drift/patterns/ignore', { id: patternId });
        await notifications.info(`Pattern ignored.`);
      }
    },
  });

  // Create variant command
  router.register({
    id: DRIFT_COMMANDS.createVariant,
    handler: async (ctx: CommandContext) => {
      const client = connectionManager.getClient();
      if (!client) {
        throw new Error('Not connected to server');
      }

      const patternId = ctx.args[0] as string | undefined;
      const violationId = ctx.args[1] as string | undefined;

      if (patternId === null || patternId === '') {
        await notifications.warning('No pattern specified for variant creation.');
        return;
      }

      // Get variant name from user
      const name = await notifications.inputBox({
        title: 'Create Variant',
        prompt: 'Enter a name for this variant',
        placeHolder: 'e.g., legacy-auth-pattern',
      });

      if (!name) {return;}

      // Get variant description
      const description = await notifications.inputBox({
        title: 'Create Variant',
        prompt: 'Enter a description (optional)',
        placeHolder: 'e.g., Used in legacy authentication module',
      });

      await client.sendRequest('drift/patterns/createVariant', {
        patternId,
        violationId,
        name,
        description,
      });

      await notifications.info(`Variant "${name}" created.`);
    },
  });
}
