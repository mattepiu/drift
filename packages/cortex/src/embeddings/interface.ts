/**
 * Embedding Provider Interface
 * 
 * Defines the contract for embedding providers.
 */

/**
 * Embedding provider interface
 */
export interface IEmbeddingProvider {
  /** Provider name */
  readonly name: string;
  /** Embedding dimensions */
  readonly dimensions: number;
  /** Maximum tokens per input */
  readonly maxTokens: number;

  /** Initialize the provider */
  initialize(): Promise<void>;
  /** Generate embedding for a single text */
  embed(text: string): Promise<number[]>;
  /** Generate embeddings for multiple texts */
  embedBatch(texts: string[]): Promise<number[][]>;
  /** Check if the provider is available */
  isAvailable(): Promise<boolean>;
}
