/**
 * Signals Submodule
 * 
 * Exports signal extraction components for prediction.
 * 
 * @module prediction/signals
 */

export { SignalGatherer, type SignalGathererConfig } from './gatherer.js';
export { FileSignalExtractor, type FileSignalExtractorConfig } from './file-signals.js';
export { TemporalSignalExtractor, type TemporalSignalExtractorConfig } from './temporal-signals.js';
export { BehavioralSignalExtractor, type BehavioralSignalExtractorConfig } from './behavioral-signals.js';
export { GitSignalExtractor, type GitSignalExtractorConfig } from './git-signals.js';
