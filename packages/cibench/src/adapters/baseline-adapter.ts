/**
 * Baseline Adapter for CIBench
 * 
 * Simulates what a vanilla AI agent (without Drift) would find
 * using only basic file reading and grep-style searches.
 * 
 * This represents the "no specialized tooling" baseline.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface BaselineAdapterConfig {
  verbose?: boolean;
}

export interface BaselineAnalysisResult {
  patterns: BaselinePattern[];
  outliers: BaselineOutlier[];
  callGraph: BaselineCallGraph;
}

export interface BaselinePattern {
  id: string;
  category: string;
  name: string;
  description?: string;
  locations: { file: string; line: number }[];
  confidence: number;
}

export interface BaselineOutlier {
  patternId: string;
  location: { file: string; line: number };
  reason: string;
  severity: string;
}

export interface BaselineCallGraph {
  functions: { id: string; file: string; name: string; line: number; type: string }[];
  calls: { caller: string; callee: string; callSite: { file: string; line: number } }[];
  entryPoints: string[];
}

/**
 * Run baseline analysis - simulates what grep/basic file reading would find
 */
export async function runBaselineAnalysis(
  codebasePath: string,
  config: BaselineAdapterConfig = {}
): Promise<BaselineAnalysisResult> {
  const { verbose = false } = config;
  
  // Resolve the actual codebase path (same mapping as drift adapter)
  let actualCodebasePath = codebasePath;
  if (codebasePath.includes('corpus/demo-backend')) {
    actualCodebasePath = path.resolve(__dirname, '../../../../demo/backend');
  }
  
  if (verbose) {
    // eslint-disable-next-line no-console
    console.log(`Baseline analysis on: ${actualCodebasePath}`);
  }
  
  const patterns: BaselinePattern[] = [];
  const outliers: BaselineOutlier[] = [];
  
  // Get all TypeScript files
  const files = await getTypeScriptFiles(actualCodebasePath);
  
  // Simple regex-based pattern detection (what grep would find)
  for (const file of files) {
    const content = await fs.readFile(file, 'utf-8');
    const lines = content.split('\n');
    const relativePath = path.relative(actualCodebasePath, file);
    
    // Look for middleware patterns (very basic)
    if (relativePath.includes('middleware')) {
      const middlewareMatches = findPattern(lines, /export\s+(const|function)\s+\w+/);
      if (middlewareMatches.length > 0) {
        patterns.push({
          id: `baseline-middleware-${relativePath}`,
          category: 'auth',
          name: 'Middleware Pattern',
          locations: middlewareMatches.map(line => ({ file: relativePath, line })),
          confidence: 0.5, // Low confidence - just grep
        });
      }
    }
    
    // Look for error handling (very basic)
    const tryMatches = findPattern(lines, /try\s*\{/);
    if (tryMatches.length > 0) {
      patterns.push({
        id: `baseline-trycatch-${relativePath}`,
        category: 'errors',
        name: 'Try/Catch Pattern',
        locations: tryMatches.map(line => ({ file: relativePath, line })),
        confidence: 0.4,
      });
    }
    
    // Look for route definitions (very basic)
    const routeMatches = findPattern(lines, /\.(get|post|put|delete|patch)\s*\(/i);
    if (routeMatches.length > 0) {
      patterns.push({
        id: `baseline-routes-${relativePath}`,
        category: 'api',
        name: 'Route Pattern',
        locations: routeMatches.map(line => ({ file: relativePath, line })),
        confidence: 0.6,
      });
    }
    
    // Look for class definitions (very basic)
    const classMatches = findPattern(lines, /class\s+\w+/);
    if (classMatches.length > 0) {
      patterns.push({
        id: `baseline-class-${relativePath}`,
        category: 'structural',
        name: 'Class Pattern',
        locations: classMatches.map(line => ({ file: relativePath, line })),
        confidence: 0.5,
      });
    }
    
    // Look for console.log (basic logging detection)
    const logMatches = findPattern(lines, /console\.(log|info|warn|error)/);
    if (logMatches.length > 0) {
      patterns.push({
        id: `baseline-logging-${relativePath}`,
        category: 'logging',
        name: 'Console Logging',
        locations: logMatches.map(line => ({ file: relativePath, line })),
        confidence: 0.7,
      });
    }
  }
  
  // Baseline can't detect outliers - it doesn't understand patterns well enough
  // to know what deviates from them
  
  // Baseline call graph is empty - no static analysis capability
  const callGraph: BaselineCallGraph = {
    functions: [],
    calls: [],
    entryPoints: [],
  };
  
  return { patterns, outliers, callGraph };
}

function findPattern(lines: string[], pattern: RegExp): number[] {
  const matches: number[] = [];
  lines.forEach((line, index) => {
    if (pattern.test(line)) {
      matches.push(index + 1); // 1-indexed
    }
  });
  return matches;
}

async function getTypeScriptFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  
  async function walk(currentDir: string): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        await walk(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
        files.push(fullPath);
      }
    }
  }
  
  await walk(dir);
  return files;
}

/**
 * Convert baseline analysis to CIBench ToolOutput format
 */
export function convertToCIBenchFormat(
  result: BaselineAnalysisResult,
  toolName: string = 'baseline'
): import('../evaluator/types.js').ToolOutput {
  return {
    tool: toolName,
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    patterns: {
      patterns: result.patterns.map(p => ({
        id: p.id,
        category: p.category,
        name: p.name,
        locations: p.locations,
        confidence: p.confidence,
      })),
      outliers: result.outliers.map(o => ({
        patternId: o.patternId,
        location: o.location,
        reason: o.reason,
      })),
    },
    callGraph: {
      functions: result.callGraph.functions.map(f => ({
        id: f.id,
        file: f.file,
        name: f.name,
        line: f.line,
      })),
      calls: result.callGraph.calls.map(c => ({
        caller: c.caller,
        callee: c.callee,
        file: c.callSite.file,
        line: c.callSite.line,
      })),
      entryPoints: result.callGraph.entryPoints,
    },
  };
}
