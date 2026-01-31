/**
 * Correction Analyzer Tests
 * 
 * Tests for the analysis submodule:
 * - DiffAnalyzer
 * - CorrectionCategorizer
 * - PrincipleExtractor
 * - CorrectionAnalyzer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DiffAnalyzer } from '../../learning/analysis/diff-analyzer.js';
import { CorrectionCategorizer } from '../../learning/analysis/categorizer.js';
import { PrincipleExtractor } from '../../learning/analysis/principle-extractor.js';
import { CorrectionAnalyzer } from '../../learning/analysis/analyzer.js';

describe('Analysis Submodule Tests', () => {
  describe('DiffAnalyzer', () => {
    let analyzer: DiffAnalyzer;

    beforeEach(() => {
      analyzer = new DiffAnalyzer();
    });

    it('should compute diff between original and corrected code', () => {
      const original = 'const x = 1;\nconst y = 2;';
      const corrected = 'const x = 1;\nconst z = 3;';

      const diff = analyzer.computeDiff(original, corrected);

      // Should detect changes
      expect(diff.summary).toBeTruthy();
      expect(diff.additions.length + diff.removals.length + diff.modifications.length).toBeGreaterThan(0);
    });

    it('should detect additions', () => {
      const original = 'const x = 1;';
      const corrected = 'const x = 1;\nconst y = 2;';

      const diff = analyzer.computeDiff(original, corrected);

      expect(diff.additions.length).toBeGreaterThan(0);
      expect(diff.summary).toContain('added');
    });

    it('should detect removals', () => {
      const original = 'const x = 1;\nconst y = 2;';
      const corrected = 'const x = 1;';

      const diff = analyzer.computeDiff(original, corrected);

      expect(diff.removals.length).toBeGreaterThan(0);
      expect(diff.summary).toContain('removed');
    });

    it('should detect semantic changes - error handling', () => {
      const original = 'doSomething();';
      const corrected = 'try { doSomething(); } catch (e) { console.error(e); }';

      const diff = analyzer.computeDiff(original, corrected);

      expect(diff.semanticChanges.some(c => c.type === 'add_error_handling')).toBe(true);
    });

    it('should detect semantic changes - validation', () => {
      const original = 'process(data);';
      const corrected = 'if (data !== null && data !== undefined) { process(data); }';

      const diff = analyzer.computeDiff(original, corrected);

      expect(diff.semanticChanges.some(c => c.type === 'add_validation')).toBe(true);
    });

    it('should summarize changes', () => {
      const original = 'const x = 1;';
      const corrected = 'const y = 2;';

      const diff = analyzer.computeDiff(original, corrected);
      const summary = analyzer.summarizeChanges(diff);

      expect(summary.totalChanges).toBeGreaterThan(0);
    });

    it('should handle identical code', () => {
      const code = 'const x = 1;';

      const diff = analyzer.computeDiff(code, code);

      expect(diff.additions.length).toBe(0);
      expect(diff.removals.length).toBe(0);
      expect(diff.modifications.length).toBe(0);
    });

    it('should handle empty strings', () => {
      const diff = analyzer.computeDiff('', '');

      expect(diff.summary).toBe('No changes detected');
    });
  });

  describe('CorrectionCategorizer', () => {
    let categorizer: CorrectionCategorizer;

    beforeEach(() => {
      categorizer = new CorrectionCategorizer();
    });

    it('should categorize pattern violations', () => {
      const result = categorizer.categorize(
        'const data = fetch(url);',
        'Follow the established pattern for API calls',
        null
      );

      expect(result.category).toBe('pattern_violation');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should categorize tribal knowledge misses', () => {
      const result = categorizer.categorize(
        'callApi();',
        'You should know that this API has a quirk with timeouts',
        null
      );

      expect(result.category).toBe('tribal_miss');
    });

    it('should categorize security issues', () => {
      const result = categorizer.categorize(
        'element.innerHTML = userInput;',
        'This is a security vulnerability - use textContent instead',
        null
      );

      expect(result.category).toBe('security_issue');
    });

    it('should categorize naming conventions', () => {
      const result = categorizer.categorize(
        'const user_name = "test";',
        'Use camelCase naming convention',
        null
      );

      expect(result.category).toBe('naming_convention');
    });

    it('should categorize style preferences', () => {
      const result = categorizer.categorize(
        'function foo() {}',
        'I prefer arrow functions for this style',
        null
      );

      expect(result.category).toBe('style_preference');
    });

    it('should provide reasoning', () => {
      const result = categorizer.categorize(
        'code',
        'feedback',
        null
      );

      expect(result.reasoning).toBeTruthy();
      expect(typeof result.reasoning).toBe('string');
    });

    it('should identify secondary categories', () => {
      const result = categorizer.categorize(
        'eval(userInput);',
        'This is a security issue and also violates our pattern for input handling',
        null
      );

      // Should have primary and possibly secondary categories
      expect(result.category).toBeTruthy();
    });

    it('should check pattern violation', () => {
      expect(categorizer.checkPatternViolation('// TODO: follow pattern')).toBe(true);
      expect(categorizer.checkPatternViolation('normal code')).toBe(false);
    });

    it('should check tribal miss', () => {
      expect(categorizer.checkTribalMiss('You should know this quirk')).toBe(true);
      expect(categorizer.checkTribalMiss('Normal feedback')).toBe(false);
    });

    it('should check constraint violation', () => {
      expect(categorizer.checkConstraintViolation('// eslint-disable-next-line')).toBe(true);
      expect(categorizer.checkConstraintViolation('normal code')).toBe(false);
    });
  });

  describe('PrincipleExtractor', () => {
    let extractor: PrincipleExtractor;

    beforeEach(() => {
      extractor = new PrincipleExtractor();
    });

    it('should extract principle from feedback', () => {
      const principle = extractor.extract(
        'const x = 1;',
        'You should always use const for immutable values',
        null,
        'style_preference'
      );

      expect(principle.statement).toBeTruthy();
      expect(principle.confidence).toBeGreaterThan(0);
    });

    it('should extract principle from diff', () => {
      const diff = {
        additions: [],
        removals: [],
        modifications: [],
        summary: 'Changes',
        semanticChanges: [
          {
            type: 'add_error_handling' as const,
            description: 'Added try/catch',
            affectedElements: ['error handling'],
          },
        ],
      };

      const principle = extractor.extract(
        'doSomething();',
        'Add error handling',
        diff,
        'pattern_violation'
      );

      expect(principle.statement).toContain('error handling');
    });

    it('should determine scope', () => {
      const principle = extractor.extract(
        'code',
        'In TypeScript files, always use strict types',
        null,
        'constraint_violation'
      );

      expect(principle.scope).toBeTruthy();
      expect(principle.scope.languages).toContain('typescript');
    });

    it('should extract keywords', () => {
      const principle = extractor.extract(
        'code',
        'Always validate user input before processing',
        null,
        'security_issue'
      );

      expect(principle.keywords.length).toBeGreaterThan(0);
    });

    it('should identify hard rules', () => {
      const principle = extractor.extract(
        'code',
        'You must never expose secrets in logs',
        null,
        'security_issue'
      );

      expect(principle.isHardRule).toBe(true);
    });

    it('should identify soft preferences', () => {
      const principle = extractor.extract(
        'code',
        'I prefer using arrow functions',
        null,
        'style_preference'
      );

      expect(principle.isHardRule).toBe(false);
    });

    it('should extract file patterns from feedback', () => {
      const scope = extractor.determineScope(
        'This applies to *.ts files in the src directory',
        ''
      );

      expect(scope.filePatterns).toBeDefined();
    });

    it('should extract frameworks from feedback', () => {
      const scope = extractor.determineScope(
        'When using React, always use hooks',
        ''
      );

      expect(scope.frameworks).toContain('react');
    });
  });

  describe('CorrectionAnalyzer', () => {
    let analyzer: CorrectionAnalyzer;

    beforeEach(() => {
      analyzer = CorrectionAnalyzer.create();
    });

    it('should analyze a correction', async () => {
      const result = await analyzer.analyze(
        'const x = 1;',
        'Use let instead of const for mutable values',
        'let x = 1;'
      );

      expect(result.id).toBeTruthy();
      expect(result.category).toBeTruthy();
      expect(result.principle).toBeTruthy();
      expect(result.suggestedMemoryType).toBeTruthy();
    });

    it('should compute diff when corrected code provided', async () => {
      const result = await analyzer.analyze(
        'const x = 1;',
        'Change to let',
        'let x = 1;'
      );

      expect(result.diff).toBeTruthy();
      expect(result.diff?.modifications.length).toBeGreaterThan(0);
    });

    it('should work without corrected code', async () => {
      const result = await analyzer.analyze(
        'const x = 1;',
        'This should be different'
      );

      expect(result.diff).toBeUndefined();
      expect(result.category).toBeTruthy();
    });

    it('should suggest appropriate memory type', async () => {
      const securityResult = await analyzer.analyze(
        'eval(input);',
        'Never use eval - security vulnerability'
      );

      expect(securityResult.suggestedMemoryType).toBe('code_smell');

      const tribalResult = await analyzer.analyze(
        'callApi();',
        'You should know this API has a quirk'
      );

      expect(tribalResult.suggestedMemoryType).toBe('tribal');
    });

    it('should analyze batch of corrections', async () => {
      const corrections = [
        { original: 'code1', feedback: 'feedback1' },
        { original: 'code2', feedback: 'feedback2' },
      ];

      const results = await analyzer.analyzeBatch(corrections);

      expect(results.length).toBe(2);
      expect(results[0].id).not.toBe(results[1].id);
    });

    it('should include metadata when provided', async () => {
      const result = await analyzer.analyze(
        'code',
        'feedback',
        undefined,
        {
          metadata: {
            filePath: 'src/test.ts',
            language: 'typescript',
          },
        }
      );

      expect(result.metadata?.filePath).toBe('src/test.ts');
    });

    it('should set analyzedAt timestamp', async () => {
      const result = await analyzer.analyze('code', 'feedback');

      expect(result.analyzedAt).toBeTruthy();
      expect(new Date(result.analyzedAt).getTime()).toBeLessThanOrEqual(Date.now());
    });
  });
});
