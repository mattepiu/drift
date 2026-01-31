/**
 * Decay Boosters
 * 
 * Factors that resist decay:
 * - Usage frequency
 * - Importance level
 * - Pattern alignment
 */

import type { Importance } from '../types/index.js';

/**
 * Usage boost: frequently accessed memories resist decay
 * Formula: 1 + log10(accessCount + 1) * 0.2, capped at 1.5
 */
export function calculateUsageBoost(accessCount: number): number {
  return Math.min(1.5, 1 + Math.log10(accessCount + 1) * 0.2);
}

/**
 * Importance anchor: critical memories decay slower
 */
export function calculateImportanceAnchor(importance: Importance): number {
  switch (importance) {
    case 'critical':
      return 2.0;
    case 'high':
      return 1.5;
    case 'normal':
      return 1.0;
    case 'low':
      return 0.8;
    default:
      return 1.0;
  }
}

/**
 * Pattern boost: memories linked to active patterns decay slower
 */
export function calculatePatternBoost(linkedPatterns: string[]): number {
  if (linkedPatterns.length === 0) return 1.0;

  // TODO: Check if patterns are still active
  // For now, any linked pattern gives a boost
  return 1.3;
}
