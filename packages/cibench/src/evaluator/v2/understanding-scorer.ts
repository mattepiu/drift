/**
 * CIBench v2 Understanding Scorer (Level 2)
 * 
 * THE NOVEL PART - Evaluates actual understanding:
 * - Architectural intent recognition
 * - Causal/counterfactual reasoning
 * - Uncertainty quantification (calibration)
 */

import { calculateCalibration, type CalibrationSample } from './calibration.js';

import type { IntentScore, CausalScore, UncertaintyScore } from './types.js';
import type {
  ArchitecturalIntentGroundTruth,
  CausalReasoningGroundTruth,
  UncertaintyGroundTruth,
  IntentProbe,
} from '../../schema/v2/understanding.js';

// ============================================================================
// Architectural Intent Scoring
// ============================================================================

export interface ToolIntentOutput {
  /** Recognized decisions */
  decisions: {
    id: string;
    decision: string;
    rationale: string;
    confidence: number;
  }[];
  
  /** Identified tradeoffs */
  tradeoffs: {
    id: string;
    description: string;
    gained: string[];
    sacrificed: string[];
  }[];
  
  /** Probe responses */
  probeResponses: {
    probeId: string;
    response: string;
    confidence: number;
  }[];
}


export function evaluateArchitecturalIntent(
  toolOutput: ToolIntentOutput,
  groundTruth: ArchitecturalIntentGroundTruth
): IntentScore {
  // Evaluate decision recognition
  const decisionMetrics = evaluateDecisions(toolOutput.decisions, groundTruth.decisions);
  
  // Evaluate tradeoff identification
  const tradeoffMetrics = evaluateTradeoffs(toolOutput.tradeoffs, groundTruth.tradeoffs);
  
  // Evaluate probe responses
  const probeMetrics = evaluateIntentProbes(toolOutput.probeResponses, groundTruth.probes);
  
  // Calculate overall score
  const score = (
    decisionMetrics.accuracy * 0.35 +
    tradeoffMetrics.accuracy * 0.25 +
    probeMetrics.averageScore * 0.40
  ) * 100;
  
  return {
    score,
    decisions: decisionMetrics,
    tradeoffs: tradeoffMetrics,
    probes: probeMetrics,
  };
}

function evaluateDecisions(
  found: { id: string; decision: string; rationale: string; confidence: number }[],
  expected: { id: string; decision: string; rationale: string }[]
): { recognized: number; total: number; accuracy: number } {
  let recognized = 0;
  
  for (const exp of expected) {
    const match = found.find(f => 
      f.id === exp.id || 
      semanticSimilarity(f.decision, exp.decision) > 0.7
    );
    if (match) {
      // Check if rationale is also correct
      const rationaleMatch = semanticSimilarity(match.rationale, exp.rationale) > 0.5;
      recognized += rationaleMatch ? 1 : 0.5;
    }
  }
  
  return {
    recognized,
    total: expected.length,
    accuracy: expected.length > 0 ? recognized / expected.length : 1,
  };
}

function evaluateTradeoffs(
  found: { id: string; description: string; gained: string[]; sacrificed: string[] }[],
  expected: { id: string; description: string; gained: string[]; sacrificed: string[] }[]
): { identified: number; total: number; accuracy: number } {
  let identified = 0;
  
  for (const exp of expected) {
    const match = found.find(f =>
      f.id === exp.id ||
      semanticSimilarity(f.description, exp.description) > 0.6
    );
    if (match) {
      // Check gained/sacrificed overlap
      const gainedOverlap = setOverlap(match.gained, exp.gained);
      const sacrificedOverlap = setOverlap(match.sacrificed, exp.sacrificed);
      identified += (gainedOverlap + sacrificedOverlap) / 2;
    }
  }
  
  return {
    identified,
    total: expected.length,
    accuracy: expected.length > 0 ? identified / expected.length : 1,
  };
}

function evaluateIntentProbes(
  responses: { probeId: string; response: string; confidence: number }[],
  probes: IntentProbe[]
): { averageScore: number; byDifficulty: Record<string, number> } {
  const byDifficulty: Record<string, { total: number; score: number }> = {
    easy: { total: 0, score: 0 },
    medium: { total: 0, score: 0 },
    hard: { total: 0, score: 0 },
    expert: { total: 0, score: 0 },
  };
  
  let totalScore = 0;
  let count = 0;
  
  for (const probe of probes) {
    const response = responses.find(r => r.probeId === probe.id);
    if (!response) {continue;}
    
    const score = scoreProbeResponse(response.response, probe);
    totalScore += score;
    count++;
    
    const diffData = byDifficulty[probe.difficulty];
    if (diffData) {
      diffData.total++;
      diffData.score += score;
    }
  }
  
  const difficultyScores: Record<string, number> = {};
  for (const [diff, data] of Object.entries(byDifficulty)) {
    difficultyScores[diff] = data.total > 0 ? data.score / data.total : 0;
  }
  
  return {
    averageScore: count > 0 ? totalScore / count : 0,
    byDifficulty: difficultyScores,
  };
}

