/**
 * Half-Lives Configuration
 * 
 * Different memory types have different half-lives.
 * Core memories never decay, episodic memories decay quickly.
 */

import type { MemoryType } from '../types/index.js';

/**
 * Half-lives in days for different memory types
 */
export const HALF_LIVES: Record<MemoryType, number> = {
  core: Infinity,           // Never decays
  tribal: 365,              // Institutional knowledge is precious
  procedural: 180,          // How-to knowledge is stable
  semantic: 90,             // Consolidated knowledge persists
  episodic: 7,              // Specific interactions fade quickly
  pattern_rationale: 180,   // Pattern context is stable
  constraint_override: 90,  // Overrides need periodic review
  decision_context: 180,    // Decision context is stable
  code_smell: 90,           // Smell patterns need validation
};

/**
 * Minimum confidence before archival
 */
export const MIN_CONFIDENCE: Record<MemoryType, number> = {
  core: 0.0,                // Never archive
  tribal: 0.2,
  procedural: 0.3,
  semantic: 0.3,
  episodic: 0.1,
  pattern_rationale: 0.3,
  constraint_override: 0.2,
  decision_context: 0.3,
  code_smell: 0.2,
};
