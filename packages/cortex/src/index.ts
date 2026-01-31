/**
 * Drift Cortex - AI Memory System
 * 
 * The only AI memory system that understands code as code, not text.
 * 
 * @packageDocumentation
 */

// Main Cortex class
export { Cortex, getCortex, resetCortex, type CortexConfig } from './cortex.js';

// Types
export * from './types/index.js';

// Storage
export type { IMemoryStorage, QueryOptions, Citation, RelationshipType } from './storage/interface.js';
export { createStorage, autoDetectStorage, type StorageConfig, type StorageType } from './storage/factory.js';
export { SQLiteMemoryStorage } from './storage/sqlite/storage.js';

// Embeddings
export type { IEmbeddingProvider } from './embeddings/interface.js';
export { createEmbeddingProvider, autoDetectEmbeddingProvider, type EmbeddingConfig, type EmbeddingProviderType } from './embeddings/factory.js';
export { LocalEmbeddingProvider } from './embeddings/local.js';
export { OpenAIEmbeddingProvider } from './embeddings/openai.js';
export { OllamaEmbeddingProvider } from './embeddings/ollama.js';

// Retrieval
export { RetrievalEngine, type Intent, type RetrievalContext, type RetrievalResult, type CompressedMemory } from './retrieval/engine.js';
export { RelevanceScorer } from './retrieval/scoring.js';
export { IntentWeighter } from './retrieval/weighting.js';
export { TokenBudgetManager } from './retrieval/budget.js';
export { HierarchicalCompressor, type CompressionResult } from './retrieval/compression.js';
export { ResultRanker, type ScoredMemory } from './retrieval/ranking.js';

// Consolidation
export { ConsolidationEngine, type ConsolidationResult, type ConsolidationConfig } from './consolidation/engine.js';
export { ConsolidationScheduler, type SchedulerConfig } from './consolidation/scheduler.js';
export { ReplayPhase, type ReplayCriteria } from './consolidation/replay.js';
export { AbstractionPhase, type AbstractedKnowledge } from './consolidation/abstraction.js';
export { IntegrationPhase } from './consolidation/integration.js';
export { PruningPhase, type PruneResult } from './consolidation/pruning.js';
export { StrengtheningPhase } from './consolidation/strengthening.js';

// Validation
export { ValidationEngine, type ValidationResult, type ValidationDetail, type ValidationIssue } from './validation/engine.js';
export { CitationValidator } from './validation/citation-validator.js';
export { TemporalValidator } from './validation/temporal-validator.js';
export { ContradictionDetector } from './validation/contradiction-detector.js';
export { PatternAlignmentValidator } from './validation/pattern-alignment.js';
export { HealingEngine, type HealResult } from './validation/healing.js';

// Decay
export { DecayCalculator, type DecayFactors } from './decay/calculator.js';
export { HALF_LIVES, MIN_CONFIDENCE } from './decay/half-lives.js';
export { calculateUsageBoost, calculateImportanceAnchor, calculatePatternBoost } from './decay/boosters.js';

// Causal Graph (v2)
export * from './causal/index.js';

// Orchestrators (v2)
export * from './orchestrators/index.js';

// Utilities
export { generateId, generateConsolidationId, generateValidationId, generateSessionId, generateCausalEdgeId, generateCorrectionId, generatePredictionId, generateGenerationId } from './utils/id-generator.js';
export { hashContent, hashMemory, hashesMatch } from './utils/hash.js';
export { estimateTokens, estimateObjectTokens, fitsInBudget, truncateToFit } from './utils/tokens.js';
export { now, daysBetween, daysSince, isPast, addDays, subtractDays } from './utils/time.js';
