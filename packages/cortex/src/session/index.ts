/**
 * Session Module
 * 
 * Provides session context management for token efficiency.
 * Tracks what has been loaded in the current session to
 * avoid re-sending the same context repeatedly.
 * 
 * @module session
 */

// Re-export types
export * from './types.js';

// Export context submodule
export * from './context/index.js';

// Export storage submodule
export * from './storage/index.js';
