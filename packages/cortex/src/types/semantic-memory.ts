/**
 * Semantic Memory Type
 * 
 * Consolidated knowledge extracted from episodic memories.
 * Created through the sleep-inspired consolidation process.
 */

import type { BaseMemory } from './memory.js';

/**
 * Information about how this memory was consolidated
 */
export interface ConsolidationSource {
  /** IDs of episodic memories this was consolidated from */
  episodicMemoryIds: string[];
  /** When consolidation occurred */
  consolidationDate: string;
  /** How consolidation was triggered */
  consolidationMethod: 'automatic' | 'manual';
}

/**
 * Semantic Memory - Consolidated knowledge
 * 
 * Half-life: 90 days
 * 
 * Created when multiple episodic memories about the same topic
 * are consolidated into a single, more abstract piece of knowledge.
 * 
 * Examples:
 * - "Users prefer explicit error messages over generic ones"
 * - "The team uses barrel exports for all public APIs"
 * - "Database queries should always include pagination"
 */
export interface SemanticMemory extends BaseMemory {
  type: 'semantic';

  /** Topic of this knowledge */
  topic: string;
  /** The consolidated knowledge */
  knowledge: string;

  /** How this memory was created */
  consolidatedFrom?: ConsolidationSource;

  /** Number of supporting episodes/evidence */
  supportingEvidence: number;
  /** Number of contradicting episodes/evidence */
  contradictingEvidence: number;

  /** When this knowledge was last reinforced by new evidence */
  lastReinforced?: string;
}
