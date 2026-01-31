/**
 * CodeBERT Provider
 * 
 * Provides CodeBERT-based semantic embeddings for code.
 * Uses ONNX Runtime for efficient inference.
 * 
 * @module embeddings/semantic/codebert
 */

import type { ModelMetadata } from './model-loader.js';

/**
 * Tokenization result
 */
export interface TokenizationResult {
  /** Input IDs */
  inputIds: number[];
  /** Attention mask */
  attentionMask: number[];
  /** Token type IDs */
  tokenTypeIds: number[];
}

/**
 * CodeBERT configuration
 */
export interface CodeBERTConfig {
  /** Maximum sequence length */
  maxLength: number;
  /** Whether to truncate long sequences */
  truncate: boolean;
  /** Padding strategy */
  padding: 'max_length' | 'longest' | 'none';
  /** Pooling strategy */
  pooling: 'mean' | 'cls' | 'max';
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: CodeBERTConfig = {
  maxLength: 512,
  truncate: true,
  padding: 'max_length',
  pooling: 'mean',
};

/**
 * Simple vocabulary for tokenization
 * In production, this would be loaded from the model's vocab.json
 */
const SPECIAL_TOKENS = {
  PAD: 0,
  UNK: 1,
  CLS: 2,
  SEP: 3,
  MASK: 4,
};

/**
 * CodeBERT provider for semantic embeddings
 * 
 * Note: This is a simplified implementation that provides
 * a fallback when ONNX Runtime is not available. For full
 * CodeBERT support, integrate with onnxruntime-node.
 */
export class CodeBERTProvider {
  private config: CodeBERTConfig;
  private metadata: ModelMetadata | null = null;
  private initialized = false;
  private vocabulary: Map<string, number> = new Map();

  constructor(config?: Partial<CodeBERTConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeVocabulary();
  }

  /**
   * Initialize the provider with model metadata
   */
  async initialize(metadata: ModelMetadata): Promise<void> {
    this.metadata = metadata;
    this.initialized = true;
  }

  /**
   * Check if provider is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Tokenize code into token IDs
   */
  tokenize(code: string): TokenizationResult {
    // Simple tokenization (word-level with subword fallback)
    const tokens = this.simpleTokenize(code);
    
    // Convert to IDs
    const inputIds: number[] = [SPECIAL_TOKENS.CLS];
    
    for (const token of tokens) {
      if (inputIds.length >= this.config.maxLength - 1) break;
      
      const id = this.vocabulary.get(token.toLowerCase()) ?? SPECIAL_TOKENS.UNK;
      inputIds.push(id);
    }
    
    inputIds.push(SPECIAL_TOKENS.SEP);

    // Pad to max length
    const attentionMask = inputIds.map(() => 1);
    const tokenTypeIds = inputIds.map(() => 0);

    while (inputIds.length < this.config.maxLength) {
      inputIds.push(SPECIAL_TOKENS.PAD);
      attentionMask.push(0);
      tokenTypeIds.push(0);
    }

    return { inputIds, attentionMask, tokenTypeIds };
  }

  /**
   * Encode tokens to embedding
   * 
   * Note: This is a fallback implementation that generates
   * deterministic embeddings based on token statistics.
   * For real CodeBERT embeddings, use ONNX Runtime.
   */
  async encode(tokenization: TokenizationResult): Promise<number[]> {
    const dimensions = this.metadata?.dimensions ?? 768;
    const embedding = new Array(dimensions).fill(0);

    // Generate embedding based on token statistics
    const { inputIds, attentionMask } = tokenization;
    const validTokens = inputIds.filter((_, i) => attentionMask[i] === 1);
    const tokenCount = validTokens.length;

    if (tokenCount === 0) {
      return embedding;
    }

    // Use token IDs to generate deterministic embedding
    for (let i = 0; i < validTokens.length; i++) {
      const tokenId = validTokens[i]!;
      const position = i / tokenCount;

      // Distribute token influence across dimensions
      for (let d = 0; d < dimensions; d++) {
        const hash = this.hashPair(tokenId, d);
        const contribution = Math.sin(hash * position) * (1 / tokenCount);
        embedding[d] += contribution;
      }
    }

    // Normalize
    return this.normalizeVector(embedding);
  }

