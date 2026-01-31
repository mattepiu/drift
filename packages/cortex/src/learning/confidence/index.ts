/**
 * Confidence Submodule
 * 
 * Calculates and calibrates confidence scores for memories:
 * - Evidence-based confidence adjustment
 * - Usage-based confidence adjustment
 * - Temporal decay integration
 * - Validation recommendations
 * 
 * @module learning/confidence
 */

export * from './metrics.js';
export * from './calibrator.js';
export * from './decay-integrator.js';
