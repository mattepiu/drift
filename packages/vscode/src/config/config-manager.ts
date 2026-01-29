/**
 * ConfigManager - Configuration management with change detection
 * 
 * Single responsibility: Load, validate, and watch configuration.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import * as vscode from 'vscode';

import { DEFAULT_CONFIG } from './defaults.js';
import { validateConfig } from './validator.js';

import type { Logger } from '../infrastructure/index.js';
import type { DriftConfig, ConfigChangeEvent, TeamConfig } from '../types/index.js';

/**
 * Configuration manager with reactive updates
 */
export class ConfigManager implements vscode.Disposable {
  private config: DriftConfig;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly changeEmitter = new vscode.EventEmitter<ConfigChangeEvent>();
  
  readonly onConfigChange = this.changeEmitter.event;

  constructor(private readonly logger: Logger) {
    this.config = this.loadConfig();
    this.watchConfig();
  }

  /**
   * Get a configuration section
   */
  get<K extends keyof DriftConfig>(section: K): DriftConfig[K] {
    return this.config[section];
  }

  /**
   * Get the full configuration
   */
  getAll(): Readonly<DriftConfig> {
    return this.config;
  }

  /**
   * Update a configuration section
   */
  async update<K extends keyof DriftConfig>(
    section: K,
    value: Partial<DriftConfig[K]>,
    target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace
  ): Promise<void> {
    const vsConfig = vscode.workspace.getConfiguration('drift');
    const current = vsConfig.get<DriftConfig[K]>(section);
    const merged = { ...current, ...value };

    // Validate before updating
    const validation = validateConfig({ [section]: merged });
    if (!validation.valid) {
      this.logger.error('Invalid configuration:', validation.errors);
      throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
    }

    await vsConfig.update(section, merged, target);
  }

  /**
   * Reset configuration to defaults
   */
  async reset(target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace): Promise<void> {
    const vsConfig = vscode.workspace.getConfiguration('drift');
    
    for (const [section, value] of Object.entries(DEFAULT_CONFIG)) {
      if (section !== 'team') {
        await vsConfig.update(section, value, target);
      }
    }
  }

  /**
   * Reload configuration from VS Code settings
   */
  reload(): void {
    const oldConfig = this.config;
    this.config = this.loadConfig();
    this.emitChanges(oldConfig, this.config);
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.changeEmitter.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  private loadConfig(): DriftConfig {
    const vsConfig = vscode.workspace.getConfiguration('drift');

    return {
      server: {
        path: vsConfig.get('server.path', DEFAULT_CONFIG.server.path),
        args: vsConfig.get('server.args', DEFAULT_CONFIG.server.args),
        trace: vsConfig.get('server.trace', DEFAULT_CONFIG.server.trace),
      },
      scan: {
        onSave: vsConfig.get('scan.onSave', DEFAULT_CONFIG.scan.onSave),
        onOpen: vsConfig.get('scan.onOpen', DEFAULT_CONFIG.scan.onOpen),
        debounceMs: vsConfig.get('scan.debounceMs', DEFAULT_CONFIG.scan.debounceMs),
        excludePatterns: vsConfig.get('scan.excludePatterns', DEFAULT_CONFIG.scan.excludePatterns),
      },
      display: {
        showStatusBar: vsConfig.get('display.showStatusBar', DEFAULT_CONFIG.display.showStatusBar),
        showInlineHints: vsConfig.get('display.showInlineHints', DEFAULT_CONFIG.display.showInlineHints),
        showGutterIcons: vsConfig.get('display.showGutterIcons', DEFAULT_CONFIG.display.showGutterIcons),
        severityFilter: vsConfig.get('display.severityFilter', DEFAULT_CONFIG.display.severityFilter),
      },
      ai: {
        enabled: vsConfig.get('ai.enabled', DEFAULT_CONFIG.ai.enabled),
        provider: vsConfig.get('ai.provider', DEFAULT_CONFIG.ai.provider),
        model: vsConfig.get('ai.model', DEFAULT_CONFIG.ai.model),
      },
      team: this.loadTeamConfig(),
    };
  }

  private loadTeamConfig(): TeamConfig {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return DEFAULT_CONFIG.team;
    }

    const configPath = path.join(workspaceFolder.uri.fsPath, '.drift', 'config.json');

    try {
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8');
        interface ParsedTeamConfig {
          enforceApproved?: boolean;
          requiredCategories?: string[];
          customRules?: Array<string | { id: string; severity: string }>;
        }
        const parsed: ParsedTeamConfig = JSON.parse(content) as ParsedTeamConfig;
        // Map customRules objects to just their IDs if they're objects
        const customRules = parsed.customRules
          ? parsed.customRules.map((rule) => (typeof rule === 'string' ? rule : rule.id))
          : DEFAULT_CONFIG.team.customRules;
        return {
          enforceApproved: parsed.enforceApproved ?? DEFAULT_CONFIG.team.enforceApproved,
          requiredCategories: parsed.requiredCategories ?? DEFAULT_CONFIG.team.requiredCategories,
          customRules,
        };
      }
    } catch (error) {
      this.logger.warn('Failed to load team config:', error);
    }

    return DEFAULT_CONFIG.team;
  }

  private watchConfig(): void {
    // Watch VS Code settings
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('drift')) {
          this.reload();
        }
      })
    );

    // Watch .drift/config.json
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      const pattern = new vscode.RelativePattern(workspaceFolder, '.drift/config.json');
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);

      watcher.onDidChange(() => { this.reloadTeamConfig(); });
      watcher.onDidCreate(() => { this.reloadTeamConfig(); });
      watcher.onDidDelete(() => { this.reloadTeamConfig(); });

      this.disposables.push(watcher);
    }
  }

  private reloadTeamConfig(): void {
    const oldTeam = this.config.team;
    this.config = { ...this.config, team: this.loadTeamConfig() };
    
    if (JSON.stringify(oldTeam) !== JSON.stringify(this.config.team)) {
      this.changeEmitter.fire({
        section: 'team',
        oldValue: oldTeam,
        newValue: this.config.team,
      });
    }
  }

  private emitChanges(oldConfig: DriftConfig, newConfig: DriftConfig): void {
    const sections: (keyof DriftConfig)[] = ['server', 'scan', 'display', 'ai', 'team'];

    for (const section of sections) {
      if (JSON.stringify(oldConfig[section]) !== JSON.stringify(newConfig[section])) {
        this.changeEmitter.fire({
          section,
          oldValue: oldConfig[section],
          newValue: newConfig[section],
        });
      }
    }
  }
}

/**
 * Factory function for creating config manager
 */
export function createConfigManager(logger: Logger): ConfigManager {
  return new ConfigManager(logger);
}
