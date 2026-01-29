/**
 * Status bar display modes
 * 
 * Single responsibility: Define status bar visual states.
 */

import * as vscode from 'vscode';

import type { ConnectionState } from '../../types/index.js';

/**
 * Status bar mode configuration
 */
export interface StatusBarMode {
  icon: string;
  text: string;
  tooltip: string;
  backgroundColor?: vscode.ThemeColor;
  command?: string;
}

/**
 * Status bar modes for different states
 */
export const StatusBarModes: Record<string, StatusBarMode> = {
  disconnected: {
    icon: '$(circle-slash)',
    text: 'Drift: Disconnected',
    tooltip: 'Drift is not connected. Click to reconnect.',
    backgroundColor: new vscode.ThemeColor('statusBarItem.errorBackground'),
    command: 'drift.reconnect',
  },
  connecting: {
    icon: '$(sync~spin)',
    text: 'Drift: Connecting...',
    tooltip: 'Connecting to Drift server...',
  },
  connected: {
    icon: '$(check)',
    text: 'Drift: Ready',
    tooltip: 'Drift is connected and ready.',
    command: 'drift.showStatus',
  },
  reconnecting: {
    icon: '$(sync~spin)',
    text: 'Drift: Reconnecting...',
    tooltip: 'Reconnecting to Drift server...',
  },
  error: {
    icon: '$(error)',
    text: 'Drift: Error',
    tooltip: 'Drift encountered an error. Click for details.',
    backgroundColor: new vscode.ThemeColor('statusBarItem.errorBackground'),
    command: 'drift.showError',
  },
  failed: {
    icon: '$(error)',
    text: 'Drift: Failed',
    tooltip: 'Drift failed to connect. Click to retry.',
    backgroundColor: new vscode.ThemeColor('statusBarItem.errorBackground'),
    command: 'drift.reconnect',
  },
  scanning: {
    icon: '$(sync~spin)',
    text: 'Drift: Scanning...',
    tooltip: 'Scanning workspace for patterns...',
  },
  healthy: {
    icon: '$(pass)',
    text: 'Drift',
    tooltip: 'No violations found.',
    command: 'drift.showStatus',
  },
  warning: {
    icon: '$(warning)',
    text: 'Drift',
    tooltip: 'Violations found. Click to view.',
    backgroundColor: new vscode.ThemeColor('statusBarItem.warningBackground'),
    command: 'drift.showViolations',
  },
};

/**
 * Get status bar mode based on state
 */
export function getStatusBarMode(
  connectionState: ConnectionState,
  violations: number,
  scanning: boolean
): StatusBarMode {
  // Connection states take priority
  if (connectionState !== 'connected') {
    const mode = StatusBarModes[connectionState];
    return mode ?? StatusBarModes['disconnected'] ?? {
      icon: '$(circle-slash)',
      text: 'Drift: Disconnected',
      tooltip: 'Drift is not connected.',
    };
  }

  // Scanning state
  if (scanning) {
    const scanningMode = StatusBarModes['scanning'];
    return scanningMode ?? {
      icon: '$(sync~spin)',
      text: 'Drift: Scanning...',
      tooltip: 'Scanning workspace for patterns...',
    };
  }

  // Violation-based states
  if (violations > 0) {
    const warningMode = StatusBarModes['warning'];
    const result: StatusBarMode = {
      icon: warningMode?.icon ?? '$(warning)',
      text: `Drift: ${String(violations)}`,
      tooltip: `${String(violations)} violation${violations === 1 ? '' : 's'} found. Click to view.`,
    };
    if (warningMode?.backgroundColor) {
      result.backgroundColor = warningMode.backgroundColor;
    }
    if (warningMode?.command) {
      result.command = warningMode.command;
    }
    return result;
  }

  const healthyMode = StatusBarModes['healthy'];
  return healthyMode ?? {
    icon: '$(pass)',
    text: 'Drift',
    tooltip: 'No violations found.',
  };
}
