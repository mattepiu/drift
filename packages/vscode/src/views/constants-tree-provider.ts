/**
 * ConstantsTreeProvider - Constants and Enums tree view
 *
 * Single responsibility: Display constants, enums, and related issues in a tree view.
 */

import * as vscode from 'vscode';

import { BaseTreeProvider, type BaseTreeItem } from './base-tree-provider.js';

import type { LanguageClient } from 'vscode-languageclient/node';

/**
 * Tree item types
 */
type ConstantTreeItemType =
  | 'category'
  | 'language'
  | 'constant'
  | 'enum'
  | 'issue-group'
  | 'secret'
  | 'inconsistent'
  | 'dead';

/**
 * Constant data from server
 */
export interface ConstantData {
  id: string;
  name: string;
  qualifiedName: string;
  file: string;
  line: number;
  language: string;
  kind: string;
  category: string;
  value?: string | number | boolean | null;
  isExported: boolean;
}

/**
 * Enum data from server
 */
export interface EnumData {
  id: string;
  name: string;
  file: string;
  line: number;
  memberCount: number;
  language: string;
}

/**
 * Category summary
 */
export interface CategorySummary {
  name: string;
  count: number;
}

/**
 * Language summary
 */
export interface LanguageSummary {
  name: string;
  count: number;
}

/**
 * Secret issue
 */
export interface SecretIssue {
  name: string;
  file: string;
  line: number;
  severity: string;
  secretType: string;
}

/**
 * Inconsistent constant issue
 */
export interface InconsistentIssue {
  name: string;
  instanceCount: number;
}

/**
 * Constants tree item
 */
export interface ConstantTreeItem extends BaseTreeItem {
  type: ConstantTreeItemType;
  data?: ConstantData | EnumData | CategorySummary | LanguageSummary | SecretIssue | InconsistentIssue;
  category?: string;
  language?: string;
}

/**
 * Constants tree provider
 */
export class ConstantsTreeProvider extends BaseTreeProvider<ConstantTreeItem> {
  private viewMode: 'category' | 'language' | 'issues' = 'category';

  /**
   * Set the view mode
   */
  setViewMode(mode: 'category' | 'language' | 'issues'): void {
    this.viewMode = mode;
    this.refresh();
  }

  async getChildren(element?: ConstantTreeItem): Promise<ConstantTreeItem[]> {
    if (!this.client) {
      return [];
    }

    const cacheKey = this.getCacheKey(element);
    const cached = this.getCached(cacheKey);
    if (cached) {
      return cached;
    }

    let items: ConstantTreeItem[];

    if (!element) {
      // Root level: show based on view mode
      switch (this.viewMode) {
        case 'category':
          items = await this.getCategories();
          break;
        case 'language':
          items = await this.getLanguages();
          break;
        case 'issues':
          items = await this.getIssueGroups();
          break;
        default:
          items = [];
      }
    } else if (element.type === 'category') {
      items = await this.getConstantsByCategory(element.label as string);
    } else if (element.type === 'language') {
      items = await this.getConstantsByLanguage(element.label as string);
    } else if (element.type === 'issue-group') {
      items = await this.getIssuesByType(element.label as string);
    } else {
      items = [];
    }

    this.setCache(cacheKey, items);
    return items;
  }

  private async getCategories(): Promise<ConstantTreeItem[]> {
    try {
      const response = await this.sendRequest<{
        data: { byCategory: Record<string, number> };
      }>('drift/constants', { action: 'status' });

      const byCategory = response.data.byCategory ?? {};
      const categories = Object.entries(byCategory)
        .filter(([, count]) => count > 0)
        .sort(([, a], [, b]) => b - a);

      return categories.map(([name, count]) =>
        this.createCategoryItem({ name, count })
      );
    } catch {
      return [];
    }
  }

  private async getLanguages(): Promise<ConstantTreeItem[]> {
    try {
      const response = await this.sendRequest<{
        data: { byLanguage: Record<string, number> };
      }>('drift/constants', { action: 'status' });

      const byLanguage = response.data.byLanguage ?? {};
      const languages = Object.entries(byLanguage)
        .filter(([, count]) => count > 0)
        .sort(([, a], [, b]) => b - a);

      return languages.map(([name, count]) =>
        this.createLanguageItem({ name, count })
      );
    } catch {
      return [];
    }
  }

