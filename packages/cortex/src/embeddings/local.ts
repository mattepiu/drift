/**
 * Local Embedding Provider (Transformers.js)
 * 
 * Default provider that works offline using Transformers.js.
 * Uses all-MiniLM-L6-v2 model (384 dimensions).
 */

import type { IEmbeddingProvider } from './interface.js';

// Dynamic import for Transformers.js
type FeatureExtractionPipeline = Awaited<ReturnType<typeof import('@xenova/transformers')['pipeline']>>;

/**
 * Local embedding provider using Transformers.js
 */
export class LocalEmbeddingProvider implements IEmbeddingProvider {
  readonly name = 'local';
  readonly dimensions = 384;
  readonly maxTokens = 512;

  private extractor: FeatureExtractionPipeline | null = null;
  private modelId = 'Xenova/all-MiniLM-L6-v2';
  private initialized = false;

  /**
   * Initialize the provider
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const { pipeline } = await import('@xenova/transformers');
      this.extractor = await pipeline('feature-extraction', this.modelId, {
        quantized: true, // Smaller, faster
      });
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize local embedding provider:', error);
      throw new Error('Failed to initialize Transformers.js');
    }
  }

  /**
   * Generate embedding for a single text
   */
  async embed(text: string): Promise<number[]> {
    if (!this.extractor) {
      throw new Error('Provider not initialized');
    }

    // Use type assertion to work around complex Transformers.js types
    const output = await (this.extractor as (text: string, options: { pooling: string; normalize: boolean }) => Promise<{ data: Float32Array }>)(text, {
      pooling: 'mean',
      normalize: true,
    });

    // Extract the embedding array
    return Array.from(output.data);
  }

  /**
   * Generate embeddings for multiple texts
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(t => this.embed(t)));
  }

  /**
   * Check if the provider is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      if (!this.initialized) {
        await this.initialize();
      }
      return true;
    } catch {
      return false;
    }
  }
}
