/**
 * Narrative Generator Tests
 * 
 * Tests for the causal narrative generation functionality.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NarrativeGenerator } from '../../causal/narrative/generator.js';
import {
  RELATION_DESCRIPTIONS,
  getMemoryTypeDescription,
  getConfidenceDescription,
  getStrengthDescription,
  formatRelation,
  generateRelationSentence,
  generateChainNarrative,
  SECTION_TEMPLATES,
} from '../../causal/narrative/templates.js';
import type { CausalChain, CausalNode, CausalEdge, CausalRelation } from '../../types/causal.js';

describe('NarrativeGenerator', () => {
  let generator: NarrativeGenerator;

  beforeEach(() => {
    generator = new NarrativeGenerator();
  });

  describe('generateNarrative', () => {
    it('should generate a narrative from a causal chain', () => {
      const chain = createMockChain({
        rootId: 'mem_1',
        nodes: [
          createMockNode('mem_1', 'Authentication middleware was added', 0),
          createMockNode('mem_2', 'Login validation was implemented', 1),
          createMockNode('mem_3', 'User session management was created', 2),
        ],
        edges: [
          createMockEdge('mem_1', 'mem_2', 'caused'),
          createMockEdge('mem_2', 'mem_3', 'enabled'),
        ],
      });

      const narrative = generator.generateNarrative(chain);

      expect(narrative).toBeDefined();
      expect(narrative.text).toBeDefined();
      expect(typeof narrative.text).toBe('string');
      expect(narrative.text.length).toBeGreaterThan(0);
    });

    it('should handle empty chains', () => {
      const chain = createMockChain({ nodes: [], edges: [] });

      const narrative = generator.generateNarrative(chain);

      expect(narrative).toBeDefined();
      expect(narrative.text).toBeDefined();
      expect(typeof narrative.text).toBe('string');
    });

    it('should handle single-node chains', () => {
      const chain = createMockChain({
        rootId: 'mem_1',
        nodes: [createMockNode('mem_1', 'Single memory', 0)],
        edges: [],
      });

      const narrative = generator.generateNarrative(chain);

      expect(narrative).toBeDefined();
      expect(narrative.text.length).toBeGreaterThan(0);
    });

    it('should include relation descriptions', () => {
      const chain = createMockChain({
        rootId: 'mem_1',
        nodes: [
          createMockNode('mem_1', 'First event', 0),
          createMockNode('mem_2', 'Second event', 1),
        ],
        edges: [createMockEdge('mem_1', 'mem_2', 'caused')],
      });

      const narrative = generator.generateNarrative(chain);

      // Should mention the causal relationship in text or markdown
      expect(narrative.text.toLowerCase() + narrative.markdown.toLowerCase()).toMatch(/caused|led to|resulted in/);
    });
  });

  describe('generateSummary', () => {
    it('should generate a concise summary', () => {
      const chain = createMockChain({
        rootId: 'mem_1',
        nodes: [
          createMockNode('mem_1', 'First', 0),
          createMockNode('mem_2', 'Second', 1),
          createMockNode('mem_3', 'Third', 2),
        ],
        edges: [
          createMockEdge('mem_1', 'mem_2', 'caused'),
          createMockEdge('mem_2', 'mem_3', 'caused'),
        ],
      });

      const narrative = generator.generateNarrative(chain);
      const summary = narrative.summary;

      expect(summary).toBeDefined();
      expect(summary.length).toBeLessThan(500); // Should be concise
    });

    it('should include key statistics', () => {
      const chain = createMockChain({
        rootId: 'mem_1',
        nodes: [
          createMockNode('mem_1', 'First', 0),
          createMockNode('mem_2', 'Second', 1),
        ],
        edges: [createMockEdge('mem_1', 'mem_2', 'caused')],
      });

      const narrative = generator.generateNarrative(chain);
      const summary = narrative.summary;

      // Should mention the number of memories or connections
      expect(summary).toMatch(/\d/);
    });
  });

  describe('formatForMCP', () => {
    it('should format chain for MCP tool output', () => {
      const chain = createMockChain({
        rootId: 'mem_1',
        nodes: [
          createMockNode('mem_1', 'First', 0),
          createMockNode('mem_2', 'Second', 1),
        ],
        edges: [createMockEdge('mem_1', 'mem_2', 'caused')],
      });

      const formatted = generator.formatForMCP(chain);

      expect(formatted).toHaveProperty('narrative');
      expect(formatted).toHaveProperty('summary');
      expect(formatted).toHaveProperty('rootId');
      expect(formatted).toHaveProperty('stats');
    });

    it('should include chain statistics', () => {
      const chain = createMockChain({
        rootId: 'mem_1',
        nodes: [
          createMockNode('mem_1', 'First', 0),
          createMockNode('mem_2', 'Second', 1),
          createMockNode('mem_3', 'Third', 2),
        ],
        edges: [
          createMockEdge('mem_1', 'mem_2', 'caused'),
          createMockEdge('mem_2', 'mem_3', 'enabled'),
        ],
        maxDepth: 2,
        totalMemories: 3,
      });

      const formatted = generator.formatForMCP(chain);

      expect(formatted.stats.totalMemories).toBe(3);
      expect(formatted.stats.maxDepth).toBe(2);
    });

    it('should include chain details when requested', () => {
      const chain = createMockChain({
        rootId: 'mem_1',
        nodes: [
          createMockNode('mem_1', 'First', 0),
          createMockNode('mem_2', 'Second', 1),
        ],
        edges: [createMockEdge('mem_1', 'mem_2', 'caused')],
      });

      const formatted = generator.formatForMCP(chain, true);

      expect(formatted.chain).toBeDefined();
      expect(formatted.chain!.nodes).toHaveLength(2);
      expect(formatted.chain!.edges).toHaveLength(1);
    });
  });
});

describe('Narrative Templates', () => {
  describe('RELATION_DESCRIPTIONS', () => {
    it('should have descriptions for all relation types', () => {
      const relations: CausalRelation[] = [
        'caused', 'enabled', 'prevented', 'contradicts',
        'supersedes', 'supports', 'derived_from', 'triggered_by'
      ];

      relations.forEach(relation => {
        expect(RELATION_DESCRIPTIONS[relation]).toBeDefined();
        expect(RELATION_DESCRIPTIONS[relation].verb).toBeDefined();
        expect(RELATION_DESCRIPTIONS[relation].pastTense).toBeDefined();
        expect(RELATION_DESCRIPTIONS[relation].connector).toBeDefined();
      });
    });
  });

  describe('getMemoryTypeDescription', () => {
    it('should return description for known types', () => {
      expect(getMemoryTypeDescription('tribal')).toBe('tribal knowledge');
      expect(getMemoryTypeDescription('episodic')).toBe('interaction memory');
    });

    it('should return type name for unknown types', () => {
      expect(getMemoryTypeDescription('unknown_type')).toBe('unknown_type');
    });
  });

  describe('getConfidenceDescription', () => {
    it('should return appropriate descriptions', () => {
      expect(getConfidenceDescription(0.95)).toBe('very high confidence');
      expect(getConfidenceDescription(0.75)).toBe('high confidence');
      expect(getConfidenceDescription(0.55)).toBe('moderate confidence');
      expect(getConfidenceDescription(0.35)).toBe('low confidence');
      expect(getConfidenceDescription(0.15)).toBe('very low confidence');
    });
  });

  describe('getStrengthDescription', () => {
    it('should return appropriate descriptions', () => {
      expect(getStrengthDescription(0.95)).toBe('very strong');
      expect(getStrengthDescription(0.75)).toBe('strong');
      expect(getStrengthDescription(0.55)).toBe('moderate');
      expect(getStrengthDescription(0.35)).toBe('weak');
      expect(getStrengthDescription(0.15)).toBe('very weak');
    });
  });

  describe('formatRelation', () => {
    it('should format relations with underscores', () => {
      expect(formatRelation('derived_from')).toBe('derived from');
      expect(formatRelation('triggered_by')).toBe('triggered by');
    });

    it('should leave simple relations unchanged', () => {
      expect(formatRelation('caused')).toBe('caused');
      expect(formatRelation('enabled')).toBe('enabled');
    });
  });

  describe('generateRelationSentence', () => {
    it('should generate a complete sentence', () => {
      const sentence = generateRelationSentence(
        'tribal',
        'Authentication pattern',
        'caused',
        'episodic',
        'Login implementation',
        0.8
      );

      expect(sentence).toContain('Authentication pattern');
      expect(sentence).toContain('Login implementation');
      expect(sentence).toContain('caused');
    });
  });

  describe('generateChainNarrative', () => {
    it('should generate narrative for chain steps', () => {
      const steps = [
        {
          sourceType: 'tribal',
          sourceSummary: 'First step',
          relation: 'caused' as CausalRelation,
          targetType: 'episodic',
          targetSummary: 'Second step',
          strength: 0.8,
        },
      ];

      const narrative = generateChainNarrative(steps);

      expect(narrative).toContain('First step');
      expect(narrative).toContain('Second step');
    });

    it('should handle empty steps', () => {
      const narrative = generateChainNarrative([]);
      expect(narrative).toBe('No causal chain found.');
    });
  });
});

// Helper functions

function createMockChain(overrides: Partial<CausalChain>): CausalChain {
  return {
    rootId: 'mem_root',
    direction: 'effects',
    nodes: [],
    edges: [],
    maxDepth: 0,
    totalMemories: 0,
    chainConfidence: 0.8,
    computedAt: new Date().toISOString(),
    ...overrides,
    totalMemories: overrides.nodes?.length ?? 0,
    maxDepth: Math.max(0, ...(overrides.nodes?.map(n => n.depth) ?? [0])),
  };
}

function createMockNode(memoryId: string, summary: string, depth: number): CausalNode {
  return {
    memoryId,
    memoryType: 'tribal',
    summary,
    depth,
    incomingEdges: [],
    outgoingEdges: [],
  };
}

function createMockEdge(sourceId: string, targetId: string, relation: string): CausalEdge {
  return {
    id: `edge_${sourceId}_${targetId}`,
    sourceId,
    targetId,
    relation: relation as CausalRelation,
    strength: 0.8,
    evidence: [],
    createdAt: new Date().toISOString(),
  };
}
