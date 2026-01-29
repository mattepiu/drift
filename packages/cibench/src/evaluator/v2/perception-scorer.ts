/**
 * CIBench v2 Perception Scorer (Level 1)
 * 
 * Evaluates basic codebase perception:
 * - Pattern recognition with confidence weighting
 * - Call graph accuracy with dynamic dispatch handling
 * - Data flow tracking with boundary awareness
 */

import type { PatternScore } from './types.js';
import type { PatternGroundTruth } from '../../schema/v2/perception.js';

// ============================================================================
// Utility Functions
// ============================================================================

export function precision(tp: number, fp: number): number {
  return tp + fp === 0 ? 1.0 : tp / (tp + fp);
}

export function recall(tp: number, fn: number): number {
  return tp + fn === 0 ? 1.0 : tp / (tp + fn);
}

export function f1(p: number, r: number): number {
  return p + r === 0 ? 0 : (2 * p * r) / (p + r);
}

function normalizeLocation(loc: { file: string; line: number }): string {
  return `${loc.file}:${loc.line}`;
}

// ============================================================================
// Pattern Scoring
// ============================================================================

export interface ToolPatternOutput {
  patterns: {
    id: string;
    category: string;
    name: string;
    locations: { file: string; line: number; confidence?: number }[];
  }[];
  outliers: {
    patternId: string;
    location: { file: string; line: number };
    confidence?: number;
  }[];
  relationships?: {
    from: string;
    to: string;
    type: string;
  }[];
}


export function evaluatePatterns(
  toolOutput: ToolPatternOutput,
  groundTruth: PatternGroundTruth
): PatternScore {
  // Build expected location sets
  const expectedByPattern = new Map<string, Set<string>>();
  for (const pattern of groundTruth.patterns) {
    expectedByPattern.set(pattern.id, new Set(pattern.locations.map(normalizeLocation)));
  }
  
  // Build found location sets
  const foundByPattern = new Map<string, Set<string>>();
  for (const pattern of toolOutput.patterns) {
    const matchedId = matchPattern(pattern, groundTruth.patterns);
    if (matchedId) {
      const existing = foundByPattern.get(matchedId) ?? new Set();
      pattern.locations.forEach(l => existing.add(normalizeLocation(l)));
      foundByPattern.set(matchedId, existing);
    }
  }
  
  // Calculate per-category metrics
  const byCategory = new Map<string, { tp: number; fp: number; fn: number }>();
  
  for (const pattern of groundTruth.patterns) {
    const expected = expectedByPattern.get(pattern.id) ?? new Set();
    const found = foundByPattern.get(pattern.id) ?? new Set();
    
    const tp = [...expected].filter(l => found.has(l)).length;
    const fn = expected.size - tp;
    
    const cat = pattern.category;
    const existing = byCategory.get(cat) ?? { tp: 0, fp: 0, fn: 0 };
    existing.tp += tp;
    existing.fn += fn;
    byCategory.set(cat, existing);
  }
  
  // Count false positives (patterns not in ground truth)
  for (const pattern of toolOutput.patterns) {
    const matchedId = matchPattern(pattern, groundTruth.patterns);
    if (!matchedId) {
      const cat = pattern.category;
      const existing = byCategory.get(cat) ?? { tp: 0, fp: 0, fn: 0 };
      existing.fp += pattern.locations.length;
      byCategory.set(cat, existing);
    }
  }
  
  // Aggregate metrics
  let totalTP = 0, totalFP = 0, totalFN = 0;
  const categoryMetrics: Record<string, { precision: number; recall: number }> = {};
  
  for (const [cat, metrics] of byCategory) {
    totalTP += metrics.tp;
    totalFP += metrics.fp;
    totalFN += metrics.fn;
    categoryMetrics[cat] = {
      precision: precision(metrics.tp, metrics.fp),
      recall: recall(metrics.tp, metrics.fn),
    };
  }
  
  const p = precision(totalTP, totalFP);
  const r = recall(totalTP, totalFN);
  
  // Evaluate outliers
  const outlierMetrics = evaluateOutliers(toolOutput, groundTruth);
  
  // Evaluate relationships
  const relationshipMetrics = evaluateRelationships(toolOutput, groundTruth);
  
  // Calculate overall score
  const detectionF1 = f1(p, r);
  const outlierF1 = f1(outlierMetrics.precision, outlierMetrics.recall);
  const relationshipF1 = f1(relationshipMetrics.precision, relationshipMetrics.recall);
  
  const score = (detectionF1 * 0.6 + outlierF1 * 0.25 + relationshipF1 * 0.15) * 100;
  
  return {
    score,
    detection: { precision: p, recall: r, f1: detectionF1, byCategory: categoryMetrics },
    outliers: { precision: outlierMetrics.precision, recall: outlierMetrics.recall, f1: outlierF1 },
    relationships: { precision: relationshipMetrics.precision, recall: relationshipMetrics.recall },
  };
}

function matchPattern(
  toolPattern: { id: string; category: string; name: string },
  expected: { id: string; category: string; name: string }[]
): string | null {
  // Exact ID match
  const exact = expected.find(p => p.id === toolPattern.id);
  if (exact) {return exact.id;}
  
  // Category + name match
  const nameMatch = expected.find(
    p => p.category === toolPattern.category &&
         p.name.toLowerCase() === toolPattern.name.toLowerCase()
  );
  if (nameMatch) {return nameMatch.id;}
  
  return null;
}

function evaluateOutliers(
  toolOutput: ToolPatternOutput,
  groundTruth: PatternGroundTruth
): { precision: number; recall: number } {
  const expectedSet = new Set(
    groundTruth.outliers.map(o => `${o.patternId}:${normalizeLocation(o.location)}`)
  );
  const foundSet = new Set(
    toolOutput.outliers.map(o => `${o.patternId}:${normalizeLocation(o.location)}`)
  );
  
  const tp = [...expectedSet].filter(o => foundSet.has(o)).length;
  const fp = [...foundSet].filter(o => !expectedSet.has(o)).length;
  const fn = [...expectedSet].filter(o => !foundSet.has(o)).length;
  
  return { precision: precision(tp, fp), recall: recall(tp, fn) };
}

function evaluateRelationships(
  toolOutput: ToolPatternOutput,
  groundTruth: PatternGroundTruth
): { precision: number; recall: number } {
  if (!toolOutput.relationships || groundTruth.relationships.length === 0) {
    return { precision: 1, recall: toolOutput.relationships ? 0 : 1 };
  }
  
  const expectedSet = new Set(
    groundTruth.relationships.map(r => `${r.from}->${r.to}:${r.type}`)
  );
  const foundSet = new Set(
    toolOutput.relationships.map(r => `${r.from}->${r.to}:${r.type}`)
  );
  
  const tp = [...expectedSet].filter(r => foundSet.has(r)).length;
  const fp = [...foundSet].filter(r => !expectedSet.has(r)).length;
  const fn = [...expectedSet].filter(r => !foundSet.has(r)).length;
  
  return { precision: precision(tp, fp), recall: recall(tp, fn) };
}
