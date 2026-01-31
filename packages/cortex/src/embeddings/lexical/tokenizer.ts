/**
 * Code Tokenizer
 * 
 * Tokenizes code for lexical analysis, handling:
 * - CamelCase splitting
 * - snake_case splitting
 * - Common token filtering
 * - Code-specific tokenization
 * 
 * @module embeddings/lexical/tokenizer
 */

/**
 * Tokenizer configuration
 */
export interface TokenizerConfig {
  /** Minimum token length */
  minTokenLength: number;
  /** Maximum token length */
  maxTokenLength: number;
  /** Whether to lowercase tokens */
  lowercase: boolean;
  /** Whether to split compound words */
  splitCompounds: boolean;
  /** Custom stop words to filter */
  stopWords?: Set<string>;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: TokenizerConfig = {
  minTokenLength: 2,
  maxTokenLength: 50,
  lowercase: true,
  splitCompounds: true,
};

/**
 * Common programming stop words
 */
const DEFAULT_STOP_WORDS = new Set([
  // Language keywords
  'const', 'let', 'var', 'function', 'class', 'interface', 'type',
  'import', 'export', 'from', 'return', 'if', 'else', 'for', 'while',
  'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally',
  'throw', 'new', 'this', 'super', 'extends', 'implements',
  'public', 'private', 'protected', 'static', 'async', 'await',
  'true', 'false', 'null', 'undefined', 'void',
  // Common short words
  'the', 'and', 'for', 'not', 'with', 'has', 'get', 'set',
  // Common code words that are too generic
  'data', 'value', 'item', 'items', 'list', 'array', 'object',
  'string', 'number', 'boolean', 'any', 'unknown',
]);

/**
 * Code tokenizer for lexical analysis
 */
export class CodeTokenizer {
  private config: TokenizerConfig;
  private stopWords: Set<string>;

  constructor(config?: Partial<TokenizerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stopWords = config?.stopWords ?? DEFAULT_STOP_WORDS;
  }

  /**
   * Tokenize code into meaningful tokens
   */
  tokenize(code: string): string[] {
    // Step 1: Remove comments and strings
    const cleaned = this.removeCommentsAndStrings(code);

    // Step 2: Extract identifiers and words
    const rawTokens = this.extractTokens(cleaned);

    // Step 3: Split compound words if configured
    const splitTokens = this.config.splitCompounds
      ? rawTokens.flatMap(t => this.splitCompoundWord(t))
      : rawTokens;

    // Step 4: Normalize and filter
    const normalized = splitTokens
      .map(t => this.config.lowercase ? t.toLowerCase() : t)
      .filter(t => this.isValidToken(t));

    // Step 5: Remove duplicates while preserving order
    return [...new Set(normalized)];
  }

  /**
   * Tokenize with frequency information
   */
  tokenizeWithFrequency(code: string): Map<string, number> {
    const cleaned = this.removeCommentsAndStrings(code);
    const rawTokens = this.extractTokens(cleaned);
    
    const splitTokens = this.config.splitCompounds
      ? rawTokens.flatMap(t => this.splitCompoundWord(t))
      : rawTokens;

    const frequency = new Map<string, number>();
    
    for (const token of splitTokens) {
      const normalized = this.config.lowercase ? token.toLowerCase() : token;
      if (this.isValidToken(normalized)) {
        frequency.set(normalized, (frequency.get(normalized) ?? 0) + 1);
      }
    }

    return frequency;
  }

  /**
   * Remove comments and string literals
   */
  private removeCommentsAndStrings(code: string): string {
    // Remove single-line comments
    let result = code.replace(/\/\/.*$/gm, '');
    
    // Remove multi-line comments
    result = result.replace(/\/\*[\s\S]*?\*\//g, '');
    
    // Remove string literals (simple approach)
    result = result.replace(/"(?:[^"\\]|\\.)*"/g, '');
    result = result.replace(/'(?:[^'\\]|\\.)*'/g, '');
    result = result.replace(/`(?:[^`\\]|\\.)*`/g, '');
    
    return result;
  }

  /**
   * Extract tokens from cleaned code
   */
  private extractTokens(code: string): string[] {
    // Match identifiers and words
    const pattern = /[a-zA-Z_$][a-zA-Z0-9_$]*/g;
    return code.match(pattern) ?? [];
  }

  /**
   * Split compound words (camelCase, PascalCase, snake_case)
   */
  private splitCompoundWord(word: string): string[] {
    const parts: string[] = [];

    // Split on underscores first
    const underscoreParts = word.split('_').filter(Boolean);

    for (const part of underscoreParts) {
      // Split camelCase/PascalCase
      const camelParts = this.splitCamelCase(part);
      parts.push(...camelParts);
    }

    return parts.length > 0 ? parts : [word];
  }

  /**
   * Split camelCase and PascalCase
   */
  private splitCamelCase(word: string): string[] {
    // Insert space before uppercase letters that follow lowercase
    // Also handle acronyms (e.g., XMLParser -> XML Parser)
    const spaced = word
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');

    return spaced.split(' ').filter(Boolean);
  }

  /**
   * Check if a token is valid
   */
  private isValidToken(token: string): boolean {
    // Check length
    if (token.length < this.config.minTokenLength) return false;
    if (token.length > this.config.maxTokenLength) return false;

    // Check if it's a stop word
    if (this.stopWords.has(token.toLowerCase())) return false;

    // Check if it's all digits
    if (/^\d+$/.test(token)) return false;

    // Check if it's a single repeated character
    if (/^(.)\1+$/.test(token)) return false;

    return true;
  }

  /**
   * Get the stop words set
   */
  getStopWords(): Set<string> {
    return new Set(this.stopWords);
  }

  /**
   * Add custom stop words
   */
  addStopWords(words: string[]): void {
    for (const word of words) {
      this.stopWords.add(word.toLowerCase());
    }
  }
}
