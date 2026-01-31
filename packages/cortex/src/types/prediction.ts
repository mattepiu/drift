/**
 * Prediction System Types
 * 
 * Defines types for predictive memory retrieval that
 * anticipates what memories will be needed based on:
 * - Current file context
 * - Temporal patterns
 * - User behavior
 * - Git activity
 * 
 * @module types/prediction
 */

/**
 * Input signals for prediction
 * 
 * All the contextual information used to predict
 * which memories will be relevant.
 */
export interface PredictionSignals {
  /** File-based signals */
  file: FileSignals;
  /** Temporal signals */
  temporal: TemporalSignals;
  /** Behavioral signals */
  behavioral: BehavioralSignals;
  /** Git-based signals */
  git: GitSignals;
  /** When signals were gathered */
  gatheredAt: string;
}

/**
 * File-based prediction signals
 */
export interface FileSignals {
  /** Currently active file */
  activeFile: string;
  /** Recently opened files */
  recentFiles: string[];
  /** File type/extension */
  fileType: string;
  /** Detected patterns in file */
  filePatterns: string[];
  /** Imports in the file */
  fileImports: string[];
  /** Functions/classes in the file */
  fileSymbols: string[];
  /** Directory context */
  directory: string;
}

/**
 * Temporal prediction signals
 */
export interface TemporalSignals {
  /** Time of day */
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  /** Day of week */
  dayOfWeek: string;
  /** Session duration in minutes */
  sessionDuration: number;
  /** Time since last query */
  timeSinceLastQuery: number;
  /** Is this a new session? */
  isNewSession: boolean;
}

/**
 * Behavioral prediction signals
 */
export interface BehavioralSignals {
  /** Recent queries made */
  recentQueries: string[];
  /** Recent intents */
  recentIntents: Intent[];
  /** Frequently accessed memories */
  frequentMemories: string[];
  /** Current task context (if known) */
  currentTask?: string;
  /** User's typical patterns */
  userPatterns: UserPattern[];
}

/**
 * User behavior pattern
 */
export interface UserPattern {
  /** Pattern type */
  type: 'file_sequence' | 'query_sequence' | 'time_based' | 'task_based';
  /** Pattern description */
  description: string;
  /** Confidence in this pattern */
  confidence: number;
  /** Associated memories */
  associatedMemories: string[];
}

/**
 * Git-based prediction signals
 */
export interface GitSignals {
  /** Current branch */
  currentBranch: string;
  /** Recently modified files */
  recentlyModifiedFiles: string[];
  /** Recent commit messages */
  recentCommitMessages: string[];
  /** Files with uncommitted changes */
  uncommittedFiles: string[];
  /** Is this a feature branch? */
  isFeatureBranch: boolean;
  /** Related PR/issue (if any) */
  relatedIssue?: string;
}

/**
 * Intent types for prediction
 */
export type Intent =
  | 'add_feature'
  | 'fix_bug'
  | 'refactor'
  | 'add_test'
  | 'review_code'
  | 'understand_code'
  | 'debug'
  | 'optimize'
  | 'document'
  | 'unknown';

/**
 * A predicted memory with confidence
 */
export interface PredictedMemory {
  /** Memory ID */
  memoryId: string;
  /** Memory type */
  memoryType: string;
  /** Memory summary */
  summary: string;
  /** Prediction confidence (0.0 - 1.0) */
  confidence: number;
  /** Prediction source/reason */
  source: PredictionSource;
  /** Relevance score */
  relevanceScore: number;
  /** Whether embedding is preloaded */
  embeddingPreloaded: boolean;
}

/**
 * Source of a prediction
 */
export interface PredictionSource {
  /** Strategy that made this prediction */
  strategy: PredictionStrategy;
  /** Specific reason for prediction */
  reason: string;
  /** Signals that contributed */
  contributingSignals: string[];
  /** Confidence breakdown */
  confidenceBreakdown: Record<string, number>;
}

/**
 * Prediction strategies
 */
export type PredictionStrategy =
  | 'file_based'
  | 'pattern_based'
  | 'temporal'
  | 'behavioral'
  | 'git_based'
  | 'co_occurrence'
  | 'semantic_similarity';

/**
 * Full prediction result
 */
export interface PredictionResult {
  /** Predicted memories */
  predictions: PredictedMemory[];
  /** Signals used */
  signals: PredictionSignals;
  /** Strategies used */
  strategiesUsed: PredictionStrategy[];
  /** Total prediction time (ms) */
  predictionTimeMs: number;
  /** Cache status */
  cacheStatus: 'hit' | 'miss' | 'partial';
  /** When prediction was made */
  predictedAt: string;
}

/**
 * Prediction configuration
 */
export interface PredictionConfig {
  /** Maximum predictions to return */
  maxPredictions: number;
  /** Minimum confidence threshold */
  minConfidence: number;
  /** Strategies to use */
  strategies: PredictionStrategy[];
  /** Whether to preload embeddings */
  preloadEmbeddings: boolean;
  /** Cache TTL in milliseconds */
  cacheTtlMs: number;
  /** Whether to use behavioral signals */
  useBehavioralSignals: boolean;
  /** Whether to use git signals */
  useGitSignals: boolean;
}

/**
 * Default prediction configuration
 */
export const DEFAULT_PREDICTION_CONFIG: PredictionConfig = {
  maxPredictions: 20,
  minConfidence: 0.3,
  strategies: ['file_based', 'pattern_based', 'temporal', 'behavioral'],
  preloadEmbeddings: true,
  cacheTtlMs: 5 * 60 * 1000, // 5 minutes
  useBehavioralSignals: true,
  useGitSignals: true,
};

/**
 * Cached prediction entry
 */
export interface CachedPrediction {
  /** Cache key */
  key: string;
  /** Predicted memories */
  predictions: PredictedMemory[];
  /** When cached */
  cachedAt: string;
  /** Expiration time */
  expiresAt: string;
  /** Signals used to generate */
  signals: PredictionSignals;
}

/**
 * Prediction cache statistics
 */
export interface PredictionCacheStats {
  /** Total cache entries */
  totalEntries: number;
  /** Cache hits */
  hits: number;
  /** Cache misses */
  misses: number;
  /** Hit rate */
  hitRate: number;
  /** Average prediction time (ms) */
  avgPredictionTimeMs: number;
  /** Embeddings preloaded */
  embeddingsPreloaded: number;
}

/**
 * Prediction feedback for learning
 */
export interface PredictionFeedback {
  /** Prediction that was made */
  predictionId: string;
  /** Memory that was predicted */
  memoryId: string;
  /** Whether prediction was used */
  wasUsed: boolean;
  /** Whether prediction was helpful */
  wasHelpful?: boolean;
  /** Query that followed (if any) */
  followingQuery?: string;
  /** When feedback was recorded */
  recordedAt: string;
}
