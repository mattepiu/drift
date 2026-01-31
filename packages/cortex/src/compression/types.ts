/**
 * Compression Types
 * 
 * Re-exports compression types from the types module.
 * 
 * @module compression/types
 */

export type {
  CompressionLevel,
  LevelConfig,
  Level0Output,
  Level1Output,
  Level2Output,
  Level3Output,
  CodeSnippet,
  Evidence,
  CompressedMemory,
  CompressionResult,
  CompressionOptions,
  TokenBudget,
} from '../types/compressed-memory.js';

export { DEFAULT_LEVEL_CONFIGS } from '../types/compressed-memory.js';
