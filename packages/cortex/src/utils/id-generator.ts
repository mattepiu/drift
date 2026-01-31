/**
 * ID Generator
 * 
 * Generates unique IDs for memories.
 * Uses a combination of timestamp and random bytes.
 */

import { randomBytes } from 'crypto';

/**
 * Generate a unique memory ID
 * Format: mem_<timestamp>_<random>
 */
export function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(6).toString('hex');
  return `mem_${timestamp}_${random}`;
}

/**
 * Generate a unique consolidation run ID
 */
export function generateConsolidationId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(4).toString('hex');
  return `cons_${timestamp}_${random}`;
}

/**
 * Generate a unique validation run ID
 */
export function generateValidationId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(4).toString('hex');
  return `val_${timestamp}_${random}`;
}

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(4).toString('hex');
  return `sess_${timestamp}_${random}`;
}

/**
 * Generate a unique causal edge ID
 */
export function generateCausalEdgeId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(4).toString('hex');
  return `edge_${timestamp}_${random}`;
}

/**
 * Generate a unique correction ID
 */
export function generateCorrectionId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(4).toString('hex');
  return `corr_${timestamp}_${random}`;
}

/**
 * Generate a unique prediction ID
 */
export function generatePredictionId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(4).toString('hex');
  return `pred_${timestamp}_${random}`;
}

/**
 * Generate a unique generation request ID
 */
export function generateGenerationId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(4).toString('hex');
  return `gen_${timestamp}_${random}`;
}
