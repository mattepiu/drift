/**
 * Causal Storage Tests
 * 
 * Tests for the SQLite causal edge storage implementation.
 * Uses an in-memory database for fast, isolated tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SQLiteCausalStorage } from '../../causal/storage/sqlite.js';
import type { CausalRelation, CreateCausalEdgeRequest } from '../../types/causal.js';

describe('SQLiteCausalStorage', () => {
  let db: Database.Database;
  let storage: SQLiteCausalStorage;

  beforeEach(async () => {
    db = new Database(':memory:');
    // Disable foreign key constraints for testing
    db.pragma('foreign_keys = OFF');
    storage = new SQLiteCausalStorage(db);
    await storage.initialize();
  });

  afterEach(async () => {
    await storage.close();
    db.close();
  });

  describe('CRUD operations', () => {
    describe('createEdge', () => {
      it('should create an edge and return its ID', async () => {
        const request = createEdgeRequest({});
        const id = await storage.createEdge(request);

        expect(id).toBeDefined();
        expect(typeof id).toBe('string');
        expect(id).toMatch(/^edge_/);
      });

      it('should store all edge properties', async () => {
        const request = createEdgeRequest({
          sourceId: 'mem_source_1',
          targetId: 'mem_target_1',
          relation: 'caused',
          strength: 0.85,
        });
        const id = await storage.createEdge(request);

        const edge = await storage.getEdge(id);
        expect(edge).not.toBeNull();
        expect(edge!.sourceId).toBe('mem_source_1');
        expect(edge!.targetId).toBe('mem_target_1');
        expect(edge!.relation).toBe('caused');
        expect(edge!.strength).toBe(0.85);
      });

      it('should store evidence array', async () => {
        const request = createEdgeRequest({
          evidence: [
            { type: 'temporal', description: 'Created within 5 minutes', confidence: 0.8 },
            { type: 'semantic', description: 'High similarity', confidence: 0.9 },
          ],
        });
        const id = await storage.createEdge(request);

        const edge = await storage.getEdge(id);
        expect(edge!.evidence).toHaveLength(2);
        expect(edge!.evidence[0]!.type).toBe('temporal');
      });
    });

    describe('getEdge', () => {
      it('should return null for non-existent ID', async () => {
        const edge = await storage.getEdge('non-existent-id');
        expect(edge).toBeNull();
      });

      it('should return the correct edge', async () => {
        const request = createEdgeRequest({ relation: 'supports' });
        const id = await storage.createEdge(request);

        const edge = await storage.getEdge(id);
        expect(edge).not.toBeNull();
        expect(edge!.id).toBe(id);
        expect(edge!.relation).toBe('supports');
      });
    });

    describe('updateEdge', () => {
      it('should update edge strength', async () => {
        const id = await storage.createEdge(createEdgeRequest({ strength: 0.5 }));

        await storage.updateEdge(id, { strength: 0.9 });

        const edge = await storage.getEdge(id);
        expect(edge!.strength).toBe(0.9);
      });
    });

    describe('deleteEdge', () => {
      it('should delete an edge', async () => {
        const id = await storage.createEdge(createEdgeRequest({}));

        await storage.deleteEdge(id);

        const edge = await storage.getEdge(id);
        expect(edge).toBeNull();
      });
    });
  });

  describe('bulk operations', () => {
    describe('bulkCreateEdges', () => {
      it('should create multiple edges', async () => {
        const requests = [
          createEdgeRequest({ sourceId: 'mem_1', targetId: 'mem_2' }),
          createEdgeRequest({ sourceId: 'mem_2', targetId: 'mem_3' }),
          createEdgeRequest({ sourceId: 'mem_3', targetId: 'mem_4' }),
        ];

        const result = await storage.bulkCreateEdges(requests);

        expect(result.successful).toBe(3);
        expect(result.failed).toBe(0);
        expect(result.ids).toHaveLength(3);
      });
    });

    describe('bulkDeleteEdges', () => {
      it('should delete multiple edges', async () => {
        const id1 = await storage.createEdge(createEdgeRequest({}));
        const id2 = await storage.createEdge(createEdgeRequest({}));

        const result = await storage.bulkDeleteEdges([id1, id2]);

        expect(result.successful).toBe(2);
        expect(await storage.getEdge(id1)).toBeNull();
        expect(await storage.getEdge(id2)).toBeNull();
      });
    });
  });

  describe('query operations', () => {
    describe('getEdgesFrom', () => {
      it('should get all edges from a source', async () => {
        await storage.createEdge(createEdgeRequest({ sourceId: 'mem_source', targetId: 'mem_1' }));
        await storage.createEdge(createEdgeRequest({ sourceId: 'mem_source', targetId: 'mem_2' }));
        await storage.createEdge(createEdgeRequest({ sourceId: 'mem_other', targetId: 'mem_3' }));

        const edges = await storage.getEdgesFrom('mem_source');

        expect(edges).toHaveLength(2);
        expect(edges.every(e => e.sourceId === 'mem_source')).toBe(true);
      });

      it('should filter by minimum strength', async () => {
        await storage.createEdge(createEdgeRequest({ sourceId: 'mem_s', targetId: 'mem_1', strength: 0.3 }));
        await storage.createEdge(createEdgeRequest({ sourceId: 'mem_s', targetId: 'mem_2', strength: 0.7 }));
        await storage.createEdge(createEdgeRequest({ sourceId: 'mem_s', targetId: 'mem_3', strength: 0.9 }));

        const edges = await storage.getEdgesFrom('mem_s', { minStrength: 0.5 });

        expect(edges).toHaveLength(2);
        expect(edges.every(e => e.strength >= 0.5)).toBe(true);
      });

      it('should filter by relation types', async () => {
        await storage.createEdge(createEdgeRequest({ sourceId: 'mem_s', targetId: 'mem_1', relation: 'caused' }));
        await storage.createEdge(createEdgeRequest({ sourceId: 'mem_s', targetId: 'mem_2', relation: 'supports' }));
        await storage.createEdge(createEdgeRequest({ sourceId: 'mem_s', targetId: 'mem_3', relation: 'contradicts' }));

        const edges = await storage.getEdgesFrom('mem_s', { relationTypes: ['caused', 'supports'] });

        expect(edges).toHaveLength(2);
        expect(edges.every(e => e.relation === 'caused' || e.relation === 'supports')).toBe(true);
      });
    });

    describe('getEdgesTo', () => {
      it('should get all edges to a target', async () => {
        await storage.createEdge(createEdgeRequest({ sourceId: 'mem_1', targetId: 'mem_target' }));
        await storage.createEdge(createEdgeRequest({ sourceId: 'mem_2', targetId: 'mem_target' }));
        await storage.createEdge(createEdgeRequest({ sourceId: 'mem_3', targetId: 'mem_other' }));

        const edges = await storage.getEdgesTo('mem_target');

        expect(edges).toHaveLength(2);
        expect(edges.every(e => e.targetId === 'mem_target')).toBe(true);
      });
    });

    describe('getEdgesFor', () => {
      it('should get all edges involving a memory (both directions)', async () => {
        await storage.createEdge(createEdgeRequest({ sourceId: 'mem_center', targetId: 'mem_1' }));
        await storage.createEdge(createEdgeRequest({ sourceId: 'mem_2', targetId: 'mem_center' }));
        await storage.createEdge(createEdgeRequest({ sourceId: 'mem_3', targetId: 'mem_4' }));

        const edges = await storage.getEdgesFor('mem_center');

        expect(edges).toHaveLength(2);
      });
    });

    describe('getEdgeBetween', () => {
      it('should get edge between two specific memories', async () => {
        await storage.createEdge(createEdgeRequest({ 
          sourceId: 'mem_a', 
          targetId: 'mem_b', 
          relation: 'caused' 
        }));

        const edge = await storage.getEdgeBetween('mem_a', 'mem_b');

        expect(edge).not.toBeNull();
        expect(edge!.sourceId).toBe('mem_a');
        expect(edge!.targetId).toBe('mem_b');
      });

      it('should return null if no edge exists', async () => {
        const edge = await storage.getEdgeBetween('mem_x', 'mem_y');
        expect(edge).toBeNull();
      });

      it('should filter by relation type', async () => {
        await storage.createEdge(createEdgeRequest({ 
          sourceId: 'mem_a', 
          targetId: 'mem_b', 
          relation: 'caused' 
        }));

        const edge = await storage.getEdgeBetween('mem_a', 'mem_b', 'supports');
        expect(edge).toBeNull();
      });
    });

    describe('findByRelation', () => {
      it('should find all edges of a specific relation type', async () => {
        await storage.createEdge(createEdgeRequest({ relation: 'caused' }));
        await storage.createEdge(createEdgeRequest({ relation: 'caused' }));
        await storage.createEdge(createEdgeRequest({ relation: 'supports' }));

        const edges = await storage.findByRelation('caused');

        expect(edges).toHaveLength(2);
        expect(edges.every(e => e.relation === 'caused')).toBe(true);
      });
    });
  });

  describe('strength operations', () => {
    describe('updateStrength', () => {
      it('should update edge strength', async () => {
        const id = await storage.createEdge(createEdgeRequest({ strength: 0.5 }));

        await storage.updateStrength(id, 0.8);

        const edge = await storage.getEdge(id);
        expect(edge!.strength).toBe(0.8);
      });
    });

    describe('incrementStrength', () => {
      it('should increment edge strength', async () => {
        const id = await storage.createEdge(createEdgeRequest({ strength: 0.5 }));

        await storage.incrementStrength(id, 0.2);

        const edge = await storage.getEdge(id);
        expect(edge!.strength).toBe(0.7);
      });

      it('should respect max strength cap', async () => {
        const id = await storage.createEdge(createEdgeRequest({ strength: 0.9 }));

        await storage.incrementStrength(id, 0.5, 1.0);

        const edge = await storage.getEdge(id);
        expect(edge!.strength).toBe(1.0);
      });
    });

    describe('decayStrengths', () => {
      it('should decay all edge strengths', async () => {
        await storage.createEdge(createEdgeRequest({ strength: 1.0 }));
        await storage.createEdge(createEdgeRequest({ strength: 0.8 }));

        const affected = await storage.decayStrengths(0.9);

        expect(affected).toBe(2);
        
        const edges = await storage.findByRelation('caused');
        expect(edges[0]!.strength).toBeCloseTo(0.9, 2);
        expect(edges[1]!.strength).toBeCloseTo(0.72, 2);
      });
    });
  });

  describe('validation operations', () => {
    describe('markValidated', () => {
      it('should mark edge as validated', async () => {
        const id = await storage.createEdge(createEdgeRequest({}));

        await storage.markValidated(id, 'user-123');

        const edge = await storage.getEdge(id);
        expect(edge!.validatedAt).toBeDefined();
        // Note: validatedBy is not stored in current implementation
      });
    });

    describe('getUnvalidatedEdges', () => {
      it('should return only unvalidated edges', async () => {
        const id1 = await storage.createEdge(createEdgeRequest({}));
        const id2 = await storage.createEdge(createEdgeRequest({}));
        await storage.markValidated(id1);

        const unvalidated = await storage.getUnvalidatedEdges();

        expect(unvalidated).toHaveLength(1);
        expect(unvalidated[0]!.id).toBe(id2);
      });
    });
  });

  describe('statistics', () => {
    describe('getStats', () => {
      it('should return graph statistics', async () => {
        await storage.createEdge(createEdgeRequest({ relation: 'caused', strength: 0.8 }));
        await storage.createEdge(createEdgeRequest({ relation: 'caused', strength: 0.6 }));
        await storage.createEdge(createEdgeRequest({ relation: 'supports', strength: 0.9 }));

        const stats = await storage.getStats();

        expect(stats.totalEdges).toBe(3);
        expect(stats.edgesByRelation.caused).toBe(2);
        expect(stats.edgesByRelation.supports).toBe(1);
        expect(stats.averageStrength).toBeCloseTo(0.767, 2);
      });
    });

    describe('countEdges', () => {
      it('should count all edges', async () => {
        await storage.createEdge(createEdgeRequest({}));
        await storage.createEdge(createEdgeRequest({}));
        await storage.createEdge(createEdgeRequest({}));

        const count = await storage.countEdges();
        expect(count).toBe(3);
      });

      it('should count with filters', async () => {
        await storage.createEdge(createEdgeRequest({ strength: 0.3 }));
        await storage.createEdge(createEdgeRequest({ strength: 0.7 }));

        const count = await storage.countEdges({ minStrength: 0.5 });
        expect(count).toBe(1);
      });
    });

    describe('getMostConnected', () => {
      it('should return most connected memories', async () => {
        // mem_hub has 3 connections
        await storage.createEdge(createEdgeRequest({ sourceId: 'mem_hub', targetId: 'mem_1' }));
        await storage.createEdge(createEdgeRequest({ sourceId: 'mem_hub', targetId: 'mem_2' }));
        await storage.createEdge(createEdgeRequest({ sourceId: 'mem_3', targetId: 'mem_hub' }));
        // mem_other has 1 connection
        await storage.createEdge(createEdgeRequest({ sourceId: 'mem_other', targetId: 'mem_4' }));

        const mostConnected = await storage.getMostConnected(2);

        expect(mostConnected).toHaveLength(2);
        expect(mostConnected[0]!.memoryId).toBe('mem_hub');
        expect(mostConnected[0]!.connectionCount).toBe(3);
      });
    });
  });

  describe('cleanup operations', () => {
    describe('deleteEdgesForMemory', () => {
      it('should delete all edges for a memory', async () => {
        await storage.createEdge(createEdgeRequest({ sourceId: 'mem_del', targetId: 'mem_1' }));
        await storage.createEdge(createEdgeRequest({ sourceId: 'mem_2', targetId: 'mem_del' }));
        await storage.createEdge(createEdgeRequest({ sourceId: 'mem_3', targetId: 'mem_4' }));

        const deleted = await storage.deleteEdgesForMemory('mem_del');

        expect(deleted).toBe(2);
        expect(await storage.countEdges()).toBe(1);
      });
    });

    describe('deleteWeakEdges', () => {
      it('should delete edges below strength threshold', async () => {
        await storage.createEdge(createEdgeRequest({ strength: 0.1 }));
        await storage.createEdge(createEdgeRequest({ strength: 0.3 }));
        await storage.createEdge(createEdgeRequest({ strength: 0.8 }));

        const deleted = await storage.deleteWeakEdges(0.5);

        expect(deleted).toBe(2);
        expect(await storage.countEdges()).toBe(1);
      });
    });
  });
});

// Helper functions

let edgeCounter = 0;

function createEdgeRequest(overrides: Partial<CreateCausalEdgeRequest>): CreateCausalEdgeRequest {
  edgeCounter++;
  return {
    sourceId: `mem_source_${edgeCounter}`,
    targetId: `mem_target_${edgeCounter}`,
    relation: 'caused' as CausalRelation,
    strength: 0.8,
    evidence: [],
    ...overrides,
  };
}
