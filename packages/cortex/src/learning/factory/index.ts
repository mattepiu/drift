/**
 * Factory Submodule
 * 
 * Creates memories from analyzed corrections:
 * - Tribal memories from institutional knowledge
 * - Pattern rationale memories from pattern violations
 * - Code smell memories from anti-patterns
 * 
 * @module learning/factory
 */

export * from './tribal-creator.js';
export * from './pattern-creator.js';
export * from './smell-creator.js';
export * from './memory-factory.js';
