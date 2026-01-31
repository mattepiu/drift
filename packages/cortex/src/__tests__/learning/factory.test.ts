/**
 * Learning Memory Factory Tests
 * 
 * Tests for the factory submodule:
 * - TribalMemoryCreator
 * - PatternRationaleCreator
 * - CodeSmellCreator
 * - LearningMemoryFactory
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TribalMemoryCreator } from '../../learning/factory/tribal-creator.js';
import { PatternRationaleCreator } from '../../learning/factory/pattern-creator.js';
import { CodeSmellCreator } from '../../learning/factory/smell-creator.js';
import { LearningMemoryFactory } from '../../learning/factory/memory-factory.js';
import { SQLiteMemoryStorage } from '../../storage/sqlite/storage.js';
import type { AnalyzedCorrection } from '../../types/learning.js';

describe('Factory Submodule Tests', () => {
  describe('TribalMemoryCreator', () => {
    let creator: TribalMemoryCreator;

    beforeEach(() => {
      creator = new TribalMemoryCreator();
    });

    it('should create tribal memory from correction', () => {
      const analysis = createAnalyzedCorrection({
        category: 'tribal_miss',
        feedback: 'You should know that this API has a timeout quirk',
      });

      const memory = creator.create(analysis);

      expect(memory.type).toBe('tribal');
      expect(memory.knowledge).toBeTruthy();
      expect(memory.topic).toBeTruthy();
    });

    it('should infer topic from feedback', () => {
      const authAnalysis = createAnalyzedCorrection({
        feedback: 'The authentication system has a session timeout',
      });

      const topic = creator.inferTopic(authAnalysis);

      expect(topic).toBe('authentication');
    });

    it('should infer severity from category', () => {
      const securityAnalysis = createAnalyzedCorrection({
        category: 'security_issue',
      });

      const severity = creator.inferSeverity(securityAnalysis);

      expect(severity).toBe('critical');
    });

    it('should build source information', () => {
      const analysis = createAnalyzedCorrection({
        metadata: { userId: 'user-1', sessionId: 'session-1' },
      });

      const source = creator.buildSource(analysis);

      expect(source.type).toBe('manual');
      expect(source.reference).toBe('session-1');
    });

    it('should extract warnings from feedback', () => {
      const analysis = createAnalyzedCorrection({
        feedback: "Don't use this API without proper error handling. Never call it synchronously.",
      });

      const memory = creator.create(analysis);

      expect(memory.warnings).toBeDefined();
      expect(memory.warnings!.length).toBeGreaterThan(0);
    });

    it('should set appropriate importance', () => {
      const criticalAnalysis = createAnalyzedCorrection({
        category: 'security_issue',
      });

      const memory = creator.create(criticalAnalysis);

      expect(memory.importance).toBe('critical');
    });

    it('should include linked files from metadata', () => {
      const analysis = createAnalyzedCorrection({
        metadata: { filePath: 'src/auth/login.ts' },
      });

      const memory = creator.create(analysis);

      expect(memory.linkedFiles).toContain('src/auth/login.ts');
    });
  });

  describe('PatternRationaleCreator', () => {
    let creator: PatternRationaleCreator;

    beforeEach(() => {
      creator = new PatternRationaleCreator();
    });

    it('should create pattern rationale memory', () => {
      const analysis = createAnalyzedCorrection({
        category: 'pattern_violation',
        feedback: 'Follow the repository pattern for data access',
      });

      const memory = creator.create(analysis);

      expect(memory.type).toBe('pattern_rationale');
      expect(memory.patternName).toBeTruthy();
      expect(memory.rationale).toBeTruthy();
    });

    it('should find related pattern from metadata', () => {
      const analysis = createAnalyzedCorrection({
        metadata: { relatedPatterns: ['pattern-123'] },
      });

      const patternId = creator.findRelatedPattern(analysis);

      expect(patternId).toBe('pattern-123');
    });

    it('should build rationale from principle', () => {
      const analysis = createAnalyzedCorrection({
        principle: {
          statement: 'Use repository pattern',
          explanation: 'It provides abstraction for data access',
          scope: { projectWide: true },
          confidence: 0.8,
          keywords: ['repository'],
          isHardRule: false,
        },
      });

      const rationale = creator.buildRationale(analysis);

      expect(rationale).toContain('repository pattern');
    });

    it('should extract alternatives from feedback', () => {
      const analysis = createAnalyzedCorrection({
        feedback: 'Use repository pattern instead of direct database calls',
      });

      const memory = creator.create(analysis);

      expect(memory.alternativesRejected).toBeDefined();
    });

    it('should infer pattern category', () => {
      const analysis = createAnalyzedCorrection({
        category: 'architecture_mismatch',
      });

      const memory = creator.create(analysis);

      expect(memory.patternCategory).toBe('structural');
    });
  });

  describe('CodeSmellCreator', () => {
    let creator: CodeSmellCreator;

    beforeEach(() => {
      creator = new CodeSmellCreator();
    });

    it('should create code smell memory', () => {
      const analysis = createAnalyzedCorrection({
        category: 'security_issue',
        feedback: 'Never use eval() - it creates security vulnerabilities',
        original: 'eval(userInput);',
      });

      const memory = creator.create(analysis);

      expect(memory.type).toBe('code_smell');
      expect(memory.name).toBeTruthy();
      expect(memory.severity).toBeTruthy();
    });

    it('should extract pattern from diff', () => {
      const analysis = createAnalyzedCorrection({
        diff: {
          additions: [],
          removals: [{ lineNumber: 1, content: 'eval(input);' }],
          modifications: [],
          summary: 'Removed eval',
          semanticChanges: [],
        },
      });

      const pattern = creator.extractPattern(analysis);

      expect(pattern).toContain('eval');
    });

    it('should build good and bad examples', () => {
      const analysis = createAnalyzedCorrection({
        original: 'eval(input);',
        correctedCode: 'JSON.parse(input);',
      });

      const { bad, good } = creator.buildExample(analysis);

      expect(bad).toContain('eval');
      expect(good).toContain('JSON.parse');
    });

    it('should infer severity from category', () => {
      const securityAnalysis = createAnalyzedCorrection({
        category: 'security_issue',
      });

      const memory = creator.create(securityAnalysis);

      expect(memory.severity).toBe('error');
    });

    it('should set auto-detect for simple patterns', () => {
      const analysis = createAnalyzedCorrection({
        original: 'eval(x)',
      });

      const memory = creator.create(analysis);

      expect(memory.autoDetect).toBe(true);
    });

    it('should extract consequences from feedback', () => {
      const analysis = createAnalyzedCorrection({
        feedback: 'This will cause security vulnerabilities and can lead to XSS attacks',
      });

      const memory = creator.create(analysis);

      expect(memory.consequences).toBeDefined();
      expect(memory.consequences!.length).toBeGreaterThan(0);
    });
  });

  describe('LearningMemoryFactory', () => {
    let factory: LearningMemoryFactory;
    let storage: SQLiteMemoryStorage;

    beforeEach(async () => {
      storage = new SQLiteMemoryStorage(':memory:');
      await storage.initialize();
      factory = LearningMemoryFactory.create(storage);
    });

    afterEach(async () => {
      await storage.close();
    });

    it('should create memory from correction', async () => {
      const analysis = createAnalyzedCorrection({
        category: 'tribal_miss',
      });

      const result = await factory.createFromCorrection(analysis);

      expect(result.memory).toBeTruthy();
      expect(result.memoryType).toBe('tribal');
      expect(result.stored).toBe(true);
    });

    it('should select tribal creator for tribal_miss', () => {
      const creator = factory.selectCreator('tribal_miss');
      const memory = creator.create(createAnalyzedCorrection({}));

      expect(memory.type).toBe('tribal');
    });

    it('should select pattern creator for pattern_violation', () => {
      const creator = factory.selectCreator('pattern_violation');
      const memory = creator.create(createAnalyzedCorrection({}));

      expect(memory.type).toBe('pattern_rationale');
    });

    it('should select smell creator for security_issue', () => {
      const creator = factory.selectCreator('security_issue');
      const memory = creator.create(createAnalyzedCorrection({}));

      expect(memory.type).toBe('code_smell');
    });

    it('should create memories from multiple corrections', async () => {
      const analyses = [
        createAnalyzedCorrection({ category: 'tribal_miss' }),
        createAnalyzedCorrection({ category: 'security_issue' }),
      ];

      const results = await factory.createFromCorrections(analyses);

      expect(results.length).toBe(2);
      expect(results[0].memoryType).toBe('tribal');
      expect(results[1].memoryType).toBe('code_smell');
    });

    it('should create tribal memory directly', () => {
      const analysis = createAnalyzedCorrection({});
      const memory = factory.createTribalMemory(analysis);

      expect(memory.type).toBe('tribal');
    });

    it('should create pattern rationale memory directly', () => {
      const analysis = createAnalyzedCorrection({});
      const memory = factory.createPatternRationaleMemory(analysis);

      expect(memory.type).toBe('pattern_rationale');
    });

    it('should create code smell memory directly', () => {
      const analysis = createAnalyzedCorrection({});
      const memory = factory.createCodeSmellMemory(analysis);

      expect(memory.type).toBe('code_smell');
    });

    it('should get suggested type for category', () => {
      expect(factory.getSuggestedType('tribal_miss')).toBe('tribal');
      expect(factory.getSuggestedType('pattern_violation')).toBe('pattern_rationale');
      expect(factory.getSuggestedType('security_issue')).toBe('code_smell');
    });

    it('should work without storage', async () => {
      const factoryNoStorage = LearningMemoryFactory.create();
      const analysis = createAnalyzedCorrection({});

      const result = await factoryNoStorage.createFromCorrection(analysis);

      expect(result.memory).toBeTruthy();
      expect(result.stored).toBe(false);
    });
  });
});

// Helper functions

function createAnalyzedCorrection(
  overrides: Partial<AnalyzedCorrection> = {}
): AnalyzedCorrection {
  return {
    id: overrides.id ?? 'analysis-1',
    original: overrides.original ?? 'const x = 1;',
    feedback: overrides.feedback ?? 'Test feedback',
    correctedCode: overrides.correctedCode,
    diff: overrides.diff,
    category: overrides.category ?? 'other',
    categoryConfidence: overrides.categoryConfidence ?? 0.7,
    principle: overrides.principle ?? {
      statement: 'Test principle',
      explanation: 'Test explanation',
      scope: { projectWide: true },
      confidence: 0.7,
      keywords: ['test'],
      isHardRule: false,
    },
    suggestedMemoryType: overrides.suggestedMemoryType ?? 'tribal',
    relatedMemories: overrides.relatedMemories ?? [],
    analyzedAt: overrides.analyzedAt ?? new Date().toISOString(),
    metadata: overrides.metadata,
  };
}
