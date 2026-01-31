/**
 * Intent Weighting Tests
 * 
 * Tests for the intent-based memory type weighting system.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { IntentWeighter } from '../../retrieval/weighting.js';
import type { Intent } from '../../retrieval/engine.js';
import type { MemoryType } from '../../types/index.js';

describe('IntentWeighter', () => {
  let weighter: IntentWeighter;

  beforeEach(() => {
    weighter = new IntentWeighter();
  });

  describe('getWeight', () => {
    it('should return a positive weight for valid combinations', () => {
      const intents: Intent[] = ['add_feature', 'fix_bug', 'refactor', 'security_audit', 'understand_code', 'add_test'];
      const memoryTypes: MemoryType[] = ['core', 'tribal', 'procedural', 'semantic', 'episodic', 'pattern_rationale', 'constraint_override', 'decision_context', 'code_smell'];

      for (const intent of intents) {
        for (const memoryType of memoryTypes) {
          const weight = weighter.getWeight(memoryType, intent);
          expect(weight).toBeGreaterThan(0);
        }
      }
    });

    it('should return 1.0 for unknown combinations', () => {
      const weight = weighter.getWeight('unknown_type' as MemoryType, 'add_feature');
      expect(weight).toBe(1.0);
    });
  });

  describe('add_feature intent', () => {
    const intent: Intent = 'add_feature';

    it('should weight procedural memories highest', () => {
      const proceduralWeight = weighter.getWeight('procedural', intent);
      const tribalWeight = weighter.getWeight('tribal', intent);
      const semanticWeight = weighter.getWeight('semantic', intent);

      expect(proceduralWeight).toBeGreaterThan(tribalWeight);
      expect(proceduralWeight).toBeGreaterThan(semanticWeight);
    });

    it('should weight episodic memories lowest', () => {
      const episodicWeight = weighter.getWeight('episodic', intent);
      const proceduralWeight = weighter.getWeight('procedural', intent);

      expect(episodicWeight).toBeLessThan(proceduralWeight);
      expect(episodicWeight).toBeLessThan(1.0);
    });

    it('should give pattern_rationale a boost', () => {
      const patternWeight = weighter.getWeight('pattern_rationale', intent);
      expect(patternWeight).toBeGreaterThan(1.0);
    });
  });

  describe('fix_bug intent', () => {
    const intent: Intent = 'fix_bug';

    it('should weight tribal knowledge highest', () => {
      const tribalWeight = weighter.getWeight('tribal', intent);
      const proceduralWeight = weighter.getWeight('procedural', intent);

      expect(tribalWeight).toBeGreaterThan(proceduralWeight);
    });

    it('should weight code_smell highly', () => {
      const codeSmellWeight = weighter.getWeight('code_smell', intent);
      expect(codeSmellWeight).toBeGreaterThanOrEqual(1.5);
    });

    it('should give episodic memories normal weight (recent context matters)', () => {
      const episodicWeight = weighter.getWeight('episodic', intent);
      expect(episodicWeight).toBe(1.0);
    });
  });

  describe('refactor intent', () => {
    const intent: Intent = 'refactor';

    it('should weight pattern_rationale highest', () => {
      const patternWeight = weighter.getWeight('pattern_rationale', intent);
      const tribalWeight = weighter.getWeight('tribal', intent);

      expect(patternWeight).toBeGreaterThan(tribalWeight);
    });

    it('should weight decision_context highly', () => {
      const decisionWeight = weighter.getWeight('decision_context', intent);
      expect(decisionWeight).toBeGreaterThanOrEqual(1.5);
    });

    it('should weight episodic memories low', () => {
      const episodicWeight = weighter.getWeight('episodic', intent);
      expect(episodicWeight).toBeLessThan(1.0);
    });
  });

  describe('security_audit intent', () => {
    const intent: Intent = 'security_audit';

    it('should weight tribal knowledge highest (security gotchas)', () => {
      const tribalWeight = weighter.getWeight('tribal', intent);
      expect(tribalWeight).toBe(2.0);
    });

    it('should weight code_smell highly', () => {
      const codeSmellWeight = weighter.getWeight('code_smell', intent);
      expect(codeSmellWeight).toBeGreaterThanOrEqual(1.5);
    });

    it('should weight constraint_override highly', () => {
      const constraintWeight = weighter.getWeight('constraint_override', intent);
      expect(constraintWeight).toBeGreaterThanOrEqual(1.5);
    });

    it('should weight episodic memories very low', () => {
      const episodicWeight = weighter.getWeight('episodic', intent);
      expect(episodicWeight).toBeLessThan(0.5);
    });
  });

  describe('understand_code intent', () => {
    const intent: Intent = 'understand_code';

    it('should weight semantic memories highly', () => {
      const semanticWeight = weighter.getWeight('semantic', intent);
      expect(semanticWeight).toBeGreaterThanOrEqual(1.5);
    });

    it('should weight pattern_rationale highly', () => {
      const patternWeight = weighter.getWeight('pattern_rationale', intent);
      expect(patternWeight).toBeGreaterThanOrEqual(1.5);
    });

    it('should weight decision_context highly', () => {
      const decisionWeight = weighter.getWeight('decision_context', intent);
      expect(decisionWeight).toBeGreaterThanOrEqual(1.5);
    });
  });

  describe('add_test intent', () => {
    const intent: Intent = 'add_test';

    it('should weight procedural memories highest', () => {
      const proceduralWeight = weighter.getWeight('procedural', intent);
      const semanticWeight = weighter.getWeight('semantic', intent);

      expect(proceduralWeight).toBeGreaterThan(semanticWeight);
    });

    it('should weight code_smell reasonably', () => {
      const codeSmellWeight = weighter.getWeight('code_smell', intent);
      expect(codeSmellWeight).toBeGreaterThan(1.0);
    });
  });

  describe('getWeightsForIntent', () => {
    it('should return all weights for an intent', () => {
      const weights = weighter.getWeightsForIntent('add_feature');

      expect(weights).toHaveProperty('core');
      expect(weights).toHaveProperty('tribal');
      expect(weights).toHaveProperty('procedural');
      expect(weights).toHaveProperty('semantic');
      expect(weights).toHaveProperty('episodic');
      expect(weights).toHaveProperty('pattern_rationale');
      expect(weights).toHaveProperty('constraint_override');
      expect(weights).toHaveProperty('decision_context');
      expect(weights).toHaveProperty('code_smell');
    });

    it('should return empty object for unknown intent', () => {
      const weights = weighter.getWeightsForIntent('unknown_intent' as Intent);
      expect(weights).toEqual({});
    });
  });

  describe('weight consistency', () => {
    it('should always have core weight of 1.0 (baseline)', () => {
      const intents: Intent[] = ['add_feature', 'fix_bug', 'refactor', 'security_audit', 'understand_code', 'add_test'];

      for (const intent of intents) {
        const coreWeight = weighter.getWeight('core', intent);
        expect(coreWeight).toBe(1.0);
      }
    });

    it('should have reasonable weight ranges (0.3 to 2.0)', () => {
      const intents: Intent[] = ['add_feature', 'fix_bug', 'refactor', 'security_audit', 'understand_code', 'add_test'];
      const memoryTypes: MemoryType[] = ['core', 'tribal', 'procedural', 'semantic', 'episodic', 'pattern_rationale', 'constraint_override', 'decision_context', 'code_smell'];

      for (const intent of intents) {
        for (const memoryType of memoryTypes) {
          const weight = weighter.getWeight(memoryType, intent);
          expect(weight).toBeGreaterThanOrEqual(0.3);
          expect(weight).toBeLessThanOrEqual(2.0);
        }
      }
    });
  });
});
