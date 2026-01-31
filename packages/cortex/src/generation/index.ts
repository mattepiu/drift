/**
 * Generation Module
 * 
 * Code generation context and validation system.
 * Provides context gathering, provenance tracking,
 * validation, and feedback processing.
 * 
 * @module generation
 */

// Types
export type {
  GenerationContext,
  GenerationTarget,
  GenerationType,
  GenerationIntent,
  PatternContext,
  TribalContext,
  ConstraintContext,
  ConstraintOverrideContext,
  AntiPatternContext,
  RelatedMemoryContext,
  CodeExample,
  TokenBudgetInfo,
  GenerationMetadata,
  CodeProvenance,
  Influence,
  InfluenceType,
  GeneratedCode,
  GenerationOutcome,
  GenerationFeedback,
} from './types.js';

// Context
export {
  GenerationContextBuilder,
  PatternContextGatherer,
  TribalContextGatherer,
  ConstraintContextGatherer,
  AntiPatternGatherer,
} from './context/index.js';
export type {
  ContextBuilderConfig,
  PatternGathererConfig,
  TribalGathererConfig,
  ConstraintGathererConfig,
  AntiPatternGathererConfig,
} from './context/index.js';

// Provenance
export {
  ProvenanceTracker,
  ProvenanceCommentGenerator,
  ExplanationBuilder,
} from './provenance/index.js';
export type {
  CommentGeneratorConfig,
  ExplanationBuilderConfig,
} from './provenance/index.js';

// Validation
export {
  GeneratedCodeValidator,
  PatternComplianceChecker,
  TribalComplianceChecker,
  AntiPatternChecker,
} from './validation/index.js';
export type {
  ValidationResult,
  ValidatorConfig,
  PatternViolation,
  TribalViolation,
  AntiPatternMatch,
} from './validation/index.js';

// Feedback
export {
  GenerationFeedbackLoop,
  OutcomeProcessor,
} from './feedback/index.js';
export type {
  FeedbackStats,
} from './feedback/index.js';
