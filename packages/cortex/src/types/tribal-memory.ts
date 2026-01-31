/**
 * Tribal Memory Type
 * 
 * Institutional knowledge that isn't written down anywhere.
 * The "gotchas", warnings, and hard-won lessons that only
 * experienced team members know.
 */

import type { BaseMemory } from './memory.js';

/**
 * Source of tribal knowledge
 */
export interface TribalSource {
  /** How this knowledge was acquired */
  type: 'manual' | 'pr_comment' | 'code_review' | 'incident' | 'documentation' | 'inferred';
  /** Reference to source (PR URL, incident ID, etc.) */
  reference?: string;
}

/**
 * Severity levels for tribal knowledge
 */
export type TribalSeverity = 'info' | 'warning' | 'critical';

/**
 * Tribal Memory - Institutional knowledge
 * 
 * Half-life: 365 days
 * 
 * Examples:
 * - "Never call the payment API without idempotency keys"
 * - "The legacy auth system has a 5-second timeout that can't be changed"
 * - "Always check user.isActive before user.permissions"
 */
export interface TribalMemory extends BaseMemory {
  type: 'tribal';

  /** Main topic (e.g., 'authentication', 'payments', 'database') */
  topic: string;
  /** Subtopic for more specific categorization */
  subtopic?: string;

  /** The actual knowledge */
  knowledge: string;
  /** Additional context */
  context?: string;
  /** Specific warnings */
  warnings?: string[];
  /** Consequences of ignoring this knowledge */
  consequences?: string[];

  /** Severity level */
  severity: TribalSeverity;

  /** How we learned this */
  source: TribalSource;

  /** People who contributed to this knowledge */
  contributors?: string[];
  /** When this was last validated by a human */
  lastValidated?: string;

  /** Auto-linked database tables (from Drift analysis) */
  linkedTables?: string[];
  /** Auto-linked environment variables */
  linkedEnvVars?: string[];
}
