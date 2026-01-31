/**
 * Learning System Types
 * 
 * Defines types for the true learning system that:
 * - Analyzes corrections to understand WHY something was wrong
 * - Extracts generalizable principles
 * - Calibrates confidence based on evidence
 * - Identifies memories needing validation
 * 
 * @module types/learning
 */

/**
 * The 10 correction categories
 * 
 * Each category represents a different type of mistake
 * that the system can learn from.
 */
export type CorrectionCategory =
  | 'pattern_violation'      // Violated an established pattern
  | 'tribal_miss'            // Missed tribal knowledge
  | 'constraint_violation'   // Violated a constraint
  | 'style_preference'       // User style preference
  | 'naming_convention'      // Naming convention issue
  | 'architecture_mismatch'  // Architectural decision mismatch
  | 'security_issue'         // Security-related correction
  | 'performance_issue'      // Performance-related correction
  | 'api_misuse'             // Incorrect API usage
  | 'other';                 // Uncategorized

/**
 * Analyzed correction result
 * 
 * The full analysis of a user correction, including
 * categorization, principle extraction, and memory creation hints.
 */
export interface AnalyzedCorrection {
  /** Unique identifier for this analysis */
  id: string;
  /** The original code/content that was corrected */
  original: string;
  /** The user's feedback/correction */
  feedback: string;
  /** The corrected code (if provided) */
  correctedCode?: string;
  /** Computed diff between original and corrected */
  diff?: CorrectionDiff;
  /** Determined category */
  category: CorrectionCategory;
  /** Confidence in the categorization (0.0 - 1.0) */
  categoryConfidence: number;
  /** Extracted principle */
  principle: ExtractedPrinciple;
  /** Suggested memory type to create */
  suggestedMemoryType: SuggestedMemoryType;
  /** Related existing memories */
  relatedMemories: string[];
  /** When this analysis was performed */
  analyzedAt: string;
  /** Analysis metadata */
  metadata?: CorrectionMetadata;
}

/**
 * Diff between original and corrected code
 */
export interface CorrectionDiff {
  /** Lines added */
  additions: DiffLine[];
  /** Lines removed */
  removals: DiffLine[];
  /** Lines modified */
  modifications: DiffModification[];
  /** Summary of changes */
  summary: string;
  /** Semantic changes detected */
  semanticChanges: SemanticChange[];
}

/**
 * A line in a diff
 */
export interface DiffLine {
  /** Line number */
  lineNumber: number;
  /** Line content */
  content: string;
}

/**
 * A modification in a diff
 */
export interface DiffModification {
  /** Original line number */
  originalLine: number;
  /** New line number */
  newLine: number;
  /** Original content */
  originalContent: string;
  /** New content */
  newContent: string;
}

/**
 * Semantic change detected in diff
 */
export interface SemanticChange {
  /** Type of semantic change */
  type: 'rename' | 'refactor' | 'add_error_handling' | 'change_logic' | 'add_validation' | 'other';
  /** Description of the change */
  description: string;
  /** Affected code elements */
  affectedElements: string[];
}

/**
 * Extracted principle from a correction
 * 
 * A generalizable rule that can be applied to future
 * code generation to avoid similar mistakes.
 */
export interface ExtractedPrinciple {
  /** The principle statement */
  statement: string;
  /** Detailed explanation */
  explanation: string;
  /** Scope where this principle applies */
  scope: PrincipleScope;
  /** Confidence in this principle (0.0 - 1.0) */
  confidence: number;
  /** Example of correct usage */
  correctExample?: string;
  /** Example of incorrect usage */
  incorrectExample?: string;
  /** Keywords for matching */
  keywords: string[];
  /** Whether this is a hard rule or soft preference */
  isHardRule: boolean;
}

/**
 * Scope where a principle applies
 */
export interface PrincipleScope {
  /** File patterns where this applies */
  filePatterns?: string[];
  /** Languages where this applies */
  languages?: string[];
  /** Frameworks where this applies */
  frameworks?: string[];
  /** Specific patterns where this applies */
  patterns?: string[];
  /** Whether this is project-wide */
  projectWide: boolean;
}

/**
 * Suggested memory type to create from correction
 */
