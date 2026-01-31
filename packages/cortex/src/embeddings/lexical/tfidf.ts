/**
 * TF-IDF Calculator
 * 
 * Calculates Term Frequency - Inverse Document Frequency scores
 * for lexical embeddings. Uses a pre-computed IDF corpus or
 * builds one from provided documents.
 * 
 * @module embeddings/lexical/tfidf
 */

import { CodeTokenizer } from './tokenizer.js';

/**
 * TF-IDF configuration
 */
export interface TFIDFConfig {
  /** Minimum document frequency for a term */
  minDocFreq: number;
  /** Maximum document frequency ratio (0-1) */
  maxDocFreqRatio: number;
  /** Smoothing factor for IDF */
  smoothing: number;
  /** Whether to use sublinear TF scaling */
  sublinearTF: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: TFIDFConfig = {
  minDocFreq: 1,
  maxDocFreqRatio: 0.95,
  smoothing: 1.0,
  sublinearTF: true,
};

/**
 * Pre-computed IDF scores for common code terms
 * These are based on analysis of typical codebases
 */
const DEFAULT_IDF_SCORES: Record<string, number> = {
  // High IDF (rare, specific terms)
  'authentication': 4.5,
  'authorization': 4.5,
  'middleware': 4.2,
  'repository': 4.0,
  'controller': 3.8,
  'validator': 4.0,
  'serializer': 4.2,
  'deserializer': 4.3,
  'encryption': 4.5,
  'decryption': 4.5,
  'pagination': 4.0,
  'throttle': 4.3,
  'debounce': 4.3,
  'memoize': 4.4,
  'singleton': 4.0,
  'factory': 3.5,
  'observer': 4.0,
  'subscriber': 4.0,
  'publisher': 4.0,
  'websocket': 4.2,
  'graphql': 4.3,
  'mutation': 3.8,
  'resolver': 4.0,
  'schema': 3.5,
  'migration': 4.0,
  'transaction': 3.8,
  'rollback': 4.2,
  'commit': 3.5,
  'cache': 3.2,
  'redis': 4.3,
  'queue': 3.5,
  'worker': 3.5,
  'scheduler': 4.0,
  'cron': 4.2,
  
  // Medium IDF (moderately common)
  'user': 2.5,
  'admin': 3.0,
  'session': 3.0,
  'token': 3.2,
  'password': 3.5,
  'email': 3.0,
  'request': 2.0,
  'response': 2.0,
  'handler': 2.5,
  'service': 2.5,
  'model': 2.5,
  'entity': 3.0,
  'database': 3.0,
  'query': 2.8,
  'filter': 2.5,
  'sort': 2.5,
  'search': 2.8,
  'create': 2.0,
  'update': 2.0,
  'delete': 2.0,
  'fetch': 2.5,
  'load': 2.0,
  'save': 2.0,
  'validate': 2.8,
  'parse': 2.5,
  'format': 2.5,
  'transform': 2.8,
  'convert': 2.5,
  'config': 2.5,
  'options': 2.0,
  'settings': 2.8,
  'context': 2.5,
  'state': 2.5,
  'props': 2.5,
  'component': 2.5,
  'render': 2.5,
  'hook': 3.0,
  'effect': 2.8,
  'callback': 2.5,
  'promise': 2.8,
  'async': 2.0,
  'await': 2.0,
  
  // Low IDF (very common)
  'error': 1.5,
  'message': 1.5,
  'result': 1.5,
  'status': 1.8,
  'code': 1.5,
  'name': 1.2,
  'type': 1.2,
  'id': 1.0,
  'key': 1.2,
  'index': 1.5,
  'length': 1.2,
  'size': 1.5,
  'count': 1.5,
  'total': 1.8,
  'start': 1.5,
  'end': 1.5,
  'init': 1.8,
  'setup': 2.0,
  'cleanup': 2.2,
  'reset': 2.0,
  'clear': 2.0,
  'add': 1.2,
  'remove': 1.5,
  'find': 1.5,
  'map': 1.2,
  'reduce': 2.0,
  'forEach': 1.5,
};

/**
 * TF-IDF calculator for lexical embeddings
 */
export class TFIDFCalculator {
  private config: TFIDFConfig;
  private idfScores: Map<string, number>;
  private documentCount: number;

