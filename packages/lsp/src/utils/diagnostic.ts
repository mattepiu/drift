/**
 * Diagnostic Utilities - Diagnostic helpers
 * @requirements 27.3
 */

import type { DriftDiagnostic, DiagnosticSeverity, Range } from '../types/lsp-types.js';

// ============================================================================
// Diagnostic Creation
// ============================================================================

/**
 * Create a drift diagnostic
 */
export function createDiagnostic(
  violationId: string,
  patternId: string,
  message: string,
  range: Range,
  severity: DiagnosticSeverity = 'warning'
): DriftDiagnostic {
  return {
    violationId,
    patternId,
    severity,
    message,
    range,
    source: 'drift',
    code: patternId,
    quickFixes: [],
  };
}

/**
 * Create an error diagnostic
 */
export function createErrorDiagnostic(
  violationId: string,
  patternId: string,
  message: string,
  range: Range
): DriftDiagnostic {
  return createDiagnostic(violationId, patternId, message, range, 'error');
}

/**
 * Create a warning diagnostic
 */
export function createWarningDiagnostic(
  violationId: string,
  patternId: string,
  message: string,
  range: Range
): DriftDiagnostic {
  return createDiagnostic(violationId, patternId, message, range, 'warning');
}

/**
 * Create an info diagnostic
 */
export function createInfoDiagnostic(
  violationId: string,
  patternId: string,
  message: string,
  range: Range
): DriftDiagnostic {
  return createDiagnostic(violationId, patternId, message, range, 'info');
}

/**
 * Create a hint diagnostic
 */
export function createHintDiagnostic(
  violationId: string,
  patternId: string,
  message: string,
  range: Range
): DriftDiagnostic {
  return createDiagnostic(violationId, patternId, message, range, 'hint');
}

// ============================================================================
// Diagnostic Filtering
// ============================================================================

/**
 * Filter diagnostics by severity
 */
export function filterBySeverity(
  diagnostics: DriftDiagnostic[],
  severities: DiagnosticSeverity[]
): DriftDiagnostic[] {
  return diagnostics.filter((d) => severities.includes(d.severity));
}

/**
 * Filter diagnostics by pattern
 */
export function filterByPattern(
  diagnostics: DriftDiagnostic[],
  patternIds: string[]
): DriftDiagnostic[] {
  return diagnostics.filter((d) => patternIds.includes(d.patternId));
}

/**
 * Filter diagnostics by range
 */
export function filterByRange(
  diagnostics: DriftDiagnostic[],
  range: Range
): DriftDiagnostic[] {
  return diagnostics.filter((d) => rangesOverlap(d.range, range));
}

/**
 * Filter diagnostics by line
 */
export function filterByLine(
  diagnostics: DriftDiagnostic[],
  line: number
): DriftDiagnostic[] {
  return diagnostics.filter(
    (d) => d.range.start.line <= line && d.range.end.line >= line
  );
}

// ============================================================================
// Diagnostic Sorting
// ============================================================================

/**
 * Sort diagnostics by position
 */
export function sortByPosition(diagnostics: DriftDiagnostic[]): DriftDiagnostic[] {
  return [...diagnostics].sort((a, b) => {
    const lineDiff = a.range.start.line - b.range.start.line;
    if (lineDiff !== 0) {return lineDiff;}
    return a.range.start.character - b.range.start.character;
  });
}

/**
 * Sort diagnostics by severity
 */
export function sortBySeverity(diagnostics: DriftDiagnostic[]): DriftDiagnostic[] {
  const severityOrder: Record<DiagnosticSeverity, number> = {
    error: 0,
    warning: 1,
    info: 2,
    hint: 3,
  };

  return [...diagnostics].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );
}

/**
 * Sort diagnostics by pattern
 */
export function sortByPattern(diagnostics: DriftDiagnostic[]): DriftDiagnostic[] {
  return [...diagnostics].sort((a, b) => a.patternId.localeCompare(b.patternId));
}

// ============================================================================
// Diagnostic Grouping
// ============================================================================

/**
 * Group diagnostics by severity
 */
export function groupBySeverity(
  diagnostics: DriftDiagnostic[]
): Map<DiagnosticSeverity, DriftDiagnostic[]> {
  const groups = new Map<DiagnosticSeverity, DriftDiagnostic[]>();

  for (const diagnostic of diagnostics) {
    const group = groups.get(diagnostic.severity) ?? [];
    group.push(diagnostic);
    groups.set(diagnostic.severity, group);
  }

  return groups;
}

