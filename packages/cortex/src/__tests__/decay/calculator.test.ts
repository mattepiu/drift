/**
 * Decay Calculator Tests
 * 
 * Tests for the multi-factor confidence decay calculation system.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DecayCalculator, type DecayFactors } from '../../decay/calculator.js';
import type { Memory, TribalMemory, CoreMemory, EpisodicMemory } from '../../types/index.js';

describe('DecayCalculator', () => {
  let calculator: DecayCalculator;

  beforeEach(() => {
    calculator = new DecayCalculator();
  });

  describe('calculate', () => {
    it('should return all decay factors', () => {
      const memory = createTribalMemory({
        createdAt: new Date().toISOString(),
        confidence: 1.0,
        accessCount: 5,
        importance: 'normal',
      });

      const factors = calculator.calculate(memory);

      expect(factors).toHaveProperty('temporalDecay');
      expect(factors).toHaveProperty('citationDecay');
      expect(factors).toHaveProperty('usageBoost');
      expect(factors).toHaveProperty('importanceAnchor');
      expect(factors).toHaveProperty('patternBoost');
      expect(factors).toHaveProperty('finalConfidence');
    });

    it('should not decay core memories (infinite half-life)', () => {
      const memory = createCoreMemory({
        createdAt: daysAgo(365), // 1 year old
        confidence: 1.0,
        accessCount: 0,
        importance: 'critical',
      });

      const factors = calculator.calculate(memory);

      expect(factors.temporalDecay).toBe(1.0);
      expect(factors.finalConfidence).toBeGreaterThan(0.9);
    });

    it('should decay episodic memories quickly (7-day half-life)', () => {
      const memory = createEpisodicMemory({
        createdAt: daysAgo(14), // 2 weeks old
        confidence: 1.0,
        accessCount: 0,
        importance: 'normal',
      });

      const factors = calculator.calculate(memory);

      // After 2 half-lives, should be ~25% of original
      expect(factors.temporalDecay).toBeLessThan(0.3);
    });

    it('should decay tribal memories slowly (365-day half-life)', () => {
      const memory = createTribalMemory({
        createdAt: daysAgo(180), // 6 months old
        confidence: 1.0,
        accessCount: 0,
        importance: 'normal',
      });

      const factors = calculator.calculate(memory);

      // After half a half-life, should be ~70% of original
      expect(factors.temporalDecay).toBeGreaterThan(0.6);
    });
  });

  describe('temporal decay', () => {
    it('should return 1.0 for freshly created memories', () => {
      const memory = createTribalMemory({
        createdAt: new Date().toISOString(),
        confidence: 1.0,
        accessCount: 0,
        importance: 'normal',
      });

      const factors = calculator.calculate(memory);

      expect(factors.temporalDecay).toBeCloseTo(1.0, 1);
    });

    it('should use lastAccessed if available', () => {
      const memory = createTribalMemory({
        createdAt: daysAgo(365),
        lastAccessed: new Date().toISOString(), // Just accessed
        confidence: 1.0,
        accessCount: 10,
        importance: 'normal',
      });

      const factors = calculator.calculate(memory);

      // Should use lastAccessed, not createdAt
      expect(factors.temporalDecay).toBeCloseTo(1.0, 1);
    });
  });

  describe('citation decay', () => {
    it('should return 1.0 for memories without citations', () => {
      const memory = createTribalMemory({
        createdAt: new Date().toISOString(),
        confidence: 1.0,
        accessCount: 0,
        importance: 'normal',
      });

      const factors = calculator.calculate(memory);

      expect(factors.citationDecay).toBe(1.0);
    });

    it('should calculate decay based on valid citations ratio', () => {
      const memory = createTribalMemory({
        createdAt: new Date().toISOString(),
        confidence: 1.0,
        accessCount: 0,
        importance: 'normal',
        citations: [
          { file: 'a.ts', lineStart: 1, lineEnd: 10, hash: 'abc', valid: true },
          { file: 'b.ts', lineStart: 1, lineEnd: 10, hash: 'def', valid: false },
        ],
      });

      const factors = calculator.calculate(memory);

      // 1 valid out of 2 = 0.5
      expect(factors.citationDecay).toBe(0.5);
    });

    it('should return 1.0 for all valid citations', () => {
      const memory = createTribalMemory({
        createdAt: new Date().toISOString(),
        confidence: 1.0,
        accessCount: 0,
        importance: 'normal',
        citations: [
          { file: 'a.ts', lineStart: 1, lineEnd: 10, hash: 'abc', valid: true },
          { file: 'b.ts', lineStart: 1, lineEnd: 10, hash: 'def', valid: true },
        ],
      });

      const factors = calculator.calculate(memory);

      expect(factors.citationDecay).toBe(1.0);
    });
  });

  describe('usage boost', () => {
    it('should return 1.0 for zero access count', () => {
      const memory = createTribalMemory({
        createdAt: new Date().toISOString(),
        confidence: 1.0,
        accessCount: 0,
        importance: 'normal',
      });

      const factors = calculator.calculate(memory);

      // log10(0 + 1) * 0.2 + 1 = 1.0
      expect(factors.usageBoost).toBeCloseTo(1.0, 2);
    });

    it('should increase with access count', () => {
      const lowAccess = createTribalMemory({
        createdAt: new Date().toISOString(),
        confidence: 1.0,
        accessCount: 1,
        importance: 'normal',
      });

      const highAccess = createTribalMemory({
        createdAt: new Date().toISOString(),
        confidence: 1.0,
        accessCount: 100,
        importance: 'normal',
      });

      const lowFactors = calculator.calculate(lowAccess);
      const highFactors = calculator.calculate(highAccess);

      expect(highFactors.usageBoost).toBeGreaterThan(lowFactors.usageBoost);
    });

    it('should cap at 1.5', () => {
      const memory = createTribalMemory({
        createdAt: new Date().toISOString(),
        confidence: 1.0,
        accessCount: 1000000, // Very high access
        importance: 'normal',
      });

      const factors = calculator.calculate(memory);

      expect(factors.usageBoost).toBeLessThanOrEqual(1.5);
    });
  });

  describe('importance anchor', () => {
    it('should return 2.0 for critical importance', () => {
      const memory = createTribalMemory({
        createdAt: new Date().toISOString(),
        confidence: 1.0,
        accessCount: 0,
        importance: 'critical',
      });

      const factors = calculator.calculate(memory);

      expect(factors.importanceAnchor).toBe(2.0);
    });

    it('should return 1.5 for high importance', () => {
      const memory = createTribalMemory({
        createdAt: new Date().toISOString(),
        confidence: 1.0,
        accessCount: 0,
        importance: 'high',
      });

      const factors = calculator.calculate(memory);

      expect(factors.importanceAnchor).toBe(1.5);
    });

    it('should return 1.0 for normal importance', () => {
      const memory = createTribalMemory({
        createdAt: new Date().toISOString(),
        confidence: 1.0,
        accessCount: 0,
        importance: 'normal',
      });

      const factors = calculator.calculate(memory);

      expect(factors.importanceAnchor).toBe(1.0);
    });

    it('should return 0.8 for low importance', () => {
      const memory = createTribalMemory({
        createdAt: new Date().toISOString(),
        confidence: 1.0,
        accessCount: 0,
        importance: 'low',
      });

      const factors = calculator.calculate(memory);

      expect(factors.importanceAnchor).toBe(0.8);
    });
  });

  describe('pattern boost', () => {
    it('should return 1.0 for memories without linked patterns', () => {
      const memory = createTribalMemory({
        createdAt: new Date().toISOString(),
        confidence: 1.0,
        accessCount: 0,
        importance: 'normal',
        linkedPatterns: [],
      });

      const factors = calculator.calculate(memory);

      expect(factors.patternBoost).toBe(1.0);
    });

    it('should return 1.3 for memories with linked patterns', () => {
      const memory = createTribalMemory({
        createdAt: new Date().toISOString(),
        confidence: 1.0,
        accessCount: 0,
        importance: 'normal',
        linkedPatterns: ['pattern-1', 'pattern-2'],
      });

      const factors = calculator.calculate(memory);

      expect(factors.patternBoost).toBe(1.3);
    });
  });

  describe('final confidence', () => {
    it('should cap at 1.0', () => {
      const memory = createTribalMemory({
        createdAt: new Date().toISOString(),
        confidence: 1.0,
        accessCount: 1000,
        importance: 'critical',
        linkedPatterns: ['pattern-1'],
      });

      const factors = calculator.calculate(memory);

      expect(factors.finalConfidence).toBeLessThanOrEqual(1.0);
    });

    it('should combine all factors correctly', () => {
      const memory = createTribalMemory({
        createdAt: daysAgo(30),
        confidence: 0.8,
        accessCount: 10,
        importance: 'high',
        linkedPatterns: ['pattern-1'],
      });

      const factors = calculator.calculate(memory);

      // Final = confidence * temporal * citation * usage * importance * pattern
      const expected = 0.8 * factors.temporalDecay * factors.citationDecay * 
                       factors.usageBoost * factors.importanceAnchor * factors.patternBoost;

      expect(factors.finalConfidence).toBeCloseTo(Math.min(1.0, expected), 2);
    });
  });
});

// Helper functions

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function createTribalMemory(overrides: Partial<TribalMemory> & {
  citations?: Array<{ file: string; lineStart: number; lineEnd: number; hash: string; valid?: boolean }>;
}): TribalMemory {
  const { citations, ...rest } = overrides;
  const memory: TribalMemory = {
    id: 'test-tribal-1',
    type: 'tribal',
    topic: 'test-topic',
    knowledge: 'Test knowledge',
    severity: 'warning',
    summary: 'Test summary',
    confidence: 1.0,
    importance: 'normal',
    accessCount: 0,
    transactionTime: { recordedAt: new Date().toISOString() },
    validTime: { validFrom: new Date().toISOString() },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...rest,
  };

  if (citations) {
    (memory as any).citations = citations;
  }

  return memory;
}

function createCoreMemory(overrides: Partial<CoreMemory>): CoreMemory {
  return {
    id: 'test-core-1',
    type: 'core',
    project: {
      name: 'Test Project',
      techStack: ['TypeScript'],
      primaryLanguage: 'TypeScript',
      frameworks: ['Express'],
    },
    conventions: {},
    criticalConstraints: [],
    preferences: { verbosity: 'normal' },
    summary: 'Core memory',
    confidence: 1.0,
    importance: 'critical',
    accessCount: 0,
    transactionTime: { recordedAt: new Date().toISOString() },
    validTime: { validFrom: new Date().toISOString() },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createEpisodicMemory(overrides: Partial<EpisodicMemory>): EpisodicMemory {
  return {
    id: 'test-episodic-1',
    type: 'episodic',
    sessionId: 'session-1',
    context: {
      intent: 'add_feature',
      focus: 'test',
    },
    interaction: {
      userQuery: 'Test query',
      agentResponse: 'Test response',
      outcome: 'accepted',
    },
    summary: 'Episodic memory',
    confidence: 1.0,
    importance: 'normal',
    accessCount: 0,
    transactionTime: { recordedAt: new Date().toISOString() },
    validTime: { validFrom: new Date().toISOString() },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    consolidationStatus: 'pending',
    ...overrides,
  };
}
