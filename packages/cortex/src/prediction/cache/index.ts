/**
 * Cache Submodule
 * 
 * Exports prediction caching and preloading components.
 * 
 * @module prediction/cache
 */

export { PredictionCache, type PredictionCacheConfig } from './prediction-cache.js';
export { EmbeddingPreloader, type EmbeddingPreloaderConfig, type PreloadResult } from './preloader.js';
