/**
 * Diff Analyzer
 * 
 * Analyzes code diffs to understand what changed between
 * original and corrected code.
 * 
 * @module learning/analysis/diff-analyzer
 */

import type { CorrectionDiff, DiffLine, DiffModification, SemanticChange } from '../../types/learning.js';

/**
 * Summary of diff changes
 */
export interface DiffSummary {
  /** Replacements made */
  replacements: Array<{ from: string; to: string }>;
  /** Lines added */
  additions: string[];
  /** Lines removed */
  removals: string[];
  /** Total lines changed */
  totalChanges: number;
}

/**
 * Diff Analyzer
 * 
 * Computes and analyzes diffs between original and corrected code.
 */
export class DiffAnalyzer {
  /**
   * Compute diff between original and corrected code
   */
  computeDiff(original: string, corrected: string): CorrectionDiff {
    const originalLines = original.split('\n');
    const correctedLines = corrected.split('\n');

    const additions: DiffLine[] = [];
    const removals: DiffLine[] = [];
    const modifications: DiffModification[] = [];

    // Use LCS-based diff algorithm
    const lcs = this.computeLCS(originalLines, correctedLines);
    const { added, removed, modified } = this.extractChanges(
      originalLines,
      correctedLines,
      lcs
    );

    additions.push(...added);
    removals.push(...removed);
    modifications.push(...modified);

    // Detect semantic changes
    const semanticChanges = this.detectSemanticChanges(
      original,
      corrected,
      modifications
    );

    // Generate summary
    const summary = this.generateSummary(additions, removals, modifications);

    return {
      additions,
      removals,
      modifications,
      summary,
      semanticChanges,
    };
  }

  /**
   * Summarize changes in a diff
   */
  summarizeChanges(diff: CorrectionDiff): DiffSummary {
    const replacements: Array<{ from: string; to: string }> = [];

    for (const mod of diff.modifications) {
      replacements.push({
        from: mod.originalContent.trim(),
        to: mod.newContent.trim(),
      });
    }

    return {
      replacements,
      additions: diff.additions.map(a => a.content),
      removals: diff.removals.map(r => r.content),
      totalChanges:
        diff.additions.length + diff.removals.length + diff.modifications.length,
    };
  }

  /**
   * Compute Longest Common Subsequence
   */
  private computeLCS(a: string[], b: string[]): number[][] {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array(m + 1)
      .fill(null)
      .map(() => Array<number>(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const aItem = a[i - 1];
        const bItem = b[j - 1];
        const dpRow = dp[i];
        const dpPrevRow = dp[i - 1];
        
        if (dpRow && dpPrevRow) {
          const prevDiag = dpPrevRow[j - 1] ?? 0;
          const prevUp = dpPrevRow[j] ?? 0;
          const prevLeft = dpRow[j - 1] ?? 0;
          
          if (aItem === bItem) {
            dpRow[j] = prevDiag + 1;
          } else {
            dpRow[j] = Math.max(prevUp, prevLeft);
          }
        }
      }
    }

    return dp;
  }

  /**
   * Extract changes from LCS matrix
   */
  private extractChanges(
    original: string[],
    corrected: string[],
    lcs: number[][]
  ): {
    added: DiffLine[];
    removed: DiffLine[];
    modified: DiffModification[];
  } {
    const added: DiffLine[] = [];
    const removed: DiffLine[] = [];
    const modified: DiffModification[] = [];

    let i = original.length;
    let j = corrected.length;

    const originalUsed = new Set<number>();
    const correctedUsed = new Set<number>();

    // Backtrack through LCS to find common lines
    while (i > 0 && j > 0) {
      const origLine = original[i - 1];
      const corrLine = corrected[j - 1];
      const lcsRow = lcs[i - 1];
      const lcsRowCurr = lcs[i];
      
      if (origLine !== undefined && corrLine !== undefined && origLine === corrLine) {
        originalUsed.add(i - 1);
        correctedUsed.add(j - 1);
        i--;
        j--;
      } else if (lcsRow !== undefined && lcsRowCurr !== undefined) {
        const lcsRowJ = lcsRow[j];
        const lcsRowCurrJMinus1 = lcsRowCurr[j - 1];
        if (lcsRowJ !== undefined && lcsRowCurrJMinus1 !== undefined &&
            lcsRowJ > lcsRowCurrJMinus1) {
          i--;
        } else {
          j--;
        }
      } else {
        j--;
      }
    }

    // Find removed lines (in original but not in LCS)
    for (let idx = 0; idx < original.length; idx++) {
      const line = original[idx];
      if (!originalUsed.has(idx) && line !== undefined) {
        removed.push({
          lineNumber: idx + 1,
          content: line,
        });
      }
    }

    // Find added lines (in corrected but not in LCS)
    for (let idx = 0; idx < corrected.length; idx++) {
      const line = corrected[idx];
      if (!correctedUsed.has(idx) && line !== undefined) {
        added.push({
          lineNumber: idx + 1,
          content: line,
        });
      }
    }

    // Detect modifications (similar lines that changed)
    this.detectModifications(removed, added, modified);

    return { added, removed, modified };
  }

