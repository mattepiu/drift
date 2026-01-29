/**
 * NotificationService - User notification management
 * 
 * Single responsibility: Display notifications to users.
 */

import * as vscode from 'vscode';

import type { Logger } from '../../infrastructure/index.js';

/**
 * Notification action
 */
export interface NotificationAction {
  title: string;
  command?: string;
  args?: unknown[];
  callback?: () => void | Promise<void>;
}

/**
 * Notification options
 */
export interface NotificationOptions {
  modal?: boolean;
  detail?: string;
}

/**
 * Notification service for user messages
 */
export class NotificationService {
  constructor(private readonly logger: Logger) {}

  /**
   * Show an information message
   */
  async info(
    message: string,
    actions: NotificationAction[] = [],
    options: NotificationOptions = {}
  ): Promise<string | undefined> {
    return this.show('info', message, actions, options);
  }

  /**
   * Show a warning message
   */
  async warning(
    message: string,
    actions: NotificationAction[] = [],
    options: NotificationOptions = {}
  ): Promise<string | undefined> {
    return this.show('warning', message, actions, options);
  }

  /**
   * Show an error message
   */
  async error(
    message: string,
    actions: NotificationAction[] = [],
    options: NotificationOptions = {}
  ): Promise<string | undefined> {
    this.logger.error(message);
    return this.show('error', message, actions, options);
  }

  /**
   * Show a progress notification
   */
  async withProgress<T>(
    title: string,
    task: (
      progress: vscode.Progress<{ message?: string; increment?: number }>,
      token: vscode.CancellationToken
    ) => Promise<T>,
    options: { cancellable?: boolean; location?: vscode.ProgressLocation } = {}
  ): Promise<T> {
    return vscode.window.withProgress(
      {
        location: options.location ?? vscode.ProgressLocation.Notification,
        title: `Drift: ${title}`,
        cancellable: options.cancellable ?? false,
      },
      task
    );
  }

  /**
   * Show a quick pick
   */
  async quickPick<T extends vscode.QuickPickItem>(
    items: T[],
    options: vscode.QuickPickOptions = {}
  ): Promise<T | undefined> {
    const pickOptions: vscode.QuickPickOptions = {
      ...options,
    };
    if (options.title !== null && options.title !== '') {
      pickOptions.title = `Drift: ${options.title}`;
    }
    return vscode.window.showQuickPick(items, pickOptions);
  }

  /**
   * Show an input box
   */
  async inputBox(options: vscode.InputBoxOptions = {}): Promise<string | undefined> {
    const inputOptions: vscode.InputBoxOptions = {
      ...options,
    };
    if (options.title !== null && options.title !== '') {
      inputOptions.title = `Drift: ${options.title}`;
    }
    return vscode.window.showInputBox(inputOptions);
  }

  private async show(
    type: 'info' | 'warning' | 'error',
    message: string,
    actions: NotificationAction[],
    options: NotificationOptions
  ): Promise<string | undefined> {
    const actionTitles = actions.map(a => a.title);
    
    const showFn = {
      info: vscode.window.showInformationMessage,
      warning: vscode.window.showWarningMessage,
      error: vscode.window.showErrorMessage,
    }[type];

    const messageOptions: vscode.MessageOptions = {};
    if (options.modal !== undefined) {
      messageOptions.modal = options.modal;
    }
    if (options.detail !== null && options.detail !== '' && options.detail !== undefined) {
      messageOptions.detail = options.detail;
    }

    const selected = await showFn(
      `Drift: ${message}`,
      messageOptions,
      ...actionTitles
    );

    if (selected !== null && selected !== '') {
      const action = actions.find(a => a.title === selected);
      if (action) {
        if (action.callback) {
          await action.callback();
        } else if (action.command) {
          await vscode.commands.executeCommand(action.command, ...(action.args ?? []));
        }
      }
    }

    return selected;
  }
}

/**
 * Factory function for creating notification service
 */
export function createNotificationService(logger: Logger): NotificationService {
  return new NotificationService(logger);
}
