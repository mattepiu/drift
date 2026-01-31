/**
 * Validation Engine
 * 
 * Self-healing validation system that keeps memories synchronized
 * with actual code. Includes:
 * - Citation validation (hash checking)
 * - Temporal validation (staleness detection)
 * - Contradiction detection
 * - Pattern alignment validation
 * - Auto-healing strategies
 */

export * from './engine.js';
export * from './citation-validator.js';
export * from './temporal-validator.js';
export * from './contradiction-detector.js';
export * from './pattern-alignment.js';
export * from './healing.js';
