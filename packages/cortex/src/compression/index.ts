/**
 * Compression Module
 * 
 * Provides hierarchical compression for token-efficient memory retrieval.
 * Implements 4-level compression system:
 * - Level 0: IDs only (~5 tokens)
 * - Level 1: One-liners (~50 tokens)
 * - Level 2: With examples (~200 tokens)
 * - Level 3: Full context (variable)
 * 
 * @module compression
 */

// Re-export types
export * from './types.js';

// Export compressor submodule
export * from './compressor/index.js';

// Export budget submodule
export * from './budget/index.js';
