/**
 * Analysis Submodule
 * 
 * Analyzes corrections to understand WHY something was wrong:
 * - Categorizes corrections into 10 types
 * - Extracts generalizable principles
 * - Analyzes code diffs semantically
 * 
 * @module learning/analysis
 */

export * from './diff-analyzer.js';
export * from './categorizer.js';
export * from './principle-extractor.js';
export * from './analyzer.js';
