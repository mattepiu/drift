/**
 * Retrieval Engine
 * 
 * Main orchestrator for memory retrieval.
 * Gathers candidates from multiple sources, scores them,
 * applies intent weighting, and fits to token budget.
 */

import type { Memory } from '../types/index.js';
import type { IMemoryStorage } from '../storage/interface.js';
import type { IEmbeddingProvider } from '../embeddings/interface.js';
import { RelevanceScorer } from './scoring.js';
import { IntentWeighter } from './weighting.js';
import { TokenBudgetManager } from './budget.js';
import { ResultRanker } from './ranking.js';

/**
 * Intent types for retrieval
 */
export type Intent =
  | 'add_feature'
  | 'fix_bug'
  | 'refactor'
  | 'security_audit'
  | 'understand_code'
  | 'add_test';

/**
 * Context for retrieval
 */
export interface RetrievalContext {
  /** What the user is trying to do */
  intent: Intent;
  /** What they're working on */
  focus: string;
  /** Currently active file */
  activeFile?: string;
  /** Currently active function */
  activeFunction?: string;
  /** Recently accessed files */
  recentFiles?: string[];
  /** Relevant pattern IDs */
  relevantPatterns?: string[];
  /** Relevant constraint IDs */
  relevantConstraints?: string[];
  /** Call graph context (function IDs) */
  callGraphContext?: string[];
  /** Security context (sensitive areas) */
  securityContext?: string[];
  /** Maximum tokens to use */
  maxTokens?: number;
  /** Maximum memories to return */
  maxMemories?: number;
}

/**
 * Result of retrieval
 */
export interface RetrievalResult {
  /** Retrieved memories with compression level */
  memories: CompressedMemory[];
  /** Total tokens used */
  tokensUsed: number;
  /** Total candidates considered */
  totalCandidates: number;
  /** Time taken in ms */
  retrievalTime: number;
}

/**
 * A memory with compression information
 */
export interface CompressedMemory {
  /** The memory */
  memory: Memory;
  /** Compression level */
  level: 'summary' | 'expanded' | 'full';
  /** Token count at this level */
  tokens: number;
  /** Relevance score */
  relevanceScore: number;
}

/**
 * Retrieval engine
 */
export class RetrievalEngine {
  private storage: IMemoryStorage;
  private embeddings: IEmbeddingProvider;
  private scorer: RelevanceScorer;
  private weighter: IntentWeighter;
  private budgetManager: TokenBudgetManager;
  private ranker: ResultRanker;

  constructor(storage: IMemoryStorage, embeddings: IEmbeddingProvider) {
    this.storage = storage;
    this.embeddings = embeddings;
    this.scorer = new RelevanceScorer();
    this.weighter = new IntentWeighter();
    this.budgetManager = new TokenBudgetManager();
    this.ranker = new ResultRanker();
  }

  /**
   * Retrieve memories for a context
   */
  async retrieve(context: RetrievalContext): Promise<RetrievalResult> {
    const startTime = Date.now();

    // 1. Gather candidates from multiple sources
    const candidates = await this.gatherCandidates(context);

    // 2. Score each candidate
    const scored = candidates.map(memory => ({
      memory,
      score: this.scorer.score(memory, context),
    }));

    // 3. Apply intent weighting
    const weighted = scored.map(({ memory, score }) => ({
      memory,
      score: score * this.weighter.getWeight(memory.type, context.intent),
    }));

    // 4. Rank results
    const ranked = this.ranker.rank(weighted);

    // 5. Apply token budget
    const budget = context.maxTokens || 2000;
    const compressed = this.budgetManager.fitToBudget(ranked, budget);

    return {
      memories: compressed,
      tokensUsed: compressed.reduce((sum, m) => sum + m.tokens, 0),
      totalCandidates: candidates.length,
      retrievalTime: Date.now() - startTime,
    };
  }

  /**
   * Gather candidates from multiple sources
   */
  private async gatherCandidates(context: RetrievalContext): Promise<Memory[]> {
    const candidateSets = await Promise.all([
      // Pattern-linked memories
      this.getPatternMemories(context.relevantPatterns || []),

      // Constraint-linked memories
      this.getConstraintMemories(context.relevantConstraints || []),

      // Topic-based (semantic search)
      this.searchByTopic(context.focus),

      // File-based
      this.getFileMemories(context.recentFiles || []),

      // Function-based (call graph)
      this.getFunctionMemories(context.callGraphContext || []),

      // Security-relevant
      context.securityContext?.length
        ? this.getSecurityMemories(context.securityContext)
        : Promise.resolve([]),
    ]);

    // Flatten and deduplicate
    const all = candidateSets.flat();
    const seen = new Set<string>();
    return all.filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }

  /**
   * Search by topic using embeddings
   */
  private async searchByTopic(topic: string): Promise<Memory[]> {
    try {
      const embedding = await this.embeddings.embed(topic);
      return this.storage.similaritySearch(embedding, 20);
    } catch {
      // Fallback to type-based search if embeddings fail
      return this.storage.search({ limit: 20 });
    }
  }

  /**
   * Get memories linked to patterns
   */
  private async getPatternMemories(patternIds: string[]): Promise<Memory[]> {
    if (patternIds.length === 0) return [];

    const results = await Promise.all(
      patternIds.map(id => this.storage.findByPattern(id))
    );
    return results.flat();
  }

  /**
   * Get memories linked to constraints
   */
  private async getConstraintMemories(constraintIds: string[]): Promise<Memory[]> {
    if (constraintIds.length === 0) return [];

    const results = await Promise.all(
      constraintIds.map(id => this.storage.findByConstraint(id))
    );
    return results.flat();
  }

  /**
   * Get memories linked to files
   */
  private async getFileMemories(files: string[]): Promise<Memory[]> {
    if (files.length === 0) return [];

    const results = await Promise.all(
      files.map(f => this.storage.findByFile(f))
    );
    return results.flat();
  }

  /**
   * Get memories linked to functions
   */
  private async getFunctionMemories(functionIds: string[]): Promise<Memory[]> {
    if (functionIds.length === 0) return [];

    const results = await Promise.all(
      functionIds.map(id => this.storage.findByFunction(id))
    );
    return results.flat();
  }

  /**
   * Get security-related memories
   */
  private async getSecurityMemories(context: string[]): Promise<Memory[]> {
    // Get tribal memories with security-related topics
    const tribal = await this.storage.search({
      types: ['tribal'],
      topics: ['security', 'auth', 'permission', ...context],
    });
    return tribal;
  }
}
