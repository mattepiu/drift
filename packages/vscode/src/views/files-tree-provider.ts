/**
 * FilesTreeProvider - Files tree view
 * 
 * Single responsibility: Display files with patterns in a tree view.
 */

import * as vscode from 'vscode';

import { BaseTreeProvider, type BaseTreeItem } from './base-tree-provider.js';

import type { FilePatternData } from '../types/index.js';
import type { LanguageClient } from 'vscode-languageclient/node';

/**
 * Tree item types
 */
type FileTreeItemType = 'folder' | 'file';

/**
 * File tree item
 */
export interface FileTreeItem extends BaseTreeItem {
  type: FileTreeItemType;
  path: string;
  data?: FilePatternData;
}

/**
 * Files tree provider
 */
export class FilesTreeProvider extends BaseTreeProvider<FileTreeItem> {
  async getChildren(element?: FileTreeItem): Promise<FileTreeItem[]> {
    if (!this.client) {
      return [];
    }

    const cacheKey = this.getCacheKey(element);
    const cached = this.getCached(cacheKey);
    if (cached) {
      return cached;
    }

    let items: FileTreeItem[];

    if (!element) {
      // Root level: get all files with patterns
      items = await this.getFilesWithPatterns();
    } else {
      // No nested children for now
      items = [];
    }

    this.setCache(cacheKey, items);
    return items;
  }

  private async getFilesWithPatterns(): Promise<FileTreeItem[]> {
    try {
      const response = await this.sendRequest<{ files: FilePatternData[] }>(
        'drift/files/list',
        { minPatterns: 1 }
      );

      // Sort by pattern count descending
      const sorted = response.files.sort((a, b) => b.patternCount - a.patternCount);

      return sorted.map((file) => this.createFileItem(file));
    } catch {
      return [];
    }
  }

  private createFileItem(file: FilePatternData): FileTreeItem {
    const fileName = file.path.split('/').pop() || file.path;
    const hasViolations = file.violationCount > 0;

    return {
      type: 'file',
      path: file.path,
      label: fileName,
      description: this.createDescription(file),
      iconPath: hasViolations
        ? new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'))
        : vscode.ThemeIcon.File,
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      contextValue: 'file',
      resourceUri: vscode.Uri.file(file.path),
      tooltip: this.createFileTooltip(file),
      command: {
        command: 'vscode.open',
        title: 'Open File',
        arguments: [vscode.Uri.file(file.path)],
      },
      data: file,
    };
  }

  private createDescription(file: FilePatternData): string {
    const parts: string[] = [];
    
    parts.push(`${file.patternCount} pattern${file.patternCount === 1 ? '' : 's'}`);
    
    if (file.violationCount > 0) {
      parts.push(`${file.violationCount} violation${file.violationCount === 1 ? '' : 's'}`);
    }

    return parts.join(' • ');
  }

  private createFileTooltip(file: FilePatternData): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    md.appendMarkdown(`### ${file.path}\n\n`);
    md.appendMarkdown(`**Patterns:** ${file.patternCount}\n\n`);
    md.appendMarkdown(`**Violations:** ${file.violationCount}\n\n`);

    if (file.categories.length > 0) {
      md.appendMarkdown(`**Categories:** ${file.categories.join(', ')}\n\n`);
    }

    md.appendMarkdown(`---\n\n`);
    md.appendMarkdown(`[View Patterns](command:drift.showFilePatterns?${encodeURIComponent(JSON.stringify({ path: file.path }))})`);

    return md;
  }
}

/**
 * Factory function for creating files tree provider
 */
export function createFilesTreeProvider(
  client: LanguageClient | null
): FilesTreeProvider {
  return new FilesTreeProvider(client);
}
