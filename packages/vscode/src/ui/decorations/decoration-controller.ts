/**
 * DecorationController - Editor decoration management
 * 
 * Single responsibility: Apply visual decorations to editors.
 */

import * as vscode from 'vscode';

import { createDecorationTypes, type DecorationTypes, type DecorationTypeKey } from './decoration-types.js';

import type { ConfigManager } from '../../config/index.js';
import type { DisplayConfig, Severity } from '../../types/index.js';

/**
 * Decoration controller for editor visuals
 */
export class DecorationController implements vscode.Disposable {
  private readonly decorationTypes: DecorationTypes;
  private readonly disposables: vscode.Disposable[] = [];
  private config: DisplayConfig;

  constructor(
    context: vscode.ExtensionContext,
    private readonly configManager: ConfigManager
  ) {
    this.decorationTypes = createDecorationTypes(context);
    this.config = configManager.get('display');

    this.setupEventHandlers();
  }

  /**
   * Update decorations for the active editor
   */
  updateDecorations(editor: vscode.TextEditor): void {
    const uri = editor.document.uri;
    const diagnostics = vscode.languages.getDiagnostics(uri);

    // Filter to Drift diagnostics only
    const driftDiagnostics = diagnostics.filter(d => d.source === 'drift');

    // Clear all decorations first
    this.clearDecorations(editor);

    if (driftDiagnostics.length === 0) {return;}

    // Apply gutter decorations
    if (this.config.showGutterIcons) {
      this.applyGutterDecorations(editor, driftDiagnostics);
    }

    // Apply inline hints
    if (this.config.showInlineHints) {
      this.applyInlineHints(editor, driftDiagnostics);
    }
  }

  /**
   * Clear all decorations from an editor
   */
  clearDecorations(editor: vscode.TextEditor): void {
    for (const [, type] of this.decorationTypes) {
      editor.setDecorations(type, []);
    }
  }

  /**
   * Refresh decorations for all visible editors
   */
  refreshAll(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.updateDecorations(editor);
    }
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  private setupEventHandlers(): void {
    // Update decorations when active editor changes
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
          this.updateDecorations(editor);
        }
      })
    );

    // Update decorations when diagnostics change
    this.disposables.push(
      vscode.languages.onDidChangeDiagnostics(event => {
        const editor = vscode.window.activeTextEditor;
        if (editor && event.uris.some(uri => uri.toString() === editor.document.uri.toString())) {
          this.updateDecorations(editor);
        }
      })
    );

    // Update config when it changes
    this.disposables.push(
      this.configManager.onConfigChange(event => {
        if (event.section === 'display') {
          this.config = event.newValue as DisplayConfig;
          this.refreshAll();
        }
      })
    );
  }

  private applyGutterDecorations(
    editor: vscode.TextEditor,
    diagnostics: vscode.Diagnostic[]
  ): void {
    // Group diagnostics by severity
    const bySeverity = this.groupBySeverity(diagnostics);

    for (const [severity, diags] of bySeverity) {
      // Check if this severity is in the filter
      if (!this.config.severityFilter.includes(severity)) {
        continue;
      }

      const decorationType = this.decorationTypes.get(`gutter-${severity}` as DecorationTypeKey);
      if (!decorationType) {continue;}

      const decorations: vscode.DecorationOptions[] = diags.map(d => ({
        range: d.range,
        hoverMessage: this.buildHoverMessage(d),
      }));

      editor.setDecorations(decorationType, decorations);
    }
  }

  private applyInlineHints(
    editor: vscode.TextEditor,
    diagnostics: vscode.Diagnostic[]
  ): void {
    const decorationType = this.decorationTypes.get('inline-hint');
    if (!decorationType) {return;}

    // Only show hints for filtered severities
    const filtered = diagnostics.filter(d => {
      const severity = this.diagnosticSeverityToString(d.severity);
      return this.config.severityFilter.includes(severity);
    });

    // Group by line to avoid multiple hints on same line
    const byLine = new Map<number, vscode.Diagnostic>();
    for (const d of filtered) {
      const line = d.range.start.line;
      if (!byLine.has(line)) {
        byLine.set(line, d);
      }
    }

    const decorations: vscode.DecorationOptions[] = [];
    for (const [, diagnostic] of byLine) {
      decorations.push({
        range: new vscode.Range(
          diagnostic.range.end.line,
          Number.MAX_SAFE_INTEGER,
          diagnostic.range.end.line,
          Number.MAX_SAFE_INTEGER
        ),
        renderOptions: {
          after: {
            contentText: ` ← ${diagnostic.message}`,
          },
        },
      });
    }

    editor.setDecorations(decorationType, decorations);
  }

  private groupBySeverity(diagnostics: vscode.Diagnostic[]): Map<Severity, vscode.Diagnostic[]> {
    const groups = new Map<Severity, vscode.Diagnostic[]>();

    for (const d of diagnostics) {
      const severity = this.diagnosticSeverityToString(d.severity);
      const group = groups.get(severity) ?? [];
      group.push(d);
      groups.set(severity, group);
    }

    return groups;
  }

  private diagnosticSeverityToString(severity: vscode.DiagnosticSeverity): Severity {
    switch (severity) {
      case vscode.DiagnosticSeverity.Error:
        return 'error';
      case vscode.DiagnosticSeverity.Warning:
        return 'warning';
      case vscode.DiagnosticSeverity.Information:
        return 'info';
      case vscode.DiagnosticSeverity.Hint:
        return 'hint';
    }
  }

  private buildHoverMessage(diagnostic: vscode.Diagnostic): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportThemeIcons = true;

    const icon = this.getSeverityIcon(diagnostic.severity);
    md.appendMarkdown(`${icon} **${diagnostic.message}**\n\n`);

    if (diagnostic.code !== null) {
      const codeStr = typeof diagnostic.code === 'object' ? String(diagnostic.code.value) : String(diagnostic.code);
      md.appendMarkdown(`Pattern: \`${codeStr}\`\n\n`);
    }

    md.appendMarkdown(`---\n\n`);
    md.appendMarkdown(`[Quick Fix](command:editor.action.quickFix) | `);
    md.appendMarkdown(`[Ignore](command:drift.ignoreOnce)\n`);

    return md;
  }

  private getSeverityIcon(severity: vscode.DiagnosticSeverity): string {
    switch (severity) {
      case vscode.DiagnosticSeverity.Error:
        return '$(error)';
      case vscode.DiagnosticSeverity.Warning:
        return '$(warning)';
      case vscode.DiagnosticSeverity.Information:
        return '$(info)';
      case vscode.DiagnosticSeverity.Hint:
        return '$(lightbulb)';
    }
  }
}

/**
 * Factory function for creating decoration controller
 */
export function createDecorationController(
  context: vscode.ExtensionContext,
  configManager: ConfigManager
): DecorationController {
  return new DecorationController(context, configManager);
}