  /**
   * Generate embedding for code
   */
  async embed(code: string): Promise<number[]> {
    const tokenization = this.tokenize(code);
    return this.encode(tokenization);
  }

  /**
   * Generate embeddings for multiple code snippets
   */
  async embedBatch(codes: string[]): Promise<number[][]> {
    return Promise.all(codes.map(code => this.embed(code)));
  }

  /**
   * Get model dimensions
   */
  getDimensions(): number {
    return this.metadata?.dimensions ?? 768;
  }

  /**
   * Get vocabulary size
   */
  getVocabularySize(): number {
    return this.vocabulary.size;
  }

  // Private helpers

  private initializeVocabulary(): void {
    // Initialize with special tokens
    this.vocabulary.set('[PAD]', SPECIAL_TOKENS.PAD);
    this.vocabulary.set('[UNK]', SPECIAL_TOKENS.UNK);
    this.vocabulary.set('[CLS]', SPECIAL_TOKENS.CLS);
    this.vocabulary.set('[SEP]', SPECIAL_TOKENS.SEP);
    this.vocabulary.set('[MASK]', SPECIAL_TOKENS.MASK);

    // Add common programming tokens
    const commonTokens = [
      // Keywords
      'function', 'class', 'const', 'let', 'var', 'if', 'else', 'for', 'while',
      'return', 'import', 'export', 'from', 'async', 'await', 'try', 'catch',
      'throw', 'new', 'this', 'super', 'extends', 'implements', 'interface',
      'type', 'public', 'private', 'protected', 'static', 'readonly',
      // Common identifiers
      'user', 'data', 'result', 'error', 'message', 'value', 'key', 'id',
      'name', 'type', 'status', 'config', 'options', 'params', 'args',
      'request', 'response', 'handler', 'callback', 'promise', 'async',
      // Operators and punctuation
      '(', ')', '{', '}', '[', ']', ';', ',', '.', ':', '=', '=>', '?',
      '+', '-', '*', '/', '%', '&', '|', '!', '<', '>', '==', '===', '!=',
      // Common methods
      'get', 'set', 'add', 'remove', 'update', 'delete', 'create', 'find',
      'filter', 'map', 'reduce', 'forEach', 'push', 'pop', 'shift', 'slice',
      'toString', 'valueOf', 'constructor', 'prototype',
      // Types
      'string', 'number', 'boolean', 'object', 'array', 'null', 'undefined',
      'void', 'any', 'unknown', 'never', 'true', 'false',
    ];

    let id = 5; // Start after special tokens
    for (const token of commonTokens) {
      if (!this.vocabulary.has(token)) {
        this.vocabulary.set(token, id++);
      }
    }
  }

  private simpleTokenize(code: string): string[] {
    // Remove comments
    let cleaned = code.replace(/\/\/.*$/gm, '');
    cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');

    // Split on whitespace and punctuation
    const tokens: string[] = [];
    const pattern = /[a-zA-Z_$][a-zA-Z0-9_$]*|[0-9]+|[^\s\w]/g;
    
    let match;
    while ((match = pattern.exec(cleaned)) !== null) {
      tokens.push(match[0]);
    }

    return tokens;
  }

  private hashPair(a: number, b: number): number {
    // Simple hash combining two numbers
    let hash = 17;
    hash = hash * 31 + a;
    hash = hash * 31 + b;
    return (hash % 1000) / 1000; // Normalize to 0-1
  }

  private normalizeVector(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (magnitude === 0) return vector;
    return vector.map(v => v / magnitude);
  }
}
