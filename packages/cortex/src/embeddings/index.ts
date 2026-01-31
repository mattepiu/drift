/**
 * Embedding Providers
 * 
 * Multiple embedding providers for vector search:
 * - Local (Transformers.js) - Default, works offline
 * - OpenAI - High quality, requires API key
 * - Ollama - Local LLM, requires Ollama running
 * - Hybrid - Combines structural, semantic, and lexical embeddings
 */

// Core interfaces and providers
export * from './interface.js';
export * from './local.js';
export * from './openai.js';
export * from './ollama.js';
export * from './factory.js';

// Structural embeddings (AST-based)
export * from './structural/index.js';

// Semantic embeddings (CodeBERT)
export * from './semantic/index.js';

// Lexical embeddings (TF-IDF)
export * from './lexical/index.js';

// Hybrid embeddings (combined)
export * from './hybrid/index.js';

// Embedding cache
export * from './cache/index.js';
