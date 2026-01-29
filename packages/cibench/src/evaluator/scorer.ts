/**
 * CIBench Scorer
 * 
 * Calculates precision, recall, F1, and category scores.
 */

import type {
  CategoryScore,
  ToolOutput,
  PatternEvaluationDetail,
  CallGraphEvaluationDetail,
} from './types.js';
import type { CallGraphGroundTruth } from '../schema/callgraph.js';
import type { BenchmarkCategory } from '../schema/manifest.js';
import type { PatternGroundTruth, ExpectedPattern } from '../schema/patterns.js';

// ============================================================================
// Category Weights
// ============================================================================

const CATEGORY_WEIGHTS: Record<BenchmarkCategory, number> = {
  'pattern-recognition': 0.20,
  'call-graph': 0.20,
  'impact-analysis': 0.15,
  'data-flow': 0.15,
  'convention-inference': 0.15,
  'agentic-grounding': 0.15,
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate precision
 */
export function precision(truePositives: number, falsePositives: number): number {
  const total = truePositives + falsePositives;
  return total === 0 ? 1.0 : truePositives / total;
}

/**
 * Calculate recall
 */
export function recall(truePositives: number, falseNegatives: number): number {
  const total = truePositives + falseNegatives;
  return total === 0 ? 1.0 : truePositives / total;
}

/**
 * Calculate F1 score
 */
export function f1Score(p: number, r: number): number {
  if (p + r === 0) {return 0;}
  return (2 * p * r) / (p + r);
}

/**
 * Normalize location for comparison
 */
function normalizeLocation(loc: { file: string; line: number }): string {
  return `${loc.file}:${loc.line}`;
}

// ============================================================================
// Pattern Evaluation
// ============================================================================

export function evaluatePatterns(
  toolOutput: ToolOutput,
  groundTruth: PatternGroundTruth
): { score: CategoryScore; detail: PatternEvaluationDetail } {
  const toolPatterns = toolOutput.patterns?.patterns ?? [];
  const expectedPatterns = groundTruth.patterns;
  
  // Build location sets for comparison
  const expectedLocations = new Map<string, Set<string>>();
  for (const pattern of expectedPatterns) {
    const patternLocs = new Set(pattern.locations.map(normalizeLocation));
    expectedLocations.set(pattern.id, patternLocs);
  }
  
  const foundLocations = new Map<string, Set<string>>();
  for (const pattern of toolPatterns) {
    // Try to match by name/category if ID doesn't match
    const matchedId = findMatchingPatternId(pattern, expectedPatterns);
    if (matchedId) {
      const existing = foundLocations.get(matchedId) ?? new Set();
      pattern.locations.forEach(l => existing.add(normalizeLocation(l)));
      foundLocations.set(matchedId, existing);
    }
  }
  
  // Calculate TP, FP, FN
  const truePositives: { patternId: string; locations: number }[] = [];
  const falseNegatives: { patternId: string; locations: number }[] = [];
  
  for (const [patternId, expectedLocs] of expectedLocations) {
    const foundLocs = foundLocations.get(patternId) ?? new Set();
    const tpCount = [...expectedLocs].filter(l => foundLocs.has(l)).length;
    const fnCount = expectedLocs.size - tpCount;
    
    if (tpCount > 0) {
      truePositives.push({ patternId, locations: tpCount });
    }
    if (fnCount > 0) {
      falseNegatives.push({ patternId, locations: fnCount });
    }
  }
  
  // False positives: patterns found but not in ground truth
  const falsePositives: { patternId: string; locations: number }[] = [];
  for (const pattern of toolPatterns) {
    const matchedId = findMatchingPatternId(pattern, expectedPatterns);
    if (!matchedId) {
      falsePositives.push({ patternId: pattern.id, locations: pattern.locations.length });
    }
  }
  
  // Calculate metrics
  const totalTP = truePositives.reduce((sum, p) => sum + p.locations, 0);
  const totalFP = falsePositives.reduce((sum, p) => sum + p.locations, 0);
  const totalFN = falseNegatives.reduce((sum, p) => sum + p.locations, 0);
  
  const p = precision(totalTP, totalFP);
  const r = recall(totalTP, totalFN);
  const f1 = f1Score(p, r);
  
  // Outlier evaluation (simplified)
  const outlierAccuracy = evaluateOutliers(toolOutput, groundTruth);
  
  const score = f1 * 100;
  
  return {
    score: {
      score,
      weight: CATEGORY_WEIGHTS['pattern-recognition'],
      weightedScore: score * CATEGORY_WEIGHTS['pattern-recognition'],
      breakdown: { precision: p, recall: r, f1 },
    },
    detail: {
      truePositives,
      falsePositives,
      falseNegatives,
      outlierAccuracy,
    },
  };
}

function findMatchingPatternId(
  toolPattern: { id: string; category: string; name: string },
  expectedPatterns: ExpectedPattern[]
): string | null {
  // Try exact ID match
  const exactMatch = expectedPatterns.find(p => p.id === toolPattern.id);
  if (exactMatch) {return exactMatch.id;}
  
  // Try category + name match
  const nameMatch = expectedPatterns.find(
    p => p.category === toolPattern.category && 
         p.name.toLowerCase() === toolPattern.name.toLowerCase()
  );
  if (nameMatch) {return nameMatch.id;}
  
  // Try fuzzy name match
  const fuzzyMatch = expectedPatterns.find(
    p => p.category === toolPattern.category &&
         (p.name.toLowerCase().includes(toolPattern.name.toLowerCase()) ||
          toolPattern.name.toLowerCase().includes(p.name.toLowerCase()))
  );
  if (fuzzyMatch) {return fuzzyMatch.id;}
  
  return null;
}

function evaluateOutliers(
  toolOutput: ToolOutput,
  groundTruth: PatternGroundTruth
): { truePositives: number; falsePositives: number; falseNegatives: number } {
  const toolOutliers = toolOutput.patterns?.outliers ?? [];
  const expectedOutliers = groundTruth.outliers;
  
  const expectedSet = new Set(
    expectedOutliers.map(o => `${o.patternId}:${normalizeLocation(o.location)}`)
  );
  const foundSet = new Set(
    toolOutliers.map(o => `${o.patternId}:${normalizeLocation(o.location)}`)
  );
  
  const tp = [...expectedSet].filter(o => foundSet.has(o)).length;
  const fp = [...foundSet].filter(o => !expectedSet.has(o)).length;
  const fn = [...expectedSet].filter(o => !foundSet.has(o)).length;
  
  return { truePositives: tp, falsePositives: fp, falseNegatives: fn };
}

// ============================================================================
// Call Graph Evaluation
// ============================================================================

export function evaluateCallGraph(
  toolOutput: ToolOutput,
  groundTruth: CallGraphGroundTruth
): { score: CategoryScore; detail: CallGraphEvaluationDetail } {
  const toolGraph = toolOutput.callGraph;
  
  if (!toolGraph) {
    return {
      score: {
        score: 0,
        weight: CATEGORY_WEIGHTS['call-graph'],
        weightedScore: 0,
        breakdown: { precision: 0, recall: 0, f1: 0 },
      },
      detail: {
        functions: { found: 0, expected: groundTruth.functions.length, precision: 0, recall: 0 },
        calls: { found: 0, expected: groundTruth.calls.length, precision: 0, recall: 0 },
        resolutionRate: 0,
        entryPoints: { found: 0, expected: groundTruth.entryPoints.length, precision: 0, recall: 0 },
      },
    };
  }
  
  // Function evaluation
  const expectedFunctions = new Set(groundTruth.functions.map(f => f.id));
  const foundFunctions = new Set(toolGraph.functions.map(f => f.id));
  
  const funcTP = [...expectedFunctions].filter(f => foundFunctions.has(f)).length;
  const funcFP = [...foundFunctions].filter(f => !expectedFunctions.has(f)).length;
  const funcFN = [...expectedFunctions].filter(f => !foundFunctions.has(f)).length;
  
  const funcPrecision = precision(funcTP, funcFP);
  const funcRecall = recall(funcTP, funcFN);
  
  // Call evaluation
  const expectedCalls = new Set(groundTruth.calls.map(c => `${c.caller}->${c.callee}`));
  const foundCalls = new Set(toolGraph.calls.map(c => `${c.caller}->${c.callee}`));
  
  const callTP = [...expectedCalls].filter(c => foundCalls.has(c)).length;
  const callFP = [...foundCalls].filter(c => !expectedCalls.has(c)).length;
  const callFN = [...expectedCalls].filter(c => !foundCalls.has(c)).length;
  
  const callPrecision = precision(callTP, callFP);
  const callRecall = recall(callTP, callFN);
  
  // Resolution rate (for resolvable calls only)
  const resolvableCalls = groundTruth.calls.filter(c => c.staticResolvable);
  const resolvedCount = resolvableCalls.filter(c => 
    foundCalls.has(`${c.caller}->${c.callee}`)
  ).length;
  const resolutionRate = resolvableCalls.length > 0 
    ? resolvedCount / resolvableCalls.length 
    : 1.0;
  
  // Entry points
  const expectedEntryPoints = new Set(groundTruth.entryPoints.map(e => e.functionId));
  const foundEntryPoints = new Set(toolGraph.entryPoints);
  
  const epTP = [...expectedEntryPoints].filter(e => foundEntryPoints.has(e)).length;
  const epFP = [...foundEntryPoints].filter(e => !expectedEntryPoints.has(e)).length;
  const epFN = [...expectedEntryPoints].filter(e => !foundEntryPoints.has(e)).length;
  
  const epPrecision = precision(epTP, epFP);
  const epRecall = recall(epTP, epFN);
  
  // Overall score (weighted average)
  const funcF1 = f1Score(funcPrecision, funcRecall);
  const callF1 = f1Score(callPrecision, callRecall);
  const epF1 = f1Score(epPrecision, epRecall);
  
  const overallF1 = (funcF1 * 0.3 + callF1 * 0.5 + epF1 * 0.2);
  const score = overallF1 * 100;
  
  return {
    score: {
      score,
      weight: CATEGORY_WEIGHTS['call-graph'],
      weightedScore: score * CATEGORY_WEIGHTS['call-graph'],
      breakdown: { 
        precision: (funcPrecision + callPrecision + epPrecision) / 3,
        recall: (funcRecall + callRecall + epRecall) / 3,
        f1: overallF1,
      },
    },
    detail: {
      functions: {
        found: foundFunctions.size,
        expected: expectedFunctions.size,
        precision: funcPrecision,
        recall: funcRecall,
      },
      calls: {
        found: foundCalls.size,
        expected: expectedCalls.size,
        precision: callPrecision,
        recall: callRecall,
      },
      resolutionRate,
      entryPoints: {
        found: foundEntryPoints.size,
        expected: expectedEntryPoints.size,
        precision: epPrecision,
        recall: epRecall,
      },
    },
  };
}

// ============================================================================
// Overall Evaluation
// ============================================================================

export function calculateOverallScore(
  categoryScores: Record<BenchmarkCategory, CategoryScore>
): number {
  let totalWeightedScore = 0;
  let totalWeight = 0;
  
  for (const score of Object.values(categoryScores)) {
    totalWeightedScore += score.weightedScore;
    totalWeight += score.weight;
  }
  
  return totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
}
