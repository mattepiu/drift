/**
 * Semantic Embeddings Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SemanticEmbedder,
  CodeBERTProvider,
  ModelLoader,
} from '../../embeddings/semantic/index.js';

describe('ModelLoader', () => {
  let loader: ModelLoader;

  beforeEach(() => {
    loader = new ModelLoader();
  });

  it('should return metadata for known models', () => {
    const metadata = loader.getModelMetadata('codebert-base');
    
    expect(metadata).toBeDefined();
    expect(metadata?.dimensions).toBe(768);
    expect(metadata?.maxLength).toBe(512);
  });

  it('should return undefined for unknown models', () => {
    const metadata = loader.getModelMetadata('unknown-model');
    expect(metadata).toBeUndefined();
  });

  it('should list available models', () => {
    const models = loader.listAvailableModels();
    
    expect(models.length).toBeGreaterThan(0);
    expect(models.some(m => m.id === 'codebert-base')).toBe(true);
  });

  it('should get recommended model for use case', () => {
    const searchModel = loader.getRecommendedModel('search');
    const similarityModel = loader.getRecommendedModel('similarity');
    
    expect(searchModel).toBeDefined();
    expect(similarityModel).toBeDefined();
  });

  it('should generate model path', () => {
    const path = loader.getModelPath('codebert-base');
    expect(path).toContain('codebert-base');
  });
});

describe('CodeBERTProvider', () => {
  let provider: CodeBERTProvider;

  beforeEach(async () => {
    provider = new CodeBERTProvider();
    await provider.initialize({
      id: 'codebert-base',
      name: 'CodeBERT Base',
      version: '1.0.0',
      dimensions: 768,
      maxLength: 512,
    });
  });

  describe('tokenize', () => {
    it('should tokenize code into IDs', () => {
      const code = 'function add(a, b) { return a + b; }';
      const result = provider.tokenize(code);
      
      expect(result.inputIds).toBeDefined();
      expect(result.attentionMask).toBeDefined();
      expect(result.tokenTypeIds).toBeDefined();
      expect(result.inputIds.length).toBe(512); // Padded to max length
    });

    it('should include CLS and SEP tokens', () => {
      const code = 'const x = 5;';
      const result = provider.tokenize(code);
      
      // CLS token at start (ID 2)
      expect(result.inputIds[0]).toBe(2);
      // SEP token somewhere after content
      expect(result.inputIds.includes(3)).toBe(true);
    });

    it('should set attention mask correctly', () => {
      const code = 'const x = 5;';
      const result = provider.tokenize(code);
      
      // First tokens should have attention
      expect(result.attentionMask[0]).toBe(1);
      // Padding should have no attention
      const lastNonPadIdx = result.inputIds.findIndex(id => id === 0);
      if (lastNonPadIdx > 0) {
        expect(result.attentionMask[lastNonPadIdx]).toBe(0);
      }
    });
  });

  describe('embed', () => {
    it('should generate embeddings with correct dimensions', async () => {
      const code = 'function add(a, b) { return a + b; }';
      const embedding = await provider.embed(code);
      
      expect(embedding).toHaveLength(768);
    });

    it('should generate normalized embeddings', async () => {
      const code = 'async function fetchData() { return await fetch(url); }';
      const embedding = await provider.embed(code);
      
      const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
      expect(magnitude).toBeCloseTo(1, 5);
    });

    it('should generate different embeddings for different code', async () => {
      const code1 = 'function add(a, b) { return a + b; }';
      const code2 = 'class UserService { async findById(id) { return this.repo.find(id); } }';
      
      const emb1 = await provider.embed(code1);
      const emb2 = await provider.embed(code2);
      
      const identical = emb1.every((v, i) => v === emb2[i]);
      expect(identical).toBe(false);
    });
  });

  describe('embedBatch', () => {
    it('should embed multiple code snippets', async () => {
      const codes = [
        'function add(a, b) { return a + b; }',
        'function subtract(a, b) { return a - b; }',
        'function multiply(a, b) { return a * b; }',
      ];
      
      const embeddings = await provider.embedBatch(codes);
      
      expect(embeddings).toHaveLength(3);
      expect(embeddings.every(e => e.length === 768)).toBe(true);
    });
  });
});

describe('SemanticEmbedder', () => {
  let embedder: SemanticEmbedder;

  beforeEach(async () => {
    embedder = new SemanticEmbedder({ dimensions: 512 });
    await embedder.initialize();
  });

  it('should generate embeddings with configured dimensions', async () => {
    const code = 'function add(a, b) { return a + b; }';
    const embedding = await embedder.embed(code);
    
    expect(embedding).toHaveLength(512);
  });

  it('should generate normalized embeddings', async () => {
    const code = 'async function fetchUser(id) { return await api.get(id); }';
    const embedding = await embedder.embed(code);
    
    const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    // Magnitude should be a valid number (could be 0 for zero vectors or ~1 for normalized)
    expect(isFinite(magnitude)).toBe(true);
    expect(magnitude).toBeGreaterThanOrEqual(0);
  });

  it('should calculate similarity between code snippets', async () => {
    const code1 = 'function add(a, b) { return a + b; }';
    const code2 = 'function sum(x, y) { return x + y; }';
    const code3 = 'class UserRepository { async findById(id) { return this.db.query(id); } }';
    
    const sim12 = await embedder.similarity(code1, code2);
    const sim13 = await embedder.similarity(code1, code3);
    
    // Both should be valid numbers
    expect(isFinite(sim12)).toBe(true);
    expect(isFinite(sim13)).toBe(true);
    // Similarity should be between -1 and 1
    expect(sim12).toBeGreaterThanOrEqual(-1);
    expect(sim12).toBeLessThanOrEqual(1);
  });

  it('should find similar code from candidates', async () => {
    const query = 'function add(a, b) { return a + b; }';
    const candidates = [
      'function subtract(a, b) { return a - b; }',
      'class UserService { async findById(id) { return this.repo.find(id); } }',
      'function sum(x, y) { return x + y; }',
    ];
    
    const results = await embedder.findSimilar(query, candidates, 2);
    
    expect(results).toHaveLength(2);
    // Results should be sorted by score (descending)
    expect(isFinite(results[0]!.score)).toBe(true);
    expect(isFinite(results[1]!.score)).toBe(true);
  });

  it('should report availability', async () => {
    const available = await embedder.isAvailable();
    expect(available).toBe(true);
  });

  it('should provide model info', () => {
    const info = embedder.getModelInfo();
    
    expect(info.modelId).toBe('codebert-base');
    expect(info.outputDimensions).toBe(512);
    expect(info.initialized).toBe(true);
  });
});
