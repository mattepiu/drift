/**
 * Causal Types Tests
 * 
 * Tests for causal type definitions and validation.
 */

import { describe, it, expect } from 'vitest';
import type {
  CausalRelation,
  CausalEdge,
  CausalChain,
  CausalNode,
  CausalEvidence,
  CausalInferenceResult,
  GraphTraversalOptions,
  CreateCausalEdgeRequest,
  UpdateCausalEdgeRequest,
  CausalGraphStats,
} from '../../types/causal.js';

describe('Causal Types', () => {
  describe('CausalRelation', () => {
    it('should accept valid relation types', () => {
      const validRelations: CausalRelation[] = [
        'caused',
        'enabled',
        'prevented',
        'contradicts',
        'supersedes',
        'supports',
        'derived_from',
        'triggered_by',
      ];

      expect(validRelations).toHaveLength(8);
      validRelations.forEach(relation => {
        expect(typeof relation).toBe('string');
      });
    });
  });

  describe('CausalEdge', () => {
    it('should have required properties', () => {
      const edge: CausalEdge = {
        id: 'edge_1',
        sourceId: 'mem_source',
        targetId: 'mem_target',
        relation: 'caused',
        strength: 0.8,
        evidence: [],
        createdAt: new Date().toISOString(),
        inferred: false,
      };

      expect(edge.id).toBeDefined();
      expect(edge.sourceId).toBeDefined();
      expect(edge.targetId).toBeDefined();
      expect(edge.relation).toBeDefined();
      expect(edge.strength).toBeDefined();
      expect(edge.evidence).toBeDefined();
      expect(edge.createdAt).toBeDefined();
      expect(edge.inferred).toBeDefined();
    });

    it('should allow optional properties', () => {
      const edge: CausalEdge = {
        id: 'edge_1',
        sourceId: 'mem_source',
        targetId: 'mem_target',
        relation: 'caused',
        strength: 0.8,
        evidence: [],
        createdAt: new Date().toISOString(),
        inferred: false,
        validatedAt: new Date().toISOString(),
        createdBy: 'user_123',
      };

      expect(edge.validatedAt).toBeDefined();
      expect(edge.createdBy).toBeDefined();
    });

    it('should enforce strength range', () => {
      const edge: CausalEdge = {
        id: 'edge_1',
        sourceId: 'mem_source',
        targetId: 'mem_target',
        relation: 'caused',
        strength: 0.5,
        evidence: [],
        createdAt: new Date().toISOString(),
        inferred: false,
      };

      expect(edge.strength).toBeGreaterThanOrEqual(0);
      expect(edge.strength).toBeLessThanOrEqual(1);
    });
  });

  describe('CausalEvidence', () => {
    it('should have required properties', () => {
      const evidence: CausalEvidence = {
        type: 'temporal',
        description: 'Events occurred within 5 minutes',
        confidence: 0.8,
        gatheredAt: new Date().toISOString(),
      };

      expect(evidence.type).toBeDefined();
      expect(evidence.description).toBeDefined();
      expect(evidence.confidence).toBeDefined();
      expect(evidence.gatheredAt).toBeDefined();
    });

    it('should accept valid evidence types', () => {
      const types: CausalEvidence['type'][] = [
        'temporal',
        'semantic',
        'entity',
        'explicit',
        'user_confirmed',
      ];

      types.forEach(type => {
        const evidence: CausalEvidence = {
          type,
          description: 'Test',
          confidence: 0.5,
          gatheredAt: new Date().toISOString(),
        };
        expect(evidence.type).toBe(type);
      });
    });
  });

  describe('CausalNode', () => {
    it('should have required properties', () => {
      const node: CausalNode = {
        memoryId: 'mem_1',
        memoryType: 'tribal',
        summary: 'Test memory',
        depth: 0,
        incomingEdges: [],
        outgoingEdges: [],
      };

      expect(node.memoryId).toBeDefined();
      expect(node.memoryType).toBeDefined();
      expect(node.summary).toBeDefined();
      expect(node.depth).toBeDefined();
      expect(node.incomingEdges).toBeDefined();
      expect(node.outgoingEdges).toBeDefined();
    });
  });

  describe('CausalChain', () => {
    it('should have required properties', () => {
      const chain: CausalChain = {
        rootId: 'mem_root',
        direction: 'effects',
        nodes: [],
        edges: [],
        maxDepth: 0,
        totalMemories: 0,
        chainConfidence: 1.0,
        computedAt: new Date().toISOString(),
      };

      expect(chain.rootId).toBeDefined();
      expect(chain.direction).toBeDefined();
      expect(chain.nodes).toBeDefined();
      expect(chain.edges).toBeDefined();
      expect(chain.maxDepth).toBeDefined();
      expect(chain.totalMemories).toBeDefined();
      expect(chain.chainConfidence).toBeDefined();
      expect(chain.computedAt).toBeDefined();
    });

    it('should accept valid direction values', () => {
      const directions: CausalChain['direction'][] = ['origins', 'effects', 'bidirectional'];

      directions.forEach(direction => {
        const chain: CausalChain = {
          rootId: 'mem_root',
          direction,
          nodes: [],
          edges: [],
          maxDepth: 0,
          totalMemories: 0,
          chainConfidence: 1.0,
          computedAt: new Date().toISOString(),
        };
        expect(chain.direction).toBe(direction);
      });
    });
  });

  describe('CausalInferenceResult', () => {
    it('should have required properties', () => {
      const result: CausalInferenceResult = {
        memoryId: 'mem_1',
        inferredEdges: [],
        confidence: 0.8,
        strategiesUsed: ['temporal_proximity', 'semantic_similarity'],
        inferenceTimeMs: 100,
      };

      expect(result.memoryId).toBeDefined();
      expect(result.inferredEdges).toBeDefined();
      expect(result.confidence).toBeDefined();
      expect(result.strategiesUsed).toBeDefined();
      expect(result.inferenceTimeMs).toBeDefined();
    });
  });

  describe('GraphTraversalOptions', () => {
    it('should allow all optional properties', () => {
      const options: GraphTraversalOptions = {
        maxDepth: 5,
        minStrength: 0.3,
        relationTypes: ['caused', 'enabled'],
        includeInferred: true,
        maxNodes: 50,
        computeConfidence: true,
      };

      expect(options.maxDepth).toBe(5);
      expect(options.minStrength).toBe(0.3);
      expect(options.relationTypes).toHaveLength(2);
      expect(options.includeInferred).toBe(true);
      expect(options.maxNodes).toBe(50);
      expect(options.computeConfidence).toBe(true);
    });

    it('should work with empty options', () => {
      const options: GraphTraversalOptions = {};
      expect(options).toBeDefined();
    });
  });

  describe('CreateCausalEdgeRequest', () => {
    it('should have required properties', () => {
      const request: CreateCausalEdgeRequest = {
        sourceId: 'mem_source',
        targetId: 'mem_target',
        relation: 'caused',
        strength: 0.8,
        evidence: [],
      };

      expect(request.sourceId).toBeDefined();
      expect(request.targetId).toBeDefined();
      expect(request.relation).toBeDefined();
      expect(request.strength).toBeDefined();
      expect(request.evidence).toBeDefined();
    });
  });

  describe('UpdateCausalEdgeRequest', () => {
    it('should allow partial updates', () => {
      const update: UpdateCausalEdgeRequest = {
        strength: 0.9,
      };

      expect(update.strength).toBe(0.9);
      expect(update.relation).toBeUndefined();
    });

    it('should allow updating relation', () => {
      const update: UpdateCausalEdgeRequest = {
        relation: 'enabled',
      };

      expect(update.relation).toBe('enabled');
    });
  });

  describe('CausalGraphStats', () => {
    it('should have required properties', () => {
      const stats: CausalGraphStats = {
        totalEdges: 100,
        edgesByRelation: {
          caused: 30,
          enabled: 20,
          prevented: 5,
          contradicts: 5,
          supersedes: 10,
          supports: 20,
          derived_from: 5,
          triggered_by: 5,
        },
        inferredCount: 50,
        explicitCount: 50,
        averageStrength: 0.75,
        connectedComponents: 5,
        mostConnected: [
          { memoryId: 'mem_1', connectionCount: 10 },
        ],
      };

      expect(stats.totalEdges).toBeDefined();
      expect(stats.edgesByRelation).toBeDefined();
      expect(stats.inferredCount).toBeDefined();
      expect(stats.explicitCount).toBeDefined();
      expect(stats.averageStrength).toBeDefined();
      expect(stats.connectedComponents).toBeDefined();
      expect(stats.mostConnected).toBeDefined();
    });
  });
});
