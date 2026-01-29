/**
 * Constants command handlers
 *
 * Handlers for constants-related commands.
 */

import * as vscode from 'vscode';

import type { ConstantsTreeProvider } from '../../views/constants-tree-provider.js';

/**
 * Create constants command handlers
 */
export function createConstantsHandlers(
  constantsProvider: ConstantsTreeProvider
): Record<string, (...args: unknown[]) => Promise<void>> {
  return {
    /**
     * Show constants view by category
     */
    'drift.showConstantsByCategory': async (): Promise<void> => {
      constantsProvider.setViewMode('category');
      await vscode.commands.executeCommand('drift.constantsView.focus');
    },

    /**
     * Show constants view by language
     */
    'drift.showConstantsByLanguage': async (): Promise<void> => {
      constantsProvider.setViewMode('language');
      await vscode.commands.executeCommand('drift.constantsView.focus');
    },

    /**
     * Show constant issues
     */
    'drift.showConstantIssues': async (): Promise<void> => {
      constantsProvider.setViewMode('issues');
      await vscode.commands.executeCommand('drift.constantsView.focus');
    },

    /**
     * Go to constant definition
     */
    'drift.goToConstant': async (file: unknown, line: unknown): Promise<void> => {
      if (typeof file !== 'string' || typeof line !== 'number') {
        return;
      }

      try {
        const uri = vscode.Uri.file(file);
        const document = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(document);

        const position = new vscode.Position(Math.max(0, line - 1), 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
          new vscode.Range(position, position),
          vscode.TextEditorRevealType.InCenter
        );
      } catch {
        void vscode.window.showErrorMessage(`Failed to open file: ${file}`);
      }
    },

    /**
     * Find constant usages
     */
    'drift.findConstantUsages': async (constantName: unknown): Promise<void> => {
      let searchName = constantName;
      if (typeof searchName !== 'string' || searchName === '') {
        // If no constant name provided, prompt for one
        const input = await vscode.window.showInputBox({
          prompt: 'Enter constant name to search for',
          placeHolder: 'CONSTANT_NAME',
        });
        if (input === null || input === '') {
          return;
        }
        searchName = input;
      }

      // Use VSCode's built-in search
      await vscode.commands.executeCommand('workbench.action.findInFiles', {
        query: searchName,
        isRegex: false,
        isCaseSensitive: true,
        matchWholeWord: true,
      });
    },

    /**
     * Show constants overview
     */
    'drift.showConstants': async (): Promise<void> => {
      constantsProvider.setViewMode('category');
      await vscode.commands.executeCommand('drift.constantsView.focus');
    },
  };
}
