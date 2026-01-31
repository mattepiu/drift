/**
 * Git Signal Extractor
 * 
 * Extracts git-based signals for prediction.
 * Analyzes git state to predict which memories
 * will be relevant based on current work.
 * 
 * @module prediction/signals/git-signals
 */

import type { GitSignals } from '../types.js';
import { execSync } from 'child_process';

/**
 * Configuration for git signal extraction
 */
export interface GitSignalExtractorConfig {
  /** Maximum recently modified files to track */
  maxRecentlyModifiedFiles: number;
  /** Maximum recent commit messages to track */
  maxRecentCommitMessages: number;
  /** Maximum uncommitted files to track */
  maxUncommittedFiles: number;
  /** Days to look back for recent commits */
  recentCommitDays: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: GitSignalExtractorConfig = {
  maxRecentlyModifiedFiles: 20,
  maxRecentCommitMessages: 10,
  maxUncommittedFiles: 50,
  recentCommitDays: 7,
};

/**
 * Git Signal Extractor
 * 
 * Extracts git-based signals for prediction.
 */
export class GitSignalExtractor {
  private config: GitSignalExtractorConfig;
  private workingDirectory: string;

  constructor(
    workingDirectory: string = process.cwd(),
    config?: Partial<GitSignalExtractorConfig>
  ) {
    this.workingDirectory = workingDirectory;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Extract git signals
   */
  extract(): GitSignals {
    const currentBranch = this.getCurrentBranch();
    const recentlyModifiedFiles = this.getRecentlyModifiedFiles();
    const recentCommitMessages = this.getRecentCommitMessages();
    const uncommittedFiles = this.getUncommittedFiles();
    const isFeatureBranch = this.isFeatureBranch(currentBranch);
    const relatedIssue = this.extractRelatedIssue(currentBranch);

    const result: GitSignals = {
      currentBranch,
      recentlyModifiedFiles,
      recentCommitMessages,
      uncommittedFiles,
      isFeatureBranch,
    };

    // Only add relatedIssue if it's defined
    if (relatedIssue !== undefined) {
      result.relatedIssue = relatedIssue;
    }

    return result;
  }

  /**
   * Get current git branch
   */
  private getCurrentBranch(): string {
    try {
      const result = this.execGit('rev-parse --abbrev-ref HEAD');
      return result.trim() || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get recently modified files
   */
  private getRecentlyModifiedFiles(): string[] {
    try {
      // Get files modified in recent commits
      const since = new Date();
      since.setDate(since.getDate() - this.config.recentCommitDays);
      const sinceStr = since.toISOString().split('T')[0];

      const result = this.execGit(
        `log --since="${sinceStr}" --name-only --pretty=format: | sort | uniq`
      );

      const files = result
        .split('\n')
        .map((f) => f.trim())
        .filter((f) => f.length > 0);

      return files.slice(0, this.config.maxRecentlyModifiedFiles);
    } catch {
      return [];
    }
  }

  /**
   * Get recent commit messages
   */
  private getRecentCommitMessages(): string[] {
    try {
      const result = this.execGit(
        `log -${this.config.maxRecentCommitMessages} --pretty=format:%s`
      );

      return result
        .split('\n')
        .map((m) => m.trim())
        .filter((m) => m.length > 0);
    } catch {
      return [];
    }
  }

  /**
   * Get uncommitted files (staged and unstaged)
   */
  private getUncommittedFiles(): string[] {
    try {
      // Get both staged and unstaged changes
      const result = this.execGit('status --porcelain');

      const files = result
        .split('\n')
        .map((line) => {
          // Status is first 2 chars, then space, then filename
          const match = line.match(/^..\s+(.+)$/);
          return match?.[1]?.trim() ?? '';
        })
        .filter((f) => f.length > 0);

      return files.slice(0, this.config.maxUncommittedFiles);
    } catch {
      return [];
    }
  }

  /**
   * Check if branch is a feature branch
   */
  private isFeatureBranch(branch: string): boolean {
    const featurePrefixes = [
      'feature/',
      'feat/',
      'fix/',
      'bugfix/',
      'hotfix/',
      'release/',
      'chore/',
      'refactor/',
      'docs/',
      'test/',
      'ci/',
    ];

    const lowerBranch = branch.toLowerCase();

    // Check for common prefixes
    for (const prefix of featurePrefixes) {
      if (lowerBranch.startsWith(prefix)) {
        return true;
      }
    }

    // Check for issue number patterns
    if (/^[a-z]+-\d+/i.test(branch)) {
      return true;
    }

    // Main branches are not feature branches
    const mainBranches = ['main', 'master', 'develop', 'dev', 'staging', 'production'];
    return !mainBranches.includes(lowerBranch);
  }

  /**
   * Extract related issue from branch name
   */
  private extractRelatedIssue(branch: string): string | undefined {
    // Common patterns:
    // feature/JIRA-123-description
    // fix/123-description
    // PROJ-456
    // #789

    // JIRA-style: ABC-123
    const jiraMatch = branch.match(/([A-Z]+-\d+)/i);
    if (jiraMatch?.[1]) {
      return jiraMatch[1].toUpperCase();
    }

    // GitHub-style: #123 or just 123
    const numberMatch = branch.match(/[/#]?(\d+)/);
    if (numberMatch?.[1]) {
      return `#${numberMatch[1]}`;
    }

    return undefined;
  }

  /**
   * Execute a git command
   */
  private execGit(command: string): string {
    try {
      const result = execSync(`git ${command}`, {
        cwd: this.workingDirectory,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 5000,
      });
      return result;
    } catch (error) {
      // Return empty string on error
      return '';
    }
  }

  /**
   * Check if directory is a git repository
   */
  isGitRepository(): boolean {
    try {
      this.execGit('rev-parse --git-dir');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get files changed in a specific commit
   */
  getFilesInCommit(commitHash: string): string[] {
    try {
      const result = this.execGit(
        `diff-tree --no-commit-id --name-only -r ${commitHash}`
      );

      return result
        .split('\n')
        .map((f) => f.trim())
        .filter((f) => f.length > 0);
    } catch {
      return [];
    }
  }

  /**
   * Get commit message for a specific commit
   */
  getCommitMessage(commitHash: string): string {
    try {
      return this.execGit(`log -1 --pretty=format:%s ${commitHash}`).trim();
    } catch {
      return '';
    }
  }

  /**
   * Get author of a specific commit
   */
  getCommitAuthor(commitHash: string): string {
    try {
      return this.execGit(`log -1 --pretty=format:%an ${commitHash}`).trim();
    } catch {
      return '';
    }
  }

  /**
   * Get files that have been modified but not committed
   */
  getDirtyFiles(): string[] {
    try {
      const result = this.execGit('diff --name-only');
      return result
        .split('\n')
        .map((f) => f.trim())
        .filter((f) => f.length > 0);
    } catch {
      return [];
    }
  }

  /**
   * Get staged files
   */
  getStagedFiles(): string[] {
    try {
      const result = this.execGit('diff --cached --name-only');
      return result
        .split('\n')
        .map((f) => f.trim())
        .filter((f) => f.length > 0);
    } catch {
      return [];
    }
  }

  /**
   * Set working directory
   */
  setWorkingDirectory(dir: string): void {
    this.workingDirectory = dir;
  }

  /**
   * Get working directory
   */
  getWorkingDirectory(): string {
    return this.workingDirectory;
  }
}
