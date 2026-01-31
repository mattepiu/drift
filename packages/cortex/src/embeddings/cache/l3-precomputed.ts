/**
 * L3 Precomputed Cache
 * 
 * Precomputed embeddings for common patterns, file types,
 * and intents. Loaded at startup for instant access.
 * 
 * @module embeddings/cache/l3-precomputed
 */

/**
 * Intent types for precomputed embeddings
 */
export type Intent =
  | 'add_feature'
  | 'fix_bug'
  | 'refactor'
  | 'add_test'
  | 'security_audit'
  | 'performance'
  | 'documentation';

/**
 * L3 cache configuration
 */
export interface L3CacheConfig {
  /** Whether to load patterns */
  loadPatterns: boolean;
  /** Whether to load file types */
  loadFileTypes: boolean;
  /** Whether to load intents */
  loadIntents: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: L3CacheConfig = {
  loadPatterns: true,
  loadFileTypes: true,
  loadIntents: true,
};

/**
 * Precomputed pattern embeddings
 * These are deterministic embeddings for common code patterns
 */
const PATTERN_EMBEDDINGS: Record<string, number[]> = {
  'async-await': generatePatternEmbedding('async-await', 768),
  'error-handling': generatePatternEmbedding('error-handling', 768),
  'middleware': generatePatternEmbedding('middleware', 768),
  'factory': generatePatternEmbedding('factory', 768),
  'singleton': generatePatternEmbedding('singleton', 768),
  'observer': generatePatternEmbedding('observer', 768),
  'repository': generatePatternEmbedding('repository', 768),
  'service': generatePatternEmbedding('service', 768),
  'controller': generatePatternEmbedding('controller', 768),
  'validator': generatePatternEmbedding('validator', 768),
  'transformer': generatePatternEmbedding('transformer', 768),
  'hook': generatePatternEmbedding('hook', 768),
  'component': generatePatternEmbedding('component', 768),
  'test': generatePatternEmbedding('test', 768),
  'config': generatePatternEmbedding('config', 768),
};

/**
 * Precomputed file type embeddings
 */
const FILE_TYPE_EMBEDDINGS: Record<string, number[]> = {
  'typescript': generatePatternEmbedding('typescript', 768),
  'javascript': generatePatternEmbedding('javascript', 768),
  'python': generatePatternEmbedding('python', 768),
  'java': generatePatternEmbedding('java', 768),
  'csharp': generatePatternEmbedding('csharp', 768),
  'go': generatePatternEmbedding('go', 768),
  'rust': generatePatternEmbedding('rust', 768),
  'php': generatePatternEmbedding('php', 768),
  'ruby': generatePatternEmbedding('ruby', 768),
  'sql': generatePatternEmbedding('sql', 768),
  'json': generatePatternEmbedding('json', 768),
  'yaml': generatePatternEmbedding('yaml', 768),
  'markdown': generatePatternEmbedding('markdown', 768),
};

/**
 * Precomputed intent embeddings
 */
const INTENT_EMBEDDINGS: Record<Intent, number[]> = {
  'add_feature': generatePatternEmbedding('add_feature', 768),
  'fix_bug': generatePatternEmbedding('fix_bug', 768),
  'refactor': generatePatternEmbedding('refactor', 768),
  'add_test': generatePatternEmbedding('add_test', 768),
  'security_audit': generatePatternEmbedding('security_audit', 768),
  'performance': generatePatternEmbedding('performance', 768),
  'documentation': generatePatternEmbedding('documentation', 768),
};

/**
 * Generate a deterministic embedding for a pattern name
 */
function generatePatternEmbedding(name: string, dimensions: number): number[] {
  const embedding = new Array(dimensions).fill(0);
  
  // Use hash-based generation for deterministic embeddings
  let hash = 5381;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) + hash) + name.charCodeAt(i);
    hash = hash | 0;
  }

  // Generate embedding values
  for (let i = 0; i < dimensions; i++) {
    const seed = hash + i * 31;
    embedding[i] = Math.sin(seed * 12.9898) * 0.5;
  }

  // Normalize
  const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  if (magnitude > 0) {
    for (let i = 0; i < dimensions; i++) {
      embedding[i] /= magnitude;
    }
  }

  return embedding;
}

/**
 * L3 Precomputed Cache for instant access to common embeddings
 */
