/**
 * @drift/vscode - VS Code Extension Entry Point
 *
 * This is the main entry point for the Drift VS Code extension.
 * It delegates all work to the ActivationController for proper
 * lifecycle management and phased activation.
 */

import * as vscode from 'vscode';

import { createActivationController, type ActivationController } from './activation/index.js';

/**
 * Extension version - read from package.json at runtime
 */
export function getVersion(): string {
  const extension = vscode.extensions.getExtension('driftdetect.driftdetect-vscode');
  const packageJSON = extension?.packageJSON as { version?: string } | undefined;
  return packageJSON?.version ?? '0.0.0';
}

// For backwards compatibility
export const VERSION = '0.4.4';

/**
 * Activation controller instance
 */
let controller: ActivationController | null = null;

/**
 * Activates the Drift extension
 * 
 * This function is called by VS Code when the extension is activated.
 * Activation is phased for optimal startup performance:
 * 
 * 1. Immediate phase (<100ms): Infrastructure, state, config, status bar
 * 2. Deferred phase: LSP connection, commands, decorations
 * 3. Lazy phase: Tree views, webviews (on-demand)
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  controller = createActivationController(context);
  context.subscriptions.push(controller);
  
  await controller.activate();
}

/**
 * Deactivates the Drift extension
 * 
 * This function is called by VS Code when the extension is deactivated.
 * It ensures proper cleanup of all resources.
 */
export async function deactivate(): Promise<void> {
  if (controller) {
    await controller.deactivate();
    controller = null;
  }
}
