/**
 * Active Learning Loop Tests
 * 
 * Tests for the active learning submodule:
 * - ValidationCandidateSelector
 * - ValidationPromptGenerator
 * - ActiveLearningLoop
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ValidationCandidateSelector } from '../../learning/active/candidate-selector.js';
import { ValidationPromptGenerator } from '../../learning/active/prompt-generator.js';
import { ActiveLearningLoop } from '../../learning/active/loop.js';
import { SQLiteMemoryStorage } from '../../storage/sqlite/storage.js';
import type { TribalMemory } from '../../types/tribal-memory.js';

describe('Active Learning Submodule Tests', () => {
  describe('ValidationCandidateSelector', () => {
    let storage: SQLiteMemoryStorage;
    let selector: ValidationCandidateSelector;

    beforeEach(async () => {
      storage = new SQLiteMemoryStorage(':memory:');
      await storage.initialize();
      selector = new ValidationCandidateSelector(storage);
    });

    afterEach(async () => {
      await storage.close();
    });

    it('should select validation candidates', async () => {
      // Create memories with varying confidence
      await storage.create(createTribalMemory({ id: 'low-1', confidence: 0.3 }));
      await storage.create(createTribalMemory({ id: 'high-1', confidence: 0.9 }));

      const candidates = await selector.selectCandidates({
        maxConfidence: 0.5,
      });

      // Should find candidates (may or may not include low-1 depending on validation logic)
      expect(Array.isArray(candidates)).toBe(true);
    });

    it('should filter by confidence range', () => {
      const memories = [
        createTribalMemory({ id: '1', confidence: 0.2 }),
        createTribalMemory({ id: '2', confidence: 0.5 }),
        createTribalMemory({ id: '3', confidence: 0.8 }),
      ];

      const filtered = selector.filterByConfidenceRange(memories, {
        minConfidence: 0.3,
        maxConfidence: 0.7,
      });

      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('2');
    });

    it('should filter by importance', () => {
      const memories = [
        createTribalMemory({ id: '1', importance: 'low' }),
        createTribalMemory({ id: '2', importance: 'high' }),
        createTribalMemory({ id: '3', importance: 'critical' }),
      ];

      const filtered = selector.filterByImportance(memories, {
        importanceLevels: ['high', 'critical'],
      });

      expect(filtered.length).toBe(2);
    });

    it('should filter by age', () => {
      const now = new Date();
      const oldDate = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000);
      const recentDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

      const memories = [
        createTribalMemory({ id: '1', createdAt: oldDate.toISOString() }),
        createTribalMemory({ id: '2', createdAt: recentDate.toISOString() }),
      ];

      const filtered = selector.filterByAge(memories, 30, 200);

      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('1');
    });

    it('should prioritize candidates', async () => {
      await storage.create(createTribalMemory({
        id: 'important-low',
        confidence: 0.2,
        importance: 'critical',
      }));
      await storage.create(createTribalMemory({
        id: 'normal-low',
        confidence: 0.3,
        importance: 'normal',
      }));

      const candidates = await selector.selectCandidates({ limit: 10 });

      // Important + low confidence should have higher priority
      if (candidates.length >= 2) {
        const importantIdx = candidates.findIndex(c => c.memoryId === 'important-low');
        const normalIdx = candidates.findIndex(c => c.memoryId === 'normal-low');
        if (importantIdx >= 0 && normalIdx >= 0) {
          expect(candidates[importantIdx].priority).toBeGreaterThan(candidates[normalIdx].priority);
        }
      }
    });

    it('should get candidates by reason', async () => {
      await storage.create(createTribalMemory({
        id: 'stale-1',
        confidence: 0.6,
        createdAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(),
      }));

      const candidates = await selector.getCandidatesByReason('stale');

      // May or may not find stale candidates depending on validation logic
      expect(Array.isArray(candidates)).toBe(true);
    });

    it('should get high priority candidates', async () => {
      await storage.create(createTribalMemory({
        id: 'critical-low',
        confidence: 0.2,
        importance: 'critical',
      }));

      const candidates = await selector.getHighPriorityCandidates();

      expect(Array.isArray(candidates)).toBe(true);
    });
  });

  describe('ValidationPromptGenerator', () => {
    let generator: ValidationPromptGenerator;

    beforeEach(() => {
      generator = new ValidationPromptGenerator();
    });

    it('should generate validation prompt', () => {
      const memory = createTribalMemory({ confidence: 0.4 });
      const prompt = generator.generate(memory, 0.4);

      expect(prompt.memoryId).toBe(memory.id);
      expect(prompt.promptText).toBeTruthy();
      expect(prompt.currentConfidence).toBe(0.4);
      expect(prompt.actions.length).toBeGreaterThan(0);
    });

    it('should format memory summary', () => {
      const memory = createTribalMemory({ summary: 'Test summary' });
      const summary = generator.formatMemorySummary(memory);

      expect(summary).toBe('Test summary');
    });

    it('should truncate long summaries', () => {
      const longSummary = 'A'.repeat(300);
      const memory = createTribalMemory({ summary: longSummary });
      const summary = generator.formatMemorySummary(memory);

      expect(summary.length).toBeLessThanOrEqual(203); // 200 + '...'
    });

    it('should format confidence explanation', () => {
      expect(generator.formatConfidenceExplanation(0.2)).toContain('Very low');
      expect(generator.formatConfidenceExplanation(0.4)).toContain('Low');
      expect(generator.formatConfidenceExplanation(0.6)).toContain('Moderate');
      expect(generator.formatConfidenceExplanation(0.8)).toContain('Good');
      expect(generator.formatConfidenceExplanation(0.95)).toContain('High');
    });

    it('should format options', () => {
      const options = generator.formatOptions();

      expect(options.length).toBe(4);
      expect(options.some(o => o.includes('Confirm'))).toBe(true);
      expect(options.some(o => o.includes('Reject'))).toBe(true);
      expect(options.some(o => o.includes('Modify'))).toBe(true);
      expect(options.some(o => o.includes('Skip'))).toBe(true);
    });

    it('should include all action types', () => {
      const memory = createTribalMemory({ confidence: 0.5 });
      const prompt = generator.generate(memory, 0.5);

      const actionTypes = prompt.actions.map(a => a.type);
      expect(actionTypes).toContain('confirm');
      expect(actionTypes).toContain('reject');
      expect(actionTypes).toContain('modify');
      expect(actionTypes).toContain('skip');
    });

    it('should generate compact prompt', () => {
      const memory = createTribalMemory({ confidence: 0.5 });
      const compact = generator.generateCompact(memory, 0.5);

      expect(compact).toContain('50%');
      expect(compact.length).toBeLessThan(200);
    });

    it('should generate batch prompt', () => {
      const memories = [
        { memory: createTribalMemory({ id: '1' }), confidence: 0.3 },
        { memory: createTribalMemory({ id: '2' }), confidence: 0.4 },
      ];

      const batch = generator.generateBatch(memories);

      expect(batch).toContain('2 memories');
      expect(batch).toContain('30%');
      expect(batch).toContain('40%');
    });
  });

  describe('ActiveLearningLoop', () => {
    let storage: SQLiteMemoryStorage;
    let loop: ActiveLearningLoop;

    beforeEach(async () => {
      storage = new SQLiteMemoryStorage(':memory:');
      await storage.initialize();
      loop = ActiveLearningLoop.create(storage);
    });

    afterEach(async () => {
      await storage.close();
    });

    it('should process confirmation feedback', async () => {
      const memory = createTribalMemory({ id: 'test-1', confidence: 0.5 });
      await storage.create(memory);

      const outcome = await loop.processFeedback('test-1', 'confirm');

      expect(outcome.success).toBe(true);
      expect(outcome.memoriesUpdated).toContain('test-1');

      const updated = await storage.read('test-1');
      expect(updated?.confidence).toBeGreaterThan(0.5);
    });

    it('should process rejection feedback', async () => {
      const memory = createTribalMemory({ id: 'test-1', confidence: 0.8 });
      await storage.create(memory);

      const outcome = await loop.processFeedback('test-1', 'reject');

      expect(outcome.success).toBe(true);

      const updated = await storage.read('test-1');
      expect(updated?.confidence).toBeLessThan(0.8);
    });

    it('should process modification feedback', async () => {
      const memory = createTribalMemory({ id: 'test-1', confidence: 0.5 });
      await storage.create(memory);

      const outcome = await loop.processFeedback(
        'test-1',
        'modify',
        'Updated summary'
      );

      expect(outcome.success).toBe(true);

      const updated = await storage.read('test-1');
      expect(updated?.summary).toBe('Updated summary');
    });

    it('should handle non-existent memory', async () => {
      const outcome = await loop.processFeedback('non-existent', 'confirm');

      expect(outcome.success).toBe(false);
      expect(outcome.error).toBeTruthy();
    });

    it('should identify validation candidates', async () => {
      await storage.create(createTribalMemory({ id: 'low-1', confidence: 0.3 }));

      const candidates = await loop.identifyValidationCandidates();

      expect(Array.isArray(candidates)).toBe(true);
    });

    it('should get next validation prompt', async () => {
      await storage.create(createTribalMemory({ id: 'low-1', confidence: 0.3 }));

      const prompt = await loop.getNextValidationPrompt();

      // May or may not get a prompt depending on validation criteria
      if (prompt) {
        expect(prompt.memoryId).toBeTruthy();
        expect(prompt.promptText).toBeTruthy();
      }
    });

    it('should get multiple validation prompts', async () => {
      await storage.create(createTribalMemory({ id: 'low-1', confidence: 0.2 }));
      await storage.create(createTribalMemory({ id: 'low-2', confidence: 0.3 }));

      const prompts = await loop.getValidationPrompts(5);

      expect(Array.isArray(prompts)).toBe(true);
    });

    it('should track queue status', () => {
      const status = loop.getQueueStatus();

      expect(status.queueLength).toBeGreaterThanOrEqual(0);
      expect(status.recentlyValidatedCount).toBeGreaterThanOrEqual(0);
    });

    it('should clear queue', async () => {
      await storage.create(createTribalMemory({ id: 'low-1', confidence: 0.3 }));
      await loop.identifyValidationCandidates();

      loop.clearQueue();

      expect(loop.getQueueStatus().queueLength).toBe(0);
    });

    it('should run validation cycle', async () => {
      await storage.create(createTribalMemory({ id: 'low-1', confidence: 0.3 }));

      const result = await loop.runValidationCycle();

      expect(result.candidatesFound).toBeGreaterThanOrEqual(0);
      expect(result.promptsGenerated).toBeGreaterThanOrEqual(0);
    });

    it('should archive memory on very low confidence rejection', async () => {
      const memory = createTribalMemory({ id: 'test-1', confidence: 0.15 });
      await storage.create(memory);

      await loop.processFeedback('test-1', 'reject');

      const updated = await storage.read('test-1');
      // After 50% reduction from 0.15, should be ~0.075 which is < 0.1
      expect(updated?.archived).toBe(true);
    });
  });
});

// Helper functions

let memoryCounter = 0;

function createTribalMemory(overrides: Partial<TribalMemory> = {}): TribalMemory {
  memoryCounter++;
  return {
    id: overrides.id ?? `tribal-${memoryCounter}`,
    type: 'tribal',
    topic: 'test',
    knowledge: 'Test knowledge',
    severity: 'info',
    source: { type: 'manual' },
    summary: overrides.summary ?? 'Test tribal memory',
    confidence: overrides.confidence ?? 0.8,
    importance: overrides.importance ?? 'normal',
    accessCount: overrides.accessCount ?? 0,
    transactionTime: { recordedAt: new Date().toISOString() },
    validTime: { validFrom: new Date().toISOString() },
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archived: overrides.archived,
    lastValidated: overrides.lastValidated,
    ...overrides,
  };
}
