/**
 * Prediction Module
 * 
 * Provides predictive memory retrieval that anticipates
 * which memories will be needed based on context signals.
 * 
 * Features:
 * - File-based prediction (linked memories, patterns)
 * - Pattern-based prediction (rationales, tribal knowledge)
 * - Temporal prediction (time of day, session duration)
 * - Behavioral prediction (queries, intents, usage)
 * - Prediction caching for fast retrieval
 * - Embedding preloading for predicted memories
 * 
 * @module prediction
 */

// Re-export types
export * from './types.js';

// Export signals submodule
export * from './signals/index.js';

// Export predictor submodule
export * from './predictor/index.js';

// Export cache submodule
export * from './cache/index.js';
