/**
 * CIBench Evaluator
 * 
 * Main evaluation harness that loads ground truth, runs tools, and scores results.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { evaluatePatterns, evaluateCallGraph, calculateOverallScore } from './scorer.js';

import type { 
  EvaluationResult, 
  ToolOutput, 
  CategoryScore,
  EvaluationDetails,
  EvaluationSummary,
} from './types.js';
import type { AgenticGroundTruth } from '../schema/agentic.js';
import type { CallGraphGroundTruth } from '../schema/callgraph.js';
import type { ConventionGroundTruth } from '../schema/conventions.js';
import type { DataFlowGroundTruth } from '../schema/dataflow.js';
import type { ImpactGroundTruth } from '../schema/impact.js';
import type { CIBenchManifest, BenchmarkCategory } from '../schema/manifest.js';
import type { PatternGroundTruth } from '../schema/patterns.js';


// ============================================================================
// Ground Truth Loader
// ============================================================================

export interface GroundTruth {
  manifest: CIBenchManifest;
  patterns?: PatternGroundTruth;
  callGraph?: CallGraphGroundTruth;
  impact?: ImpactGroundTruth;
  dataFlow?: DataFlowGroundTruth;
  conventions?: ConventionGroundTruth;
  agentic?: AgenticGroundTruth;
}

/**
 * Load ground truth from a .cibench directory
 */
export async function loadGroundTruth(cibenchDir: string): Promise<GroundTruth> {
  const manifestPath = path.join(cibenchDir, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as CIBenchManifest;
  
  const groundTruth: GroundTruth = { manifest };
  
  // Load optional ground truth files
  const optionalFiles: Array<[keyof GroundTruth, string]> = [
    ['patterns', 'patterns.json'],
    ['callGraph', 'callgraph.json'],
    ['impact', 'impact.json'],
    ['dataFlow', 'dataflow.json'],
    ['conventions', 'conventions.json'],
    ['agentic', 'agentic.json'],
  ];
  
  for (const [key, filename] of optionalFiles) {
    const filePath = path.join(cibenchDir, filename);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      // Use type assertion to handle the dynamic key assignment
      Object.assign(groundTruth, { [key]: JSON.parse(content) });
    } catch {
      // File doesn't exist, skip
    }
  }
  
  return groundTruth;
}

// ============================================================================
// Tool Adapter Interface
// ============================================================================

/**
 * Interface for tool adapters
 * Each tool (Drift, Cursor, Cody, etc.) needs an adapter that produces ToolOutput
 */
export interface ToolAdapter {
  /** Tool name */
  name: string;
  
  /** Tool version */
  version: string;
  
  /**
   * Run the tool on a codebase and produce output
   */
  analyze(codebasePath: string, categories: BenchmarkCategory[]): Promise<ToolOutput>;
}

// ============================================================================
// Evaluator
// ============================================================================

export interface EvaluatorOptions {
  /** Categories to evaluate (default: all) */
  categories?: BenchmarkCategory[];
  
  /** Verbose output */
  verbose?: boolean;
}

/**
 * Main evaluator class
 */
export class Evaluator {
  private groundTruth: GroundTruth;
  private options: EvaluatorOptions;
  
  constructor(groundTruth: GroundTruth, options: EvaluatorOptions = {}) {
    this.groundTruth = groundTruth;
    this.options = options;
  }
  
  /**
   * Evaluate a tool's output against ground truth
   */
  evaluate(toolOutput: ToolOutput): EvaluationResult {
    const categoryScores: Partial<Record<BenchmarkCategory, CategoryScore>> = {};
    const details: EvaluationDetails = {};
    
    const categoriesToEvaluate = this.options.categories ?? 
      this.groundTruth.manifest.testsFocus;
    
    // Pattern Recognition
    if (categoriesToEvaluate.includes('pattern-recognition') && this.groundTruth.patterns) {
      const result = evaluatePatterns(toolOutput, this.groundTruth.patterns);
      categoryScores['pattern-recognition'] = result.score;
      details.patterns = result.detail;
    }
    
    // Call Graph
    if (categoriesToEvaluate.includes('call-graph') && this.groundTruth.callGraph) {
      const result = evaluateCallGraph(toolOutput, this.groundTruth.callGraph);
      categoryScores['call-graph'] = result.score;
      details.callGraph = result.detail;
    }
    
    // TODO: Implement other category evaluators
    // - Impact Analysis
    // - Data Flow
    // - Convention Inference
    // - Agentic Grounding
    
    // Fill in missing categories with zero scores
    const allCategories: BenchmarkCategory[] = [
      'pattern-recognition',
      'call-graph',
      'impact-analysis',
      'data-flow',
      'convention-inference',
      'agentic-grounding',
    ];
    
    for (const cat of allCategories) {
      if (!categoryScores[cat]) {
        categoryScores[cat] = {
          score: 0,
          weight: 0,
          weightedScore: 0,
          breakdown: { precision: 0, recall: 0, f1: 0 },
        };
      }
    }
    
    const overallScore = calculateOverallScore(categoryScores as Record<BenchmarkCategory, CategoryScore>);
    const summary = this.generateSummary(categoryScores as Record<BenchmarkCategory, CategoryScore>, details);
    
    return {
      tool: toolOutput.tool,
      corpus: this.groundTruth.manifest.id,
      timestamp: new Date().toISOString(),
      overallScore,
      categoryScores: categoryScores as Record<BenchmarkCategory, CategoryScore>,
      details,
      summary,
    };
  }
  
  private generateSummary(
    scores: Record<BenchmarkCategory, CategoryScore>,
    _details: EvaluationDetails
  ): EvaluationSummary {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const recommendations: string[] = [];
    
    // Identify strengths (score > 80)
    for (const [category, score] of Object.entries(scores)) {
      if (score.score > 80) {
        strengths.push(`Strong ${category} (${score.score.toFixed(1)}%)`);
      } else if (score.score < 50 && score.weight > 0) {
        weaknesses.push(`Weak ${category} (${score.score.toFixed(1)}%)`);
        recommendations.push(`Improve ${category} detection`);
      }
    }
    
    // Count test cases
    let totalTestCases = 0;
    let passedTestCases = 0;
    
    if (this.groundTruth.patterns) {
      totalTestCases += this.groundTruth.patterns.patterns.length;
      passedTestCases += Math.round(
        this.groundTruth.patterns.patterns.length * (scores['pattern-recognition']?.score ?? 0) / 100
      );
    }
    
    if (this.groundTruth.callGraph) {
      totalTestCases += this.groundTruth.callGraph.functions.length;
      passedTestCases += Math.round(
        this.groundTruth.callGraph.functions.length * (scores['call-graph']?.score ?? 0) / 100
      );
    }
    
    return {
      totalTestCases,
      passedTestCases,
      passRate: totalTestCases > 0 ? passedTestCases / totalTestCases : 0,
      strengths,
      weaknesses,
      recommendations,
    };
  }
}

// ============================================================================
// Exports
// ============================================================================

export * from './types.js';
export * from './scorer.js';
