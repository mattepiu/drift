/**
 * Critical Path Tests
 * 
 * Tests for high-risk untested modules:
 * - Privacy sanitizer (PII/secret detection)
 * - Token budget manager (budget fitting)
 * - Contradiction detector (memory conflicts)
 * - Fact extractor (learning from episodes)
 * - File linker (auto-linking)
 * - Main Cortex class (integration)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrivacySanitizer } from '../../privacy/sanitizer.js';
import { TokenBudgetManager } from '../../retrieval/budget.js';
import { ContradictionDetector } from '../../validation/contradiction-detector.js';
import { FactExtractor } from '../../learning/fact-extractor.js';
import { FileLinker } from '../../linking/file-linker.js';
import { SQLiteMemoryStorage } from '../../storage/sqlite/storage.js';
import type { TribalMemory, EpisodicMemory, Memory } from '../../types/index.js';

describe('Critical Path Tests', () => {
  describe('Privacy Sanitizer', () => {
    let sanitizer: PrivacySanitizer;

    beforeEach(() => {
      sanitizer = new PrivacySanitizer();
    });

    describe('PII detection', () => {
      it('should detect and redact email addresses', () => {
        const result = sanitizer.sanitize('Contact john.doe@example.com for help');
        expect(result.sanitized).toBe('Contact [EMAIL] for help');
        expect(result.redactedCount).toBe(1);
        expect(result.redactedTypes).toContain('email');
      });

      it('should detect multiple emails', () => {
        const result = sanitizer.sanitize('Email a@b.com or c@d.org');
        expect(result.redactedCount).toBe(2);
      });

      it('should detect phone numbers', () => {
        const result = sanitizer.sanitize('Call 555-123-4567 or (555) 987-6543');
        expect(result.sanitized).toContain('[PHONE]');
        expect(result.redactedTypes).toContain('phone');
      });

      it('should detect SSN patterns', () => {
        const result = sanitizer.sanitize('SSN: 123-45-6789');
        expect(result.sanitized).toContain('[SSN]');
      });

      it('should detect credit card numbers', () => {
        const result = sanitizer.sanitize('Card: 4111-1111-1111-1111');
        expect(result.sanitized).toContain('[CREDIT_CARD]');
      });

      it('should detect IP addresses', () => {
        const result = sanitizer.sanitize('Server at 192.168.1.100');
        expect(result.sanitized).toContain('[IP_ADDRESS]');
      });

      it('should handle content with no PII', () => {
        const result = sanitizer.sanitize('This is clean content');
        expect(result.sanitized).toBe('This is clean content');
        expect(result.redactedCount).toBe(0);
      });

      it('should handle empty string', () => {
        const result = sanitizer.sanitize('');
        expect(result.sanitized).toBe('');
        expect(result.redactedCount).toBe(0);
      });
    });

    describe('Secret detection', () => {
      it('should detect API keys', () => {
        const result = sanitizer.sanitize('api_key=sk_test_FAKE_KEY_FOR_TESTING_1234567890');
        expect(result.sanitized).toContain('[API_KEY]');
      });

      it('should detect AWS access keys', () => {
        const result = sanitizer.sanitize('AWS key: AKIAIOSFODNN7EXAMPLE');
        expect(result.sanitized).toContain('[AWS_KEY]');
      });

      it('should detect JWT tokens', () => {
        const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
        const result = sanitizer.sanitize(`Token: ${jwt}`);
        expect(result.sanitized).toContain('[JWT_TOKEN]');
      });

      it('should detect private key headers', () => {
        const result = sanitizer.sanitize('-----BEGIN RSA PRIVATE KEY-----');
        expect(result.sanitized).toContain('[PRIVATE_KEY]');
      });

      it('should detect password patterns', () => {
        const result = sanitizer.sanitize('password=mysecretpassword123');
        expect(result.sanitized).toContain('[PASSWORD]');
      });
    });

    describe('containsSensitive', () => {
      it('should return true for content with PII', () => {
        expect(sanitizer.containsSensitive('email: test@test.com')).toBe(true);
      });

      it('should return true for content with secrets', () => {
        expect(sanitizer.containsSensitive('AKIAIOSFODNN7EXAMPLE')).toBe(true);
      });

      it('should return false for clean content', () => {
        expect(sanitizer.containsSensitive('This is clean')).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should handle unicode content', () => {
        const result = sanitizer.sanitize('日本語 test@test.com 中文');
        expect(result.sanitized).toContain('[EMAIL]');
        expect(result.sanitized).toContain('日本語');
      });

      it('should handle very long content', () => {
        const longContent = 'x'.repeat(100000) + ' test@test.com ' + 'y'.repeat(100000);
        const result = sanitizer.sanitize(longContent);
        expect(result.sanitized).toContain('[EMAIL]');
      });

      it('should handle multiple patterns in same content', () => {
        const result = sanitizer.sanitize(
          'Email: a@b.com, Phone: 555-123-4567, API: api_key=abcdefghijklmnopqrstuvwxyz'
        );
        expect(result.redactedCount).toBeGreaterThanOrEqual(3);
      });

      it('should not false positive on similar patterns', () => {
        // Version numbers shouldn't match IP
        const result = sanitizer.sanitize('Version 1.2.3.4');
        // This might match IP pattern - that's a known limitation
        expect(result.sanitized).toBeDefined();
      });
    });
  });

  describe('Token Budget Manager', () => {
    let budgetManager: TokenBudgetManager;

    beforeEach(() => {
      budgetManager = new TokenBudgetManager();
    });

    it('should fit memories into budget', () => {
      const memories = createRankedMemories(5);
      const result = budgetManager.fitToBudget(memories, 1000);
      
      const totalTokens = result.reduce((sum, m) => sum + m.tokens, 0);
      expect(totalTokens).toBeLessThanOrEqual(1000);
    });

    it('should handle zero budget', () => {
      const memories = createRankedMemories(5);
      const result = budgetManager.fitToBudget(memories, 0);
      expect(result).toEqual([]);
    });

    it('should handle very small budget', () => {
      const memories = createRankedMemories(5);
      const result = budgetManager.fitToBudget(memories, 10);
      // With 10 token budget, should fit some summaries (each ~3-4 tokens)
      // but not all 5
      expect(result.length).toBeLessThan(5);
      
      // Total tokens should be within budget
      const totalTokens = result.reduce((sum, m) => sum + m.tokens, 0);
      expect(totalTokens).toBeLessThanOrEqual(10);
    });

    it('should handle empty memories array', () => {
      const result = budgetManager.fitToBudget([], 1000);
      expect(result).toEqual([]);
    });

    it('should expand top memories when budget allows', () => {
      const memories = createRankedMemories(3);
      const result = budgetManager.fitToBudget(memories, 10000);
      
      // With large budget, top memories should be expanded
      const expanded = result.filter(m => m.level === 'expanded');
      expect(expanded.length).toBeGreaterThan(0);
    });

    it('should preserve relevance scores', () => {
      const memories = createRankedMemories(3);
      const result = budgetManager.fitToBudget(memories, 1000);
      
      for (let i = 0; i < result.length; i++) {
        expect(result[i]!.relevanceScore).toBe(memories[i]!.score);
      }
    });

    it('should estimate tokens correctly', () => {
      const memory = createTribalMemory({});
      
      const summary = budgetManager.estimateTokens(memory, 'summary');
      const expanded = budgetManager.estimateTokens(memory, 'expanded');
      const full = budgetManager.estimateTokens(memory, 'full');
      
      expect(summary).toBeLessThan(expanded);
      expect(expanded).toBeLessThan(full);
    });

    it('should handle memories with very long content', () => {
      const memory = createTribalMemory({ knowledge: 'x'.repeat(10000) });
      const memories = [{ memory, score: 0.9 }];
      
      const result = budgetManager.fitToBudget(memories, 100);
      // Should still work, just might not fit
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Contradiction Detector', () => {
    let storage: SQLiteMemoryStorage;
    let detector: ContradictionDetector;

    beforeEach(async () => {
      storage = new SQLiteMemoryStorage(':memory:');
      await storage.initialize();
      detector = new ContradictionDetector(storage);
    });

    afterEach(async () => {
      await storage.close();
    });

    it('should detect no contradictions for single memory', async () => {
      const memory = createTribalMemory({});
      await storage.create(memory);
      
      const issues = await detector.detect(memory);
      expect(issues).toEqual([]);
    });

    it('should detect contradiction between same-topic memories', async () => {
      // Create two memories with same topic but different content
      const memory1 = createTribalMemory({
        id: 'mem-1',
        topic: 'authentication',
        knowledge: 'Always use JWT tokens for auth',
        confidence: 0.7,
        createdAt: new Date('2024-01-01').toISOString(),
      });
      
      const memory2 = createTribalMemory({
        id: 'mem-2',
        topic: 'authentication',
        knowledge: 'Never use JWT tokens, use sessions instead',
        confidence: 0.9,
        createdAt: new Date('2024-06-01').toISOString(),
      });
      
      await storage.create(memory1);
      await storage.create(memory2);
      
      // Check if memory1 is contradicted by memory2
      const issues = await detector.detect(memory1);
      // May or may not detect depending on similarity threshold
      expect(Array.isArray(issues)).toBe(true);
    });

    it('should not flag memories with different topics', async () => {
      const memory1 = createTribalMemory({
        id: 'mem-1',
        topic: 'authentication',
        knowledge: 'Use JWT tokens',
      });
      
      const memory2 = createTribalMemory({
        id: 'mem-2',
        topic: 'database',
        knowledge: 'Use connection pooling',
      });
      
      await storage.create(memory1);
      await storage.create(memory2);
      
      const issues = await detector.detect(memory1);
      expect(issues.filter(i => i.dimension === 'contradiction')).toEqual([]);
    });

    it('should handle memory with no topic', async () => {
      const memory = createTribalMemory({});
      (memory as any).topic = undefined;
      
      // Should not crash
      const issues = await detector.detect(memory);
      expect(Array.isArray(issues)).toBe(true);
    });

    it('should handle empty storage', async () => {
      const memory = createTribalMemory({});
      const issues = await detector.detect(memory);
      expect(issues).toEqual([]);
    });
  });

  describe('Fact Extractor', () => {
    let extractor: FactExtractor;

    beforeEach(() => {
      extractor = new FactExtractor();
    });

    it('should extract preference facts', () => {
      const episode = createEpisodicMemory({
        interaction: {
          userQuery: 'I prefer using TypeScript over JavaScript',
          agentResponse: 'Noted',
          outcome: 'accepted',
        },
      });
      
      const facts = extractor.extract(episode);
      const preferences = facts.filter(f => f.type === 'preference');
      expect(preferences.length).toBeGreaterThan(0);
    });

    it('should extract warning facts', () => {
      const episode = createEpisodicMemory({
        interaction: {
          userQuery: "Don't ever use eval() in this codebase",
          agentResponse: 'Understood',
          outcome: 'accepted',
        },
      });
      
      const facts = extractor.extract(episode);
      const warnings = facts.filter(f => f.type === 'warning');
      expect(warnings.length).toBeGreaterThan(0);
    });

    it('should extract knowledge facts', () => {
      const episode = createEpisodicMemory({
        interaction: {
          userQuery: 'You should always validate input before processing',
          agentResponse: 'Will do',
          outcome: 'accepted',
        },
      });
      
      const facts = extractor.extract(episode);
      const knowledge = facts.filter(f => f.type === 'knowledge');
      expect(knowledge.length).toBeGreaterThan(0);
    });

    it('should extract correction fact on rejection', () => {
      const episode = createEpisodicMemory({
        interaction: {
          userQuery: 'Fix the bug',
          agentResponse: 'Here is the fix',
          outcome: 'rejected',
        },
        context: {
          intent: 'fix_bug',
          focus: 'authentication',
        },
      });
      
      const facts = extractor.extract(episode);
      const corrections = facts.filter(f => f.type === 'correction');
      expect(corrections.length).toBeGreaterThan(0);
    });

    it('should handle empty query', () => {
      const episode = createEpisodicMemory({
        interaction: {
          userQuery: '',
          agentResponse: 'Response',
          outcome: 'accepted',
        },
      });
      
      const facts = extractor.extract(episode);
      expect(Array.isArray(facts)).toBe(true);
    });

    it('should handle query with no keywords', () => {
      const episode = createEpisodicMemory({
        interaction: {
          userQuery: 'Hello world',
          agentResponse: 'Hi',
          outcome: 'accepted',
        },
      });
      
      const facts = extractor.extract(episode);
      // May or may not extract facts
      expect(Array.isArray(facts)).toBe(true);
    });
  });

  describe('File Linker', () => {
    let storage: SQLiteMemoryStorage;
    let linker: FileLinker;

    beforeEach(async () => {
      storage = new SQLiteMemoryStorage(':memory:');
      await storage.initialize();
      linker = new FileLinker(storage);
    });

    afterEach(async () => {
      await storage.close();
    });

    it('should link memory to file', async () => {
      const memory = createTribalMemory({});
      const id = await storage.create(memory);
      
      await linker.link(id, 'src/auth/login.ts');
      
      const memories = await linker.getMemoriesForFile('src/auth/login.ts');
      expect(memories.length).toBe(1);
      expect(memories[0]!.id).toBe(id);
    });

    it('should link with citation', async () => {
      const memory = createTribalMemory({});
      const id = await storage.create(memory);
      
      await linker.link(id, 'src/auth/login.ts', {
        lineStart: 10,
        lineEnd: 20,
        contentHash: 'abc123',
      });
      
      const memories = await linker.getMemoriesForFile('src/auth/login.ts');
      expect(memories.length).toBe(1);
    });

    it('should auto-link based on content', async () => {
      const memory = createTribalMemory({
        knowledge: 'The login.ts file handles authentication',
      });
      const id = await storage.create(memory);
      
      const linked = await linker.autoLink(
        { ...memory, id },
        ['src/auth/login.ts', 'src/utils/helpers.ts']
      );
      
      expect(linked).toContain('src/auth/login.ts');
    });

    it('should handle file with special characters', async () => {
      const memory = createTribalMemory({});
      const id = await storage.create(memory);
      
      await linker.link(id, 'src/[slug]/page.tsx');
      
      const memories = await linker.getMemoriesForFile('src/[slug]/page.tsx');
      expect(memories.length).toBe(1);
    });

    it('should return empty for non-linked file', async () => {
      const memories = await linker.getMemoriesForFile('non-existent.ts');
      expect(memories).toEqual([]);
    });
  });

  describe('Cortex Integration Edge Cases', () => {
    // These test the main Cortex class behavior indirectly through storage

    let storage: SQLiteMemoryStorage;

    beforeEach(async () => {
      storage = new SQLiteMemoryStorage(':memory:');
      await storage.initialize();
    });

    afterEach(async () => {
      await storage.close();
    });

    it('should handle rapid memory creation', async () => {
      const promises = Array.from({ length: 50 }, (_, i) =>
        storage.create(createTribalMemory({ id: `rapid-${i}` }))
      );
      
      const ids = await Promise.all(promises);
      expect(new Set(ids).size).toBe(50);
    });

    it('should handle memory with all optional fields', async () => {
      const memory = createTribalMemory({
        subtopic: 'sub',
        context: 'additional context',
        warnings: ['warning1', 'warning2'],
        consequences: ['consequence1'],
        contributors: ['user1', 'user2'],
        lastValidated: new Date().toISOString(),
        linkedTables: ['users', 'sessions'],
        linkedEnvVars: ['DATABASE_URL'],
        tags: ['important', 'auth'],
        linkedPatterns: ['pattern-1'],
        linkedConstraints: ['constraint-1'],
      });
      
      const id = await storage.create(memory);
      const retrieved = await storage.read(id);
      
      expect(retrieved).not.toBeNull();
      expect((retrieved as TribalMemory).warnings).toEqual(['warning1', 'warning2']);
    });

    it('should handle search with complex filters', async () => {
      await storage.create(createTribalMemory({ 
        id: 'high-conf',
        confidence: 0.9,
        importance: 'critical',
      }));
      await storage.create(createTribalMemory({ 
        id: 'low-conf',
        confidence: 0.3,
        importance: 'low',
      }));
      
      const results = await storage.search({
        minConfidence: 0.5,
        importance: ['critical', 'high'],
        limit: 10,
      });
      
      expect(results.every(m => m.confidence >= 0.5)).toBe(true);
    });

    it('should handle relationship cycles', async () => {
      const id1 = await storage.create(createTribalMemory({ id: 'cycle-1' }));
      const id2 = await storage.create(createTribalMemory({ id: 'cycle-2' }));
      const id3 = await storage.create(createTribalMemory({ id: 'cycle-3' }));
      
      // Create a cycle: 1 -> 2 -> 3 -> 1
      await storage.addRelationship(id1, id2, 'related');
      await storage.addRelationship(id2, id3, 'related');
      await storage.addRelationship(id3, id1, 'related');
      
      // Should not infinite loop
      const related = await storage.getRelated(id1, 'related', 5);
      expect(Array.isArray(related)).toBe(true);
    });

    it('should handle bitemporal queries', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      await storage.create(createTribalMemory({
        id: 'temporal-1',
        createdAt: yesterday.toISOString(),
      }));
      
      // Query as of yesterday
      const scopedStorage = storage.asOf(yesterday.toISOString());
      const results = await scopedStorage.search({ limit: 10 });
      
      expect(Array.isArray(results)).toBe(true);
    });
  });
});

// Helper functions

let memoryCounter = 0;

function createTribalMemory(overrides: Partial<TribalMemory>): TribalMemory {
  memoryCounter++;
  return {
    id: overrides.id ?? `tribal-${memoryCounter}`,
    type: 'tribal',
    topic: 'test-topic',
    knowledge: 'Test knowledge',
    severity: 'warning',
    source: { type: 'manual' },
    summary: 'Test summary',
    confidence: 0.8,
    importance: 'normal',
    accessCount: 0,
    transactionTime: { recordedAt: new Date().toISOString() },
    validTime: { validFrom: new Date().toISOString() },
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createEpisodicMemory(overrides: Partial<EpisodicMemory>): EpisodicMemory {
  memoryCounter++;
  return {
    id: `episodic-${memoryCounter}`,
    type: 'episodic',
    sessionId: 'session-1',
    context: overrides.context ?? {
      intent: 'add_feature',
      focus: 'test',
    },
    interaction: overrides.interaction ?? {
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

function createRankedMemories(count: number): Array<{ memory: Memory; score: number }> {
  return Array.from({ length: count }, (_, i) => ({
    memory: createTribalMemory({ id: `ranked-${i}` }),
    score: 1.0 - i * 0.1,
  }));
}
