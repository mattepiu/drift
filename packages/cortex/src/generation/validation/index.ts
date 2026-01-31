/**
 * Validation Module
 * 
 * Exports all validation components for generated code.
 * 
 * @module generation/validation
 */

export { GeneratedCodeValidator } from './validator.js';
export type { ValidationResult, ValidatorConfig } from './validator.js';

export { PatternComplianceChecker } from './pattern-checker.js';
export type { PatternViolation } from './pattern-checker.js';

export { TribalComplianceChecker } from './tribal-checker.js';
export type { TribalViolation } from './tribal-checker.js';

export { AntiPatternChecker } from './antipattern-checker.js';
export type { AntiPatternMatch } from './antipattern-checker.js';
