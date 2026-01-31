/**
 * Constraint Override Memory Type
 * 
 * Records approved exceptions to constraints.
 * Links to Drift's constraint system.
 */

import type { BaseMemory } from './memory.js';

/**
 * Scope of the override
 */
export interface OverrideScope {
  /** Type of scope */
  type: 'file' | 'directory' | 'function' | 'pattern' | 'global';
  /** Target of the scope (file path, directory path, function name, pattern ID) */
  target: string;
}

/**
 * Constraint Override Memory - Approved exceptions
 * 
 * Half-life: 90 days
 * 
 * Records when a constraint has been intentionally overridden
 * with proper approval and documentation.
 * 
 * Examples:
 * - "The no-any rule is overridden in legacy/adapter.ts for third-party compatibility"
 * - "Rate limiting is disabled for internal health check endpoints"
 * - "The authentication middleware is bypassed for public API routes"
 */
export interface ConstraintOverrideMemory extends BaseMemory {
  type: 'constraint_override';

  /** Constraint ID from Drift's constraint system */
  constraintId: string;
  /** Human-readable constraint name */
  constraintName: string;

  /** Where this override applies */
  scope: OverrideScope;

  /** Why this override was approved */
  reason: string;
  /** Who approved this override */
  approvedBy?: string;
  /** When this override was approved */
  approvalDate?: string;

  /** Whether this override is permanent */
  permanent: boolean;
  /** When this override expires (if not permanent) */
  expiresAt?: string;
  /** When this override should be reviewed */
  reviewAt?: string;

  /** How many times this override has been used */
  usageCount: number;
  /** When this override was last used */
  lastUsed?: string;
}
