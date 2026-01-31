/**
 * Consolidation Engine
 * 
 * Sleep-inspired memory consolidation with 5 phases:
 * 1. Replay - Select episodic memories
 * 2. Abstraction - Extract patterns
 * 3. Integration - Merge with semantic memory
 * 4. Pruning - Remove redundant episodes
 * 5. Strengthening - Boost frequently accessed memories
 */

export * from './engine.js';
export * from './replay.js';
export * from './abstraction.js';
export * from './integration.js';
export * from './pruning.js';
export * from './strengthening.js';
export * from './scheduler.js';