function scoreProbeResponse(response: string, probe: IntentProbe): number {
  const responseLower = response.toLowerCase();
  let score = 0;
  
  // Check for required concepts
  for (const element of probe.expectedAnswers) {
    if (responseLower.includes(element.toLowerCase())) {
      score += 0.3;
    }
  }
  
  // Check for required concepts
  for (const concept of probe.requiredConcepts) {
    if (responseLower.includes(concept.toLowerCase())) {
      score += 0.2;
    }
  }
  
  // Penalize wrong concepts
  for (const wrong of probe.wrongConcepts) {
    if (responseLower.includes(wrong.toLowerCase())) {
      score -= 0.3;
    }
  }
  
  return Math.max(0, Math.min(1, score));
}

// ============================================================================
// Causal Reasoning Scoring
// ============================================================================

export interface ToolCausalOutput {
  /** Counterfactual predictions */
  counterfactuals: {
    scenarioId: string;
    predictedEffects: {
      target: { file: string; line?: number };
      effectType: string;
      description: string;
      confidence: number;
    }[];
    predictedUnaffected: { file: string }[];
  }[];
  
  /** Causal chain reconstructions */
  causalChains: {
    id: string;
    chain: { step: number; location: { file: string; line: number }; action: string }[];
  }[];
}

export function evaluateCausalReasoning(
  toolOutput: ToolCausalOutput,
  groundTruth: CausalReasoningGroundTruth
): CausalScore {
  // Evaluate counterfactual predictions
  const counterfactualMetrics = evaluateCounterfactuals(
    toolOutput.counterfactuals,
    groundTruth.counterfactuals
  );
  
  // Evaluate causal chain reconstruction
  const chainMetrics = evaluateCausalChains(
    toolOutput.causalChains,
    groundTruth.causalChains
  );
  
  // Calculate overall score
  const score = (
    counterfactualMetrics.overallAccuracy * 0.6 +
    chainMetrics.accuracy * 0.4
  ) * 100;
  
  return {
    score,
    counterfactual: counterfactualMetrics,
    causalChains: chainMetrics,
    interventions: { accuracy: 0, magnitudeAccuracy: 0 }, // TODO: implement
  };
}

function evaluateCounterfactuals(
  found: ToolCausalOutput['counterfactuals'],
  expected: CausalReasoningGroundTruth['counterfactuals']
): { effectPrediction: number; unaffectedPrediction: number; overallAccuracy: number } {
  let effectScore = 0;
  let unaffectedScore = 0;
  let count = 0;
  
  for (const exp of expected) {
    const match = found.find(f => f.scenarioId === exp.id);
    if (!match) {continue;}
    count++;
    
    // Score effect predictions
    const expectedEffects = new Set(exp.expectedEffects.map(e => e.target.file));
    const predictedEffects = new Set(match.predictedEffects.map(e => e.target.file));
    
    const effectTP = [...expectedEffects].filter(e => predictedEffects.has(e)).length;
    effectScore += expectedEffects.size > 0 ? effectTP / expectedEffects.size : 1;
    
    // Score unaffected predictions
    const expectedUnaffected = new Set(exp.unaffected.map(u => u.file));
    const predictedUnaffected = new Set(match.predictedUnaffected.map(u => u.file));
    
    const unaffectedTP = [...expectedUnaffected].filter(u => predictedUnaffected.has(u)).length;
    unaffectedScore += expectedUnaffected.size > 0 ? unaffectedTP / expectedUnaffected.size : 1;
  }
  
  const avgEffect = count > 0 ? effectScore / count : 0;
  const avgUnaffected = count > 0 ? unaffectedScore / count : 0;
  
  return {
    effectPrediction: avgEffect,
    unaffectedPrediction: avgUnaffected,
    overallAccuracy: (avgEffect + avgUnaffected) / 2,
  };
}

