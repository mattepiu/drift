/**
 * Pattern Rationale Memory Type
 * 
 * Captures WHY a pattern exists in the codebase.
 * Links to Drift's pattern detection system.
 */

import type { BaseMemory } from './memory.js';
import type { MemoryCitation } from './citation.js';

/**
 * Pattern Rationale Memory - Why patterns exist
 * 
 * Half-life: 180 days
 * 
 * Provides human context for patterns detected by Drift.
 * Answers the question "Why do we do it this way?"
 * 
 * Examples:
 * - "We use barrel exports because it simplifies imports and enables tree-shaking"
 * - "The repository pattern was chosen to abstract database access for testing"
 * - "Error boundaries are placed at route level to prevent full-page crashes"
 */
export interface PatternRationaleMemory extends BaseMemory {
  type: 'pattern_rationale';

  /** Pattern ID from Drift's pattern system */
  patternId: string;
  /** Human-readable pattern name */
  patternName: string;
  /** Pattern category (e.g., 'api', 'auth', 'structural') */
  patternCategory: string;

  /** The rationale - why this pattern exists */
  rationale: string;
  /** Business context for the pattern */
  businessContext?: string;
  /** Technical context for the pattern */
  technicalContext?: string;
  /** Alternatives that were considered and rejected */
  alternativesRejected?: string[];
  /** Trade-offs made by choosing this pattern */
  tradeoffs?: string[];

  /** Who introduced this pattern */
  introducedBy?: string;
  /** When this pattern was introduced */
  introducedWhen?: string;
  /** Related decision ID from decision mining */
  relatedDecisionId?: string;

  /** Code citations supporting this rationale */
  citations?: MemoryCitation[];
}
