/**
 * Active Learning Submodule
 * 
 * Implements active learning to improve memory quality:
 * - Identifies memories needing validation
 * - Generates validation prompts
 * - Processes user feedback
 * 
 * @module learning/active
 */

export * from './candidate-selector.js';
export * from './prompt-generator.js';
export * from './loop.js';
