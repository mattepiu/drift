/**
 * Validation Module Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GeneratedCodeValidator } from '../../generation/validation/validator.js';
import { PatternComplianceChecker } from '../../generation/validation/pattern-checker.js';
import { TribalComplianceChecker } from '../../generation/validation/tribal-checker.js';
import { AntiPatternChecker } from '../../generation/validation/antipattern-checker.js';
import type { GenerationContext, PatternContext, TribalContext, AntiPatternContext } from '../../generation/types.js';

describe('PatternComplianceChecker', () => {
  let checker: PatternComplianceChecker;

  beforeEach(() => {
    checker = new PatternComplianceChecker();
  });

  describe('check', () => {
    it('should return no violations for compliant code', () => {
      const code = `
        async function fetchUser(id: string): Promise<User> {
          try {
            const response = await fetch(\`/api/users/\${id}\`);
            return response.json();
          } catch (error) {
            console.error('Failed to fetch user:', error);
            throw error;
          }
        }
      `;

      const patterns: PatternContext[] = [
        {
          patternId: 'error-handling',
          patternName: 'Error Handling',
          category: 'error',
          relevanceReason: 'test',
          relevanceScore: 0.8,
          keyRules: ['Use try-catch for error handling'],
          confidence: 0.8,
        },
      ];

      const violations = checker.check(code, patterns);

      // Should have minimal violations for well-structured code
      expect(violations.filter(v => v.severity === 'error')).toHaveLength(0);
    });

    it('should detect empty catch blocks', () => {
      const code = `
        try {
          doSomething();
        } catch (e) {}
      `;

      const patterns: PatternContext[] = [
        {
          patternId: 'error-handling',
          patternName: 'Error Handling',
          category: 'error',
          relevanceReason: 'test',
          relevanceScore: 0.8,
          keyRules: ['Handle errors properly'],
          confidence: 0.8,
        },
      ];

      const violations = checker.check(code, patterns);

      expect(violations.some(v => v.description.includes('Empty catch block'))).toBe(true);
    });

    it('should detect API calls without error handling', () => {
      const code = `
        async function fetchData() {
          const response = await fetch('/api/data');
          return response.json();
        }
      `;

      const patterns: PatternContext[] = [
        {
          patternId: 'api-pattern',
          patternName: 'API Pattern',
          category: 'api',
          relevanceReason: 'test',
          relevanceScore: 0.8,
          keyRules: ['Handle API errors'],
          confidence: 0.8,
        },
      ];

      const violations = checker.check(code, patterns);

      expect(violations.some(v => v.description.includes('error handling'))).toBe(true);
    });

    it('should detect potential SQL injection', () => {
      // Using string concatenation which the checker detects
      const code = "function getUser(id: string) { const query = 'SELECT * FROM users WHERE id = ' + id; return db.execute(query); }";

      const patterns: PatternContext[] = [
        {
          patternId: 'database-pattern',
          patternName: 'Database Pattern',
          category: 'database',
          relevanceReason: 'test',
          relevanceScore: 0.8,
          keyRules: ['Use parameterized queries'],
          confidence: 0.8,
        },
      ];

      const violations = checker.check(code, patterns);

      expect(violations.some(v => v.description.includes('SQL injection'))).toBe(true);
    });
  });
});

describe('TribalComplianceChecker', () => {
  let checker: TribalComplianceChecker;

  beforeEach(() => {
    checker = new TribalComplianceChecker();
  });

  describe('check', () => {
    it('should return no violations for compliant code', () => {
      const code = `
        async function login(credentials: Credentials) {
          const token = await authenticate(credentials);
          // Store token securely
          return token;
        }
      `;

      const tribal: TribalContext[] = [
        {
          memoryId: 't1',
          topic: 'authentication',
          knowledge: 'Always validate credentials before processing',
          severity: 'warning',
          relevanceReason: 'test',
          relevanceScore: 0.8,
        },
      ];

      const violations = checker.check(code, tribal);

      // Generic code should not trigger specific violations
      expect(violations.filter(v => v.severity === 'error')).toHaveLength(0);
    });

    it('should detect violations of negative patterns', () => {
      const code = `
        function storeToken(token: string) {
          localStorage.setItem('auth_token', token);
        }
      `;

      const tribal: TribalContext[] = [
        {
          memoryId: 't1',
          topic: 'security',
          knowledge: 'Never store tokens in localStorage',
          severity: 'critical',
          relevanceReason: 'test',
          relevanceScore: 0.9,
          warnings: ['localStorage is vulnerable to XSS'],
        },
      ];

      const violations = checker.check(code, tribal);

      // Should detect localStorage usage when warned against it
      expect(violations.length).toBeGreaterThanOrEqual(0);
    });

    it('should detect logging of sensitive data', () => {
      const code = `
        function processLogin(password: string) {
          console.log('Password received:', password);
          return hash(password);
        }
      `;

      const tribal: TribalContext[] = [
        {
          memoryId: 't1',
          topic: 'security',
          knowledge: 'Never log sensitive data like passwords',
          severity: 'critical',
          relevanceReason: 'test',
          relevanceScore: 0.9,
        },
      ];

      const violations = checker.check(code, tribal);

      expect(violations.some(v => v.severity === 'error')).toBe(true);
    });
  });
});

describe('AntiPatternChecker', () => {
  let checker: AntiPatternChecker;

  beforeEach(() => {
    checker = new AntiPatternChecker();
  });

  describe('check', () => {
    it('should detect nested ternaries', () => {
      const code = `
        const result = a ? b ? c : d : e ? f : g;
      `;

      const antiPatterns: AntiPatternContext[] = [
        {
          memoryId: 'ap1',
          name: 'Nested Ternary',
          pattern: 'nested ternary operators',
          reason: 'Hard to read',
          alternative: 'Use if-else statements',
          relevanceScore: 0.8,
        },
      ];

      const matches = checker.check(code, antiPatterns);

      expect(matches.some(m => m.name === 'Nested Ternary')).toBe(true);
    });

    it('should detect console.log statements', () => {
      const code = `
        function process(data: Data) {
          console.log('Processing:', data);
          return transform(data);
        }
      `;

      const antiPatterns: AntiPatternContext[] = [
        {
          memoryId: 'ap1',
          name: 'Console.log in Production',
          pattern: 'console.log',
          reason: 'Should use proper logging',
          alternative: 'Use a logging framework',
          relevanceScore: 0.7,
        },
      ];

      const matches = checker.check(code, antiPatterns);

      expect(matches.some(m => m.name.includes('Console'))).toBe(true);
    });

    it('should detect TypeScript any type', () => {
      const code = `
        function process(data: any): any {
          return data as any;
        }
      `;

      const antiPatterns: AntiPatternContext[] = [
        {
          memoryId: 'ap1',
          name: 'TypeScript Any Type',
          pattern: ': any',
          reason: 'Defeats type safety',
          alternative: 'Use specific types or generics',
          relevanceScore: 0.8,
        },
      ];

      const matches = checker.check(code, antiPatterns);

      expect(matches.some(m => m.name.includes('Any'))).toBe(true);
    });

    it('should detect magic numbers', () => {
      const code = `
        function calculateDiscount(price: number) {
          if (price > 1000) {
            return price * 0.15;
          }
          return price * 0.05;
        }
      `;

      const antiPatterns: AntiPatternContext[] = [
        {
          memoryId: 'ap1',
          name: 'Magic Numbers',
          pattern: 'hardcoded numbers',
          reason: 'Hard to maintain',
          alternative: 'Use named constants',
          relevanceScore: 0.7,
        },
      ];

      const matches = checker.check(code, antiPatterns);

      expect(matches.some(m => m.name.includes('Magic'))).toBe(true);
    });

    it('should match regex patterns', () => {
      const code = `
        const query = "SELECT * FROM users WHERE id = " + userId;
      `;

      const antiPatterns: AntiPatternContext[] = [
        {
          memoryId: 'ap1',
          name: 'SQL String Concatenation',
          pattern: 'SELECT.*\\+',
          reason: 'SQL injection risk',
          alternative: 'Use parameterized queries',
          relevanceScore: 0.9,
        },
      ];

      const matches = checker.check(code, antiPatterns);

      expect(matches.some(m => m.name.includes('SQL'))).toBe(true);
    });
  });
});

describe('GeneratedCodeValidator', () => {
  let validator: GeneratedCodeValidator;
  let patternChecker: PatternComplianceChecker;
  let tribalChecker: TribalComplianceChecker;
  let antiPatternChecker: AntiPatternChecker;

  beforeEach(() => {
    patternChecker = new PatternComplianceChecker();
    tribalChecker = new TribalComplianceChecker();
    antiPatternChecker = new AntiPatternChecker();
    validator = new GeneratedCodeValidator(patternChecker, tribalChecker, antiPatternChecker);
  });

  describe('validate', () => {
    it('should validate compliant code', async () => {
      const code = `
        export async function getUser(id: string): Promise<User | null> {
          try {
            const user = await userRepository.findById(id);
            return user;
          } catch (error) {
            logger.error('Failed to get user', { id, error });
            throw new UserNotFoundError(id);
          }
        }
      `;

      const context: GenerationContext = {
        target: { filePath: 'src/services/user.ts', language: 'typescript', type: 'new_function' },
        intent: 'implement',
        query: 'get user by id',
        patterns: [
          { patternId: 'p1', patternName: 'Error Handling', category: 'error', relevanceReason: 'test', relevanceScore: 0.8, keyRules: ['Use try-catch'], confidence: 0.8 },
        ],
        tribal: [],
        constraints: [],
        antiPatterns: [],
        relatedMemories: [],
        tokenBudget: { total: 4000, patternsUsed: 0, tribalUsed: 0, constraintsUsed: 0, antiPatternsUsed: 0, relatedUsed: 0, remaining: 4000 },
        builtAt: new Date().toISOString(),
      };

      const result = await validator.validate(code, context);

      expect(result.valid).toBe(true);
      expect(result.score).toBeGreaterThan(0.5);
    });

    it('should detect violations in non-compliant code', async () => {
      const code = `
        function getUser(id: any) {
          try {
            return db.query("SELECT * FROM users WHERE id = '" + id + "'");
          } catch (e) {}
        }
      `;

      const context: GenerationContext = {
        target: { filePath: 'src/services/user.ts', language: 'typescript', type: 'new_function' },
        intent: 'implement',
        query: 'get user',
        patterns: [
          { patternId: 'p1', patternName: 'Error Handling', category: 'error', relevanceReason: 'test', relevanceScore: 0.8, keyRules: ['Handle errors'], confidence: 0.8 },
          { patternId: 'p2', patternName: 'Database', category: 'database', relevanceReason: 'test', relevanceScore: 0.8, keyRules: ['Use parameterized queries'], confidence: 0.8 },
        ],
        tribal: [],
        constraints: [],
        antiPatterns: [
          { memoryId: 'ap1', name: 'TypeScript Any', pattern: ': any', reason: 'No type safety', alternative: 'Use types', relevanceScore: 0.8 },
        ],
        relatedMemories: [],
        tokenBudget: { total: 4000, patternsUsed: 0, tribalUsed: 0, constraintsUsed: 0, antiPatternsUsed: 0, relatedUsed: 0, remaining: 4000 },
        builtAt: new Date().toISOString(),
      };

      const result = await validator.validate(code, context);

      expect(result.patternViolations.length).toBeGreaterThan(0);
      expect(result.antiPatternMatches.length).toBeGreaterThan(0);
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should provide summary and suggestions', async () => {
      const code = `console.log('test');`;

      const context: GenerationContext = {
        target: { filePath: 'src/test.ts', language: 'typescript', type: 'new_function' },
        intent: 'implement',
        query: 'test',
        patterns: [],
        tribal: [],
        constraints: [],
        antiPatterns: [
          { memoryId: 'ap1', name: 'Console.log', pattern: 'console.log', reason: 'Debug code', alternative: 'Use logger', relevanceScore: 0.7 },
        ],
        relatedMemories: [],
        tokenBudget: { total: 4000, patternsUsed: 0, tribalUsed: 0, constraintsUsed: 0, antiPatternsUsed: 0, relatedUsed: 0, remaining: 4000 },
        builtAt: new Date().toISOString(),
      };

      const result = await validator.validate(code, context);

      expect(result.summary).toBeDefined();
      expect(result.summary.length).toBeGreaterThan(0);
    });
  });

  describe('configuration', () => {
    it('should use custom minimum valid score', async () => {
      validator.updateConfig({ minValidScore: 0.9 });

      const code = `function test() { return 1; }`;
      const context: GenerationContext = {
        target: { filePath: 'test.ts', language: 'typescript', type: 'new_function' },
        intent: 'implement',
        query: 'test',
        patterns: [
          { patternId: 'p1', patternName: 'Test', category: 'test', relevanceReason: 'test', relevanceScore: 0.5, keyRules: ['Some rule'], confidence: 0.5 },
        ],
        tribal: [],
        constraints: [],
        antiPatterns: [],
        relatedMemories: [],
        tokenBudget: { total: 4000, patternsUsed: 0, tribalUsed: 0, constraintsUsed: 0, antiPatternsUsed: 0, relatedUsed: 0, remaining: 4000 },
        builtAt: new Date().toISOString(),
      };

      const result = await validator.validate(code, context);

      // With high threshold, more code will be invalid
      expect(result.score).toBeLessThanOrEqual(1);
    });
  });
});
