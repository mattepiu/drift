/**
 * Temporal Validator Tests
 * 
 * Tests for the time-based memory staleness validation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TemporalValidator } from '../../validation/temporal-validator.js';
import type { TribalMemory, EpisodicMemory, CoreMemory, SemanticMemory } from '../../types/index.js';

describe('TemporalValidator', () => {
  let validator: TemporalValidator;

  beforeEach(() => {
    validator = new TemporalValidator();
  });

  describe('validate', () => {
    it('should return no issues for fresh memories', () => {
      const memory = createTribalMemory({
        createdAt: new Date().toISOString(),
        lastValidated: new Date().toISOString(),
        lastAccessed: new Date().toISOString(),
      });

      const issues = validator.validate(memory);

      expect(issues).toEqual([]);
    });

    it('should flag memories not validated recently', () => {
      const memory = createTribalMemory({
        createdAt: daysAgo(180),
        lastValidated: daysAgo(100), // Over 90-day threshold for tribal
        lastAccessed: new Date().toISOString(),
      });

      const issues = validator.validate(memory);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0]!.dimension).toBe('temporal');
      expect(issues[0]!.description).toContain('not validated');
    });

    it('should flag dormant memories', () => {
      const memory = createTribalMemory({
        createdAt: daysAgo(400),
        lastValidated: new Date().toISOString(),
        lastAccessed: daysAgo(400), // Over 365-day half-life for tribal
      });

      const issues = validator.validate(memory);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.description.includes('not accessed'))).toBe(true);
    });
  });

  describe('validation thresholds by type', () => {
    it('should use 365-day threshold for core memories', () => {
      const memory = createCoreMemory({
        createdAt: daysAgo(400),
        lastValidated: daysAgo(300), // Under 365-day threshold
        lastAccessed: new Date().toISOString(),
      });

      const issues = validator.validate(memory);

      // Should not flag validation staleness (under threshold)
      const validationIssues = issues.filter(i => i.description.includes('not validated'));
      expect(validationIssues.length).toBe(0);
    });

    it('should use 7-day threshold for episodic memories', () => {
      const memory = createEpisodicMemory({
        createdAt: daysAgo(10),
        lastValidated: daysAgo(10), // Over 7-day threshold
        lastAccessed: new Date().toISOString(),
      });

      const issues = validator.validate(memory);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0]!.description).toContain('not validated');
    });

    it('should use 30-day threshold for semantic memories', () => {
      const memory = createSemanticMemory({
        createdAt: daysAgo(60),
        lastValidated: daysAgo(35), // Over 30-day threshold
        lastAccessed: new Date().toISOString(),
      });

      const issues = validator.validate(memory);

      expect(issues.length).toBeGreaterThan(0);
    });
  });

  describe('severity levels', () => {
    it('should return minor severity for slightly stale memories', () => {
      const memory = createTribalMemory({
        createdAt: daysAgo(100),
        lastValidated: daysAgo(100), // Just over 90-day threshold
        lastAccessed: new Date().toISOString(),
      });

      const issues = validator.validate(memory);

      expect(issues[0]!.severity).toBe('minor');
    });

    it('should return moderate severity for very stale memories', () => {
      const memory = createTribalMemory({
        createdAt: daysAgo(200),
        lastValidated: daysAgo(200), // Over 2x threshold (180 days)
        lastAccessed: new Date().toISOString(),
      });

      const issues = validator.validate(memory);

      expect(issues[0]!.severity).toBe('moderate');
    });
  });

  describe('dormancy detection', () => {
    it('should not flag dormancy for core memories (infinite half-life)', () => {
      const memory = createCoreMemory({
        createdAt: daysAgo(1000),
        lastValidated: new Date().toISOString(),
        lastAccessed: daysAgo(1000), // Very old but core never goes dormant
      });

      const issues = validator.validate(memory);

      const dormancyIssues = issues.filter(i => i.description.includes('not accessed'));
      expect(dormancyIssues.length).toBe(0);
    });

    it('should flag dormancy for episodic memories after 7 days', () => {
      const memory = createEpisodicMemory({
        createdAt: daysAgo(14),
        lastValidated: new Date().toISOString(),
        lastAccessed: daysAgo(14), // Over 7-day half-life
      });

      const issues = validator.validate(memory);

      expect(issues.some(i => i.description.includes('not accessed'))).toBe(true);
    });
  });

  describe('suggestions', () => {
    it('should suggest re-validation for stale memories', () => {
      const memory = createTribalMemory({
        createdAt: daysAgo(100),
        lastValidated: daysAgo(100),
        lastAccessed: new Date().toISOString(),
      });

      const issues = validator.validate(memory);

      expect(issues[0]!.suggestion).toContain('Re-validate');
    });

    it('should suggest archiving for dormant memories', () => {
      const memory = createTribalMemory({
        createdAt: daysAgo(400),
        lastValidated: new Date().toISOString(),
        lastAccessed: daysAgo(400),
      });

      const issues = validator.validate(memory);

      const dormancyIssue = issues.find(i => i.description.includes('not accessed'));
      expect(dormancyIssue?.suggestion).toContain('archiving');
    });
  });

  describe('edge cases', () => {
    it('should use createdAt when lastValidated is missing', () => {
      const memory = createTribalMemory({
        createdAt: daysAgo(100),
        lastValidated: undefined,
        lastAccessed: new Date().toISOString(),
      });

      const issues = validator.validate(memory);

      expect(issues.length).toBeGreaterThan(0);
    });

    it('should use createdAt when lastAccessed is missing', () => {
      const memory = createTribalMemory({
        createdAt: daysAgo(400),
        lastValidated: new Date().toISOString(),
        lastAccessed: undefined,
      });

      const issues = validator.validate(memory);

      expect(issues.some(i => i.description.includes('not accessed'))).toBe(true);
    });

    it('should handle future dates gracefully', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      const memory = createTribalMemory({
        createdAt: futureDate.toISOString(),
        lastValidated: futureDate.toISOString(),
        lastAccessed: futureDate.toISOString(),
      });

      // Should not throw
      const issues = validator.validate(memory);
      expect(Array.isArray(issues)).toBe(true);
    });
  });
});

// Helper functions

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function createTribalMemory(overrides: {
  createdAt?: string;
  lastValidated?: string;
  lastAccessed?: string;
}): TribalMemory {
  return {
    id: 'test-tribal-1',
    type: 'tribal',
    topic: 'test-topic',
    knowledge: 'Test knowledge',
    severity: 'warning',
    summary: 'Test summary',
    confidence: 1.0,
    importance: 'normal',
    accessCount: 5,
    transactionTime: { recordedAt: new Date().toISOString() },
    validTime: { validFrom: new Date().toISOString() },
    createdAt: overrides.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastValidated: overrides.lastValidated,
    lastAccessed: overrides.lastAccessed,
  };
}

function createCoreMemory(overrides: {
  createdAt?: string;
  lastValidated?: string;
  lastAccessed?: string;
}): CoreMemory {
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
    createdAt: overrides.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastValidated: overrides.lastValidated,
    lastAccessed: overrides.lastAccessed,
  };
}

function createEpisodicMemory(overrides: {
  createdAt?: string;
  lastValidated?: string;
  lastAccessed?: string;
}): EpisodicMemory {
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
    createdAt: overrides.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    consolidationStatus: 'pending',
    lastValidated: overrides.lastValidated,
    lastAccessed: overrides.lastAccessed,
  };
}

function createSemanticMemory(overrides: {
  createdAt?: string;
  lastValidated?: string;
  lastAccessed?: string;
}): SemanticMemory {
  return {
    id: 'test-semantic-1',
    type: 'semantic',
    topic: 'test-topic',
    knowledge: 'Test semantic knowledge',
    summary: 'Test summary',
    confidence: 0.8,
    importance: 'normal',
    accessCount: 5,
    supportingEvidence: 3,
    contradictingEvidence: 0,
    transactionTime: { recordedAt: new Date().toISOString() },
    validTime: { validFrom: new Date().toISOString() },
    createdAt: overrides.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastValidated: overrides.lastValidated,
    lastAccessed: overrides.lastAccessed,
  };
}