export class L3PrecomputedCache {
  private patterns: Map<string, number[]> = new Map();
  private fileTypes: Map<string, number[]> = new Map();
  private intents: Map<Intent, number[]> = new Map();
  private config: L3CacheConfig;
  private initialized = false;

  constructor(config?: Partial<L3CacheConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the cache
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.config.loadPatterns) {
      for (const [name, embedding] of Object.entries(PATTERN_EMBEDDINGS)) {
        this.patterns.set(name, embedding);
      }
    }

    if (this.config.loadFileTypes) {
      for (const [name, embedding] of Object.entries(FILE_TYPE_EMBEDDINGS)) {
        this.fileTypes.set(name, embedding);
      }
    }

    if (this.config.loadIntents) {
      for (const [name, embedding] of Object.entries(INTENT_EMBEDDINGS)) {
        this.intents.set(name as Intent, embedding);
      }
    }

    this.initialized = true;
  }

  /**
   * Get embedding by key and type
   */
  get(key: string, type: 'pattern' | 'fileType' | 'intent'): number[] | null {
    switch (type) {
      case 'pattern':
        return this.patterns.get(key) ?? null;
      case 'fileType':
        return this.fileTypes.get(key) ?? null;
      case 'intent':
        return this.intents.get(key as Intent) ?? null;
      default:
        return null;
    }
  }

  /**
   * Get pattern embedding
   */
  getPattern(name: string): number[] | null {
    return this.patterns.get(name) ?? null;
  }

  /**
   * Get file type embedding
   */
  getFileType(type: string): number[] | null {
    return this.fileTypes.get(type) ?? null;
  }

  /**
   * Get intent embedding
   */
  getIntent(intent: Intent): number[] | null {
    return this.intents.get(intent) ?? null;
  }

  /**
   * List available patterns
   */
  listPatterns(): string[] {
    return Array.from(this.patterns.keys());
  }

  /**
   * List available file types
   */
  listFileTypes(): string[] {
    return Array.from(this.fileTypes.keys());
  }

  /**
   * List available intents
   */
  listIntents(): Intent[] {
    return Array.from(this.intents.keys());
  }

  /**
   * Add custom pattern embedding
   */
  addPattern(name: string, embedding: number[]): void {
    this.patterns.set(name, embedding);
  }

  /**
   * Add custom file type embedding
   */
  addFileType(type: string, embedding: number[]): void {
    this.fileTypes.set(type, embedding);
  }

  /**
   * Find closest pattern to an embedding
   */
  findClosestPattern(embedding: number[]): { pattern: string; similarity: number } | null {
    let bestPattern: string | null = null;
    let bestSimilarity = -1;

    for (const [pattern, patternEmb] of this.patterns) {
      const similarity = this.cosineSimilarity(embedding, patternEmb);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestPattern = pattern;
      }
    }

    if (bestPattern === null) return null;

    return { pattern: bestPattern, similarity: bestSimilarity };
  }

  /**
   * Find closest file type to an embedding
   */
  findClosestFileType(embedding: number[]): { fileType: string; similarity: number } | null {
    let bestType: string | null = null;
    let bestSimilarity = -1;

    for (const [fileType, typeEmb] of this.fileTypes) {
      const similarity = this.cosineSimilarity(embedding, typeEmb);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestType = fileType;
      }
    }

    if (bestType === null) return null;

    return { fileType: bestType, similarity: bestSimilarity };
  }

  /**
   * Find closest intent to an embedding
   */
  findClosestIntent(embedding: number[]): { intent: Intent; similarity: number } | null {
    let bestIntent: Intent | null = null;
    let bestSimilarity = -1;

    for (const [intent, intentEmb] of this.intents) {
      const similarity = this.cosineSimilarity(embedding, intentEmb);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestIntent = intent;
      }
    }

    if (bestIntent === null) return null;

    return { intent: bestIntent, similarity: bestSimilarity };
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    patterns: number;
    fileTypes: number;
    intents: number;
    initialized: boolean;
  } {
    return {
      patterns: this.patterns.size,
      fileTypes: this.fileTypes.size,
      intents: this.intents.size,
      initialized: this.initialized,
    };
  }

  // Private helpers

  private cosineSimilarity(a: number[], b: number[]): number {
    const minLen = Math.min(a.length, b.length);
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < minLen; i++) {
      dotProduct += a[i]! * b[i]!;
      normA += a[i]! * a[i]!;
      normB += b[i]! * b[i]!;
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) return 0;

    return dotProduct / magnitude;
  }
}
