/**
 * Procedural Memory Type
 * 
 * How-to knowledge - step-by-step procedures for common tasks.
 * Includes trigger phrases for intent matching and checklists
 * for verification.
 */

import type { BaseMemory } from './memory.js';

/**
 * A single step in a procedure
 */
export interface ProcedureStep {
  /** Order of this step (1-indexed) */
  order: number;
  /** Action to take */
  action: string;
  /** Additional details */
  details?: string;
  /** Files involved in this step */
  files?: string[];
  /** Patterns to follow */
  patterns?: string[];
  /** Constraints to respect */
  constraints?: string[];
  /** Example code or command */
  example?: string;
}

/**
 * A checklist item for verification
 */
export interface ChecklistItem {
  /** What to check */
  item: string;
  /** Whether this is required */
  required: boolean;
  /** Command or pattern to auto-check (optional) */
  autoCheck?: string;
}

/**
 * A correction made to the procedure
 */
export interface ProcedureCorrection {
  /** When the correction was made */
  timestamp: string;
  /** Original step/action */
  original: string;
  /** Corrected step/action */
  corrected: string;
  /** Why the correction was needed */
  reason?: string;
}

/**
 * Procedural Memory - How-to knowledge
 * 
 * Half-life: 180 days
 * 
 * Examples:
 * - "How to add a new API endpoint"
 * - "How to set up a new database migration"
 * - "How to deploy to staging"
 */
export interface ProceduralMemory extends BaseMemory {
  type: 'procedural';

  /** Name of the procedure */
  name: string;
  /** Description of what this procedure accomplishes */
  description: string;

  /** Trigger phrases for intent matching (e.g., ['add endpoint', 'create api', 'new route']) */
  triggers: string[];

  /** Steps to follow */
  steps: ProcedureStep[];

  /** Verification checklist */
  checklist?: ChecklistItem[];

  /** How many times this procedure has been used */
  usageCount: number;
  /** When this procedure was last used */
  lastUsed?: string;
  /** Success rate (0.0 - 1.0) */
  successRate?: number;

  /** Corrections made to this procedure over time */
  corrections?: ProcedureCorrection[];
}
