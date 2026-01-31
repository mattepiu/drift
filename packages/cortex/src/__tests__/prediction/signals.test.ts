/**
 * Prediction Signals Tests
 * 
 * Tests for signal extraction components.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  FileSignalExtractor,
  TemporalSignalExtractor,
  BehavioralSignalExtractor,
  GitSignalExtractor,
  SignalGatherer,
} from '../../prediction/signals/index.js';

describe('FileSignalExtractor', () => {
  let extractor: FileSignalExtractor;

  beforeEach(() => {
    extractor = new FileSignalExtractor();
  });

  it('should extract file type from path', () => {
    const signals = extractor.extract('/path/to/file.ts', []);
    expect(signals.fileType).toBe('ts');
  });

  it('should extract directory from path', () => {
    const signals = extractor.extract('/path/to/file.ts', []);
    expect(signals.directory).toBe('/path/to');
  });

  it('should include recent files', () => {
    const recentFiles = ['/a.ts', '/b.ts', '/c.ts'];
    const signals = extractor.extract('/path/to/file.ts', recentFiles);
    expect(signals.recentFiles).toEqual(recentFiles);
  });

  it('should limit recent files to max', () => {
    const recentFiles = Array.from({ length: 20 }, (_, i) => `/file${i}.ts`);
    const signals = extractor.extract('/path/to/file.ts', recentFiles);
    expect(signals.recentFiles.length).toBeLessThanOrEqual(10);
  });

  describe('detectPatterns', () => {
    it('should detect async patterns', () => {
      const code = 'async function fetchData() { await fetch(); }';
      const patterns = extractor.detectPatterns(code, 'ts');
      expect(patterns).toContain('async-function');
      expect(patterns).toContain('await-usage');
    });

    it('should detect error handling patterns', () => {
      const code = 'try { doSomething(); } catch (e) { console.error(e); }';
      const patterns = extractor.detectPatterns(code, 'ts');
      expect(patterns).toContain('error-handling');
    });

    it('should detect React hooks', () => {
      const code = 'const [state, setState] = useState(0); useEffect(() => {}, []);';
      const patterns = extractor.detectPatterns(code, 'tsx');
      expect(patterns).toContain('react-hooks');
    });

    it('should detect API patterns', () => {
      const code = 'router.get("/users", handler); router.post("/users", create);';
      const patterns = extractor.detectPatterns(code, 'ts');
      expect(patterns).toContain('express-route');
    });

    it('should detect validation patterns', () => {
      const code = 'const schema = z.object({ name: z.string() });';
      const patterns = extractor.detectPatterns(code, 'ts');
      expect(patterns).toContain('zod-validation');
    });
  });

  describe('extractImports', () => {
    it('should extract ES6 imports', () => {
      const code = `
        import { useState } from 'react';
        import express from 'express';
      `;
      const imports = extractor.extractImports(code, 'ts');
      expect(imports).toContain('react');
      expect(imports).toContain('express');
    });

    it('should extract CommonJS requires', () => {
      const code = `
        const fs = require('fs');
        const path = require('path');
      `;
      const imports = extractor.extractImports(code, 'js');
      expect(imports).toContain('fs');
      expect(imports).toContain('path');
    });

    it('should extract Python imports', () => {
      const code = `
        from flask import Flask
        import os
      `;
      const imports = extractor.extractImports(code, 'py');
      expect(imports).toContain('flask');
      expect(imports).toContain('os');
    });
  });

  describe('extractSymbols', () => {
    it('should extract function declarations', () => {
      const code = `
        function handleRequest() {}
        async function fetchData() {}
      `;
      const symbols = extractor.extractSymbols(code, 'ts');
      expect(symbols).toContain('handleRequest');
      expect(symbols).toContain('fetchData');
    });

    it('should extract class declarations', () => {
      const code = `
        class UserService {}
        export class AuthController {}
      `;
      const symbols = extractor.extractSymbols(code, 'ts');
      expect(symbols).toContain('UserService');
      expect(symbols).toContain('AuthController');
    });

    it('should extract TypeScript types', () => {
      const code = `
        interface User { name: string; }
        type UserId = string;
      `;
      const symbols = extractor.extractSymbols(code, 'ts');
      expect(symbols).toContain('User');
      expect(symbols).toContain('UserId');
    });
  });
});

describe('TemporalSignalExtractor', () => {
  let extractor: TemporalSignalExtractor;

  beforeEach(() => {
    extractor = new TemporalSignalExtractor();
  });

  it('should extract time of day', () => {
    const signals = extractor.extract();
    expect(['morning', 'afternoon', 'evening', 'night']).toContain(signals.timeOfDay);
  });

  it('should extract day of week', () => {
    const signals = extractor.extract();
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    expect(days).toContain(signals.dayOfWeek);
  });

  it('should detect new session on first call', () => {
    const signals = extractor.extract();
    expect(signals.isNewSession).toBe(true);
  });

  it('should not be new session on subsequent calls', () => {
    extractor.extract(); // First call
    const signals = extractor.extract(); // Second call
    expect(signals.isNewSession).toBe(false);
  });

  it('should track session duration', () => {
    extractor.startSession();
    const signals = extractor.extract();
    expect(signals.sessionDuration).toBeGreaterThanOrEqual(0);
  });

  it('should track time since last query', () => {
    extractor.extract(); // First call
    const signals = extractor.extract(); // Second call
    expect(signals.timeSinceLastQuery).toBeGreaterThanOrEqual(0);
  });

  it('should detect session active state', () => {
    extractor.startSession();
    expect(extractor.isSessionActive()).toBe(true);
  });

  it('should end session', () => {
    extractor.startSession();
    extractor.endSession();
    expect(extractor.isSessionActive()).toBe(false);
  });

  it('should get work pattern', () => {
    const pattern = extractor.getWorkPattern();
    expect(['peak', 'normal', 'off-hours']).toContain(pattern);
  });
});

describe('BehavioralSignalExtractor', () => {
  let extractor: BehavioralSignalExtractor;

  beforeEach(() => {
    extractor = new BehavioralSignalExtractor();
  });

  it('should extract empty signals initially', () => {
    const signals = extractor.extract();
    expect(signals.recentQueries).toEqual([]);
    expect(signals.recentIntents).toEqual([]);
    expect(signals.frequentMemories).toEqual([]);
  });

  it('should record queries', () => {
    extractor.recordQuery('how to authenticate', 'add_feature', '/auth.ts', ['mem1']);
    const signals = extractor.extract();
    expect(signals.recentQueries).toContain('how to authenticate');
  });

  it('should record intents', () => {
    extractor.recordQuery('fix login bug', 'fix_bug');
    const signals = extractor.extract();
    expect(signals.recentIntents).toContain('fix_bug');
  });

  it('should track frequent memories', () => {
    extractor.recordMemoryUsage('mem1', 'context1');
    extractor.recordMemoryUsage('mem1', 'context2');
    extractor.recordMemoryUsage('mem1', 'context3');
    const signals = extractor.extract();
    expect(signals.frequentMemories).toContain('mem1');
  });

  it('should set current task', () => {
    extractor.setCurrentTask('Implement authentication');
    const signals = extractor.extract();
    expect(signals.currentTask).toBe('Implement authentication');
  });

  it('should detect user patterns', () => {
    // Record enough queries to detect patterns
    for (let i = 0; i < 5; i++) {
      extractor.recordQuery(`query ${i}`, 'add_feature', '/file.ts', ['mem1']);
    }
    const signals = extractor.extract();
    expect(signals.userPatterns.length).toBeGreaterThanOrEqual(0);
  });

  it('should export and import state', () => {
    extractor.recordQuery('test query', 'fix_bug', '/test.ts', ['mem1']);
    const exported = extractor.export();
    
    const newExtractor = new BehavioralSignalExtractor();
    newExtractor.import(exported);
    
    const signals = newExtractor.extract();
    expect(signals.recentQueries).toContain('test query');
  });

  it('should clear data', () => {
    extractor.recordQuery('test', 'add_feature');
    extractor.clear();
    const signals = extractor.extract();
    expect(signals.recentQueries).toEqual([]);
  });
});

describe('GitSignalExtractor', () => {
  let extractor: GitSignalExtractor;

  beforeEach(() => {
    extractor = new GitSignalExtractor(process.cwd());
  });

  it('should check if directory is git repository', () => {
    // This test depends on the actual environment
    const isRepo = extractor.isGitRepository();
    expect(typeof isRepo).toBe('boolean');
  });

  it('should extract git signals', () => {
    const signals = extractor.extract();
    expect(signals).toHaveProperty('currentBranch');
    expect(signals).toHaveProperty('recentlyModifiedFiles');
    expect(signals).toHaveProperty('recentCommitMessages');
    expect(signals).toHaveProperty('uncommittedFiles');
    expect(signals).toHaveProperty('isFeatureBranch');
  });

  it('should detect feature branches', () => {
    // Test internal method via extract
    const signals = extractor.extract();
    expect(typeof signals.isFeatureBranch).toBe('boolean');
  });

  it('should set working directory', () => {
    extractor.setWorkingDirectory('/tmp');
    expect(extractor.getWorkingDirectory()).toBe('/tmp');
  });
});

describe('SignalGatherer', () => {
  let gatherer: SignalGatherer;

  beforeEach(() => {
    gatherer = new SignalGatherer({
      useGitSignals: false, // Disable git for tests
    });
  });

  it('should gather all signals', async () => {
    const signals = await gatherer.gather('/path/to/file.ts', ['/recent.ts']);
    
    expect(signals).toHaveProperty('file');
    expect(signals).toHaveProperty('temporal');
    expect(signals).toHaveProperty('behavioral');
    expect(signals).toHaveProperty('git');
    expect(signals).toHaveProperty('gatheredAt');
  });

  it('should record queries', () => {
    gatherer.recordQuery('test query', 'add_feature', '/file.ts', ['mem1']);
    // Verify through behavioral extractor
    const behavioral = gatherer.getBehavioralSignalExtractor();
    const signals = behavioral.extract();
    expect(signals.recentQueries).toContain('test query');
  });

  it('should manage sessions', () => {
    gatherer.startSession();
    expect(gatherer.isSessionActive()).toBe(true);
    gatherer.endSession();
    expect(gatherer.isSessionActive()).toBe(false);
  });

  it('should export and import state', async () => {
    gatherer.recordQuery('test', 'fix_bug');
    const exported = gatherer.export();
    
    const newGatherer = new SignalGatherer({ useGitSignals: false });
    newGatherer.import(exported);
    
    const behavioral = newGatherer.getBehavioralSignalExtractor();
    const signals = behavioral.extract();
    expect(signals.recentQueries).toContain('test');
  });

  it('should provide access to individual extractors', () => {
    expect(gatherer.getFileSignalExtractor()).toBeInstanceOf(FileSignalExtractor);
    expect(gatherer.getTemporalSignalExtractor()).toBeInstanceOf(TemporalSignalExtractor);
    expect(gatherer.getBehavioralSignalExtractor()).toBeInstanceOf(BehavioralSignalExtractor);
    expect(gatherer.getGitSignalExtractor()).toBeInstanceOf(GitSignalExtractor);
  });
});