  constructor(
    idfScores?: Map<string, number>,
    config?: Partial<TFIDFConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.idfScores = idfScores ?? new Map(Object.entries(DEFAULT_IDF_SCORES));
    this.documentCount = 1000; // Default assumption
  }

  /**
   * Calculate term frequency for tokens
   */
  calculateTF(tokens: string[]): Map<string, number> {
    const tf = new Map<string, number>();
    const total = tokens.length;

    if (total === 0) return tf;

    // Count occurrences
    for (const token of tokens) {
      tf.set(token, (tf.get(token) ?? 0) + 1);
    }

    // Normalize by total tokens
    for (const [token, count] of tf) {
      let normalizedTF = count / total;

      // Apply sublinear scaling if configured
      if (this.config.sublinearTF) {
        normalizedTF = 1 + Math.log(normalizedTF + 1);
      }

      tf.set(token, normalizedTF);
    }

    return tf;
  }

  /**
   * Calculate TF-IDF scores for tokens
   */
  calculateTFIDF(tokens: string[]): Map<string, number> {
    const tf = this.calculateTF(tokens);
    const tfidf = new Map<string, number>();

    for (const [token, tfScore] of tf) {
      const idf = this.getIDF(token);
      tfidf.set(token, tfScore * idf);
    }

    return tfidf;
  }

  /**
   * Get IDF score for a token
   */
  getIDF(token: string): number {
    const lowerToken = token.toLowerCase();
    
    // Check pre-computed scores
    if (this.idfScores.has(lowerToken)) {
      return this.idfScores.get(lowerToken)!;
    }

    // Default IDF for unknown terms (assume rare)
    return 3.0;
  }

  /**
   * Convert TF-IDF scores to a fixed-dimension vector
   */
  toVector(tfidf: Map<string, number>, dimensions: number): number[] {
    const vector = new Array(dimensions).fill(0);
    
    // Use hash-based projection to fixed dimensions
    for (const [token, score] of tfidf) {
      const hash = this.hashToken(token);
      const index = Math.abs(hash) % dimensions;
      
      // Use sign of hash for positive/negative contribution
      const sign = hash >= 0 ? 1 : -1;
      vector[index] += sign * score;
    }

    // Normalize the vector
    return this.normalizeVector(vector);
  }

  /**
   * Build TF-IDF calculator from a corpus of documents
   */
  static async buildFromCorpus(
    documents: string[],
    tokenizer?: CodeTokenizer,
    config?: Partial<TFIDFConfig>
  ): Promise<TFIDFCalculator> {
    const tok = tokenizer ?? new CodeTokenizer();
    const cfg = { ...DEFAULT_CONFIG, ...config };
    
    // Count document frequency for each term
    const docFreq = new Map<string, number>();
    const totalDocs = documents.length;

    for (const doc of documents) {
      const tokens = new Set(tok.tokenize(doc));
      for (const token of tokens) {
        docFreq.set(token, (docFreq.get(token) ?? 0) + 1);
      }
    }

    // Calculate IDF scores
    const idfScores = new Map<string, number>();
    
    for (const [token, df] of docFreq) {
      // Filter by document frequency thresholds
      if (df < cfg.minDocFreq) continue;
      if (df / totalDocs > cfg.maxDocFreqRatio) continue;

      // IDF with smoothing: log((N + 1) / (df + 1)) + 1
      const idf = Math.log((totalDocs + cfg.smoothing) / (df + cfg.smoothing)) + 1;
      idfScores.set(token, idf);
    }

    const calculator = new TFIDFCalculator(idfScores, cfg);
    calculator.documentCount = totalDocs;
    
    return calculator;
  }

  /**
   * Hash a token to an integer
   */
  private hashToken(token: string): number {
    // Simple hash function (djb2)
    let hash = 5381;
    for (let i = 0; i < token.length; i++) {
      hash = ((hash << 5) + hash) + token.charCodeAt(i);
      hash = hash | 0; // Convert to 32-bit integer
    }
    return hash;
  }

  /**
   * Normalize a vector to unit length
   */
  private normalizeVector(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    
    if (magnitude === 0) return vector;
    
    return vector.map(v => v / magnitude);
  }

  /**
   * Get statistics about the IDF scores
   */
  getStats(): { termCount: number; documentCount: number; avgIDF: number } {
    const scores = Array.from(this.idfScores.values());
    const avgIDF = scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 0;

    return {
      termCount: this.idfScores.size,
      documentCount: this.documentCount,
      avgIDF,
    };
  }
}
