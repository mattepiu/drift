/**
 * StatusBarController - Status bar management
 * 
 * Single responsibility: Display extension status in VS Code status bar.
 */

import * as vscode from 'vscode';

import { getStatusBarMode } from './status-bar-modes.js';
import { selectStatusBarData } from '../../state/selectors.js';

import type { StateManager } from '../../state/index.js';

/**
 * Status bar controller
 */
export class StatusBarController implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly stateManager: StateManager) {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );

    this.setupSubscriptions();
    this.updateDisplay();
    this.item.show();
  }

  /**
   * Show the status bar item
   */
  show(): void {
    this.item.show();
  }

  /**
   * Hide the status bar item
   */
  hide(): void {
    this.item.hide();
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.item.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  private setupSubscriptions(): void {
    // Subscribe to relevant state changes
    this.disposables.push(
      this.stateManager.subscribe(selectStatusBarData, () => {
        this.updateDisplay();
      })
    );
  }

  private updateDisplay(): void {
    const state = this.stateManager.getState();
    const { status, violations, scanning } = {
      status: state.connection.status,
      violations: state.violations.total,
      scanning: state.workspace.scanning,
    };

    const mode = getStatusBarMode(status, violations, scanning);

    this.item.text = `${mode.icon} ${mode.text}`;
    this.item.tooltip = this.buildTooltip(mode.tooltip, state);
    this.item.backgroundColor = mode.backgroundColor;
    this.item.command = mode.command;
  }

  private buildTooltip(baseTooltip: string, state: ReturnType<StateManager['getState']>): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportThemeIcons = true;

    md.appendMarkdown(`### $(drift-logo) Drift\n\n`);
    md.appendMarkdown(`${baseTooltip}\n\n`);

    // Add stats if connected
    if (state.connection.status === 'connected') {
      md.appendMarkdown(`---\n\n`);
      md.appendMarkdown(`**Patterns:** ${String(state.patterns.total)}\n\n`);
      md.appendMarkdown(`**Violations:** ${String(state.violations.total)}\n\n`);

      if (state.violations.total > 0) {
        md.appendMarkdown(`\n`);
        for (const [severity, count] of Object.entries(state.violations.bySeverity)) {
          if (count > 0) {
            const icon = this.getSeverityIcon(severity);
            md.appendMarkdown(`- ${icon} ${severity}: ${String(count)}\n`);
          }
        }
      }

      md.appendMarkdown(`\n---\n\n`);
      md.appendMarkdown(`[View Violations](command:drift.showViolations) | `);
      md.appendMarkdown(`[View Patterns](command:drift.showPatterns) | `);
      md.appendMarkdown(`[Rescan](command:drift.rescan)\n`);
    }

    return md;
  }

  private getSeverityIcon(severity: string): string {
    switch (severity) {
      case 'error':
        return '$(error)';
      case 'warning':
        return '$(warning)';
      case 'info':
        return '$(info)';
      case 'hint':
        return '$(lightbulb)';
      default:
        return '$(circle)';
    }
  }
}

/**
 * Factory function for creating status bar controller
 */
export function createStatusBar(stateManager: StateManager): StatusBarController {
  return new StatusBarController(stateManager);
}
