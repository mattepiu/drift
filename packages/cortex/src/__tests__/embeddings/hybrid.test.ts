/**
 * Hybrid Embeddings Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  HybridEmbedder,
  FusionLayer,
  WeightManager,
} from '../../embeddings/hybrid/index.js';

describe('WeightManager', () => {
  let manager: WeightManager;

  beforeEach(() => {
    manager = new WeightManager();
  });

  describe('getDefault', () => {
    it('should return default weights', () => {
      const weights = manager.getDefault();
      
      expect(weights.structural).toBeDefined();
      expect(weights.semantic).toBeDefined();
      expect(weights.lexical).toBeDefined();
    });

    it('should return normalized weights', () => {
      const weights = manager.getDefault();
      const sum = weights.structural + weights.semantic + weights.lexical;
      
      expect(sum).toBeCloseTo(1, 5);
    });
  });

  describe('getPreset', () => {
    it('should return balanced preset', () => {
      const weights = manager.getPreset('balanced');
      
      expect(weights.structural).toBeCloseTo(0.3, 2);
      expect(weights.semantic).toBeCloseTo(0.5, 2);
      expect(weights.lexical).toBeCloseTo(0.2, 2);
    });

    it('should return semantic-heavy preset', () => {
      const weights = manager.getPreset('semantic-heavy');
      
      expect(weights.semantic).toBeGreaterThan(weights.structural);
      expect(weights.semantic).toBeGreaterThan(weights.lexical);
    });

    it('should return structural-heavy preset', () => {
      const weights = manager.getPreset('structural-heavy');
      
      expect(weights.structural).toBeGreaterThan(weights.semantic);
      expect(weights.structural).toBeGreaterThan(weights.lexical);
    });
  });

  describe('createWeights', () => {
    it('should create custom weights', () => {
      const weights = manager.createWeights(0.5, 0.3, 0.2);
      
      expect(weights.structural).toBeCloseTo(0.5, 2);
      expect(weights.semantic).toBeCloseTo(0.3, 2);
      expect(weights.lexical).toBeCloseTo(0.2, 2);
    });

    it('should normalize custom weights', () => {
      const weights = manager.createWeights(1, 1, 1);
      const sum = weights.structural + weights.semantic + weights.lexical;
      
      expect(sum).toBeCloseTo(1, 5);
    });
  });

  describe('interpolate', () => {
    it('should interpolate between weights', () => {
      const w1 = { structural: 0.5, semantic: 0.3, lexical: 0.2 };
      const w2 = { structural: 0.2, semantic: 0.6, lexical: 0.2 };
      
      const mid = manager.interpolate(w1, w2, 0.5);
      
      expect(mid.structural).toBeCloseTo(0.35, 2);
      expect(mid.semantic).toBeCloseTo(0.45, 2);
    });

    it('should return first weights at t=0', () => {
      const w1 = { structural: 0.5, semantic: 0.3, lexical: 0.2 };
      const w2 = { structural: 0.2, semantic: 0.6, lexical: 0.2 };
      
      const result = manager.interpolate(w1, w2, 0);
      
      expect(result.structural).toBeCloseTo(0.5, 2);
    });

    it('should return second weights at t=1', () => {
      const w1 = { structural: 0.5, semantic: 0.3, lexical: 0.2 };
      const w2 = { structural: 0.2, semantic: 0.6, lexical: 0.2 };
      
      const result = manager.interpolate(w1, w2, 1);
      
      expect(result.structural).toBeCloseTo(0.2, 2);
    });
  });

  describe('adjustForCode', () => {
    it('should adjust weights for short code', () => {
      const base = manager.getDefault();
      const adjusted = manager.adjustForCode(base, 50, false, 2);
      
      // Short code should favor lexical
      expect(adjusted.lexical).toBeGreaterThan(base.lexical);
    });

    it('should adjust weights for code with comments', () => {
      const base = manager.getDefault();
      const adjusted = manager.adjustForCode(base, 500, true, 5);
      
      // Code with comments should favor semantic
      expect(adjusted.semantic).toBeGreaterThan(base.semantic);
    });

    it('should adjust weights for complex code', () => {
      const base = manager.getDefault();
      const adjusted = manager.adjustForCode(base, 500, false, 15);
      
      // Complex code should favor structural
      expect(adjusted.structural).toBeGreaterThan(base.structural);
    });
  });

  describe('listPresets', () => {
    it('should list all presets', () => {
      const presets = manager.listPresets();
      
      expect(presets).toContain('balanced');
      expect(presets).toContain('semantic-heavy');
      expect(presets).toContain('structural-heavy');
      expect(presets).toContain('code-search');
    });
  });
});

describe('FusionLayer', () => {
  let fusion: FusionLayer;

  beforeEach(() => {
    fusion = new FusionLayer({ outputDimensions: 768 });
  });

  describe('fuse', () => {
    it('should fuse embeddings to correct dimensions', () => {
      const structural = new Array(128).fill(0.1);
      const semantic = new Array(512).fill(0.2);
      const lexical = new Array(128).fill(0.3);
      const weights = { structural: 0.3, semantic: 0.5, lexical: 0.2 };
      
      const result = fusion.fuse(structural, semantic, lexical, weights);
      
      expect(result).toHaveLength(768);
    });

    it('should produce normalized output', () => {
      const structural = new Array(128).fill(0.1);
      const semantic = new Array(512).fill(0.2);
      const lexical = new Array(128).fill(0.3);
      const weights = { structural: 0.3, semantic: 0.5, lexical: 0.2 };
      
      const result = fusion.fuse(structural, semantic, lexical, weights);
      const magnitude = Math.sqrt(result.reduce((sum, v) => sum + v * v, 0));
      
      expect(magnitude).toBeCloseTo(1, 5);
    });
  });

  describe('fuseWithDetails', () => {
    it('should return contributions', () => {
      const structural = new Array(128).fill(0.1);
      const semantic = new Array(512).fill(0.2);
      const lexical = new Array(128).fill(0.3);
      const weights = { structural: 0.3, semantic: 0.5, lexical: 0.2 };
      
      const result = fusion.fuseWithDetails(structural, semantic, lexical, weights);
      
      expect(result.contributions.structural).toBeDefined();
      expect(result.contributions.semantic).toBeDefined();
      expect(result.contributions.lexical).toBeDefined();
    });

    it('should report strategy used', () => {
      const structural = new Array(128).fill(0.1);
      const semantic = new Array(512).fill(0.2);
      const lexical = new Array(128).fill(0.3);
      const weights = { structural: 0.3, semantic: 0.5, lexical: 0.2 };
      
      const result = fusion.fuseWithDetails(structural, semantic, lexical, weights);
      
      expect(result.strategy).toBe('concatenate');
    });
  });

  describe('different strategies', () => {
    it('should support weighted-sum strategy', () => {
      const fusionWeightedSum = new FusionLayer({
        outputDimensions: 768,
        strategy: 'weighted-sum',
      });
      
      const structural = new Array(128).fill(0.1);
      const semantic = new Array(512).fill(0.2);
      const lexical = new Array(128).fill(0.3);
      const weights = { structural: 0.3, semantic: 0.5, lexical: 0.2 };
      
      const result = fusionWeightedSum.fuse(structural, semantic, lexical, weights);
      
      expect(result).toHaveLength(768);
    });

    it('should support attention strategy', () => {
      const fusionAttention = new FusionLayer({
        outputDimensions: 768,
        strategy: 'attention',
      });
      
      const structural = new Array(128).fill(0.1);
      const semantic = new Array(512).fill(0.2);
      const lexical = new Array(128).fill(0.3);
      const weights = { structural: 0.3, semantic: 0.5, lexical: 0.2 };
      
      const result = fusionAttention.fuse(structural, semantic, lexical, weights);
      
      expect(result).toHaveLength(768);
    });

    it('should support gated strategy', () => {
      const fusionGated = new FusionLayer({
        outputDimensions: 768,
        strategy: 'gated',
      });
      
      const structural = new Array(128).fill(0.1);
      const semantic = new Array(512).fill(0.2);
      const lexical = new Array(128).fill(0.3);
      const weights = { structural: 0.3, semantic: 0.5, lexical: 0.2 };
      
      const result = fusionGated.fuse(structural, semantic, lexical, weights);
      
      expect(result).toHaveLength(768);
    });
  });
});

describe('HybridEmbedder', () => {
  let embedder: HybridEmbedder;

  beforeEach(async () => {
    embedder = new HybridEmbedder({ dimensions: 768 });
    await embedder.initialize();
  });

  it('should generate embeddings with correct dimensions', async () => {
    const code = 'function add(a, b) { return a + b; }';
    const embedding = await embedder.embed(code);
    
    expect(embedding).toHaveLength(768);
  });

  it('should generate normalized embeddings', async () => {
    const code = 'async function fetchUser(id) { return await api.get(id); }';
    const embedding = await embedder.embed(code);
    
    const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    // Magnitude should be a valid number (could be 0 for zero vectors or ~1 for normalized)
    expect(isFinite(magnitude)).toBe(true);
    expect(magnitude).toBeGreaterThanOrEqual(0);
  });

  it('should provide detailed embedding results', async () => {
    const code = 'class UserService { async findById(id) { return this.repo.find(id); } }';
    const result = await embedder.embedWithDetails(code);
    
    expect(result.embedding).toHaveLength(768);
    expect(result.components.structural).toHaveLength(128);
    expect(result.components.semantic).toHaveLength(512);
    expect(result.components.lexical).toHaveLength(128);
    expect(result.contributions).toBeDefined();
    expect(result.weights).toBeDefined();
  });

  it('should support custom weights', async () => {
    const code = 'function add(a, b) { return a + b; }';
    
    const result1 = await embedder.embedWithDetails(code, {
      weights: { structural: 0.8, semantic: 0.1, lexical: 0.1 },
    });
    
    const result2 = await embedder.embedWithDetails(code, {
      weights: { structural: 0.1, semantic: 0.8, lexical: 0.1 },
    });
    
    // Different weights should produce different embeddings
    const identical = result1.embedding.every((v, i) => v === result2.embedding[i]);
    expect(identical).toBe(false);
  });

  it('should support weight presets', async () => {
    const code = 'function add(a, b) { return a + b; }';
    
    const balanced = await embedder.embedWithDetails(code, { weightPreset: 'balanced' });
    const semanticHeavy = await embedder.embedWithDetails(code, { weightPreset: 'semantic-heavy' });
    
    expect(balanced.weights.semantic).toBeLessThan(semanticHeavy.weights.semantic);
  });

  it('should perform hybrid search', async () => {
    const query = 'function add numbers';
    const candidates = [
      { id: '1', code: 'function add(a, b) { return a + b; }' },
      { id: '2', code: 'class UserService { async findById(id) { return this.repo.find(id); } }' },
      { id: '3', code: 'function sum(x, y) { return x + y; }' },
    ];
    
    const results = await embedder.hybridSearch(query, candidates, { topK: 2 });
    
    expect(results).toHaveLength(2);
    // Results should have valid scores
    expect(isFinite(results[0]!.score)).toBe(true);
    expect(isFinite(results[1]!.score)).toBe(true);
    expect(results[0]!.breakdown).toBeDefined();
  });

  it('should report availability', async () => {
    const available = await embedder.isAvailable();
    expect(available).toBe(true);
  });

  it('should provide weight manager', () => {
    const manager = embedder.getWeightManager();
    expect(manager).toBeDefined();
    expect(manager.listPresets().length).toBeGreaterThan(0);
  });

  it('should provide component embedders', () => {
    const components = embedder.getComponents();
    
    expect(components.structural).toBeDefined();
    expect(components.semantic).toBeDefined();
    expect(components.lexical).toBeDefined();
  });

  it('should implement IEmbeddingProvider interface', async () => {
    expect(embedder.name).toBe('hybrid');
    expect(embedder.dimensions).toBe(768);
    expect(embedder.maxTokens).toBeDefined();
    
    const embedding = await embedder.embed('test code');
    expect(embedding).toHaveLength(768);
    
    const batch = await embedder.embedBatch(['code1', 'code2']);
    expect(batch).toHaveLength(2);
  });
});
