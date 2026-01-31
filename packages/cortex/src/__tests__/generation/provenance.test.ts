/**
 * Provenance Module Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ProvenanceTracker } from '../../generation/provenance/tracker.js';
import { ProvenanceCommentGenerator } from '../../generation/provenance/comment-generator.js';
import { ExplanationBuilder } from '../../generation/provenance/explanation-builder.js';
import type { GenerationContext, CodeProvenance } from '../../generation/types.js';

describe('ProvenanceTracker', () => {
  let tracker: ProvenanceTracker;

  beforeEach(() => {
    tracker = new ProvenanceTracker('test-request-123');
  });

  describe('recordInfluence', () => {
    it('should record an influence', () => {
      tracker.recordInfluence(
        'memory-1',
        'pattern_rationale',
        'pattern_followed',
        'Following error handling pattern',
        0.8
      );

      const provenance = tracker.build();
      expect(provenance.influences).toHaveLength(1);
      expect(provenance.influences[0]?.memoryId).toBe('memory-1');
      expect(provenance.influences[0]?.influenceType).toBe('pattern_followed');
    });

    it('should track multiple influences', () => {
      tracker.recordInfluence('memory-1', 'pattern_rationale', 'pattern_followed', 'Pattern 1', 0.8);
      tracker.recordInfluence('memory-2', 'tribal', 'tribal_applied', 'Tribal 1', 0.7);
      tracker.recordInfluence('memory-3', 'code_smell', 'antipattern_avoided', 'Anti-pattern 1', 0.6);

      const provenance = tracker.build();
      expect(provenance.influences).toHaveLength(3);
    });
  });

  describe('recordWarning', () => {
    it('should record a warning', () => {
      tracker.recordWarning('Be careful with null values');

      const provenance = tracker.build();
      expect(provenance.warnings).toContain('Be careful with null values');
    });

    it('should not duplicate warnings', () => {
      tracker.recordWarning('Same warning');
      tracker.recordWarning('Same warning');

      const provenance = tracker.build();
      expect(provenance.warnings).toHaveLength(1);
    });
  });

  describe('recordConstraint', () => {
    it('should record a constraint', () => {
      tracker.recordConstraint('no-any-type');

      const provenance = tracker.build();
      expect(provenance.appliedConstraints).toContain('no-any-type');
    });

    it('should not duplicate constraints', () => {
      tracker.recordConstraint('same-constraint');
      tracker.recordConstraint('same-constraint');

      const provenance = tracker.build();
      expect(provenance.appliedConstraints).toHaveLength(1);
    });
  });

  describe('recordAntiPattern', () => {
    it('should record an anti-pattern', () => {
      tracker.recordAntiPattern('nested-ternary');

      const provenance = tracker.build();
      expect(provenance.avoidedAntiPatterns).toContain('nested-ternary');
    });
  });

  describe('build', () => {
    it('should build complete provenance', () => {
      tracker.recordInfluence('m1', 'pattern_rationale', 'pattern_followed', 'Test', 0.8);
      tracker.recordWarning('Test warning');
      tracker.recordConstraint('test-constraint');
      tracker.recordAntiPattern('test-antipattern');

      const provenance = tracker.build();

      expect(provenance.requestId).toBe('test-request-123');
      expect(provenance.influences).toHaveLength(1);
      expect(provenance.warnings).toHaveLength(1);
      expect(provenance.appliedConstraints).toHaveLength(1);
      expect(provenance.avoidedAntiPatterns).toHaveLength(1);
      expect(provenance.confidence).toBeGreaterThan(0);
      expect(provenance.generatedAt).toBeDefined();
    });

    it('should calculate average confidence', () => {
      tracker.recordInfluence('m1', 'pattern_rationale', 'pattern_followed', 'Test 1', 0.8);
      tracker.recordInfluence('m2', 'tribal', 'tribal_applied', 'Test 2', 0.6);

      const provenance = tracker.build();
      expect(provenance.confidence).toBe(0.7); // Average of 0.8 and 0.6
    });
  });

  describe('initFromContext', () => {
    it('should initialize from generation context', () => {
      const context: GenerationContext = {
        target: {
          filePath: 'test.ts',
          language: 'typescript',
          type: 'new_function',
        },
        intent: 'implement',
        query: 'test query',
        patterns: [
          {
            patternId: 'p1',
            patternName: 'Pattern 1',
            category: 'api',
            relevanceReason: 'test',
            relevanceScore: 0.8,
            keyRules: ['rule 1'],
            confidence: 0.8,
          },
        ],
        tribal: [
          {
            memoryId: 't1',
            topic: 'auth',
            knowledge: 'Always validate',
            severity: 'warning',
            relevanceReason: 'test',
            relevanceScore: 0.7,
            warnings: ['Be careful'],
          },
        ],
        constraints: [
          {
            constraintId: 'c1',
            constraintName: 'Constraint 1',
            description: 'Test constraint',
            isHard: true,
            relevanceScore: 0.9,
          },
        ],
        antiPatterns: [
          {
            memoryId: 'a1',
            name: 'Anti-pattern 1',
            pattern: 'bad pattern',
            reason: 'It is bad',
            alternative: 'Do this instead',
            relevanceScore: 0.6,
          },
        ],
        relatedMemories: [],
        tokenBudget: {
          total: 4000,
          patternsUsed: 100,
          tribalUsed: 100,
          constraintsUsed: 100,
          antiPatternsUsed: 100,
          relatedUsed: 0,
          remaining: 3600,
        },
        builtAt: new Date().toISOString(),
      };

      tracker.initFromContext(context);
      const provenance = tracker.build();

      expect(provenance.influences.length).toBeGreaterThan(0);
      expect(provenance.warnings).toContain('Be careful');
      expect(provenance.appliedConstraints).toContain('c1');
      expect(provenance.avoidedAntiPatterns).toContain('a1');
    });
  });

  describe('reset', () => {
    it('should reset tracker state', () => {
      tracker.recordInfluence('m1', 'pattern_rationale', 'pattern_followed', 'Test', 0.8);
      tracker.recordWarning('Warning');

      tracker.reset('new-request-456');

      const provenance = tracker.build();
      expect(provenance.requestId).toBe('new-request-456');
      expect(provenance.influences).toHaveLength(0);
      expect(provenance.warnings).toHaveLength(0);
    });
  });
});

describe('ProvenanceCommentGenerator', () => {
  let generator: ProvenanceCommentGenerator;

  beforeEach(() => {
    generator = new ProvenanceCommentGenerator();
  });

  describe('generate', () => {
    it('should generate block comment', () => {
      const provenance: CodeProvenance = {
        requestId: 'test-123',
        influences: [
          {
            memoryId: 'm1',
            memoryType: 'pattern_rationale',
            influenceType: 'pattern_followed',
            description: 'Following error handling pattern',
            strength: 0.8,
          },
        ],
        warnings: ['Be careful with null values'],
        appliedConstraints: ['no-any-type'],
        avoidedAntiPatterns: ['nested-ternary'],
        confidence: 0.8,
        generatedAt: new Date().toISOString(),
      };

      const comment = generator.generate(provenance);

      expect(comment).toContain('/*');
      expect(comment).toContain('*/');
      expect(comment).toContain('Provenance');
      expect(comment).toContain('80%');
    });

    it('should generate line comment style', () => {
      generator.updateConfig({ style: 'line' });

      const provenance: CodeProvenance = {
        requestId: 'test-123',
        influences: [],
        warnings: [],
        appliedConstraints: [],
        avoidedAntiPatterns: [],
        confidence: 0.5,
        generatedAt: new Date().toISOString(),
      };

      const comment = generator.generate(provenance);

      expect(comment).toContain('//');
      expect(comment).not.toContain('/*');
    });

    it('should generate JSDoc style', () => {
      generator.updateConfig({ style: 'jsdoc' });

      const provenance: CodeProvenance = {
        requestId: 'test-123',
        influences: [],
        warnings: [],
        appliedConstraints: [],
        avoidedAntiPatterns: [],
        confidence: 0.5,
        generatedAt: new Date().toISOString(),
      };

      const comment = generator.generate(provenance);

      expect(comment).toContain('/**');
      expect(comment).toContain('*/');
    });
  });

  describe('generateCompact', () => {
    it('should generate compact single-line comment', () => {
      const provenance: CodeProvenance = {
        requestId: 'test-123',
        influences: [
          {
            memoryId: 'm1',
            memoryType: 'pattern_rationale',
            influenceType: 'pattern_followed',
            description: 'Test',
            strength: 0.8,
          },
        ],
        warnings: [],
        appliedConstraints: [],
        avoidedAntiPatterns: [],
        confidence: 0.8,
        generatedAt: new Date().toISOString(),
      };

      const comment = generator.generateCompact(provenance);

      expect(comment).toMatch(/^\/\/ Generated/);
      expect(comment).toContain('80%');
    });
  });
});