function evaluateCausalChains(
  found: ToolCausalOutput['causalChains'],
  expected: CausalReasoningGroundTruth['causalChains']
): { accuracy: number; completeness: number } {
  let accuracy = 0;
  let completeness = 0;
  let count = 0;
  
  for (const exp of expected) {
    const match = found.find(f => f.id === exp.id);
    if (!match) {continue;}
    count++;
    
    // Check chain accuracy (order matters)
    const expectedSteps = exp.chain.map(s => `${s.location.file}:${s.location.line}`);
    const foundSteps = match.chain.map(s => `${s.location.file}:${s.location.line}`);
    
    let correctOrder = 0;
    for (let i = 0; i < Math.min(expectedSteps.length, foundSteps.length); i++) {
      if (expectedSteps[i] === foundSteps[i]) {correctOrder++;}
    }
    
    accuracy += expectedSteps.length > 0 ? correctOrder / expectedSteps.length : 1;
    completeness += foundSteps.length >= expectedSteps.length ? 1 : foundSteps.length / expectedSteps.length;
  }
  
  return {
    accuracy: count > 0 ? accuracy / count : 0,
    completeness: count > 0 ? completeness / count : 0,
  };
}

// ============================================================================
// Uncertainty Quantification Scoring
// ============================================================================

export interface ToolUncertaintyOutput {
  /** Predictions with confidence */
  predictions: {
    taskId: string;
    prediction: string;
    confidence: number;
    correct?: boolean; // Set during evaluation
  }[];
}

export function evaluateUncertainty(
  toolOutput: ToolUncertaintyOutput,
  groundTruth: UncertaintyGroundTruth
): UncertaintyScore {
  // Build calibration samples
  const samples: CalibrationSample[] = [];
  
  for (const test of groundTruth.calibrationTests) {
    const prediction = toolOutput.predictions.find(p => p.taskId === test.id);
    if (!prediction) {continue;}
    
    const correct = prediction.prediction.toLowerCase().includes(test.correctAnswer.toLowerCase());
    samples.push({ confidence: prediction.confidence, correct });
  }
  
  // Calculate calibration
  const calibration = calculateCalibration(samples);
  
  // Evaluate ambiguity recognition
  const ambiguityMetrics = evaluateAmbiguityRecognition(toolOutput, groundTruth);
  
  // Calculate score (lower ECE is better)
  const calibrationScore = 1 - calibration.ece;
  const score = (calibrationScore * 0.5 + ambiguityMetrics.accuracy * 0.5) * 100;
  
  return {
    score,
    ece: calibration.ece,
    mce: calibration.mce,
    ambiguityRecognition: ambiguityMetrics,
    overconfidenceRate: calculateOverconfidenceRate(samples),
    underconfidenceRate: calculateUnderconfidenceRate(samples),
  };
}

function evaluateAmbiguityRecognition(
  toolOutput: ToolUncertaintyOutput,
  groundTruth: UncertaintyGroundTruth
): { accuracy: number; appropriateConfidence: number } {
  let appropriateCount = 0;
  let total = 0;
  
  for (const scenario of groundTruth.ambiguousScenarios) {
    const prediction = toolOutput.predictions.find(p => p.taskId === scenario.id);
    if (!prediction) {continue;}
    total++;
    
    // Check if confidence is appropriately low
    if (prediction.confidence <= scenario.maxReasonableConfidence) {
      appropriateCount++;
    }
  }
  
  return {
    accuracy: total > 0 ? appropriateCount / total : 1,
    appropriateConfidence: total > 0 ? appropriateCount / total : 1,
  };
}

function calculateOverconfidenceRate(samples: CalibrationSample[]): number {
  const overconfident = samples.filter(s => s.confidence > 0.7 && !s.correct);
  return samples.length > 0 ? overconfident.length / samples.length : 0;
}

function calculateUnderconfidenceRate(samples: CalibrationSample[]): number {
  const underconfident = samples.filter(s => s.confidence < 0.3 && s.correct);
  return samples.length > 0 ? underconfident.length / samples.length : 0;
}

// ============================================================================
// Utility Functions
// ============================================================================

function semanticSimilarity(a: string, b: string): number {
  // Simple word overlap similarity (could be improved with embeddings)
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  
  return union > 0 ? intersection / union : 0;
}

function setOverlap(a: string[], b: string[]): number {
  const setA = new Set(a.map(s => s.toLowerCase()));
  const setB = new Set(b.map(s => s.toLowerCase()));
  
  const intersection = [...setA].filter(s => setB.has(s)).length;
  const union = new Set([...setA, ...setB]).size;
  
  return union > 0 ? intersection / union : 0;
}
