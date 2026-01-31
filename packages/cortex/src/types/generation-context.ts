/**
 * Code Generation Context Types
 * 
 * Defines types for building rich context for code generation,
 * including pattern context, tribal knowledge, constraints,
 * and provenance tracking.
 * 
 * @module types/generation-context
 */

/**
 * Full context for code generation
 * 
 * Everything the AI needs to generate code that follows
 * project patterns and avoids known pitfalls.
 */
export interface GenerationContext {
  /** What we're generating */
  target: GenerationTarget;
  /** User's intent */
  intent: GenerationIntent;
  /** Original query */
  query: string;
  /** Pattern context */
  patterns: PatternContext[];
  /** Tribal knowledge context */
  tribal: TribalContext[];
  /** Constraint context */
  constraints: ConstraintContext[];
  /** Anti-patterns to avoid */
  antiPatterns: AntiPatternContext[];
  /** Related memories */
  relatedMemories: RelatedMemoryContext[];
  /** Token budget used */
  tokenBudget: TokenBudgetInfo;
  /** When context was built */
  builtAt: string;
  /** Context metadata */
  metadata?: GenerationMetadata;
}

/**
 * What we're generating
 */
export interface GenerationTarget {
  /** Target file path */
  filePath: string;
  /** Target language */
  language: string;
  /** Target framework (if applicable) */
  framework?: string;
  /** Specific function/class being generated */
  symbol?: string;
  /** Type of generation */
  type: GenerationType;
  /** Surrounding code context */
  surroundingCode?: string;
}

/**
 * Types of code generation
 */
export type GenerationType =
  | 'new_file'
  | 'new_function'
  | 'new_class'
  | 'modify_existing'
  | 'add_feature'
  | 'fix_bug'
  | 'refactor'
  | 'add_test';

/**
 * Generation intent
 */
export type GenerationIntent =
  | 'implement'
  | 'fix'
  | 'refactor'
  | 'test'
  | 'document'
  | 'optimize'
  | 'explain';

/**
 * Pattern context for generation
 */
export interface PatternContext {
  /** Pattern ID */
  patternId: string;
  /** Pattern name */
  patternName: string;
  /** Pattern category */
  category: string;
  /** Why this pattern is relevant */
  relevanceReason: string;
  /** Relevance score (0.0 - 1.0) */
  relevanceScore: number;
  /** Example code following this pattern */
  example?: CodeExample;
  /** Key rules from this pattern */
  keyRules: string[];
  /** Confidence in this pattern */
  confidence: number;
}

/**
 * Tribal knowledge context for generation
 */
export interface TribalContext {
  /** Memory ID */
  memoryId: string;
  /** Topic */
  topic: string;
  /** The knowledge */
  knowledge: string;
  /** Severity */
  severity: 'info' | 'warning' | 'critical';
  /** Why this is relevant */
  relevanceReason: string;
  /** Relevance score */
  relevanceScore: number;
  /** Warnings to include */
  warnings?: string[];
  /** Consequences of ignoring */
  consequences?: string[];
}

/**
 * Constraint context for generation
 */
export interface ConstraintContext {
  /** Constraint ID */
  constraintId: string;
  /** Constraint name */
  constraintName: string;
  /** Constraint description */
  description: string;
  /** Whether this constraint is hard (must follow) or soft (should follow) */
  isHard: boolean;
  /** Any overrides that apply */
  overrides?: ConstraintOverrideContext[];
  /** Relevance score */
  relevanceScore: number;
}

/**
 * Constraint override context
 */
export interface ConstraintOverrideContext {
  /** Override memory ID */
  memoryId: string;
  /** Scope where override applies */
  scope: string;
  /** Reason for override */
  reason: string;
  /** Alternative approach */
  alternative?: string;
}

/**
 * Anti-pattern context for generation
 */
