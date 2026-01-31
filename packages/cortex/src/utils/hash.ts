/**
 * Hashing Utilities
 * 
 * Content hashing for citation drift detection.
 */

import { createHash } from 'crypto';

/**
 * Hash content for citation comparison
 * Returns first 16 characters of SHA-256 hash
 */
export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Hash a memory for deduplication
 */
export function hashMemory(memory: unknown): string {
  const content = JSON.stringify(memory);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Compare two hashes
 */
export function hashesMatch(a: string, b: string): boolean {
  return a === b;
}
