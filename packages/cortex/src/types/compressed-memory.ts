/**
 * Compressed Memory Types
 * 
 * Defines the 4-level hierarchical compression system for
 * token-efficient memory retrieval:
 * 
 * Level 0: IDs only (~5 tokens)
 * Level 1: One-liners (~50 tokens)
 * Level 2: With examples (~200 tokens)
 * Level 3: Full context (variable)
 * 
 * @module types/compressed-memory
 */

/**
 * Compression levels
 * 
 * 0 = Minimal (IDs, type, importance only)
 * 1 = Summary (one-liner + tags)
 * 2 = Standard (knowledge + one example + evidence)
 * 3 = Full (complete memory with all context)
 */
export type CompressionLevel = 0 | 1 | 2 | 3;

/**
 * Token budget configuration per level
 */
export interface LevelConfig {
  /** Compression level */
  level: CompressionLevel;
  /** Target token count for this level */
  targetTokens: number;
  /** Maximum token count allowed */
  maxTokens: number;
  /** Description of what's included */
  description: string;
}

/**
 * Default level configurations
 */
export const DEFAULT_LEVEL_CONFIGS: Record<CompressionLevel, LevelConfig> = {
  0: {
    level: 0,
    targetTokens: 5,
    maxTokens: 10,
    description: 'IDs only - memory ID, type, importance',
  },
  1: {
    level: 1,
    targetTokens: 50,
    maxTokens: 75,
    description: 'One-liner summary with key tags',
  },
  2: {
    level: 2,
    targetTokens: 200,
    maxTokens: 300,
    description: 'Knowledge with one example and key evidence',
  },
  3: {
    level: 3,
    targetTokens: 500,
    maxTokens: 1000,
    description: 'Full context with all examples and evidence',
  },
};

/**
 * Level 0 compressed output (IDs only)
 */
export interface Level0Output {
  /** Memory ID */
  id: string;
  /** Memory type */
  type: string;
  /** Importance level */
  importance: string;
  /** Actual token count */
  tokens: number;
}

/**
 * Level 1 compressed output (one-liners)
 */
export interface Level1Output extends Level0Output {
  /** One-line summary */
  oneLiner: string;
  /** Key tags (max 3) */
  tags: string[];
  /** Confidence score */
  confidence: number;
}

/**
 * Level 2 compressed output (with examples)
 */
export interface Level2Output extends Level1Output {
  /** Detailed content */
  details: {
    /** Core knowledge/content */
    knowledge: string;
    /** Single best example */
    example?: string;
    /** Key evidence points (max 2) */
    evidence: string[];
  };
}

/**
 * Level 3 compressed output (full context)
 */
export interface Level3Output extends Level2Output {
  /** Full context */
  full: {
    /** Complete knowledge */
    completeKnowledge: string;
    /** All examples */
    allExamples: CodeSnippet[];
    /** All evidence */
    allEvidence: Evidence[];
    /** Related memory IDs */
    relatedMemories: string[];
    /** Causal chain summary */
    causalChain: string[];
    /** Linked entities */
    linkedPatterns?: string[];
    linkedConstraints?: string[];
    linkedFiles?: string[];
    linkedFunctions?: string[];
  };
}

/**
 * Code snippet for examples
 */
export interface CodeSnippet {
  /** Code content */
  code: string;
  /** Programming language */
  language?: string;
  /** File path */
  filePath?: string;
  /** Line numbers */
  lineStart?: number;
  lineEnd?: number;
  /** Description of what this shows */
  description?: string;
}

/**
 * Evidence item
 */
export interface Evidence {
  /** Evidence type */
  type: 'code' | 'commit' | 'pr' | 'incident' | 'documentation' | 'user';
  /** Evidence content/description */
  content: string;
  /** Reference URL or ID */
  reference?: string;
  /** When this evidence was gathered */
  gatheredAt?: string;
}

/**
 * A memory with compression metadata
 */
export interface CompressedMemory {
  /** Original memory ID */
  memoryId: string;
  /** Compression level applied */
  level: CompressionLevel;
  /** Compressed output based on level */
  output: Level0Output | Level1Output | Level2Output | Level3Output;
  /** Actual token count */
  tokenCount: number;
  /** Original token count (level 3) */
  originalTokenCount: number;
  /** Compression ratio */
  compressionRatio: number;
  /** When compression was performed */
  compressedAt: string;
}

/**
 * Result of a compression operation
 */
export interface CompressionResult {
  /** Successfully compressed memories */
  compressed: CompressedMemory[];
  /** Total tokens used */
  totalTokens: number;
  /** Average compression ratio */
  averageCompressionRatio: number;
  /** Breakdown by level */
  levelBreakdown: Record<CompressionLevel, number>;
  /** Any warnings */
  warnings?: string[];
}

/**
 * Options for compression
 */
export interface CompressionOptions {
  /** Target compression level */
  targetLevel?: CompressionLevel;
  /** Maximum tokens allowed */
  maxTokens?: number;
  /** Whether to allow level escalation */
  allowEscalation?: boolean;
  /** Minimum level to use */
  minLevel?: CompressionLevel;
  /** Maximum level to use */
  maxLevel?: CompressionLevel;
  /** Custom level configs */
  levelConfigs?: Partial<Record<CompressionLevel, LevelConfig>>;
}

/**
 * Token budget allocation
 */
export interface TokenBudget {
  /** Total budget available */
  total: number;
  /** Already used */
  used: number;
  /** Remaining */
  remaining: number;
  /** Reserved for system prompts */
  reserved: number;
  /** Available for memories */
  availableForMemories: number;
}
