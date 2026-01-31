/**
 * Session Tracker Tests
 * 
 * Tests for the LoadedMemoryTracker.
 * 
 * @module __tests__/session/tracker
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LoadedMemoryTracker, type TrackableType } from '../../session/context/tracker.js';

describe('Session Tracker Tests', () => {
  describe('LoadedMemoryTracker', () => {
    let tracker: LoadedMemoryTracker;

    beforeEach(() => {
      tracker = new LoadedMemoryTracker();
    });

    it('should mark items as loaded', () => {
      tracker.markLoaded('memory', 'mem-1');
      tracker.markLoaded('pattern', 'pat-1');
      tracker.markLoaded('file', 'src/utils.ts');
      tracker.markLoaded('constraint', 'con-1');

      expect(tracker.isLoaded('memory', 'mem-1')).toBe(true);
      expect(tracker.isLoaded('pattern', 'pat-1')).toBe(true);
      expect(tracker.isLoaded('file', 'src/utils.ts')).toBe(true);
      expect(tracker.isLoaded('constraint', 'con-1')).toBe(true);
    });

    it('should return false for unloaded items', () => {
      expect(tracker.isLoaded('memory', 'unknown')).toBe(false);
      expect(tracker.isLoaded('pattern', 'unknown')).toBe(false);
    });

    it('should track metadata', () => {
      tracker.markLoaded('memory', 'mem-1', {
        tokenCount: 100,
        compressionLevel: 2,
      });

      const metadata = tracker.getMetadata('memory', 'mem-1');

      expect(metadata).toBeDefined();
      expect(metadata?.tokenCount).toBe(100);
      expect(metadata?.compressionLevel).toBe(2);
      expect(metadata?.loadCount).toBe(1);
      expect(metadata?.loadedAt).toBeDefined();
    });

    it('should increment load count on re-load', () => {
      tracker.markLoaded('memory', 'mem-1');
      tracker.markLoaded('memory', 'mem-1');
      tracker.markLoaded('memory', 'mem-1');

      const metadata = tracker.getMetadata('memory', 'mem-1');
      expect(metadata?.loadCount).toBe(3);
    });

    it('should get all loaded items of a type', () => {
      tracker.markLoaded('memory', 'mem-1');
      tracker.markLoaded('memory', 'mem-2');
      tracker.markLoaded('memory', 'mem-3');

      const loaded = tracker.getLoaded('memory');

      expect(loaded).toHaveLength(3);
      expect(loaded).toContain('mem-1');
      expect(loaded).toContain('mem-2');
      expect(loaded).toContain('mem-3');
    });

    it('should get loaded items as Set', () => {
      tracker.markLoaded('pattern', 'pat-1');
      tracker.markLoaded('pattern', 'pat-2');

      const loadedSet = tracker.getLoadedSet('pattern');

      expect(loadedSet).toBeInstanceOf(Set);
      expect(loadedSet.has('pat-1')).toBe(true);
      expect(loadedSet.has('pat-2')).toBe(true);
    });

    it('should get count of loaded items', () => {
      tracker.markLoaded('file', 'file-1');
      tracker.markLoaded('file', 'file-2');

      expect(tracker.getCount('file')).toBe(2);
      expect(tracker.getCount('memory')).toBe(0);
    });

    it('should get total count across all types', () => {
      tracker.markLoaded('memory', 'mem-1');
      tracker.markLoaded('pattern', 'pat-1');
      tracker.markLoaded('file', 'file-1');
      tracker.markLoaded('constraint', 'con-1');

      expect(tracker.getTotalCount()).toBe(4);
    });

    it('should calculate total tokens', () => {
      tracker.markLoaded('memory', 'mem-1', { tokenCount: 100 });
      tracker.markLoaded('memory', 'mem-2', { tokenCount: 200 });
      tracker.markLoaded('pattern', 'pat-1', { tokenCount: 50 });

      expect(tracker.getTotalTokens()).toBe(350);
    });

    it('should unmark items', () => {
      tracker.markLoaded('memory', 'mem-1');
      expect(tracker.isLoaded('memory', 'mem-1')).toBe(true);

      const result = tracker.unmark('memory', 'mem-1');

      expect(result).toBe(true);
      expect(tracker.isLoaded('memory', 'mem-1')).toBe(false);
    });

    it('should return false when unmarking non-existent item', () => {
      const result = tracker.unmark('memory', 'unknown');
      expect(result).toBe(false);
    });

    it('should clear items of a specific type', () => {
      tracker.markLoaded('memory', 'mem-1');
      tracker.markLoaded('memory', 'mem-2');
      tracker.markLoaded('pattern', 'pat-1');

      tracker.clearType('memory');

      expect(tracker.getCount('memory')).toBe(0);
      expect(tracker.getCount('pattern')).toBe(1);
    });

    it('should clear all items', () => {
      tracker.markLoaded('memory', 'mem-1');
      tracker.markLoaded('pattern', 'pat-1');
      tracker.markLoaded('file', 'file-1');
      tracker.markLoaded('constraint', 'con-1');

      tracker.clear();

      expect(tracker.getTotalCount()).toBe(0);
    });

    it('should export state for serialization', () => {
      tracker.markLoaded('memory', 'mem-1', { tokenCount: 100 });
      tracker.markLoaded('pattern', 'pat-1');

      const exported = tracker.export();

      expect(exported.memories).toHaveLength(1);
      expect(exported.patterns).toHaveLength(1);
      expect(exported.files).toHaveLength(0);
      expect(exported.constraints).toHaveLength(0);
    });

    it('should import state from serialization', () => {
      const state = {
        memories: [['mem-1', { loadedAt: new Date().toISOString(), loadCount: 2, tokenCount: 100 }]] as [string, any][],
        patterns: [['pat-1', { loadedAt: new Date().toISOString(), loadCount: 1 }]] as [string, any][],
      };

      tracker.import(state);

      expect(tracker.isLoaded('memory', 'mem-1')).toBe(true);
      expect(tracker.isLoaded('pattern', 'pat-1')).toBe(true);
      expect(tracker.getMetadata('memory', 'mem-1')?.loadCount).toBe(2);
    });

    it('should get all metadata for a type', () => {
      tracker.markLoaded('memory', 'mem-1', { tokenCount: 100 });
      tracker.markLoaded('memory', 'mem-2', { tokenCount: 200 });

      const allMetadata = tracker.getAllMetadata('memory');

      expect(allMetadata.size).toBe(2);
      expect(allMetadata.get('mem-1')?.tokenCount).toBe(100);
      expect(allMetadata.get('mem-2')?.tokenCount).toBe(200);
    });

    it('should throw for unknown trackable type', () => {
      expect(() => {
        tracker.markLoaded('unknown' as TrackableType, 'id');
      }).toThrow('Unknown trackable type');
    });
  });
});
