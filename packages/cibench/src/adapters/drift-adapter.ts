/**
 * Drift Adapter for CIBench
 * 
 * Calls Drift's actual analysis and converts output to CIBench format.
 */

import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DriftAdapterConfig {
  /** Path to drift CLI (defaults to npx drift) */
  driftPath?: string;
  
  /** Timeout for drift commands (ms) */
  timeout?: number;
  
  /** Verbose output */
  verbose?: boolean;
}

export interface DriftAnalysisResult {
  patterns: DriftPattern[];
  outliers: DriftOutlier[];
  callGraph: DriftCallGraph;
  status: DriftStatus;
}

export interface DriftPattern {
  id: string;
  category: string;
  name: string;
  description?: string;
  locations: { file: string; line: number }[];
  confidence: number;
}

export interface DriftOutlier {
  patternId: string;
  location: { file: string; line: number };
  reason: string;
  severity: string;
}

export interface DriftCallGraph {
  functions: { id: string; file: string; name: string; line: number; type: string }[];
  calls: { caller: string; callee: string; callSite: { file: string; line: number } }[];
  entryPoints: string[];
}

export interface DriftStatus {
  health: number;
  patterns: number;
  outliers: number;
  files: number;
}

/**
 * Run Drift analysis on a codebase
 */
export async function runDriftAnalysis(
  codebasePath: string,
  config: DriftAdapterConfig = {}
): Promise<DriftAnalysisResult> {
  const { timeout = 60000, verbose = false } = config;
  
  // Resolve the actual codebase path
  // If this is a corpus path (packages/cibench/corpus/X), map to actual demo folder
  let actualCodebasePath = codebasePath;
  if (codebasePath.includes('corpus/demo-backend')) {
    // Map to the actual demo/backend folder
    // From dist/adapters/, we need to go up to packages/cibench, then up to packages, then up to drift root, then into demo/backend
    actualCodebasePath = path.resolve(__dirname, '../../../../demo/backend');
  }
  
  // Check if .drift directory exists (already scanned)
  const driftDir = path.join(actualCodebasePath, '.drift');
  const hasDriftData = await fs.access(driftDir).then(() => true).catch(() => false);
  
  if (!hasDriftData) {
    // Run drift scan first
    if (verbose) {
      // eslint-disable-next-line no-console
      console.log('Running drift scan...');
    }
    await runDriftCommand(['scan'], actualCodebasePath, timeout);
  }
  
  // Get status
  const status = await getDriftStatus(actualCodebasePath, timeout);
  
  // Get patterns
  const patterns = await getDriftPatterns(actualCodebasePath, timeout);
  
  // Get call graph
  const callGraph = await getDriftCallGraph(actualCodebasePath, timeout);
  
  return {
    patterns: patterns.patterns,
    outliers: patterns.outliers,
    callGraph,
    status,
  };
}