export interface AntiPatternContext {
  /** Memory ID (code_smell) */
  memoryId: string;
  /** Anti-pattern name */
  name: string;
  /** What to avoid */
  pattern: string;
  /** Why it's bad */
  reason: string;
  /** What to do instead */
  alternative: string;
  /** Example of bad code */
  badExample?: string;
  /** Example of good code */
  goodExample?: string;
  /** Relevance score */
  relevanceScore: number;
}

/**
 * Related memory context
 */
export interface RelatedMemoryContext {
  /** Memory ID */
  memoryId: string;
  /** Memory type */
  memoryType: string;
  /** Summary */
  summary: string;
  /** Relationship to current context */
  relationship: string;
  /** Relevance score */
  relevanceScore: number;
}

/**
 * Code example
 */
export interface CodeExample {
  /** Code content */
  code: string;
  /** Language */
  language: string;
  /** File path */
  filePath?: string;
  /** Description */
  description?: string;
  /** Line numbers */
  lineStart?: number;
  lineEnd?: number;
}

/**
 * Token budget information
 */
export interface TokenBudgetInfo {
  /** Total budget */
  total: number;
  /** Used by patterns */
  patternsUsed: number;
  /** Used by tribal */
  tribalUsed: number;
  /** Used by constraints */
  constraintsUsed: number;
  /** Used by anti-patterns */
  antiPatternsUsed: number;
  /** Used by related memories */
  relatedUsed: number;
  /** Remaining */
  remaining: number;
}

/**
 * Generation metadata
 */
export interface GenerationMetadata {
  /** Session ID */
  sessionId?: string;
  /** User ID */
  userId?: string;
  /** Request ID */
  requestId?: string;
  /** Build time (ms) */
  buildTimeMs: number;
  /** Memories considered */
  memoriesConsidered: number;
  /** Memories included */
  memoriesIncluded: number;
}

/**
 * Code provenance tracking
 * 
 * Tracks what influenced the generated code for
 * transparency and debugging.
 */
export interface CodeProvenance {
  /** Generation request ID */
  requestId: string;
  /** Influences on the generated code */
  influences: Influence[];
  /** Warnings that were considered */
  warnings: string[];
  /** Constraints that were applied */
  appliedConstraints: string[];
  /** Anti-patterns that were avoided */
  avoidedAntiPatterns: string[];
  /** Confidence in the generation */
  confidence: number;
  /** When generation occurred */
  generatedAt: string;
}

/**
 * An influence on generated code
 */
export interface Influence {
  /** Memory ID that influenced */
  memoryId: string;
  /** Memory type */
  memoryType: string;
  /** Type of influence */
  influenceType: InfluenceType;
  /** Description of influence */
  description: string;
  /** Strength of influence (0.0 - 1.0) */
  strength: number;
}

/**
 * Types of influence
 */
export type InfluenceType =
  | 'pattern_followed'
  | 'tribal_applied'
  | 'constraint_enforced'
  | 'antipattern_avoided'
  | 'example_used'
  | 'style_matched';

/**
 * Generated code with metadata
 */
export interface GeneratedCode {
  /** The generated code */
  code: string;
  /** Language */
  language: string;
  /** Target file */
  targetFile: string;
  /** Provenance tracking */
  provenance: CodeProvenance;
  /** Explanation of the code */
  explanation?: string;
  /** Warnings for the user */
  warnings?: string[];
  /** Suggested follow-up actions */
  suggestedActions?: string[];
  /** When generated */
  generatedAt: string;
}

/**
 * Generation outcome for feedback
 */
export type GenerationOutcome = 'accepted' | 'modified' | 'rejected';

/**
 * Generation feedback
 */
export interface GenerationFeedback {
  /** Generation request ID */
  requestId: string;
  /** Outcome */
  outcome: GenerationOutcome;
  /** User feedback text */
  feedback?: string;
  /** Modified code (if outcome is 'modified') */
  modifiedCode?: string;
  /** When feedback was provided */
  providedAt: string;
}
