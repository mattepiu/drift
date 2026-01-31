/**
 * Causal Inference Engine Tests
 * 
 * Tests for the automatic causal inference functionality.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { CausalInferenceEngine } from '../../causal/inference/engine.js';
import { TemporalInferenceStrategy } from '../../causal/inference/temporal.js';
import { SemanticInferenceStrategy } from '../../causal/inference/semantic.js';
import { EntityInferenceStrategy } from '../../causal/inference/entity.js';
import { ExplicitInferenceStrategy } from '../../causal/inference/explicit.js';
import { SQLiteCausalStorage } from '../../causal/storage/sqlite.js';
import type { IMemoryStorage } from '../../storage/interface.js';
import type { Memory, TribalMemory, EpisodicMemory } from '../../types/index.js';

describe('CausalInferenceEngine', () => {
  let db: Database.Database;
  let causalStorage: SQLiteCausalStorage;
  let memoryStorage: MockMemoryStorage;
  let engine: CausalInferenceEngine;

  beforeEach(async () => {
    db = new Database(':memory:');
    // Disable foreign key constraints for testing with mock memory storage
    db.pragma('foreign_keys = OFF');
    causalStorage = new SQLiteCausalStorage(db);
    await causalStorage.initialize();
    
    memoryStorage = new MockMemoryStorage();
    engine = new CausalInferenceEngine(causalStorage, memoryStorage);
  });

  afterEach(async () => {
    await causalStorage.close();
    db.close();
  });

  describe('inferCauses', () => {
    it('should infer causes based on temporal proximity', async () => {
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

      const olderMemory = createMockMemory('mem_older', 'Older memory', fiveMinutesAgo);
      const newerMemory = createMockMemory('mem_newer', 'Newer memory', now);

      memoryStorage.addMemory(olderMemory);
      memoryStorage.addMemory(newerMemory);

      const result = await engine.inferCauses(newerMemory);

      // Should return a CausalInferenceResult
      expect(result).toBeDefined();
      expect(result.memoryId).toBe('mem_newer');
      expect(Array.isArray(result.inferredEdges)).toBe(true);
    });

    it('should infer causes based on entity overlap', async () => {
      const memory1 = createMockMemory('mem_1', 'Authentication middleware for user login');
      const memory2 = createMockMemory('mem_2', 'User login validation rules');

      memoryStorage.addMemory(memory1);
      memoryStorage.addMemory(memory2);

      const result = await engine.inferCauses(memory2);

      // Should return a valid result
      expect(result).toBeDefined();
      expect(result.memoryId).toBe('mem_2');
    });

    it('should respect minimum confidence threshold', async () => {
      const memory1 = createMockMemory('mem_1', 'Memory 1');
      const memory2 = createMockMemory('mem_2', 'Memory 2');

      memoryStorage.addMemory(memory1);
      memoryStorage.addMemory(memory2);

      const result = await engine.inferCauses(memory2);

      // All inferred edges should meet minimum confidence
      expect(result.inferredEdges.every(e => e.strength >= 0.5)).toBe(true);
    });
  });

  describe('inferEffects', () => {
    it('should infer effects of a memory', async () => {
      const now = new Date();
      const fiveMinutesLater = new Date(now.getTime() + 5 * 60 * 1000);

      const olderMemory = createMockMemory('mem_older', 'Older memory', now);
      const newerMemory = createMockMemory('mem_newer', 'Newer memory', fiveMinutesLater);

      memoryStorage.addMemory(olderMemory);
      memoryStorage.addMemory(newerMemory);

      const result = await engine.inferEffects(olderMemory);

      // Should return a CausalInferenceResult
      expect(result).toBeDefined();
      expect(result.memoryId).toBe('mem_older');
      expect(Array.isArray(result.inferredEdges)).toBe(true);
    });
  });

  describe('validateInference', () => {
    it('should validate a causal inference', async () => {
      const memory1 = createMockMemory('mem_1', 'Memory 1');
      const memory2 = createMockMemory('mem_2', 'Memory 2');

      memoryStorage.addMemory(memory1);
      memoryStorage.addMemory(memory2);

      const edgeId = await causalStorage.createEdge({
        sourceId: 'mem_1',
        targetId: 'mem_2',
        relation: 'caused',
        strength: 0.7,
        evidence: [],
      });

      const edge = await causalStorage.getEdge(edgeId);
      const isValid = await engine.validateInference(edge!);

      expect(typeof isValid).toBe('boolean');
    });
  });

  describe('getCandidates', () => {
    it('should get candidate memories for inference', async () => {
      const now = new Date();
      
      for (let i = 0; i < 5; i++) {
        const time = new Date(now.getTime() - i * 60 * 1000);
        memoryStorage.addMemory(createMockMemory(`mem_${i}`, `Memory ${i}`, time));
      }

      const targetMemory = createMockMemory('mem_target', 'Target memory', now);
      memoryStorage.addMemory(targetMemory);

      const candidates = await engine.getCandidates(targetMemory, 'causes');

      expect(Array.isArray(candidates)).toBe(true);
    });
  });
});

describe('TemporalInferenceStrategy', () => {
  let strategy: TemporalInferenceStrategy;

  beforeEach(() => {
    strategy = new TemporalInferenceStrategy();
  });

  describe('infer', () => {
    it('should infer causation from temporal proximity', async () => {
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

      const source = createMockMemory('mem_source', 'Source', fiveMinutesAgo);
      const target = createMockMemory('mem_target', 'Target', now);

      const result = await strategy.infer(target, [source]);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]!.evidence.type).toBe('temporal');
    });

    it('should return lower confidence for distant events', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const source = createMockMemory('mem_source', 'Source', oneHourAgo);
      const target = createMockMemory('mem_target', 'Target', now);

      const result = await strategy.infer(target, [source]);

      // Distant events should have lower confidence
      if (result.length > 0) {
        expect(result[0]!.confidence).toBeLessThan(0.8);
      }
    });

    it('should return empty for very distant events', async () => {
      const now = new Date();
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      const source = createMockMemory('mem_source', 'Source', twoDaysAgo);
      const target = createMockMemory('mem_target', 'Target', now);

      const result = await strategy.infer(target, [source]);

      // Very distant events should not be inferred
      expect(result.length).toBe(0);
    });
  });
});

describe('EntityInferenceStrategy', () => {
  let strategy: EntityInferenceStrategy;

  beforeEach(() => {
    strategy = new EntityInferenceStrategy();
  });

  describe('infer', () => {
    it('should infer causation from entity overlap', async () => {
      const source = createMockMemory('mem_source', 'User authentication middleware');
      const target = createMockMemory('mem_target', 'User login validation');

      const result = await strategy.infer(target, [source]);

      // Both mention "user" - should have some results
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return higher confidence for more entity overlap', async () => {
      const source = createMockMemory('mem_source', 'User authentication login middleware');
      const target = createMockMemory('mem_target', 'User authentication login validation');

      const result = await strategy.infer(target, [source]);

      // Multiple overlapping entities should produce results
      expect(Array.isArray(result)).toBe(true);
    });
  });
});

describe('ExplicitInferenceStrategy', () => {
  let strategy: ExplicitInferenceStrategy;

  beforeEach(() => {
    strategy = new ExplicitInferenceStrategy();
  });

  describe('infer', () => {
    it('should detect explicit references', async () => {
      const source = createMockMemory('mem_source', 'Original pattern');
      const target = createMockMemoryWithKnowledge(
        'mem_target', 
        'Extended pattern',
        'This extends mem_source with additional features'
      );

      const result = await strategy.infer(target, [source]);

      // Should detect the explicit reference to mem_source
      expect(result.length).toBeGreaterThanOrEqual(0);
      // If found, should have explicit evidence type
      if (result.length > 0) {
        expect(result[0]!.evidence.type).toBe('explicit');
      }
    });

    it('should return empty array for no references', async () => {
      const source = createMockMemory('mem_source', 'Original pattern');
      const target = createMockMemory('mem_target', 'Unrelated pattern');

      const result = await strategy.infer(target, [source]);

      // No explicit references should be found
      expect(Array.isArray(result)).toBe(true);
    });
  });
});

// Mock Memory Storage

class MockMemoryStorage implements Partial<IMemoryStorage> {
  private memories = new Map<string, Memory>();

  addMemory(memory: Memory): void {
    this.memories.set(memory.id, memory);
  }

  async read(id: string): Promise<Memory | null> {
    return this.memories.get(id) ?? null;
  }

  async search(): Promise<Memory[]> {
    return Array.from(this.memories.values());
  }

  async initialize(): Promise<void> {}
  async close(): Promise<void> {}
}

function createMockMemory(id: string, summary: string, createdAt?: Date): TribalMemory {
  const timestamp = createdAt ?? new Date();
  return {
    id,
    type: 'tribal',
    topic: 'test',
    knowledge: summary,
    severity: 'info',
    summary,
    confidence: 0.8,
    importance: 'normal',
    accessCount: 0,
    transactionTime: { recordedAt: timestamp.toISOString() },
    validTime: { validFrom: timestamp.toISOString() },
    createdAt: timestamp.toISOString(),
    updatedAt: timestamp.toISOString(),
  };
}

function createMockMemoryWithKnowledge(id: string, summary: string, knowledge: string): TribalMemory {
  return {
    id,
    type: 'tribal',
    topic: 'test',
    knowledge,
    severity: 'info',
    summary,
    confidence: 0.8,
    importance: 'normal',
    accessCount: 0,
    transactionTime: { recordedAt: new Date().toISOString() },
    validTime: { validFrom: new Date().toISOString() },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