/**
 * Group diagnostics by pattern
 */
export function groupByPattern(
  diagnostics: DriftDiagnostic[]
): Map<string, DriftDiagnostic[]> {
  const groups = new Map<string, DriftDiagnostic[]>();

  for (const diagnostic of diagnostics) {
    const group = groups.get(diagnostic.patternId) ?? [];
    group.push(diagnostic);
    groups.set(diagnostic.patternId, group);
  }

  return groups;
}

/**
 * Group diagnostics by line
 */
export function groupByLine(
  diagnostics: DriftDiagnostic[]
): Map<number, DriftDiagnostic[]> {
  const groups = new Map<number, DriftDiagnostic[]>();

  for (const diagnostic of diagnostics) {
    const line = diagnostic.range.start.line;
    const group = groups.get(line) ?? [];
    group.push(diagnostic);
    groups.set(line, group);
  }

  return groups;
}

// ============================================================================
// Diagnostic Statistics
// ============================================================================

/**
 * Get diagnostic statistics
 */
export function getDiagnosticStats(diagnostics: DriftDiagnostic[]): {
  total: number;
  bySeverity: Record<DiagnosticSeverity, number>;
  byPattern: Record<string, number>;
  uniquePatterns: number;
  affectedLines: number;
} {
  const bySeverity: Record<DiagnosticSeverity, number> = {
    error: 0,
    warning: 0,
    info: 0,
    hint: 0,
  };

  const byPattern: Record<string, number> = {};
  const affectedLines = new Set<number>();

  for (const diagnostic of diagnostics) {
    bySeverity[diagnostic.severity]++;
    byPattern[diagnostic.patternId] = (byPattern[diagnostic.patternId] ?? 0) + 1;

    for (let line = diagnostic.range.start.line; line <= diagnostic.range.end.line; line++) {
      affectedLines.add(line);
    }
  }

  return {
    total: diagnostics.length,
    bySeverity,
    byPattern,
    uniquePatterns: Object.keys(byPattern).length,
    affectedLines: affectedLines.size,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if two ranges overlap
 */
function rangesOverlap(a: Range, b: Range): boolean {
  // a ends before b starts
  if (a.end.line < b.start.line) {return false;}
  if (a.end.line === b.start.line && a.end.character < b.start.character) {return false;}

  // b ends before a starts
  if (b.end.line < a.start.line) {return false;}
  if (b.end.line === a.start.line && b.end.character < a.start.character) {return false;}

  return true;
}

/**
 * Merge overlapping diagnostics
 */
export function mergeOverlapping(diagnostics: DriftDiagnostic[]): DriftDiagnostic[] {
  if (diagnostics.length <= 1) {return diagnostics;}

  const sorted = sortByPosition(diagnostics);
  const first = sorted[0];
  if (!first) {return diagnostics;}

  const merged: DriftDiagnostic[] = [first];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (!current || !last) {
      continue;
    }

    if (rangesOverlap(last.range, current.range) && last.patternId === current.patternId) {
      // Merge ranges
      last.range = {
        start: {
          line: Math.min(last.range.start.line, current.range.start.line),
          character: last.range.start.line < current.range.start.line
            ? last.range.start.character
            : current.range.start.line < last.range.start.line
              ? current.range.start.character
              : Math.min(last.range.start.character, current.range.start.character),
        },
        end: {
          line: Math.max(last.range.end.line, current.range.end.line),
          character: last.range.end.line > current.range.end.line
            ? last.range.end.character
            : current.range.end.line > last.range.end.line
              ? current.range.end.character
              : Math.max(last.range.end.character, current.range.end.character),
        },
      };

      // Merge quick fixes
      last.quickFixes = [...last.quickFixes, ...current.quickFixes];
    } else {
      merged.push(current);
    }
  }

  return merged;
}

/**
 * Deduplicate diagnostics
 */
export function deduplicate(diagnostics: DriftDiagnostic[]): DriftDiagnostic[] {
  const seen = new Set<string>();
  const result: DriftDiagnostic[] = [];

  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.patternId}:${diagnostic.range.start.line}:${diagnostic.range.start.character}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(diagnostic);
    }
  }

  return result;
}
