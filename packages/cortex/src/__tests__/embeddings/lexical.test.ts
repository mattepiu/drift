/**
 * Lexical Embeddings Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  LexicalEmbedder,
  CodeTokenizer,
  TFIDFCalculator,
} from '../../embeddings/lexical/index.js';

describe('CodeTokenizer', () => {
  let tokenizer: CodeTokenizer;

  beforeEach(() => {
    tokenizer = new CodeTokenizer();
  });

  describe('tokenize', () => {
    it('should tokenize simple code', () => {
      const code = 'function add(a, b) { return a + b; }';
      const tokens = tokenizer.tokenize(code);
      
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens).toContain('add');
    });

    it('should split camelCase', () => {
      const code = 'const getUserById = () => {}';
      const tokens = tokenizer.tokenize(code);
      
      expect(tokens).toContain('user');
      expect(tokens).toContain('by');
    });

    it('should split snake_case', () => {
      const code = 'const get_user_by_id = () => {}';
      const tokens = tokenizer.tokenize(code);
      
      expect(tokens).toContain('user');
      expect(tokens).toContain('by');
    });

    it('should remove comments', () => {
      const code = `
        // This is a comment
        function add(a, b) {
          /* Multi-line
             comment */
          return a + b;
        }
      `;
      const tokens = tokenizer.tokenize(code);
      
      expect(tokens).not.toContain('comment');
      expect(tokens).not.toContain('multi');
    });

    it('should filter stop words', () => {
      const code = 'const value = function() { return true; }';
      const tokens = tokenizer.tokenize(code);
      
      // Common stop words should be filtered
      expect(tokens).not.toContain('const');
      expect(tokens).not.toContain('function');
      expect(tokens).not.toContain('return');
      expect(tokens).not.toContain('true');
    });

    it('should remove duplicates', () => {
      const code = 'user.name = user.email = user.id';
      const tokens = tokenizer.tokenize(code);
      
      const userCount = tokens.filter(t => t === 'user').length;
      expect(userCount).toBeLessThanOrEqual(1);
    });
  });

  describe('tokenizeWithFrequency', () => {
    it('should return frequency map', () => {
      const code = 'user.name = user.email';
      const freq = tokenizer.tokenizeWithFrequency(code);
      
      expect(freq.get('user')).toBe(2);
      expect(freq.get('name')).toBe(1);
      expect(freq.get('email')).toBe(1);
    });
  });
});

describe('TFIDFCalculator', () => {
  let calculator: TFIDFCalculator;

  beforeEach(() => {
    calculator = new TFIDFCalculator();
  });

  describe('calculateTF', () => {
    it('should calculate term frequency', () => {
      const tokens = ['user', 'name', 'user', 'email'];
      const tf = calculator.calculateTF(tokens);
      
      expect(tf.get('user')).toBeGreaterThan(tf.get('name')!);
    });

    it('should handle empty tokens', () => {
      const tf = calculator.calculateTF([]);
      expect(tf.size).toBe(0);
    });
  });

  describe('calculateTFIDF', () => {
    it('should calculate TF-IDF scores', () => {
      const tokens = ['authentication', 'user', 'middleware'];
      const tfidf = calculator.calculateTFIDF(tokens);
      
      // All tokens should have scores
      expect(tfidf.size).toBe(3);
      
      // Rare terms should have higher scores
      expect(tfidf.get('authentication')).toBeGreaterThan(tfidf.get('user')!);
    });
  });

  describe('getIDF', () => {
    it('should return pre-computed IDF for known terms', () => {
      const authIDF = calculator.getIDF('authentication');
      const userIDF = calculator.getIDF('user');
      
      // Authentication is rarer, should have higher IDF
      expect(authIDF).toBeGreaterThan(userIDF);
    });

    it('should return default IDF for unknown terms', () => {
      const unknownIDF = calculator.getIDF('xyzabc123');
      expect(unknownIDF).toBe(3.0); // Default for unknown
    });
  });

  describe('toVector', () => {
    it('should convert TF-IDF to fixed-dimension vector', () => {
      const tokens = ['user', 'authentication', 'middleware'];
      const tfidf = calculator.calculateTFIDF(tokens);
      const vector = calculator.toVector(tfidf, 128);
      
      expect(vector).toHaveLength(128);
    });

    it('should normalize the vector', () => {
      const tokens = ['user', 'authentication', 'middleware'];
      const tfidf = calculator.calculateTFIDF(tokens);
      const vector = calculator.toVector(tfidf, 128);
      
      const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
      expect(magnitude).toBeCloseTo(1, 5);
    });
  });

  describe('buildFromCorpus', () => {
    it('should build calculator from documents', async () => {
      const documents = [
        'function add(a, b) { return a + b; }',
        'function subtract(a, b) { return a - b; }',
        'class UserService { findById(id) { return this.repo.find(id); } }',
      ];
      
      const calc = await TFIDFCalculator.buildFromCorpus(documents);
      const stats = calc.getStats();
      
      expect(stats.documentCount).toBe(3);
      expect(stats.termCount).toBeGreaterThan(0);
    });
  });
});

describe('LexicalEmbedder', () => {
  let embedder: LexicalEmbedder;

  beforeEach(async () => {
    embedder = new LexicalEmbedder({ dimensions: 128 });
    await embedder.initialize();
  });

  it('should generate embeddings with correct dimensions', () => {
    const text = 'function add(a, b) { return a + b; }';
    const embedding = embedder.embed(text);
    
    expect(embedding).toHaveLength(128);
  });

  it('should generate normalized embeddings', () => {
    const text = 'async function fetchUser(id) { return await api.get(id); }';
    const embedding = embedder.embed(text);
    
    const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    expect(magnitude).toBeCloseTo(1, 5);
  });

  it('should handle empty text', () => {
    const embedding = embedder.embed('');
    
    expect(embedding).toHaveLength(128);
    expect(embedding.every(v => v === 0)).toBe(true);
  });

  it('should calculate similarity between texts', () => {
    const text1 = 'function add(a, b) { return a + b; }';
    const text2 = 'function sum(x, y) { return x + y; }';
    const text3 = 'class UserRepository { async findById(id) { return this.db.query(id); } }';
    
    const sim12 = embedder.similarity(text1, text2);
    const sim13 = embedder.similarity(text1, text3);
    
    // Both should be valid numbers
    expect(isFinite(sim12)).toBe(true);
    expect(isFinite(sim13)).toBe(true);
    // Similarity should be between -1 and 1
    expect(sim12).toBeGreaterThanOrEqual(-1);
    expect(sim12).toBeLessThanOrEqual(1);
  });

  it('should find similar texts from candidates', () => {
    const query = 'authentication middleware';
    const candidates = [
      'user authentication service',
      'database connection pool',
      'auth middleware handler',
    ];
    
    const results = embedder.findSimilar(query, candidates, 2);
    
    expect(results).toHaveLength(2);
    expect(results[0]!.score).toBeGreaterThanOrEqual(results[1]!.score);
  });

  it('should analyze tokens', () => {
    const text = 'async function fetchUserById(userId) { return await api.getUser(userId); }';
    const analysis = embedder.analyzeTokens(text);
    
    expect(analysis.tokens.length).toBeGreaterThan(0);
    expect(analysis.tfidf.size).toBeGreaterThan(0);
    expect(analysis.topTerms.length).toBeGreaterThan(0);
  });

  it('should report availability', async () => {
    const available = await embedder.isAvailable();
    expect(available).toBe(true);
  });

  it('should build from corpus', async () => {
    const documents = [
      'function add(a, b) { return a + b; }',
      'function subtract(a, b) { return a - b; }',
      'class UserService { findById(id) { return this.repo.find(id); } }',
    ];
    
    const corpusEmbedder = await LexicalEmbedder.fromCorpus(documents, { dimensions: 128 });
    const embedding = corpusEmbedder.embed('function multiply(a, b) { return a * b; }');
    
    expect(embedding).toHaveLength(128);
  });
});
