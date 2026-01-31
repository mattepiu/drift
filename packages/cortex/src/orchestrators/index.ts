/**
 * Orchestrators Module
 * 
 * Top-level orchestrators that coordinate Cortex v2 subsystems.
 * 
 * @module orchestrators
 */

// Main orchestrator
export { CortexV2 } from './cortex-v2.js';
export type {
  ContextOptions,
  ContextResult,
  WhyResult,
  HealthReport,
  ConsolidateOptions,
  ConsolidateResult,
  ValidateOptions,
  ValidateResult,
} from './cortex-v2.js';

// Retrieval orchestrator
export { RetrievalOrchestrator } from './retrieval-orchestrator.js';
export type {
  RetrievalMemory,
  RetrievalResultV2,
} from './retrieval-orchestrator.js';

// Learning orchestrator
export { LearningOrchestrator } from './learning-orchestrator.js';
export type {
  LearnResult,
  FeedbackType,
  FeedbackResult,
} from './learning-orchestrator.js';

// Generation orchestrator
export { GenerationOrchestrator } from './generation-orchestrator.js';
export type {
  ContextBuildResult,
  OutcomeTrackResult,
} from './generation-orchestrator.js';
