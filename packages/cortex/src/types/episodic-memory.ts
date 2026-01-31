/**
 * Episodic Memory Type
 * 
 * Records of specific interactions with the AI agent.
 * These are the raw material for consolidation into semantic memory.
 */

import type { BaseMemory } from './memory.js';

/**
 * The interaction that occurred
 */
export interface Interaction {
  /** What the user asked/requested */
  userQuery: string;
  /** What the agent responded with */
  agentResponse: string;
  /** Outcome of the interaction */
  outcome: 'accepted' | 'rejected' | 'modified' | 'unknown';
}

/**
 * Context at the time of the interaction
 */
export interface InteractionContext {
  /** File that was active */
  activeFile?: string;
  /** Function that was being worked on */
  activeFunction?: string;
  /** Intent of the interaction */
  intent?: string;
  /** Focus area */
  focus?: string;
}

/**
 * A fact extracted from the interaction
 */
export interface ExtractedFact {
  /** The fact itself */
  fact: string;
  /** Confidence in this extraction */
  confidence: number;
  /** Type of fact */
  type: 'preference' | 'knowledge' | 'correction' | 'warning';
}

/**
 * Consolidation status
 */
export type ConsolidationStatus = 'pending' | 'consolidated' | 'pruned';

/**
 * Episodic Memory - Interaction records
 * 
 * Half-life: 7 days
 * 
 * Short-lived memories that capture specific interactions.
 * Periodically consolidated into semantic memories.
 */
export interface EpisodicMemory extends BaseMemory {
  type: 'episodic';

  /** The interaction that occurred */
  interaction: Interaction;

  /** Context at the time of interaction */
  context: InteractionContext;

  /** Facts extracted from this interaction */
  extractedFacts?: ExtractedFact[];

  /** Current consolidation status */
  consolidationStatus: ConsolidationStatus;
  /** IDs of semantic memories this was consolidated into */
  consolidatedInto?: string[];

  /** Session identifier for grouping related interactions */
  sessionId: string;
}
