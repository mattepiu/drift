/**
 * Decision Context Memory Type
 * 
 * Human-provided context for architectural decisions
 * mined by Drift's decision mining system.
 */

import type { BaseMemory } from './memory.js';

/**
 * Decision Context Memory - Human context for ADRs
 * 
 * Half-life: 180 days
 * 
 * Enriches automatically mined decisions with human context
 * that can't be extracted from code alone.
 * 
 * Examples:
 * - "We migrated from REST to GraphQL because the mobile team needed flexible queries"
 * - "The microservices split was driven by team scaling, not technical requirements"
 * - "We chose PostgreSQL over MongoDB for ACID compliance in financial transactions"
 */
export interface DecisionContextMemory extends BaseMemory {
  type: 'decision_context';

  /** Decision ID from Drift's decision mining */
  decisionId: string;
  /** Summary of the decision */
  decisionSummary: string;

  /** Business context that drove this decision */
  businessContext?: string;
  /** Technical context for this decision */
  technicalContext?: string;
  /** Stakeholders involved in the decision */
  stakeholders?: string[];
  /** Constraints that influenced the decision */
  constraints?: string[];

  /** Conditions that would trigger revisiting this decision */
  revisitWhen?: string[];

  /** Whether this decision is still valid */
  stillValid: boolean;
  /** When this decision was last reviewed */
  lastReviewed?: string;
  /** Notes from the last review */
  reviewNotes?: string;
}