  private async getIssueGroups(): Promise<ConstantTreeItem[]> {
    try {
      const response = await this.sendRequest<{
        data: {
          issues: {
            potentialSecrets: number;
            inconsistentValues: number;
            deadConstants: number;
          };
        };
      }>('drift/constants', { action: 'status' });

      const issues = response.data.issues ?? {
        potentialSecrets: 0,
        inconsistentValues: 0,
        deadConstants: 0,
      };

      const items: ConstantTreeItem[] = [];

      if (issues.potentialSecrets > 0) {
        items.push(this.createIssueGroupItem('Secrets', issues.potentialSecrets, 'shield'));
      }
      if (issues.inconsistentValues > 0) {
        items.push(this.createIssueGroupItem('Inconsistent', issues.inconsistentValues, 'warning'));
      }
      if (issues.deadConstants > 0) {
        items.push(this.createIssueGroupItem('Unused', issues.deadConstants, 'trash'));
      }

      if (items.length === 0) {
        items.push({
          type: 'issue-group',
          label: 'No issues found',
          iconPath: new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green')),
          collapsibleState: vscode.TreeItemCollapsibleState.None,
          contextValue: 'no-issues',
        });
      }

      return items;
    } catch {
      return [];
    }
  }

  private async getConstantsByCategory(category: string): Promise<ConstantTreeItem[]> {
    try {
      const response = await this.sendRequest<{
        data: { constants: ConstantData[]; enums: EnumData[] };
      }>('drift/constants', { action: 'list', category, limit: 50 });

      const items: ConstantTreeItem[] = [];

      for (const constant of response.data.constants ?? []) {
        items.push(this.createConstantItem(constant));
      }

      for (const enumDef of response.data.enums ?? []) {
        items.push(this.createEnumItem(enumDef));
      }

      return items;
    } catch {
      return [];
    }
  }

  private async getConstantsByLanguage(language: string): Promise<ConstantTreeItem[]> {
    try {
      const response = await this.sendRequest<{
        data: { constants: ConstantData[]; enums: EnumData[] };
      }>('drift/constants', { action: 'list', language, limit: 50 });

      const items: ConstantTreeItem[] = [];

      for (const constant of response.data.constants ?? []) {
        items.push(this.createConstantItem(constant));
      }

      for (const enumDef of response.data.enums ?? []) {
        items.push(this.createEnumItem(enumDef));
      }

      return items;
    } catch {
      return [];
    }
  }

  private async getIssuesByType(issueType: string): Promise<ConstantTreeItem[]> {
    try {
      if (issueType === 'Secrets') {
        const response = await this.sendRequest<{
          data: { potentialSecrets: SecretIssue[] };
        }>('drift/constants', { action: 'secrets', limit: 50 });

        return (response.data.potentialSecrets ?? []).map((secret) =>
          this.createSecretItem(secret)
        );
      }

      if (issueType === 'Inconsistent') {
        const response = await this.sendRequest<{
          data: { inconsistencies: InconsistentIssue[] };
        }>('drift/constants', { action: 'inconsistent', limit: 50 });

        return (response.data.inconsistencies ?? []).map((inc) =>
          this.createInconsistentItem(inc)
        );
      }

      if (issueType === 'Unused') {
        const response = await this.sendRequest<{
          data: { deadConstants: Array<{ id: string; name: string; file: string; line: number }> };
        }>('drift/constants', { action: 'dead', limit: 50 });

        return (response.data.deadConstants ?? []).map((dead) =>
          this.createDeadItem(dead)
        );
      }

      return [];
    } catch {
      return [];
    }
  }

  private createCategoryItem(category: CategorySummary): ConstantTreeItem {
    return {
      type: 'category',
      label: category.name,
      description: `${String(category.count)} constants`,
      iconPath: this.getCategoryIcon(category.name),
      collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
      contextValue: 'constant-category',
      data: category,
    };
  }

  private createLanguageItem(language: LanguageSummary): ConstantTreeItem {
    return {
      type: 'language',
      label: language.name,
      description: `${String(language.count)} constants`,
      iconPath: this.getLanguageIcon(language.name),
      collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
      contextValue: 'constant-language',
      data: language,
    };
  }

  private createIssueGroupItem(
    name: string,
    count: number,
    icon: string
  ): ConstantTreeItem {
    const color =
      name === 'Secrets'
        ? 'charts.red'
        : name === 'Inconsistent'
          ? 'charts.yellow'
          : 'charts.gray';

    return {
      type: 'issue-group',
      label: name,
      description: `${String(count)} issues`,
      iconPath: new vscode.ThemeIcon(icon, new vscode.ThemeColor(color)),
      collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
      contextValue: 'constant-issue-group',
    };
  }

