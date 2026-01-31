/**
 * Embedding Provider Factory
 * 
 * Creates embedding providers based on configuration.
 * Auto-detects the best provider for the environment.
 */

import type { IEmbeddingProvider } from './interface.js';
import { LocalEmbeddingProvider } from './local.js';
import { OpenAIEmbeddingProvider } from './openai.js';
import { OllamaEmbeddingProvider } from './ollama.js';
import { HybridEmbedder, type HybridEmbedderConfig } from './hybrid/index.js';

/**
 * Embedding provider type
 */
export type EmbeddingProviderType = 'local' | 'openai' | 'ollama' | 'hybrid';

/**
 * Embedding configuration
 */
export interface EmbeddingConfig {
  /** Provider type */
  provider: EmbeddingProviderType;
  /** OpenAI API key (for openai provider) */
  openaiApiKey?: string;
  /** Ollama base URL (for ollama provider) */
  ollamaBaseUrl?: string;
  /** Ollama model (for ollama provider) */
  ollamaModel?: string;
  /** Hybrid embedder config (for hybrid provider) */
  hybrid?: Partial<HybridEmbedderConfig>;
}

/**
 * Create an embedding provider
 */
export async function createEmbeddingProvider(
  config: EmbeddingConfig
): Promise<IEmbeddingProvider> {
  let provider: IEmbeddingProvider;

  switch (config.provider) {
    case 'openai':
      if (!config.openaiApiKey) {
        throw new Error('OpenAI API key required');
      }
      provider = new OpenAIEmbeddingProvider(config.openaiApiKey);
      break;

    case 'ollama':
      provider = new OllamaEmbeddingProvider(
        config.ollamaBaseUrl,
        config.ollamaModel
      );
      break;

    case 'hybrid':
      provider = new HybridEmbedder(config.hybrid);
      break;

    case 'local':
    default:
      provider = new LocalEmbeddingProvider();
      break;
  }

  await provider.initialize();
  return provider;
}

/**
 * Auto-detect and create the best embedding provider
 */
export async function autoDetectEmbeddingProvider(): Promise<IEmbeddingProvider> {
  // 1. Check for OpenAI API key in env
  const openaiKey = process.env['OPENAI_API_KEY'];
  if (openaiKey) {
    try {
      const provider = new OpenAIEmbeddingProvider(openaiKey);
      if (await provider.isAvailable()) {
        await provider.initialize();
        console.log('Using OpenAI embedding provider');
        return provider;
      }
    } catch {
      // Continue to next provider
    }
  }

  // 2. Check for Ollama
  try {
    const ollamaUrl = process.env['OLLAMA_BASE_URL'] || 'http://localhost:11434';
    const provider = new OllamaEmbeddingProvider(ollamaUrl);
    if (await provider.isAvailable()) {
      await provider.initialize();
      console.log('Using Ollama embedding provider');
      return provider;
    }
  } catch {
    // Continue to next provider
  }

  // 3. Fall back to local
  console.log('Using local (Transformers.js) embedding provider');
  const provider = new LocalEmbeddingProvider();
  await provider.initialize();
  return provider;
}

/**
 * Create hybrid embedding provider (recommended for code)
 */
export async function createHybridEmbeddingProvider(
  config?: Partial<HybridEmbedderConfig>
): Promise<HybridEmbedder> {
  const provider = new HybridEmbedder(config);
  await provider.initialize();
  return provider;
}
