/**
 * Causal Graph Traverser Tests
 * 
 * Tests for the causal graph traversal functionality.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { CausalGraphTraverser } from '../../causal/traversal/traverser.js';
import { SQLiteCausalStorage } from '../../causal/storage/sqlite.js';
import type { IMemoryStorage } from '../../storage/interface.js';
import type { Memory, TribalMemory } from '../../types/index.js';

describe('CausalGraphTraverser', () => {
  let db: Database.Database;
  let causalStorage: SQLiteCausalStorage;
  let memoryStorage: MockMemoryStorage;
  let traverser: CausalGraphTraverser;

  beforeEach(async () => {
    db = new Database(':memory:');
    // Disable foreign key constraints for testing with mock memory storage
    db.pragma('foreign_keys = OFF');
    causalStorage = new SQLiteCausalStorage(db);
    await causalStorage.initialize();
    
    memoryStorage = new MockMemoryStorage();
    traverser = new CausalGraphTraverser(causalStorage, memoryStorage);
  });

  afterEach(async () => {
    await causalStorage.close();
    db.close();
  });

  describe('traceOrigins', () => {
    it('should trace origins of a memory', async () => {
      // Create a chain: A -> B -> C (A caused B, B caused C)
      memoryStorage.addMemory(createMockMemory('mem_a', 'Memory A'));
      memoryStorage.addMemory(createMockMemory('mem_b', 'Memory B'));
      memoryStorage.addMemory(createMockMemory('mem_c', 'Memory C'));

      await causalStorage.createEdge({
        sourceId: 'mem_a',
        targetId: 'mem_b',
        relation: 'caused',
        strength: 0.9,
        evidence: [],
      });
      await causalStorage.createEdge({
        sourceId: 'mem_b',
        targetId: 'mem_c',
        relation: 'caused',
        strength: 0.8,
        evidence: [],
      });

      const chain = await traverser.traceOrigins('mem_c');

      expect(chain.rootId).toBe('mem_c');
      expect(chain.direction).toBe('origins');
      expect(chain.nodes.length).toBeGreaterThanOrEqual(2);
      expect(chain.edges.length).toBeGreaterThanOrEqual(1);
    });

    it('should respect maxDepth option', async () => {
      // Create a long chain: A -> B -> C -> D -> E
      for (const id of ['a', 'b', 'c', 'd', 'e']) {
        memoryStorage.addMemory(createMockMemory(`mem_${id}`, `Memory ${id}`));
      }
      
      await causalStorage.createEdge({ sourceId: 'mem_a', targetId: 'mem_b', relation: 'caused', strength: 0.9, evidence: [] });
      await causalStorage.createEdge({ sourceId: 'mem_b', targetId: 'mem_c', relation: 'caused', strength: 0.9, evidence: [] });
      await causalStorage.createEdge({ sourceId: 'mem_c', targetId: 'mem_d', relation: 'caused', strength: 0.9, evidence: [] });
      await causalStorage.createEdge({ sourceId: 'mem_d', targetId: 'mem_e', relation: 'caused', strength: 0.9, evidence: [] });

      const chain = await traverser.traceOrigins('mem_e', { maxDepth: 2 });

      // Should only go back 2 levels from E
      expect(chain.maxDepth).toBeLessThanOrEqual(2);
    });

    it('should filter by minimum strength', async () => {
      memoryStorage.addMemory(createMockMemory('mem_a', 'Memory A'));
      memoryStorage.addMemory(createMockMemory('mem_b', 'Memory B'));
      memoryStorage.addMemory(createMockMemory('mem_c', 'Memory C'));

      await causalStorage.createEdge({ sourceId: 'mem_a', targetId: 'mem_b', relation: 'caused', strength: 0.9, evidence: [] });
      await causalStorage.createEdge({ sourceId: 'mem_b', targetId: 'mem_c', relation: 'caused', strength: 0.2, evidence: [] });

      const chain = await traverser.traceOrigins('mem_c', { minStrength: 0.5 });

      // Should not include the weak edge
      expect(chain.edges.every(e => e.strength >= 0.5)).toBe(true);
    });
  });

  describe('traceEffects', () => {
    it('should trace effects of a memory', async () => {
      memoryStorage.addMemory(createMockMemory('mem_a', 'Memory A'));
      memoryStorage.addMemory(createMockMemory('mem_b', 'Memory B'));
      memoryStorage.addMemory(createMockMemory('mem_c', 'Memory C'));

      await causalStorage.createEdge({ sourceId: 'mem_a', targetId: 'mem_b', relation: 'caused', strength: 0.9, evidence: [] });
      await causalStorage.createEdge({ sourceId: 'mem_a', targetId: 'mem_c', relation: 'enabled', strength: 0.8, evidence: [] });

      const chain = await traverser.traceEffects('mem_a');

      expect(chain.rootId).toBe('mem_a');
      expect(chain.direction).toBe('effects');
      expect(chain.nodes.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle branching effects', async () => {
      // A causes both B and C
      memoryStorage.addMemory(createMockMemory('mem_a', 'Memory A'));
      memoryStorage.addMemory(createMockMemory('mem_b', 'Memory B'));
      memoryStorage.addMemory(createMockMemory('mem_c', 'Memory C'));

      await causalStorage.createEdge({ sourceId: 'mem_a', targetId: 'mem_b', relation: 'caused', strength: 0.9, evidence: [] });
      await causalStorage.createEdge({ sourceId: 'mem_a', targetId: 'mem_c', relation: 'caused', strength: 0.8, evidence: [] });

      const chain = await traverser.traceEffects('mem_a');

      expect(chain.totalMemories).toBeGreaterThanOrEqual(3);
    });
  });

  describe('traceBidirectional', () => {
    it('should trace both origins and effects', async () => {
      // A -> B -> C (B is in the middle)
      memoryStorage.addMemory(createMockMemory('mem_a', 'Memory A'));
      memoryStorage.addMemory(createMockMemory('mem_b', 'Memory B'));
      memoryStorage.addMemory(createMockMemory('mem_c', 'Memory C'));

      await causalStorage.createEdge({ sourceId: 'mem_a', targetId: 'mem_b', relation: 'caused', strength: 0.9, evidence: [] });
      await causalStorage.createEdge({ sourceId: 'mem_b', targetId: 'mem_c', relation: 'caused', strength: 0.8, evidence: [] });

      const chain = await traverser.traceBidirectional('mem_b');

      expect(chain.rootId).toBe('mem_b');
      expect(chain.direction).toBe('bidirectional');
      // Should include A (origin) and C (effect)
      expect(chain.totalMemories).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getNeighbors', () => {
    it('should get immediate neighbors', async () => {
      memoryStorage.addMemory(createMockMemory('mem_center', 'Center'));
      memoryStorage.addMemory(createMockMemory('mem_in1', 'Incoming 1'));
      memoryStorage.addMemory(createMockMemory('mem_in2', 'Incoming 2'));
      memoryStorage.addMemory(createMockMemory('mem_out1', 'Outgoing 1'));

      await causalStorage.createEdge({ sourceId: 'mem_in1', targetId: 'mem_center', relation: 'caused', strength: 0.9, evidence: [] });
      await causalStorage.createEdge({ sourceId: 'mem_in2', targetId: 'mem_center', relation: 'supports', strength: 0.8, evidence: [] });
      await causalStorage.createEdge({ sourceId: 'mem_center', targetId: 'mem_out1', relation: 'enabled', strength: 0.7, evidence: [] });

      const { incoming, outgoing } = await traverser.getNeighbors('mem_center');

      expect(incoming).toHaveLength(2);
      expect(outgoing).toHaveLength(1);
    });
  });

  describe('chain confidence', () => {
    it('should compute chain confidence from edge strengths', async () => {
      memoryStorage.addMemory(createMockMemory('mem_a', 'Memory A'));
      memoryStorage.addMemory(createMockMemory('mem_b', 'Memory B'));

      await causalStorage.createEdge({ sourceId: 'mem_a', targetId: 'mem_b', relation: 'caused', strength: 0.8, evidence: [] });

      const chain = await traverser.traceEffects('mem_a', { computeConfidence: true });

      expect(chain.chainConfidence).toBeGreaterThan(0);
      expect(chain.chainConfidence).toBeLessThanOrEqual(1);
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

  // Implement other methods as needed for tests
  async initialize(): Promise<void> {}
  async close(): Promise<void> {}
}

function createMockMemory(id: string, summary: string): TribalMemory {
  return {
    id,
    type: 'tribal',
    topic: 'test',
    knowledge: 'Test knowledge',
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