  /**
   * Detect modifications by matching similar removed/added lines
   */
  private detectModifications(
    removed: DiffLine[],
    added: DiffLine[],
    modified: DiffModification[]
  ): void {
    const usedRemoved = new Set<number>();
    const usedAdded = new Set<number>();

    for (let ri = 0; ri < removed.length; ri++) {
      if (usedRemoved.has(ri)) continue;
      const removedItem = removed[ri];
      if (!removedItem) continue;

      for (let ai = 0; ai < added.length; ai++) {
        if (usedAdded.has(ai)) continue;
        const addedItem = added[ai];
        if (!addedItem) continue;

        const similarity = this.computeSimilarity(
          removedItem.content,
          addedItem.content
        );

        // If lines are similar enough, treat as modification
        if (similarity > 0.5) {
          modified.push({
            originalLine: removedItem.lineNumber,
            newLine: addedItem.lineNumber,
            originalContent: removedItem.content,
            newContent: addedItem.content,
          });
          usedRemoved.add(ri);
          usedAdded.add(ai);
          break;
        }
      }
    }

    // Remove matched lines from added/removed
    const filteredRemoved = removed.filter((_, i) => !usedRemoved.has(i));
    const filteredAdded = added.filter((_, i) => !usedAdded.has(i));

    removed.length = 0;
    removed.push(...filteredRemoved);
    added.length = 0;
    added.push(...filteredAdded);
  }

  /**
   * Compute similarity between two strings (0-1)
   */
  private computeSimilarity(a: string, b: string): number {
    const aTokens = new Set(a.toLowerCase().split(/\s+/));
    const bTokens = new Set(b.toLowerCase().split(/\s+/));

    if (aTokens.size === 0 && bTokens.size === 0) return 1;
    if (aTokens.size === 0 || bTokens.size === 0) return 0;

    let intersection = 0;
    for (const token of aTokens) {
      if (bTokens.has(token)) intersection++;
    }

    const union = aTokens.size + bTokens.size - intersection;
    return intersection / union;
  }

  /**
   * Detect semantic changes in the diff
   */
  private detectSemanticChanges(
    original: string,
    corrected: string,
    modifications: DiffModification[]
  ): SemanticChange[] {
    const changes: SemanticChange[] = [];

    // Check for error handling additions
    if (
      !original.includes('try') &&
      !original.includes('catch') &&
      (corrected.includes('try') || corrected.includes('catch'))
    ) {
      changes.push({
        type: 'add_error_handling',
        description: 'Added error handling (try/catch)',
        affectedElements: ['error handling'],
      });
    }

    // Check for validation additions
    if (
      (corrected.includes('if (') || corrected.includes('if(')) &&
      (corrected.includes('null') ||
        corrected.includes('undefined') ||
        corrected.includes('!'))
    ) {
      const hasValidation =
        original.includes('if (') || original.includes('if(');
      if (!hasValidation) {
        changes.push({
          type: 'add_validation',
          description: 'Added input validation',
          affectedElements: ['validation'],
        });
      }
    }

    // Check for renames in modifications
    for (const mod of modifications) {
      const originalIdent = this.extractIdentifiers(mod.originalContent);
      const newIdent = this.extractIdentifiers(mod.newContent);

      // If structure is same but identifiers changed, it's a rename
      if (
        originalIdent.length === newIdent.length &&
        originalIdent.length > 0
      ) {
        const renamed = originalIdent.filter(
          (id, i) => id !== newIdent[i]
        );
        if (renamed.length > 0 && renamed.length <= 2) {
          changes.push({
            type: 'rename',
            description: `Renamed: ${renamed.join(', ')}`,
            affectedElements: renamed,
          });
        }
      }
    }

    // Check for logic changes
    const logicKeywords = ['if', 'else', 'switch', 'case', '&&', '||', '?', ':'];
    const originalHasLogic = logicKeywords.some(k => original.includes(k));
    const correctedHasLogic = logicKeywords.some(k => corrected.includes(k));

    if (originalHasLogic && correctedHasLogic) {
      // Both have logic, check if it changed
      for (const mod of modifications) {
        if (logicKeywords.some(k => mod.originalContent.includes(k))) {
          changes.push({
            type: 'change_logic',
            description: 'Modified conditional logic',
            affectedElements: ['conditional'],
          });
          break;
        }
      }
    }

    // Check for refactoring (structural changes)
    if (modifications.length > 3 || changes.length === 0) {
      const structuralChange =
        (original.includes('function') !== corrected.includes('function')) ||
        (original.includes('=>') !== corrected.includes('=>')) ||
        (original.includes('class') !== corrected.includes('class'));

      if (structuralChange) {
        changes.push({
          type: 'refactor',
          description: 'Structural refactoring',
          affectedElements: ['structure'],
        });
      }
    }

    // If no specific changes detected, mark as other
    if (changes.length === 0 && modifications.length > 0) {
      changes.push({
        type: 'other',
        description: 'General code modification',
        affectedElements: [],
      });
    }

    return changes;
  }

  /**
   * Extract identifiers from code
   */
  private extractIdentifiers(code: string): string[] {
    const identifierRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
    const matches = code.match(identifierRegex) || [];

    // Filter out common keywords
    const keywords = new Set([
      'const', 'let', 'var', 'function', 'return', 'if', 'else',
      'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
      'try', 'catch', 'finally', 'throw', 'new', 'this', 'class',
      'extends', 'import', 'export', 'default', 'async', 'await',
      'true', 'false', 'null', 'undefined', 'typeof', 'instanceof',
    ]);

    return matches.filter(m => !keywords.has(m));
  }

  /**
   * Generate a human-readable summary of the diff
   */
  private generateSummary(
    additions: DiffLine[],
    removals: DiffLine[],
    modifications: DiffModification[]
  ): string {
    const parts: string[] = [];

    if (additions.length > 0) {
      parts.push(`${additions.length} line(s) added`);
    }
    if (removals.length > 0) {
      parts.push(`${removals.length} line(s) removed`);
    }
    if (modifications.length > 0) {
      parts.push(`${modifications.length} line(s) modified`);
    }

    if (parts.length === 0) {
      return 'No changes detected';
    }

    return parts.join(', ');
  }
}
