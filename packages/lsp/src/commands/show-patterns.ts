/**
 * Show Patterns Command - drift.showPatterns
 * @requirements 28.8
 */

import type { CommandResult } from '../handlers/commands.js';
import type { ServerContext } from '../server/types.js';

/**
 * Execute show patterns command
 * Shows detected patterns in the workspace
 */
export async function executeShowPatterns(
  context: ServerContext,
  patternId?: string
): Promise<CommandResult> {
  const { state, logger, connection } = context;

  logger.info(`Show patterns requested${patternId ? ` for: ${patternId}` : ''}`);

  if (patternId) {
    // Show specific pattern
    const pattern = state.patterns.get(patternId);

    if (!pattern) {
      return {
        success: false,
        error: `Pattern not found: ${patternId}`,
      };
    }

    // Count violations for this pattern
    let violationCount = 0;
    const affectedFiles: string[] = [];

    for (const [uri, violations] of state.violations) {
      const patternViolations = violations.filter((v) => v.patternId === patternId);
      if (patternViolations.length > 0) {
        violationCount += patternViolations.length;
        affectedFiles.push(uri);
      }
    }

    // Format pattern details
    const details = formatPatternDetails(pattern, violationCount, affectedFiles);

    // Show in message
    connection.window.showInformationMessage(details);

    return {
      success: true,
      message: `Pattern details for: ${patternId}`,
      data: {
        pattern,
        violationCount,
        affectedFiles,
      },
    };
  } else {
    // Show all patterns
    const patterns = Array.from(state.patterns.values());

    if (patterns.length === 0) {
      connection.window.showInformationMessage('No patterns detected in the workspace.');
      return {
        success: true,
        message: 'No patterns detected',
        data: { patterns: [] },
      };
    }

    // Group patterns by category
    const patternsByCategory = groupPatternsByCategory(patterns);

    // Format summary
    const summary = formatPatternsSummary(patternsByCategory, state.violations);

    // Show summary
    connection.window.showInformationMessage(summary);

    return {
      success: true,
      message: `Found ${patterns.length} patterns`,
      data: {
        patterns,
        patternsByCategory: Object.fromEntries(patternsByCategory),
      },
    };
  }
}

/**
 * Format pattern details for display
 */
function formatPatternDetails(
  pattern: {
    id?: string;
    name?: string;
    description?: string;
    category?: string;
    subcategory?: string;
    confidence?: number;
    examples?: string[];
  },
  violationCount: number,
  affectedFiles: string[]
): string {
  const lines: string[] = [];

  lines.push(`📋 Pattern: ${pattern.name ?? pattern.id ?? 'Unknown'}`);
  lines.push('');

  if (pattern.category) {
    lines.push(`Category: ${pattern.category}${pattern.subcategory ? ` > ${pattern.subcategory}` : ''}`);
  }

  if (pattern.description) {
    lines.push(`Description: ${pattern.description}`);
  }

  if (pattern.confidence !== undefined) {
    lines.push(`Confidence: ${Math.round(pattern.confidence * 100)}%`);
  }

  lines.push('');
  lines.push(`Violations: ${violationCount}`);
  lines.push(`Affected files: ${affectedFiles.length}`);

  if (affectedFiles.length > 0 && affectedFiles.length <= 5) {
    lines.push('');
    lines.push('Files:');
    for (const file of affectedFiles) {
      const fileName = file.split('/').pop() ?? file;
      lines.push(`  - ${fileName}`);
    }
  }

  return lines.join('\n');
}

/**
 * Group patterns by category
 */
function groupPatternsByCategory(
  patterns: Array<{ id?: string; category?: string }>
): Map<string, Array<{ id?: string; category?: string }>> {
  const groups = new Map<string, Array<{ id?: string; category?: string }>>();

  for (const pattern of patterns) {
    const category = pattern.category ?? 'Uncategorized';
    const group = groups.get(category) ?? [];
    group.push(pattern);
    groups.set(category, group);
  }

  return groups;
}

/**
 * Format patterns summary for display
 */
function formatPatternsSummary(
  patternsByCategory: Map<string, Array<{ id?: string; name?: string }>>,
  violations: Map<string, Array<{ patternId: string }>>
): string {
  const lines: string[] = [];

  lines.push(`📊 Detected Patterns Summary`);
  lines.push('');

  let totalPatterns = 0;
  let totalViolations = 0;

  for (const [category, patterns] of patternsByCategory) {
    totalPatterns += patterns.length;

    // Count violations for this category
    let categoryViolations = 0;
    for (const pattern of patterns) {
      for (const docViolations of violations.values()) {
        categoryViolations += docViolations.filter((v) => v.patternId === pattern.id).length;
      }
    }
    totalViolations += categoryViolations;

    lines.push(`${category}: ${patterns.length} pattern${patterns.length === 1 ? '' : 's'}, ${categoryViolations} violation${categoryViolations === 1 ? '' : 's'}`);
  }

  lines.push('');
  lines.push(`Total: ${totalPatterns} patterns, ${totalViolations} violations`);

  return lines.join('\n');
}

/**
 * Get pattern statistics
 */
export function getPatternStatistics(
  patterns: Map<string, { id: string; category?: string }>,
  violations: Map<string, Array<{ patternId: string; severity: string }>>
): {
  totalPatterns: number;
  totalViolations: number;
  byCategory: Record<string, { patterns: number; violations: number }>;
  bySeverity: Record<string, number>;
} {
  const byCategory: Record<string, { patterns: number; violations: number }> = {};
  const bySeverity: Record<string, number> = { error: 0, warning: 0, info: 0, hint: 0 };

  let totalViolations = 0;

  // Count patterns by category
  for (const pattern of patterns.values()) {
    const category = pattern.category ?? 'Uncategorized';
    if (!byCategory[category]) {
      byCategory[category] = { patterns: 0, violations: 0 };
    }
    byCategory[category].patterns++;
  }

  // Count violations
  for (const docViolations of violations.values()) {
    for (const violation of docViolations) {
      totalViolations++;

      // By severity
      bySeverity[violation.severity] = (bySeverity[violation.severity] ?? 0) + 1;

      // By category
      const pattern = patterns.get(violation.patternId);
      const category = pattern?.category ?? 'Uncategorized';
      if (byCategory[category]) {
        byCategory[category].violations++;
      }
    }
  }

  return {
    totalPatterns: patterns.size,
    totalViolations,
    byCategory,
    bySeverity,
  };
}
