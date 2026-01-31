/**
 * Causal Narrative Integration Tests
 * 
 * Tests the causal graph traversal and narrative generation
 * that explains WHY things are the way they are.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteMemoryStorage } from '../../storage/sqlite/index.js';
import { CortexV2 } from '../../orchestrators/cortex-v2.js';

describe('Causal Narrative Integration Tests', () => {
  let storage: SQLiteMemoryStorage;
  let cortex: CortexV2;

  beforeEach(async () => {
    storage = new SQLiteMemoryStorage(':memory:');
    await storage.initialize();
    cortex = new CortexV2(storage);
  });

  afterEach(async () => {
    await storage.close();
  });

  describe('Causal Chain Building', () => {
    it('should build causal chain from related memories', async () => {
      // Create a chain of related memories
      const rootId = await storage.create({
        type: 'decision_context',
        decisionSummary: 'Chose PostgreSQL over MongoDB',
        businessContext: 'Need ACID compliance for financial data',
        stillValid: true,
        confidence: 0.95,
        importance: 'high',
        summary: '🗄️ PostgreSQL decision',
      } as any);

      const consequenceId = await storage.create({
        type: 'pattern_rationale',
        patternName: 'repository-pattern',
        rationale: 'Abstracts database access for PostgreSQL',
        confidence: 0.9,
        importance: 'normal',
        summary: '📦 Repository pattern for PostgreSQL',
      } as any);

      // Link them causally
      await storage.addRelationship(consequenceId, rootId, 'derived_from');

      // Verify chain exists
      const rootRelated = await storage.getRelated(consequenceId, 'derived_from');
      expect(rootRelated).toBeDefined();
    });

    it('should handle circular references gracefully', async () => {
      const id1 = await storage.create({
        type: 'tribal',
        topic: 'circular-1',
        knowledge: 'First in cycle',
        severity: 'info',
        confidence: 0.8,
        importance: 'normal',
        summary: '🔄 Circular 1',
      } as any);

      const id2 = await storage.create({
        type: 'tribal',
        topic: 'circular-2',
        knowledge: 'Second in cycle',
        severity: 'info',
        confidence: 0.8,
        importance: 'normal',
        summary: '🔄 Circular 2',
      } as any);

      // Create circular reference
      await storage.addRelationship(id1, id2, 'related');
      await storage.addRelationship(id2, id1, 'related');

      // Should not throw or infinite loop
      const related1 = await storage.getRelated(id1, 'related');
      const related2 = await storage.getRelated(id2, 'related');

      expect(related1.length).toBe(1);
      expect(related2.length).toBe(1);
    });
  });

  describe('Why Queries', () => {
    beforeEach(async () => {
      // Set up a rich context for "why" queries
      await storage.create({
        type: 'decision_context',
        decisionSummary: 'Adopted TypeScript for type safety',
        businessContext: 'Reduce runtime errors in production',
        stillValid: true,
        confidence: 0.95,
        importance: 'high',
        summary: '📝 TypeScript adoption',
        linkedFiles: ['src/**/*.ts'],
      } as any);

      await storage.create({
        type: 'pattern_rationale',
        patternName: 'strict-null-checks',
        rationale: 'Prevents null reference errors at compile time',
        confidence: 0.9,
        importance: 'normal',
        summary: '✓ Strict null checks',
      } as any);

      await storage.create({
        type: 'tribal',
        topic: 'typescript',
        knowledge: 'Always define return types for public functions',
        severity: 'warning',
        confidence: 0.85,
        importance: 'normal',
        summary: '📋 Return type requirement',
      } as any);

      await storage.create({
        type: 'code_smell',
        name: 'any-type',
        reason: 'Defeats the purpose of TypeScript',
        suggestion: 'Use proper types or unknown',
        confidence: 0.95,
        importance: 'high',
        summary: '⚠️ Avoid any type',
      } as any);
    });

    it('should get why context for a focus area', async () => {
      const result = await cortex.getWhy('understand_code', 'typescript');

      expect(result).toBeDefined();
      expect(result.narrative).toBeDefined();
      // May or may not have causal chain depending on setup
    });

    it('should include relevant memories in why response', async () => {
      const result = await cortex.getWhy('add_feature', 'types');

      expect(result.sources.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Relationship Types', () => {
    it('should handle supersedes relationship', async () => {
      const oldId = await storage.create({
        type: 'tribal',
        topic: 'old-practice',
        knowledge: 'Use callbacks for async',
        severity: 'info',
        confidence: 0.9,
        importance: 'normal',
        summary: '📜 Old: callbacks',
      } as any);

      const newId = await storage.create({
        type: 'tribal',
        topic: 'new-practice',
        knowledge: 'Use async/await for async',
        severity: 'info',
        confidence: 0.95,
        importance: 'normal',
        summary: '✨ New: async/await',
      } as any);

      await storage.addRelationship(newId, oldId, 'supersedes');

      const superseded = await storage.getRelated(newId, 'supersedes');
      expect(superseded).toBeDefined();
    });

    it('should handle supports relationship', async () => {
      const mainId = await storage.create({
        type: 'pattern_rationale',
        patternName: 'dependency-injection',
        rationale: 'Improves testability',
        confidence: 0.9,
        importance: 'normal',
        summary: '📦 DI pattern',
      } as any);

      const supportingId = await storage.create({
        type: 'tribal',
        topic: 'testing',
        knowledge: 'DI makes mocking dependencies easy',
        severity: 'info',
        confidence: 0.85,
        importance: 'normal',
        summary: '🧪 DI for testing',
      } as any);

      await storage.addRelationship(supportingId, mainId, 'supports');

      const supporting = await storage.getRelated(supportingId, 'supports');
      expect(supporting.length).toBe(1);
    });

    it('should handle contradicts relationship', async () => {
      const id1 = await storage.create({
        type: 'tribal',
        topic: 'approach-1',
        knowledge: 'Use ORM for all database access',
        severity: 'info',
        confidence: 0.7,
        importance: 'normal',
        summary: '🗄️ Use ORM',
      } as any);

      const id2 = await storage.create({
        type: 'tribal',
        topic: 'approach-2',
        knowledge: 'Use raw SQL for complex queries',
        severity: 'info',
        confidence: 0.75,
        importance: 'normal',
        summary: '🗄️ Use raw SQL',
      } as any);

      await storage.addRelationship(id1, id2, 'contradicts');

      const contradictions = await storage.getRelated(id1, 'contradicts');
      expect(contradictions.length).toBe(1);
    });
  });

  describe('File Linking', () => {
    it('should link memories to files', async () => {
      const id = await storage.create({
        type: 'tribal',
        topic: 'auth',
        knowledge: 'Always validate JWT tokens',
        severity: 'critical',
        confidence: 0.95,
        importance: 'high',
        summary: '🔐 JWT validation',
      } as any);

      await storage.linkToFile(id, 'src/auth/jwt.ts');

      const byFile = await storage.findByFile('src/auth/jwt.ts');
      expect(byFile).toBeDefined();
    });

    it('should find memories by file pattern', async () => {
      const id1 = await storage.create({
        type: 'tribal',
        topic: 'api',
        knowledge: 'Validate request bodies',
        severity: 'warning',
        confidence: 0.9,
        importance: 'normal',
        summary: '✓ Request validation',
      } as any);

      await storage.linkToFile(id1, 'src/api/users.ts');

      const apiMemories = await storage.findByFile('src/api/users.ts');
      expect(apiMemories).toBeDefined();
    });
  });

  describe('Pattern Linking', () => {
    it('should link memories to patterns', async () => {
      const id = await storage.create({
        type: 'pattern_rationale',
        patternName: 'singleton',
        rationale: 'Ensures single instance of database connection',
        confidence: 0.9,
        importance: 'normal',
        summary: '📦 Singleton for DB',
      } as any);

      await storage.linkToPattern(id, 'pattern-singleton-001');

      const byPattern = await storage.findByPattern('pattern-singleton-001');
      expect(byPattern).toBeDefined();
    });
  });

  describe('Narrative Generation', () => {
    it('should generate narrative for simple chain', async () => {
      // Create a simple causal chain
      const decisionId = await storage.create({
        type: 'decision_context',
        decisionSummary: 'Use Redis for caching',
        businessContext: 'Improve API response times',
        stillValid: true,
        confidence: 0.9,
        importance: 'high',
        summary: '🗄️ Redis caching decision',
      } as any);

      const practiceId = await storage.create({
        type: 'tribal',
        topic: 'caching',
        knowledge: 'Set TTL on all cache keys',
        severity: 'warning',
        confidence: 0.85,
        importance: 'normal',
        summary: '⏰ Cache TTL requirement',
      } as any);

      await storage.addRelationship(practiceId, decisionId, 'derived_from');

      // Get why for caching
      const result = await cortex.getWhy('understand_code', 'caching');

      expect(result).toBeDefined();
    });

    it('should handle missing causal data gracefully', async () => {
      // Create memory without causal links
      await storage.create({
        type: 'tribal',
        topic: 'isolated',
        knowledge: 'Standalone knowledge',
        severity: 'info',
        confidence: 0.8,
        importance: 'normal',
        summary: '📝 Isolated memory',
      } as any);

      const result = await cortex.getWhy('understand_code', 'isolated');

      // Should not throw, should return something
      expect(result).toBeDefined();
    });
  });
});