async function runDriftCommand(
  args: string[],
  cwd: string,
  timeout: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Use node to run the drift CLI directly
    // From dist/adapters/drift-adapter.js, we need to go up to packages/cli/dist/bin/drift.js
    const driftCliPath = path.resolve(__dirname, '../../../cli/dist/bin/drift.js');
    const proc = spawn('node', [driftCliPath, ...args], {
      cwd,
      timeout,
      shell: false,
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Drift command failed (code ${code}): ${stderr || stdout}`));
      }
    });
    
    proc.on('error', (err) => {
      reject(err);
    });
  });
}

async function getDriftStatus(codebasePath: string, _timeout: number): Promise<DriftStatus> {
  try {
    // Read from .drift/views/status.json
    const statusPath = path.join(codebasePath, '.drift', 'views', 'status.json');
    const content = await fs.readFile(statusPath, 'utf-8');
    const status = JSON.parse(content) as Record<string, unknown>;
    
    return {
      health: typeof status['health'] === 'number' ? status['health'] : 0,
      patterns: typeof status['patterns'] === 'number' ? status['patterns'] : 0,
      outliers: typeof status['outliers'] === 'number' ? status['outliers'] : 0,
      files: typeof status['files'] === 'number' ? status['files'] : 0,
    };
  } catch {
    return { health: 0, patterns: 0, outliers: 0, files: 0 };
  }
}

async function getDriftPatterns(
  codebasePath: string,
  _timeout: number
): Promise<{ patterns: DriftPattern[]; outliers: DriftOutlier[] }> {
  const patterns: DriftPattern[] = [];
  const outliers: DriftOutlier[] = [];
  
  interface PatternLocation {
    file: string;
    line: number;
    isOutlier?: boolean;
    reason?: string;
  }
  
  interface PatternOutlier {
    file?: string;
    line?: number;
    reason?: string;
    severity?: string;
  }
  
  interface PatternData {
    id: string;
    category?: string;
    name: string;
    description?: string;
    locations?: PatternLocation[];
    confidence?: number | { score: number };
    outliers?: PatternOutlier[];
  }
  
  interface PatternFile {
    category?: string;
    patterns?: PatternData[];
  }
  
  try {
    // Read from .drift/patterns/discovered/
    const discoveredDir = path.join(codebasePath, '.drift', 'patterns', 'discovered');
    const files = await fs.readdir(discoveredDir).catch(() => [] as string[]);
    
    for (const file of files) {
      if (!file.endsWith('.json')) {continue;}
      
      const content = await fs.readFile(path.join(discoveredDir, file), 'utf-8');
      const data = JSON.parse(content) as PatternFile | PatternData;
      
      // The file contains a patterns array
      const filePatterns: PatternData[] = 'patterns' in data && Array.isArray(data.patterns) 
        ? data.patterns 
        : [data as PatternData];
      const fileCategory = 'category' in data ? data.category : undefined;
      
      for (const pattern of filePatterns) {
        const confidenceValue = typeof pattern.confidence === 'object' && pattern.confidence !== null
          ? pattern.confidence.score
          : typeof pattern.confidence === 'number'
            ? pattern.confidence
            : 0.8;
            
        patterns.push({
          id: pattern.id,
          category: fileCategory ?? pattern.category ?? 'unknown',
          name: pattern.name,
          description: pattern.description ?? '',
          locations: pattern.locations ?? [],
          confidence: confidenceValue,
        });
        
        // Extract outliers from pattern
        if (pattern.outliers && Array.isArray(pattern.outliers)) {
          for (const outlier of pattern.outliers) {
            outliers.push({
              patternId: pattern.id,
              location: { file: outlier.file ?? '', line: outlier.line ?? 0 },
              reason: outlier.reason ?? 'Pattern violation detected',
              severity: outlier.severity ?? 'warning',
            });
          }
        }
        
        // Also check locations for outliers
        if (pattern.locations && Array.isArray(pattern.locations)) {
          for (const loc of pattern.locations) {
            if (loc.isOutlier) {
              outliers.push({
                patternId: pattern.id,
                location: { file: loc.file, line: loc.line },
                reason: loc.reason ?? 'Location marked as outlier',
                severity: 'warning',
              });
            }
          }
        }
      }
    }
    
    // Also check approved patterns
    const approvedDir = path.join(codebasePath, '.drift', 'patterns', 'approved');
    const approvedFiles = await fs.readdir(approvedDir).catch(() => [] as string[]);
    
    for (const file of approvedFiles) {
      if (!file.endsWith('.json')) {continue;}
      
      const content = await fs.readFile(path.join(approvedDir, file), 'utf-8');
      const pattern = JSON.parse(content) as PatternData;
      
      // Don't duplicate if already in discovered
      if (!patterns.find(p => p.id === pattern.id)) {
        const confidenceValue = typeof pattern.confidence === 'number' ? pattern.confidence : 0.9;
        patterns.push({
          id: pattern.id,
          category: pattern.category ?? 'unknown',
          name: pattern.name,
          description: pattern.description ?? '',
          locations: pattern.locations ?? [],
          confidence: confidenceValue,
        });
      }
    }
  } catch {
    // Patterns not available
  }
  
  return { patterns, outliers };
}

async function getDriftCallGraph(
  codebasePath: string,
  _timeout: number
): Promise<DriftCallGraph> {
  interface CallGraphFunction {
    id?: string;
    name: string;
    line: number;
    type?: string;
    isEntryPoint?: boolean;
  }
  
  interface CallGraphCall {
    caller: string;
    callee: string;
    line?: number;
    callSite?: { file: string; line: number };
  }
  
  interface CallGraphFile {
    file: string;
    functions?: CallGraphFunction[];
    calls?: CallGraphCall[];
  }
  
  try {
    // Read from .drift/lake/callgraph/
    const callGraphDir = path.join(codebasePath, '.drift', 'lake', 'callgraph', 'files');
    const files = await fs.readdir(callGraphDir).catch(() => [] as string[]);
    
    const functions: DriftCallGraph['functions'] = [];
    const calls: DriftCallGraph['calls'] = [];
    const entryPoints: string[] = [];
    
    for (const file of files) {
      if (!file.endsWith('.json')) {continue;}
      
      const content = await fs.readFile(path.join(callGraphDir, file), 'utf-8');
      const data = JSON.parse(content) as CallGraphFile;
      
      // Extract functions
      if (data.functions && Array.isArray(data.functions)) {
        for (const func of data.functions) {
          const funcId = func.id ?? `${data.file}:${func.name}`;
          functions.push({
            id: funcId,
            file: data.file,
            name: func.name,
            line: func.line,
            type: func.type ?? 'function',
          });
          
          if (func.isEntryPoint) {
            entryPoints.push(funcId);
          }
        }
      }
      
      // Extract calls
      if (data.calls && Array.isArray(data.calls)) {
        for (const call of data.calls) {
          calls.push({
            caller: call.caller,
            callee: call.callee,
            callSite: call.callSite ?? { file: data.file, line: call.line ?? 0 },
          });
        }
      }
    }
    
    return { functions, calls, entryPoints };
  } catch {
    return { functions: [], calls: [], entryPoints: [] };
  }
}

/**
 * Convert Drift analysis to CIBench ToolOutput format
 */
export function convertToCIBenchFormat(
  driftResult: DriftAnalysisResult,
  toolName: string = 'drift'
): import('../evaluator/types.js').ToolOutput {
  return {
    tool: toolName,
    version: '0.9.30',
    timestamp: new Date().toISOString(),
    patterns: {
      patterns: driftResult.patterns.map(p => ({
        id: p.id,
        category: p.category,
        name: p.name,
        locations: p.locations,
        confidence: p.confidence,
      })),
      outliers: driftResult.outliers.map(o => ({
        patternId: o.patternId,
        location: o.location,
        reason: o.reason,
      })),
    },
    callGraph: {
      functions: driftResult.callGraph.functions.map(f => ({
        id: f.id,
        file: f.file,
        name: f.name,
        line: f.line,
      })),
      calls: driftResult.callGraph.calls.map(c => ({
        caller: c.caller,
        callee: c.callee,
        file: c.callSite.file,
        line: c.callSite.line,
      })),
      entryPoints: driftResult.callGraph.entryPoints,
    },
  };
}
