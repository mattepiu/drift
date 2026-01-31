/**
 * Code Smell Memory Type
 * 
 * Patterns to avoid - anti-patterns, bad practices,
 * and mistakes that have been made before.
 */

import type { BaseMemory } from './memory.js';

/**
 * Severity of the code smell
 */
export type SmellSeverity = 'error' | 'warning' | 'info';

/**
 * A recorded occurrence of this smell
 */
export interface SmellOccurrence {
  /** File where the smell was found */
  file: string;
  /** Line number */
  line: number;
  /** When it was found */
  timestamp: string;
  /** Whether it has been resolved */
  resolved: boolean;
  /** Who resolved it */
  resolvedBy?: string;
}

/**
 * Code Smell Memory - Patterns to avoid
 * 
 * Half-life: 90 days
 * 
 * Records anti-patterns and mistakes that should not be repeated.
 * Can include auto-detection rules for proactive warnings.
 * 
 * Examples:
 * - "Don't use string concatenation for SQL queries"
 * - "Avoid nested ternaries more than 2 levels deep"
 * - "Don't store sensitive data in localStorage"
 */
export interface CodeSmellMemory extends BaseMemory {
  type: 'code_smell';

  /** Name of the smell */
  name: string;
  /** Pattern to match (regex or description) */
  pattern?: string;
  /** Description of the smell */
  description: string;
  /** Severity level */
  severity: SmellSeverity;

  /** Why this is bad */
  reason: string;
  /** Consequences of this smell */
  consequences?: string[];

  /** How to fix it */
  suggestion: string;
  /** Example of bad code */
  exampleBad?: string;
  /** Example of good code */
  exampleGood?: string;

  /** Historical occurrences */
  occurrences?: SmellOccurrence[];

  /** Whether to auto-detect this smell */
  autoDetect: boolean;
  /** Detection rule (regex, AST pattern, etc.) */
  detectionRule?: string;
}
