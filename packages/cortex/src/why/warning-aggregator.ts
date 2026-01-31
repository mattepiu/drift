/**
 * Warning Aggregator
 * 
 * Aggregates warnings from tribal knowledge and patterns.
 */

import type { TribalContext, PatternContext, Warning } from './synthesizer.js';

/**
 * Severity order for sorting (lower = higher priority)
 */
const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/**
 * Warning aggregator
 */
export class WarningAggregator {
  /**
   * Aggregate warnings from various sources
   */
  aggregate(tribal: TribalContext[], patterns: PatternContext[]): Warning[] {
    const warnings: Warning[] = [];

    // Add tribal warnings
    for (const t of tribal) {
      if (t.severity === 'critical' || t.severity === 'warning') {
        warnings.push({
          type: 'tribal',
          severity: t.severity,
          message: t.knowledge,
          source: t.topic,
        });
      }
    }

    // Add pattern warnings (patterns without rationales)
    for (const p of patterns) {
      if (!p.rationale) {
        warnings.push({
          type: 'pattern',
          severity: 'info',
          message: `Pattern "${p.patternName}" has no documented rationale`,
          source: p.patternId,
        });
      }
    }

    // Sort by severity (critical first, then warning, then info)
    return warnings.sort((a, b) => {
      const aOrder = SEVERITY_ORDER[a.severity] ?? 3;
      const bOrder = SEVERITY_ORDER[b.severity] ?? 3;
      return aOrder - bOrder;
    });
  }
}
