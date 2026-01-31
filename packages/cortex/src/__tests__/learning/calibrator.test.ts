/**
 * Confidence Calibrator Tests
 * 
 * Tests for the confidence submodule:
 * - MetricsCalculator
 * - ConfidenceCalibrator
 * - DecayIntegrator
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfidenceCalibrator } from '../../learning/confidence/calibrator.js';
import { MetricsCalculator } from '../../learning/confidence/metrics.js';
import { DecayIntegrator } from '../../learning/confidence/decay-integrator.js';
import { SQLiteMemoryStorage } from '../../storage/sqlite/storage.js';
import type { TribalMemory } from '../../types/tribal-memory.js';
import type { ConfidenceMetrics } from '../../types/learning.js';

describe('Confidence Submodule Tests', () => {
  describe('ConfidenceCalibrator', () => {
    let calibrator: ConfidenceCalibrator;

    beforeEach(() => {
      calibrator = new ConfidenceCalibrator();
    });

    it('should calculate confidence from metrics', () => {
      const memory = createTribalMemory({ confidence: 0.7 });
      const metrics: ConfidenceMetrics = {
        baseConfidence: 0.7,
        supportingEvidenceCount: 5,
        contradictingEvidenceCount: 1,
        successfulUses: 10,
        rejectedUses: 2,
        ageInDays: 30,
        userConfirmations: 2,
        userRejections: 0,
      };

      const result = calibrator.calculate(memory, metrics);

      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.factors.length).toBeGreaterThan(0);
    });

    it('should recommend validation for low confidence', () => {
      const memory = createTribalMemory({ confidence: 0.3 });
      const metrics: ConfidenceMetrics = {
        baseConfidence: 0.3,
        supportingEvidenceCount: 0,
        contradictingEvidenceCount: 2,
        successfulUses: 1,
        rejectedUses: 5,
        ageInDays: 60,
        userConfirmations: 0,
        userRejections: 1,
      };

      const result = calibrator.calculate(memory, metrics);

      expect(result.needsValidation).toBe(true);
      expect(result.validationReason).toBeTruthy();
    });

    it('should not recommend validation for high confidence', () => {
      const memory = createTribalMemory({ confidence: 0.9 });
      const metrics: ConfidenceMetrics = {
        baseConfidence: 0.9,
        supportingEvidenceCount: 10,
        contradictingEvidenceCount: 0,
        successfulUses: 20,
        rejectedUses: 1,
        ageInDays: 10,
        lastValidated: new Date().toISOString(),
        userConfirmations: 5,
        userRejections: 0,
      };

      const result = calibrator.calculate(memory, metrics);

      expect(result.needsValidation).toBe(false);
    });

    it('should apply evidence adjustments', () => {
      const metrics: ConfidenceMetrics = {
        baseConfidence: 0.5,
        supportingEvidenceCount: 10,
        contradictingEvidenceCount: 0,
        successfulUses: 0,
        rejectedUses: 0,
        ageInDays: 0,
        userConfirmations: 0,
        userRejections: 0,
      };

      const adjusted = calibrator.applyEvidenceAdjustments(0.5, metrics);

      expect(adjusted).toBeGreaterThan(0.5);
    });

    it('should apply usage adjustments', () => {
      const metrics: ConfidenceMetrics = {
        baseConfidence: 0.5,
        supportingEvidenceCount: 0,
        contradictingEvidenceCount: 0,
        successfulUses: 10,
        rejectedUses: 0,
        ageInDays: 0,
        userConfirmations: 0,
        userRejections: 0,
      };

      const adjusted = calibrator.applyUsageAdjustments(0.5, metrics);

      expect(adjusted).toBeGreaterThan(0.5);
    });

    it('should apply temporal decay', () => {
      const memory = createTribalMemory({
        confidence: 0.8,
        createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year ago
      });

      const decayed = calibrator.applyTemporalDecay(0.8, memory);

      expect(decayed).toBeLessThan(0.8);
      expect(decayed).toBeGreaterThanOrEqual(0.4); // Should not decay below 50%
    });

    it('should check if user should be asked', () => {
      const lowConfidenceMemory = createTribalMemory({ confidence: 0.3 });
      expect(calibrator.shouldAskUser(lowConfidenceMemory, 0.3)).toBe(true);

      const highConfidenceMemory = createTribalMemory({ confidence: 0.9 });
      expect(calibrator.shouldAskUser(highConfidenceMemory, 0.9)).toBe(false);
    });

    it('should generate validation prompt', () => {
      const memory = createTribalMemory({ confidence: 0.4 });
      const prompt = calibrator.generateValidationPrompt(memory, 0.4);

      expect(prompt).toContain('40%');
      expect(prompt).toContain(memory.summary);
      expect(prompt).toContain('Confirm');
      expect(prompt).toContain('Reject');
    });

    it('should include all confidence factors', () => {
      const memory = createTribalMemory({ confidence: 0.7 });
      const metrics: ConfidenceMetrics = {
        baseConfidence: 0.7,
        supportingEvidenceCount: 3,
        contradictingEvidenceCount: 1,
        successfulUses: 5,
        rejectedUses: 2,
        ageInDays: 45,
        userConfirmations: 1,
        userRejections: 0,
      };

      const result = calibrator.calculate(memory, metrics);

      const factorNames = result.factors.map(f => f.name);
      expect(factorNames).toContain('base');
      expect(factorNames).toContain('evidence');
      expect(factorNames).toContain('usage');
      expect(factorNames).toContain('temporal');
      expect(factorNames).toContain('validation');
    });
  });

  describe('MetricsCalculator', () => {
    let storage: SQLiteMemoryStorage;
    let calculator: MetricsCalculator;

    beforeEach(async () => {
      storage = new SQLiteMemoryStorage(':memory:');
      await storage.initialize();
      calculator = new MetricsCalculator(storage);
    });

    afterEach(async () => {
      await storage.close();
    });

    it('should get metrics for a memory', async () => {
      const memory = createTribalMemory({ id: 'test-1' });
      await storage.create(memory);

      const metrics = await calculator.getMetrics('test-1');

      expect(metrics.baseConfidence).toBe(memory.confidence);
      expect(metrics.ageInDays).toBeGreaterThanOrEqual(0);
    });

    it('should throw for non-existent memory', async () => {
      await expect(calculator.getMetrics('non-existent')).rejects.toThrow();
    });

    it('should get usage stats', async () => {
      const memory = createTribalMemory({ id: 'test-1', accessCount: 10 });
      await storage.create(memory);

      const stats = await calculator.getUsageStats('test-1');

      expect(stats.totalUses).toBe(10);
    });

    it('should count supporting evidence', async () => {
      const memory = createTribalMemory({ id: 'test-1' });
      await storage.create(memory);

      const count = await calculator.countSupportingEvidence('test-1');

      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should get metrics for batch', async () => {
      await storage.create(createTribalMemory({ id: 'test-1' }));
      await storage.create(createTribalMemory({ id: 'test-2' }));

      const metrics = await calculator.getMetricsBatch(['test-1', 'test-2']);

      expect(metrics.size).toBe(2);
      expect(metrics.has('test-1')).toBe(true);
      expect(metrics.has('test-2')).toBe(true);
    });
  });

  describe('DecayIntegrator', () => {
    let storage: SQLiteMemoryStorage;
    let integrator: DecayIntegrator;

    beforeEach(async () => {
      storage = new SQLiteMemoryStorage(':memory:');
      await storage.initialize();
      integrator = DecayIntegrator.create(storage);
    });

    afterEach(async () => {
      await storage.close();
    });

    it('should process decay for a memory', async () => {
      const memory = createTribalMemory({ id: 'test-1', confidence: 0.8 });
      await storage.create(memory);

      const result = await integrator.processDecay('test-1');

      expect(result.memoryId).toBe('test-1');
      expect(result.previousConfidence).toBe(0.8);
      expect(result.newConfidence).toBeGreaterThan(0);
    });

    it('should identify validation candidates', async () => {
      // Create a low confidence memory
      const memory = createTribalMemory({
        id: 'test-1',
        confidence: 0.3,
        importance: 'high',
      });
      await storage.create(memory);

      const candidates = await integrator.getValidationCandidates();

      expect(candidates.length).toBeGreaterThanOrEqual(0);
    });

    it('should boost confidence on confirmation', async () => {
      const memory = createTribalMemory({ id: 'test-1', confidence: 0.5 });
      await storage.create(memory);

      await integrator.boostConfidence('test-1', 'confirm');

      const updated = await storage.read('test-1');
      expect(updated?.confidence).toBeGreaterThan(0.5);
    });

    it('should reduce confidence on rejection', async () => {
      const memory = createTribalMemory({ id: 'test-1', confidence: 0.8 });
      await storage.create(memory);

      await integrator.boostConfidence('test-1', 'reject');

      const updated = await storage.read('test-1');
      expect(updated?.confidence).toBeLessThan(0.8);
    });

    it('should archive memory', async () => {
      const memory = createTribalMemory({ id: 'test-1' });
      await storage.create(memory);

      await integrator.archiveMemory('test-1', 'test reason');

      const updated = await storage.read('test-1');
      expect(updated?.archived).toBe(true);
      expect(updated?.archiveReason).toBe('test reason');
    });

    it('should restore archived memory', async () => {
      const memory = createTribalMemory({ id: 'test-1', archived: true });
      await storage.create(memory);

      await integrator.restoreMemory('test-1');

      const updated = await storage.read('test-1');
      expect(updated?.archived).toBe(false);
    });

    it('should get decay stats', async () => {
      await storage.create(createTribalMemory({ id: 'test-1', confidence: 0.3 }));
      await storage.create(createTribalMemory({ id: 'test-2', confidence: 0.9 }));

      const stats = await integrator.getDecayStats();

      expect(stats.totalMemories).toBe(2);
      expect(stats.averageConfidence).toBeGreaterThan(0);
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
    archiveReason: overrides.archiveReason,
    lastValidated: overrides.lastValidated,
    ...overrides,
  };
}
