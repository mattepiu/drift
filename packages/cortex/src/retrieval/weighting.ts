/**
 * Intent Weighting
 * 
 * Different intents weight different memory types differently.
 * For example, security audits weight tribal knowledge higher
 * because security gotchas are critical.
 */

import type { MemoryType } from '../types/index.js';
import type { Intent } from './engine.js';

/**
 * Weight matrix for intent-based memory weighting
 */
const WEIGHTS: Record<Intent, Record<MemoryType, number>> = {
  add_feature: {
    core: 1.0,
    tribal: 1.0,
    procedural: 1.5,      // How to do things
    semantic: 1.2,        // What patterns exist
    episodic: 0.5,
    pattern_rationale: 1.3,
    constraint_override: 1.0,
    decision_context: 0.8,
    code_smell: 1.2,
  },
  fix_bug: {
    core: 1.0,
    tribal: 1.5,          // Known issues
    procedural: 0.8,
    semantic: 1.2,
    episodic: 1.0,        // Recent context
    pattern_rationale: 1.0,
    constraint_override: 0.8,
    decision_context: 1.0,
    code_smell: 1.5,      // Past mistakes
  },
  refactor: {
    core: 1.0,
    tribal: 1.2,
    procedural: 1.0,
    semantic: 1.3,
    episodic: 0.5,
    pattern_rationale: 1.5,  // Why patterns exist
    constraint_override: 1.2,
    decision_context: 1.5,   // Why decisions were made
    code_smell: 1.3,
  },
  security_audit: {
    core: 1.0,
    tribal: 2.0,          // Security gotchas critical
    procedural: 1.0,
    semantic: 1.5,
    episodic: 0.3,
    pattern_rationale: 1.2,
    constraint_override: 1.5,  // Security overrides
    decision_context: 1.0,
    code_smell: 1.8,
  },
  understand_code: {
    core: 1.0,
    tribal: 1.2,
    procedural: 0.8,
    semantic: 1.5,        // Consolidated knowledge
    episodic: 0.5,
    pattern_rationale: 1.5,
    constraint_override: 0.8,
    decision_context: 1.5,
    code_smell: 1.0,
  },
  add_test: {
    core: 1.0,
    tribal: 1.2,
    procedural: 1.5,      // How to write tests
    semantic: 1.0,
    episodic: 0.5,
    pattern_rationale: 1.0,
    constraint_override: 0.8,
    decision_context: 0.8,
    code_smell: 1.3,
  },
};

/**
 * Intent weighter
 */
export class IntentWeighter {
  /**
   * Get the weight for a memory type given an intent
   */
  getWeight(memoryType: MemoryType, intent: Intent): number {
    return WEIGHTS[intent]?.[memoryType] ?? 1.0;
  }

  /**
   * Get all weights for an intent
   */
  getWeightsForIntent(intent: Intent): Record<MemoryType, number> {
    return WEIGHTS[intent] ?? {};
  }
}
