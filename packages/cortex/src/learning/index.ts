/**
 * Learning Module
 * 
 * True learning system that:
 * - Analyzes corrections to understand WHY something was wrong
 * - Extracts generalizable principles
 * - Calibrates confidence based on evidence
 * - Identifies memories needing validation
 * - Creates memories from learned corrections
 * 
 * @module learning
 */

// Existing exports
export * from './outcome-tracker.js';
export * from './correction-extractor.js';
export * from './fact-extractor.js';
export * from './preference-learner.js';

// Analysis submodule
export * from './analysis/index.js';

// Confidence submodule
export * from './confidence/index.js';

// Active learning submodule
export * from './active/index.js';

// Factory submodule
export * from './factory/index.js';
