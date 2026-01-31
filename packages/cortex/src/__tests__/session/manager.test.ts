/**
 * Session Manager Tests
 * 
 * Tests for the SessionContextManager.
 * 
 * @module __tests__/session/manager
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SessionContextManager } from '../../session/context/manager.js';
import { SQLiteSessionStorage } from '../../session/storage/sqlite.js';
import { ContextDeduplicator } from '../../session/context/deduplicator.js';
import { LoadedMemoryTracker } from '../../session/context/tracker.js';
import type { Memory } from '../../types/memory.js';

// Helper to create test memory
function createTestMemory(id: string): Memory {
  const now = new Date().toISOString();
  return {
    id,
    type: 'tribal',
    summary: 'Test memory',
    confidence: 0.85,
    importance: 'high',
    transactionTime: { recordedAt: now },
    validTime: { validFrom: now },
    accessCount: 0,
    createdAt: now,
    updatedAt: now,
    tags: [],
  } as Memory;
}

describe('Session Manager Tests', () => {
  describe('SessionContextManager', () => {
    let manager: SessionContextManager;
    let db: Database.Database;
    let storage: SQLiteSessionStorage;

    beforeEach(() => {
      db = new Database(':memory:');
      storage = new SQLiteSessionStorage(db);
      manager = new SessionContextManager(storage, { persistSessions: true });
    });

    afterEach(() => {
      db.close();
    });

    it('should start a new session', async () => {
      const session = await manager.startSession();

      expect(session.id).toBeDefined();
      expect(session.startedAt).toBeDefined();
      expect(session.loadedMemories.size).toBe(0);
      expect(session.tokensSent).toBe(0);
    });

    it('should start session with custom ID', async () => {
      const session = await manager.startSession({ id: 'custom-session-id' });

      expect(session.id).toBe('custom-session-id');
    });

    it('should start session with metadata', async () => {
      const session = await manager.startSession({
        metadata: { userId: 'user-123', projectId: 'proj-456' },
      });

      expect(session.metadata?.userId).toBe('user-123');
      expect(session.metadata?.projectId).toBe('proj-456');
    });

    it('should end previous session when starting new one', async () => {
      const session1 = await manager.startSession();
      const session2 = await manager.startSession();

      expect(session2.id).not.toBe(session1.id);

      // Session 1 should be ended
      const stored = await storage.getSession(session1.id);
      expect(stored?.endedAt).toBeDefined();
    });

    it('should end session', async () => {
      const session = await manager.startSession();
      await manager.endSession(session.id);

      const active = await manager.getActiveSession();
      expect(active).toBeNull();
    });

    it('should get active session', async () => {
      const session = await manager.startSession();
      const active = await manager.getActiveSession();

      expect(active?.id).toBe(session.id);
    });

    it('should record memory loaded', async () => {
      const session = await manager.startSession();
      await manager.recordMemoryLoaded(session.id, 'mem-1', 100);

      const active = await manager.getActiveSession();
      expect(active?.loadedMemories.has('mem-1')).toBe(true);
      expect(active?.tokensSent).toBe(100);
    });

    it('should record pattern loaded', async () => {
      const session = await manager.startSession();
      await manager.recordPatternLoaded(session.id, 'pat-1', 50);

      const active = await manager.getActiveSession();
      expect(active?.loadedPatterns.has('pat-1')).toBe(true);
    });

    it('should record file loaded', async () => {
      const session = await manager.startSession();
      await manager.recordFileLoaded(session.id, 'src/utils.ts', 200);

      const active = await manager.getActiveSession();
      expect(active?.loadedFiles.has('src/utils.ts')).toBe(true);
    });

    it('should record query', async () => {
      const session = await manager.startSession();
      await manager.recordQuery(session.id, 500);
      await manager.recordQuery(session.id, 300);

      const active = await manager.getActiveSession();
      expect(active?.queriesMade).toBe(2);
      expect(active?.tokensSent).toBe(800);
    });

    it('should get session statistics', async () => {
      const session = await manager.startSession();
      await manager.recordMemoryLoaded(session.id, 'mem-1', 100);
      await manager.recordMemoryLoaded(session.id, 'mem-2', 150);
      await manager.recordQuery(session.id, 500);

      const stats = await manager.getSessionStats(session.id);

      expect(stats).toBeDefined();
      expect(stats?.memoriesLoaded).toBeGreaterThanOrEqual(2);
      expect(stats?.tokensSent).toBe(750);
      expect(stats?.queriesMade).toBe(1);
    });

    it('should validate session', async () => {
      const session = await manager.startSession();

      expect(manager.isSessionValid(session)).toBe(true);

      // End session
      session.endedAt = new Date().toISOString();
      expect(manager.isSessionValid(session)).toBe(false);
    });

    it('should invalidate session after max tokens', async () => {
      const customManager = new SessionContextManager(storage, {
        maxTokensPerSession: 100,
      });

      const session = await customManager.startSession();
      session.tokensSent = 150;

      expect(customManager.isSessionValid(session)).toBe(false);
    });

    it('should get tracker instance', async () => {
      const tracker = manager.getTracker();
      expect(tracker).toBeInstanceOf(LoadedMemoryTracker);
    });

    it('should update metadata', async () => {
      const session = await manager.startSession();
      const result = await manager.updateMetadata(session.id, {
        userId: 'new-user',
      });

      expect(result.success).toBe(true);

      const active = await manager.getActiveSession();
      expect(active?.metadata?.userId).toBe('new-user');
    });

    it('should fail to update metadata for non-active session', async () => {
      const result = await manager.updateMetadata('unknown-session', {
        userId: 'user',
      });

      expect(result.success).toBe(false);
    });

    it('should not record for wrong session ID', async () => {
      const session = await manager.startSession();
      await manager.recordMemoryLoaded('wrong-id', 'mem-1', 100);

      const active = await manager.getActiveSession();
      expect(active?.loadedMemories.has('mem-1')).toBe(false);
    });
  });

  describe('ContextDeduplicator', () => {
    let tracker: LoadedMemoryTracker;
    let deduplicator: ContextDeduplicator;

    beforeEach(() => {
      tracker = new LoadedMemoryTracker();
      deduplicator = new ContextDeduplicator(tracker);
    });

    it('should deduplicate memories', () => {
      tracker.markLoaded('memory', 'mem-1');
      tracker.markLoaded('memory', 'mem-2');

      const memories = [
        createTestMemory('mem-1'),
        createTestMemory('mem-2'),
        createTestMemory('mem-3'),
      ];

      const deduplicated = deduplicator.deduplicate(memories);

      expect(deduplicated).toHaveLength(1);
      expect(deduplicated[0]?.id).toBe('mem-3');
    });

    it('should deduplicate with details', () => {
      tracker.markLoaded('memory', 'mem-1', { tokenCount: 100 });

      const memories = [
        createTestMemory('mem-1'),
        createTestMemory('mem-2'),
      ];

      const result = deduplicator.deduplicateWithDetails(memories);

      expect(result.new).toHaveLength(1);
      expect(result.duplicate).toHaveLength(1);
      expect(result.tokensSaved).toBe(100);
    });

    it('should deduplicate patterns', () => {
      tracker.markLoaded('pattern', 'pat-1');

      const patterns = [
        { id: 'pat-1', name: 'Pattern 1' },
        { id: 'pat-2', name: 'Pattern 2' },
      ];

      const deduplicated = deduplicator.deduplicatePatterns(patterns);

      expect(deduplicated).toHaveLength(1);
      expect(deduplicated[0]?.id).toBe('pat-2');
    });

    it('should deduplicate files', () => {
      tracker.markLoaded('file', 'src/utils.ts');

      const files = ['src/utils.ts', 'src/helpers.ts'];

      const deduplicated = deduplicator.deduplicateFiles(files);

      expect(deduplicated).toHaveLength(1);
      expect(deduplicated[0]).toBe('src/helpers.ts');
    });

    it('should deduplicate constraints', () => {
      tracker.markLoaded('constraint', 'con-1');

      const constraints = [
        { id: 'con-1', rule: 'Rule 1' },
        { id: 'con-2', rule: 'Rule 2' },
      ];

      const deduplicated = deduplicator.deduplicateConstraints(constraints);

      expect(deduplicated).toHaveLength(1);
      expect(deduplicated[0]?.id).toBe('con-2');
    });

    it('should mark items as sent', () => {
      const tokenCounts = new Map([
        ['mem-1', 100],
        ['mem-2', 200],
      ]);

      deduplicator.markSent('memory', ['mem-1', 'mem-2'], tokenCounts);

      expect(tracker.isLoaded('memory', 'mem-1')).toBe(true);
      expect(tracker.isLoaded('memory', 'mem-2')).toBe(true);
      expect(tracker.getMetadata('memory', 'mem-1')?.tokenCount).toBe(100);
    });

    it('should mark memories sent with compression levels', () => {
      const memories = [createTestMemory('mem-1'), createTestMemory('mem-2')];
      const compressionLevels = new Map([
        ['mem-1', 2],
        ['mem-2', 1],
      ]);
      const tokenCounts = new Map([
        ['mem-1', 200],
        ['mem-2', 50],
      ]);

      deduplicator.markMemoriesSent(memories, compressionLevels, tokenCounts);

      expect(tracker.getMetadata('memory', 'mem-1')?.compressionLevel).toBe(2);
      expect(tracker.getMetadata('memory', 'mem-2')?.compressionLevel).toBe(1);
    });

    it('should get deduplication stats', () => {
      tracker.markLoaded('memory', 'mem-1', { tokenCount: 100 });
      tracker.markLoaded('pattern', 'pat-1', { tokenCount: 50 });
      tracker.markLoaded('file', 'file-1');
      tracker.markLoaded('constraint', 'con-1');

      const stats = deduplicator.getStats();

      expect(stats.memoriesLoaded).toBe(1);
      expect(stats.patternsLoaded).toBe(1);
      expect(stats.filesLoaded).toBe(1);
      expect(stats.constraintsLoaded).toBe(1);
      expect(stats.totalTokens).toBe(150);
    });

    it('should calculate potential savings', () => {
      tracker.markLoaded('memory', 'mem-1', { tokenCount: 100 });
      tracker.markLoaded('memory', 'mem-2', { tokenCount: 200 });

      const memories = [
        createTestMemory('mem-1'),
        createTestMemory('mem-2'),
        createTestMemory('mem-3'),
      ];

      const savings = deduplicator.calculatePotentialSavings(memories);

      expect(savings).toBe(300);
    });

    it('should reset deduplication state', () => {
      tracker.markLoaded('memory', 'mem-1');
      tracker.markLoaded('pattern', 'pat-1');

      deduplicator.reset();

      expect(tracker.getTotalCount()).toBe(0);
    });
  });

  describe('SQLiteSessionStorage', () => {
    let db: Database.Database;
    let storage: SQLiteSessionStorage;

    beforeEach(() => {
      db = new Database(':memory:');
      storage = new SQLiteSessionStorage(db);
    });

    afterEach(() => {
      db.close();
    });

    it('should save and retrieve session', async () => {
      const now = new Date().toISOString();
      const session = {
        id: 'test-session',
        startedAt: now,
        loadedMemories: new Set(['mem-1', 'mem-2']),
        loadedPatterns: new Set(['pat-1']),
        loadedFiles: new Set(['file-1']),
        loadedConstraints: new Set(['con-1']),
        tokensSent: 500,
        queriesMade: 3,
        lastActivity: now,
      };

      await storage.saveSession(session);
      const retrieved = await storage.getSession('test-session');

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('test-session');
      expect(retrieved?.loadedMemories.has('mem-1')).toBe(true);
      expect(retrieved?.tokensSent).toBe(500);
    });

    it('should return null for non-existent session', async () => {
      const session = await storage.getSession('unknown');
      expect(session).toBeNull();
    });

    it('should get all sessions', async () => {
      const now = new Date().toISOString();
      const baseSession = {
        startedAt: now,
        loadedMemories: new Set<string>(),
        loadedPatterns: new Set<string>(),
        loadedFiles: new Set<string>(),
        loadedConstraints: new Set<string>(),
        tokensSent: 0,
        queriesMade: 0,
        lastActivity: now,
      };

      await storage.saveSession({ ...baseSession, id: 'session-1' });
      await storage.saveSession({ ...baseSession, id: 'session-2' });
      await storage.saveSession({ ...baseSession, id: 'session-3' });

      const sessions = await storage.getAllSessions();

      expect(sessions).toHaveLength(3);
    });

    it('should get recent sessions', async () => {
      const now = new Date().toISOString();
      const baseSession = {
        startedAt: now,
        loadedMemories: new Set<string>(),
        loadedPatterns: new Set<string>(),
        loadedFiles: new Set<string>(),
        loadedConstraints: new Set<string>(),
        tokensSent: 0,
        queriesMade: 0,
        lastActivity: now,
      };

      await storage.saveSession({ ...baseSession, id: 'session-1' });
      await storage.saveSession({ ...baseSession, id: 'session-2' });
      await storage.saveSession({ ...baseSession, id: 'session-3' });

      const recent = await storage.getRecentSessions(2);

      expect(recent).toHaveLength(2);
    });

    it('should delete session', async () => {
      const now = new Date().toISOString();
      const session = {
        id: 'to-delete',
        startedAt: now,
        loadedMemories: new Set<string>(),
        loadedPatterns: new Set<string>(),
        loadedFiles: new Set<string>(),
        loadedConstraints: new Set<string>(),
        tokensSent: 0,
        queriesMade: 0,
        lastActivity: now,
      };

      await storage.saveSession(session);
      const deleted = await storage.deleteSession('to-delete');

      expect(deleted).toBe(true);
      expect(await storage.getSession('to-delete')).toBeNull();
    });

    it('should check if session exists', async () => {
      const now = new Date().toISOString();
      const session = {
        id: 'exists',
        startedAt: now,
        loadedMemories: new Set<string>(),
        loadedPatterns: new Set<string>(),
        loadedFiles: new Set<string>(),
        loadedConstraints: new Set<string>(),
        tokensSent: 0,
        queriesMade: 0,
        lastActivity: now,
      };

      await storage.saveSession(session);

      expect(await storage.sessionExists('exists')).toBe(true);
      expect(await storage.sessionExists('not-exists')).toBe(false);
    });

    it('should get active sessions', async () => {
      const now = new Date().toISOString();
      const baseSession = {
        startedAt: now,
        loadedMemories: new Set<string>(),
        loadedPatterns: new Set<string>(),
        loadedFiles: new Set<string>(),
        loadedConstraints: new Set<string>(),
        tokensSent: 0,
        queriesMade: 0,
        lastActivity: now,
      };

      await storage.saveSession({ ...baseSession, id: 'active-1' });
      await storage.saveSession({ ...baseSession, id: 'active-2' });
      await storage.saveSession({ ...baseSession, id: 'ended', endedAt: now });

      const active = await storage.getActiveSessions();

      expect(active).toHaveLength(2);
    });

    it('should get session stats', async () => {
      const now = new Date().toISOString();
      const session = {
        id: 'stats-session',
        startedAt: now,
        loadedMemories: new Set(['mem-1', 'mem-2']),
        loadedPatterns: new Set(['pat-1']),
        loadedFiles: new Set(['file-1']),
        loadedConstraints: new Set<string>(),
        tokensSent: 1000,
        queriesMade: 5,
        lastActivity: now,
      };

      await storage.saveSession(session);
      const stats = await storage.getSessionStats('stats-session');

      expect(stats).toBeDefined();
      expect(stats?.memoriesLoaded).toBe(2);
      expect(stats?.patternsLoaded).toBe(1);
      expect(stats?.tokensSent).toBe(1000);
      expect(stats?.queriesMade).toBe(5);
    });

    it('should delete sessions before date', async () => {
      const oldDate = new Date('2020-01-01').toISOString();
      const newDate = new Date().toISOString();

      const baseSession = {
        loadedMemories: new Set<string>(),
        loadedPatterns: new Set<string>(),
        loadedFiles: new Set<string>(),
        loadedConstraints: new Set<string>(),
        tokensSent: 0,
        queriesMade: 0,
      };

      await storage.saveSession({
        ...baseSession,
        id: 'old-session',
        startedAt: oldDate,
        endedAt: oldDate,
        lastActivity: oldDate,
      });

      await storage.saveSession({
        ...baseSession,
        id: 'new-session',
        startedAt: newDate,
        lastActivity: newDate,
      });

      const deleted = await storage.deleteSessionsBefore('2021-01-01');

      expect(deleted).toBe(1);
      expect(await storage.sessionExists('old-session')).toBe(false);
      expect(await storage.sessionExists('new-session')).toBe(true);
    });
  });
});
