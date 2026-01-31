/**
 * Lexical Embeddings Module
 * 
 * TF-IDF based lexical embeddings for code and text.
 * Captures surface-level lexical patterns and terminology.
 * 
 * @module embeddings/lexical
 */

export { LexicalEmbedder, type LexicalEmbedderConfig } from './embedder.js';
export { CodeTokenizer, type TokenizerConfig } from './tokenizer.js';
export { TFIDFCalculator, type TFIDFConfig } from './tfidf.js';