export type SuggestedMemoryType =
  | 'tribal'
  | 'code_smell'
  | 'pattern_rationale'
  | 'constraint_override'
  | 'procedural';

/**
 * Metadata about a correction
 */
export interface CorrectionMetadata {
  /** File where correction occurred */
  filePath?: string;
  /** Language of the code */
  language?: string;
  /** User who made the correction */
  userId?: string;
  /** Session ID */
  sessionId?: string;
  /** Related pattern IDs */
  relatedPatterns?: string[];
  /** Related constraint IDs */
  relatedConstraints?: string[];
}

/**
 * Confidence metrics for a memory
 */
export interface ConfidenceMetrics {
  /** Base confidence from creation */
  baseConfidence: number;
  /** Number of supporting evidence items */
  supportingEvidenceCount: number;
  /** Number of contradicting evidence items */
  contradictingEvidenceCount: number;
  /** Times this memory was used successfully */
  successfulUses: number;
  /** Times this memory was rejected/modified */
  rejectedUses: number;
  /** Age of the memory in days */
  ageInDays: number;
  /** Last validation timestamp */
  lastValidated?: string;
  /** User confirmations */
  userConfirmations: number;
  /** User rejections */
  userRejections: number;
}

/**
 * Calculated confidence result
 */
export interface CalculatedConfidence {
  /** Final confidence score (0.0 - 1.0) */
  confidence: number;
  /** Breakdown of factors */
  factors: ConfidenceFactor[];
  /** Whether validation is recommended */
  needsValidation: boolean;
  /** Reason for validation recommendation */
  validationReason?: string;
}

/**
 * A factor contributing to confidence
 */
export interface ConfidenceFactor {
  /** Factor name */
  name: string;
  /** Factor weight */
  weight: number;
  /** Factor value */
  value: number;
  /** Contribution to final score */
  contribution: number;
  /** Description */
  description: string;
}

/**
 * A memory that needs validation
 */
export interface ValidationCandidate {
  /** Memory ID */
  memoryId: string;
  /** Memory type */
  memoryType: string;
  /** Memory summary */
  summary: string;
  /** Current confidence */
  currentConfidence: number;
  /** Reason for validation */
  reason: ValidationReason;
  /** Priority (higher = more urgent) */
  priority: number;
  /** Suggested validation prompt */
  suggestedPrompt: string;
}

/**
 * Reasons a memory needs validation
 */
export type ValidationReason =
  | 'low_confidence'
  | 'conflicting_evidence'
  | 'stale'
  | 'never_validated'
  | 'high_importance_low_confidence'
  | 'frequent_rejection'
  | 'user_requested';

/**
 * Validation prompt for user
 */
export interface ValidationPrompt {
  /** Memory being validated */
  memoryId: string;
  /** Formatted prompt text */
  promptText: string;
  /** Memory summary */
  memorySummary: string;
  /** Current confidence */
  currentConfidence: number;
  /** Validation reason */
  reason: ValidationReason;
  /** Available actions */
  actions: ValidationAction[];
}

/**
 * Available validation actions
 */
export interface ValidationAction {
  /** Action type */
  type: 'confirm' | 'reject' | 'modify' | 'skip';
  /** Display label */
  label: string;
  /** Description */
  description: string;
}

/**
 * Result of validation feedback
 */
export interface ValidationFeedback {
  /** Memory ID */
  memoryId: string;
  /** Action taken */
  action: 'confirm' | 'reject' | 'modify';
  /** Modification details (if action is 'modify') */
  modification?: string;
  /** User feedback text */
  feedback?: string;
  /** When feedback was provided */
  providedAt: string;
  /** User who provided feedback */
  providedBy?: string;
}

/**
 * Learning outcome tracking
 */
export interface LearningOutcome {
  /** Correction ID */
  correctionId: string;
  /** Memory created (if any) */
  memoryCreated?: string;
  /** Memories updated */
  memoriesUpdated: string[];
  /** Principles extracted */
  principlesExtracted: number;
  /** Whether learning was successful */
  success: boolean;
  /** Any errors */
  error?: string;
  /** When learning completed */
  completedAt: string;
}
