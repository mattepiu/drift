/**
 * Session Context Types
 * 
 * Defines session state tracking for token efficiency.
 * Tracks what has been loaded in the current session to
 * avoid re-sending the same context repeatedly.
 * 
 * @module types/session-context
 */

/**
 * Current session state
 * 
 * Tracks everything that has been loaded/sent in the
 * current conversation session.
 */
export interface SessionContext {
  /** Unique session identifier */
  id: string;
  /** When the session started */
  startedAt: string;
  /** When the session ended (null if active) */
  endedAt?: string;
  /** Set of loaded memory IDs */
  loadedMemories: Set<string>;
  /** Set of loaded pattern IDs */
  loadedPatterns: Set<string>;
  /** Set of loaded file paths */
  loadedFiles: Set<string>;
  /** Set of loaded constraint IDs */
  loadedConstraints: Set<string>;
  /** Total tokens sent in this session */
  tokensSent: number;
  /** Number of queries made */
  queriesMade: number;
  /** Last activity timestamp */
  lastActivity: string;
  /** Session metadata */
  metadata?: SessionMetadata;
}

/**
 * Serializable version of SessionContext for storage
 */
export interface SerializableSessionContext {
  id: string;
  startedAt: string;
  endedAt?: string;
  loadedMemories: string[];
  loadedPatterns: string[];
  loadedFiles: string[];
  loadedConstraints: string[];
  tokensSent: number;
  queriesMade: number;
  lastActivity: string;
  metadata?: SessionMetadata;
}

/**
 * Session metadata
 */
export interface SessionMetadata {
  /** User identifier */
  userId?: string;
  /** Project/workspace identifier */
  projectId?: string;
  /** Active file when session started */
  initialFile?: string;
  /** Client information */
  client?: string;
  /** Custom tags */
  tags?: string[];
}

/**
 * Set of loaded memory IDs with metadata
 */
export interface LoadedMemorySet {
  /** Memory IDs that have been loaded */
  memoryIds: Set<string>;
  /** When each memory was loaded */
  loadedAt: Map<string, string>;
  /** Compression level used for each memory */
  compressionLevels: Map<string, number>;
  /** Token count for each memory */
  tokenCounts: Map<string, number>;
}

/**
 * Session configuration
 */
export interface SessionConfig {
  /** Maximum session duration (ms) */
  maxDuration?: number;
  /** Session timeout for inactivity (ms) */
  inactivityTimeout?: number;
  /** Maximum tokens per session */
  maxTokensPerSession?: number;
  /** Whether to persist sessions */
  persistSessions?: boolean;
  /** Whether to track detailed metrics */
  trackDetailedMetrics?: boolean;
  /** Auto-cleanup old sessions */
  autoCleanup?: boolean;
  /** Days to keep session history */
  retentionDays?: number;
}

/**
 * Default session configuration
 */
export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  maxDuration: 24 * 60 * 60 * 1000, // 24 hours
  inactivityTimeout: 30 * 60 * 1000, // 30 minutes
  maxTokensPerSession: 1_000_000, // 1M tokens
  persistSessions: true,
  trackDetailedMetrics: true,
  autoCleanup: true,
  retentionDays: 7,
};

/**
 * Session statistics
 */
export interface SessionStats {
  /** Session ID */
  sessionId: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Total memories loaded */
  memoriesLoaded: number;
  /** Unique memories loaded */
  uniqueMemoriesLoaded: number;
  /** Total patterns loaded */
  patternsLoaded: number;
  /** Total files referenced */
  filesReferenced: number;
  /** Total tokens sent */
  tokensSent: number;
  /** Tokens saved by deduplication */
  tokensSaved: number;
  /** Deduplication efficiency (0.0 - 1.0) */
  deduplicationEfficiency: number;
  /** Queries made */
  queriesMade: number;
  /** Average tokens per query */
  avgTokensPerQuery: number;
  /** Compression level distribution */
  compressionLevelDistribution: Record<number, number>;
}

/**
 * Session event for tracking
 */
export interface SessionEvent {
  /** Event type */
  type: SessionEventType;
  /** When the event occurred */
  timestamp: string;
  /** Event-specific data */
  data: Record<string, unknown>;
}

/**
 * Types of session events
 */
export type SessionEventType =
  | 'session_started'
  | 'session_ended'
  | 'memory_loaded'
  | 'memory_deduplicated'
  | 'pattern_loaded'
  | 'file_loaded'
  | 'query_made'
  | 'tokens_sent'
  | 'compression_applied';

/**
 * Request to create a new session
 */
export interface CreateSessionRequest {
  /** Optional session ID (auto-generated if not provided) */
  id?: string;
  /** Session metadata */
  metadata?: SessionMetadata;
  /** Custom configuration */
  config?: Partial<SessionConfig>;
}

/**
 * Result of session operations
 */
export interface SessionOperationResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Session ID */
  sessionId: string;
  /** Operation message */
  message?: string;
  /** Updated session context */
  session?: SessionContext;
}
