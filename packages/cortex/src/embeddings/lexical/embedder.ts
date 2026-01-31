/**
 * Lexical Embedder
 * 
 * Generates TF-IDF based lexical embeddings for code and text.
 * Captures surface-level lexical patterns and terminology.
 * 
 * @module embeddings/lexical/embedder
 */

import { CodeTokenizer, type TokenizerConfig } from './tokenizer.js';
import { TFIDFCalculator, type TFIDFConfig } from './tfidf.js';

/**
 * Lexical embedder configuration
 */
export interface LexicalEmbedderConfig {
  /** Output dimensions */
  dimensions: number;
  /** Tokenizer configuration */
  tokenizer?: Partial<TokenizerConfig>;
  /** TF-IDF configuration */
  tfidf?: Partial<TFIDFConfig>;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: LexicalEmbedderConfig = {
  dimensions: 128,
};

/**
 * Lexical embedder using TF-IDF
 * 
 * Generates embeddings based on lexical features:
 * - Token frequencies
 * - TF-IDF weighted terms
 * - Hash-based dimension projection
 */
export class LexicalEmbedder {
  readonly dimensions: number;
  
  private tokenizer: CodeTokenizer;
  private tfidf: TFIDFCalculator;
  private _initialized = false;

  constructor(config?: Partial<LexicalEmbedderConfig>) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    this.dimensions = cfg.dimensions;
    this.tokenizer = new CodeTokenizer(cfg.tokenizer);
    this.tfidf = new TFIDFCalculator(undefined, cfg.tfidf);
  }

  /**
   * Check if embedder is initialized
   */
  get initialized(): boolean {
    return this._initialized;
  }

  /**
   * Initialize the embedder
   */
  async initialize(): Promise<void> {
    // Lexical embedder doesn't need async initialization
    // but we keep the interface consistent
    this._initialized = true;
  }

  /**
   * Generate embedding for text
   */
  embed(text: string): number[] {
    // Tokenize the text
    const tokens = this.tokenizer.tokenize(text);

    if (tokens.length === 0) {
      return new Array(this.dimensions).fill(0);
    }

    // Calculate TF-IDF scores
    const tfidfScores = this.tfidf.calculateTFIDF(tokens);

    // Convert to fixed-dimension vector
    const vector = this.tfidf.toVector(tfidfScores, this.dimensions);

    return vector;
  }

  /**
   * Generate embeddings for multiple texts
   */
  embedBatch(texts: string[]): number[][] {
    return texts.map(t => this.embed(t));
  }

  /**
   * Calculate similarity between two texts
   */
  similarity(text1: string, text2: string): number {
    const emb1 = this.embed(text1);
    const emb2 = this.embed(text2);
    return this.cosineSimilarity(emb1, emb2);
  }

  /**
   * Find most similar texts from candidates
   */
  findSimilar(
    query: string,
    candidates: string[],
    topK = 5
  ): Array<{ index: number; text: string; score: number }> {
    const queryEmb = this.embed(query);
    
    const scored = candidates.map((text, index) => ({
      index,
      text,
      score: this.cosineSimilarity(queryEmb, this.embed(text)),
    }));

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, topK);
  }

  /**
   * Get token analysis for text
   */
  analyzeTokens(text: string): {
    tokens: string[];
    tfidf: Map<string, number>;
    topTerms: Array<{ term: string; score: number }>;
  } {
    const tokens = this.tokenizer.tokenize(text);
    const tfidf = this.tfidf.calculateTFIDF(tokens);

    // Get top terms by TF-IDF score
    const topTerms = Array.from(tfidf.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([term, score]) => ({ term, score }));

    return { tokens, tfidf, topTerms };
  }

  /**
   * Check if embedder is available
   */
  async isAvailable(): Promise<boolean> {
    return true; // Lexical embedder is always available
  }

  /**
   * Build embedder from a corpus
   */
  static async fromCorpus(
    documents: string[],
    config?: Partial<LexicalEmbedderConfig>
  ): Promise<LexicalEmbedder> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const tokenizer = new CodeTokenizer(cfg.tokenizer);
    const tfidf = await TFIDFCalculator.buildFromCorpus(
      documents,
      tokenizer,
      cfg.tfidf
    );

    const embedder = new LexicalEmbedder(cfg);
    embedder.tfidf = tfidf;
    embedder._initialized = true;

    return embedder;
  }

  // Private helpers

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      const aVal = a[i] ?? 0;
      const bVal = b[i] ?? 0;
      dotProduct += aVal * bVal;
      normA += aVal * aVal;
      normB += bVal * bVal;
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    
    if (magnitude === 0 || !isFinite(magnitude)) return 0;
    
    const result = dotProduct / magnitude;
    return isFinite(result) ? result : 0;
  }
}
