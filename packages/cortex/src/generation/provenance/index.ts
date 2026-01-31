/**
 * Provenance Module
 * 
 * Exports all provenance tracking components for code generation.
 * 
 * @module generation/provenance
 */

export { ProvenanceTracker } from './tracker.js';

export { ProvenanceCommentGenerator } from './comment-generator.js';
export type { CommentGeneratorConfig } from './comment-generator.js';

export { ExplanationBuilder } from './explanation-builder.js';
export type { ExplanationBuilderConfig } from './explanation-builder.js';
