/**
 * Decay System
 * 
 * Multi-factor confidence decay calculation.
 * Memories decay based on:
 * - Time since last access
 * - Citation validity
 * - Usage frequency
 * - Importance level
 * - Pattern alignment
 */

export * from './calculator.js';
export * from './half-lives.js';
export * from './boosters.js';