describe('ExplanationBuilder', () => {
  let builder: ExplanationBuilder;

  beforeEach(() => {
    builder = new ExplanationBuilder();
  });

  describe('build', () => {
    it('should build explanation from provenance', () => {
      const provenance: CodeProvenance = {
        requestId: 'test-123',
        influences: [
          {
            memoryId: 'm1',
            memoryType: 'pattern_rationale',
            influenceType: 'pattern_followed',
            description: 'Following error handling pattern',
            strength: 0.8,
          },
        ],
        warnings: ['Be careful with null values'],
        appliedConstraints: ['no-any-type'],
        avoidedAntiPatterns: ['nested-ternary'],
        confidence: 0.8,
        generatedAt: new Date().toISOString(),
      };

      const explanation = builder.build(provenance);

      expect(explanation).toContain('80%');
      expect(explanation).toContain('influence');
    });

    it('should include warnings section', () => {
      const provenance: CodeProvenance = {
        requestId: 'test-123',
        influences: [],
        warnings: ['Warning 1', 'Warning 2'],
        appliedConstraints: [],
        avoidedAntiPatterns: [],
        confidence: 0.5,
        generatedAt: new Date().toISOString(),
      };

      const explanation = builder.build(provenance);

      expect(explanation).toContain('Warning');
    });
  });

  describe('buildBrief', () => {
    it('should build brief one-sentence explanation', () => {
      const provenance: CodeProvenance = {
        requestId: 'test-123',
        influences: [
          { memoryId: 'm1', memoryType: 'pattern', influenceType: 'pattern_followed', description: 'Test', strength: 0.8 },
          { memoryId: 'm2', memoryType: 'tribal', influenceType: 'tribal_applied', description: 'Test', strength: 0.7 },
        ],
        warnings: ['Warning'],
        appliedConstraints: ['constraint'],
        avoidedAntiPatterns: [],
        confidence: 0.75,
        generatedAt: new Date().toISOString(),
      };

      const brief = builder.buildBrief(provenance);

      expect(brief).toContain('75%');
      expect(brief).toContain('pattern');
      expect(brief).toContain('constraint');
    });

    it('should handle empty provenance', () => {
      const provenance: CodeProvenance = {
        requestId: 'test-123',
        influences: [],
        warnings: [],
        appliedConstraints: [],
        avoidedAntiPatterns: [],
        confidence: 0.5,
        generatedAt: new Date().toISOString(),
      };

      const brief = builder.buildBrief(provenance);

      expect(brief).toContain('50%');
    });
  });

  describe('buildFromContext', () => {
    it('should build explanation from generation context', () => {
      const context: GenerationContext = {
        target: {
          filePath: 'src/test.ts',
          language: 'typescript',
          type: 'new_function',
        },
        intent: 'implement',
        query: 'test',
        patterns: [
          { patternId: 'p1', patternName: 'Pattern 1', category: 'api', relevanceReason: 'test', relevanceScore: 0.8, keyRules: [], confidence: 0.8 },
        ],
        tribal: [
          { memoryId: 't1', topic: 'auth', knowledge: 'Test', severity: 'warning', relevanceReason: 'test', relevanceScore: 0.7 },
        ],
        constraints: [],
        antiPatterns: [],
        relatedMemories: [],
        tokenBudget: { total: 4000, patternsUsed: 0, tribalUsed: 0, constraintsUsed: 0, antiPatternsUsed: 0, relatedUsed: 0, remaining: 4000 },
        builtAt: new Date().toISOString(),
      };

      const explanation = builder.buildFromContext(context);

      expect(explanation).toContain('src/test.ts');
      expect(explanation).toContain('Pattern 1');
      expect(explanation).toContain('auth');
    });
  });
});