  private createConstantItem(constant: ConstantData): ConstantTreeItem {
    const valueStr = constant.value !== undefined ? ` = ${String(constant.value).slice(0, 30)}` : '';

    return {
      type: 'constant',
      id: constant.id,
      label: constant.name,
      description: `${constant.kind}${valueStr}`,
      iconPath: constant.isExported
        ? new vscode.ThemeIcon('symbol-constant', new vscode.ThemeColor('charts.blue'))
        : new vscode.ThemeIcon('symbol-constant'),
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      contextValue: 'constant',
      tooltip: this.createConstantTooltip(constant),
      command: {
        command: 'drift.goToConstant',
        title: 'Go to Constant',
        arguments: [constant.file, constant.line],
      },
      data: constant,
    };
  }

  private createEnumItem(enumDef: EnumData): ConstantTreeItem {
    return {
      type: 'enum',
      id: enumDef.id,
      label: enumDef.name,
      description: `enum (${enumDef.memberCount} members)`,
      iconPath: new vscode.ThemeIcon('symbol-enum'),
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      contextValue: 'enum',
      command: {
        command: 'drift.goToConstant',
        title: 'Go to Enum',
        arguments: [enumDef.file, enumDef.line],
      },
      data: enumDef,
    };
  }

  private createSecretItem(secret: SecretIssue): ConstantTreeItem {
    const severityColor =
      secret.severity === 'critical' || secret.severity === 'high'
        ? 'charts.red'
        : 'charts.yellow';

    return {
      type: 'secret',
      label: secret.name,
      description: `${secret.severity} - ${secret.secretType}`,
      iconPath: new vscode.ThemeIcon('shield', new vscode.ThemeColor(severityColor)),
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      contextValue: 'constant-secret',
      command: {
        command: 'drift.goToConstant',
        title: 'Go to Secret',
        arguments: [secret.file, secret.line],
      },
      data: secret,
    };
  }

  private createInconsistentItem(inc: InconsistentIssue): ConstantTreeItem {
    return {
      type: 'inconsistent',
      label: inc.name,
      description: `${String(inc.instanceCount)} different values`,
      iconPath: new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.yellow')),
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      contextValue: 'constant-inconsistent',
      data: inc,
    };
  }

  private createDeadItem(dead: {
    id: string;
    name: string;
    file: string;
    line: number;
  }): ConstantTreeItem {
    return {
      type: 'dead',
      id: dead.id,
      label: dead.name,
      description: 'potentially unused',
      iconPath: new vscode.ThemeIcon('trash', new vscode.ThemeColor('charts.gray')),
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      contextValue: 'constant-dead',
      command: {
        command: 'drift.goToConstant',
        title: 'Go to Constant',
        arguments: [dead.file, dead.line],
      },
    };
  }

  private getCategoryIcon(category: string): vscode.ThemeIcon {
    const iconMap: Record<string, string> = {
      config: 'gear',
      api: 'globe',
      status: 'pulse',
      error: 'error',
      feature_flag: 'toggle-on',
      limit: 'dashboard',
      regex: 'regex',
      path: 'folder',
      env: 'server-environment',
      security: 'shield',
      uncategorized: 'symbol-misc',
    };

    return new vscode.ThemeIcon(iconMap[category] || 'symbol-constant');
  }

  private getLanguageIcon(language: string): vscode.ThemeIcon {
    const iconMap: Record<string, string> = {
      typescript: 'symbol-class',
      javascript: 'symbol-class',
      python: 'symbol-class',
      java: 'symbol-class',
      csharp: 'symbol-class',
      php: 'symbol-class',
      go: 'symbol-class',
    };

    return new vscode.ThemeIcon(iconMap[language] || 'file-code');
  }

  private createConstantTooltip(constant: ConstantData): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    md.appendMarkdown(`### ${constant.name}\n\n`);
    md.appendMarkdown(`**Qualified Name:** \`${constant.qualifiedName}\`\n\n`);
    md.appendMarkdown(`**File:** ${constant.file}:${String(constant.line)}\n\n`);
    md.appendMarkdown(`**Language:** ${constant.language}\n\n`);
    md.appendMarkdown(`**Kind:** ${constant.kind}\n\n`);
    md.appendMarkdown(`**Category:** ${constant.category}\n\n`);
    md.appendMarkdown(`**Exported:** ${constant.isExported ? 'Yes' : 'No'}\n\n`);

    if (constant.value !== undefined) {
      md.appendMarkdown(`---\n\n**Value:**\n\`\`\`\n${String(constant.value)}\n\`\`\`\n`);
    }

    return md;
  }
}

/**
 * Factory function for creating constants tree provider
 */
export function createConstantsTreeProvider(
  client: LanguageClient | null
): ConstantsTreeProvider {
  return new ConstantsTreeProvider(client);
}
