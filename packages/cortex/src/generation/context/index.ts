/**
 * Generation Context Module
 * 
 * Exports all context gathering components for code generation.
 * 
 * @module generation/context
 */

export { GenerationContextBuilder } from './builder.js';
export type { ContextBuilderConfig } from './builder.js';

export { PatternContextGatherer } from './pattern-gatherer.js';
export type { PatternGathererConfig } from './pattern-gatherer.js';

export { TribalContextGatherer } from './tribal-gatherer.js';
export type { TribalGathererConfig } from './tribal-gatherer.js';

export { ConstraintContextGatherer } from './constraint-gatherer.js';
export type { ConstraintGathererConfig } from './constraint-gatherer.js';

export { AntiPatternGatherer } from './antipattern-gatherer.js';
export type { AntiPatternGathererConfig } from './antipattern-gatherer.js';
