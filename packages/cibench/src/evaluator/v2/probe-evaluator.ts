/**
 * CIBench v2 Probe Evaluator
 * 
 * Evaluates generative probes - the key innovation for testing understanding.
 * Instead of just checking if the tool found the right answer,
 * we ask it to GENERATE explanations, predictions, and reasoning.
 */

import type { ProbeResults, IndividualProbeResult, ProbeTypeResult } from './types.js';
import type {
  ProbeGroundTruth,
  ExplanationProbe,
  PredictionProbe,
  ComparisonProbe,
  SynthesisProbe,
  AdversarialProbe,
} from '../../schema/v2/probes.js';

// ============================================================================
// Probe Response Interface
// ============================================================================

export interface ToolProbeResponse {
  probeId: string;
  probeType: 'explanation' | 'prediction' | 'comparison' | 'synthesis' | 'adversarial';
  response: string;
  confidence?: number;
  reasoning?: string;
}

// ============================================================================
// Main Evaluation Function
// ============================================================================

export function evaluateProbes(
  responses: ToolProbeResponse[],
  groundTruth: ProbeGroundTruth
): ProbeResults {
  const results: IndividualProbeResult[] = [];
  
  // Evaluate explanation probes
  for (const probe of groundTruth.explanationProbes) {
    const response = responses.find(r => r.probeId === probe.id);
    if (response) {
      results.push(evaluateExplanationProbe(response, probe));
    }
  }
  
  // Evaluate prediction probes
  for (const probe of groundTruth.predictionProbes) {
    const response = responses.find(r => r.probeId === probe.id);
    if (response) {
      results.push(evaluatePredictionProbe(response, probe));
    }
  }
  
  // Evaluate comparison probes
  for (const probe of groundTruth.comparisonProbes) {
    const response = responses.find(r => r.probeId === probe.id);
    if (response) {
      results.push(evaluateComparisonProbe(response, probe));
    }
  }
  
  // Evaluate synthesis probes
  for (const probe of groundTruth.synthesisProbes) {
    const response = responses.find(r => r.probeId === probe.id);
    if (response) {
      results.push(evaluateSynthesisProbe(response, probe));
    }
  }
  
  // Evaluate adversarial probes
  for (const probe of groundTruth.adversarialProbes) {
    const response = responses.find(r => r.probeId === probe.id);
    if (response) {
      results.push(evaluateAdversarialProbe(response, probe));
    }
  }
  
  // Aggregate results
  return aggregateProbeResults(results);
}


// ============================================================================
// Explanation Probe Evaluation
// ============================================================================

function evaluateExplanationProbe(
  response: ToolProbeResponse,
  probe: ExplanationProbe
): IndividualProbeResult {
  const responseLower = response.response.toLowerCase();
  
  const elementsFound: string[] = [];
  const elementsMissed: string[] = [];
  let score = 0;
  
  // Check for expected elements
  for (const element of probe.expectedElements) {
    const found = element.acceptablePhrases.some(phrase =>
      responseLower.includes(phrase.toLowerCase())
    ) || responseLower.includes(element.concept.toLowerCase());
    
    if (found) {
      elementsFound.push(element.concept);
      score += element.points;
    } else if (element.importance === 'required') {
      elementsMissed.push(element.concept);
    }
  }
  
  // Check for misconceptions (penalties)
  const misconceptionsDetected: string[] = [];
  for (const misconception of probe.misconceptions) {
    if (responseLower.includes(misconception.concept.toLowerCase())) {
      misconceptionsDetected.push(misconception.concept);
      score -= misconception.penalty;
    }
  }
  
  // Normalize score
  const normalizedScore = Math.max(0, Math.min(1, score / probe.rubric.maxPoints));
  const passed = normalizedScore >= probe.rubric.passThreshold / probe.rubric.maxPoints;
  
  return {
    probeId: probe.id,
    type: 'explanation',
    difficulty: probe.difficulty,
    score: normalizedScore,
    passed,
    elementsFound,
    elementsMissed,
  };
}

// ============================================================================
// Prediction Probe Evaluation
// ============================================================================

function evaluatePredictionProbe(
  response: ToolProbeResponse,
  probe: PredictionProbe
): IndividualProbeResult {
  const responseLower = response.response.toLowerCase();
  
  const elementsFound: string[] = [];
  const elementsMissed: string[] = [];
  let score = 0;
  
  // Check for correct predictions
  for (const prediction of probe.expectedPredictions) {
    if (responseLower.includes(prediction.effect.toLowerCase())) {
      elementsFound.push(prediction.effect);
      score += prediction.points;
      
      // Bonus for causal chain explanation
      if (prediction.causalChain && probe.rubric.causalChainBonus > 0) {
        const chainMentioned = prediction.causalChain.some(step =>
          responseLower.includes(step.toLowerCase())
        );
        if (chainMentioned) {
          score += probe.rubric.causalChainBonus;
        }
      }
    } else if (prediction.likelihood === 'certain' || prediction.likelihood === 'likely') {
      elementsMissed.push(prediction.effect);
    }
  }
  
  // Check for incorrect predictions (penalties)
  for (const incorrect of probe.incorrectPredictions) {
    if (responseLower.includes(incorrect.effect.toLowerCase())) {
      score -= incorrect.penalty;
    }
  }
  
  // Normalize score
  const normalizedScore = Math.max(0, Math.min(1, score / probe.rubric.maxPoints));
  const passed = normalizedScore >= 0.5;
  
  return {
    probeId: probe.id,
    type: 'prediction',
    difficulty: probe.difficulty,
    score: normalizedScore,
    passed,
    elementsFound,
    elementsMissed,
  };
}

// ============================================================================
// Comparison Probe Evaluation
// ============================================================================

function evaluateComparisonProbe(
  response: ToolProbeResponse,
  probe: ComparisonProbe
): IndividualProbeResult {
  const responseLower = response.response.toLowerCase();
  
  const elementsFound: string[] = [];
  const elementsMissed: string[] = [];
  let score = 0;
  
  // Check for similarities
  for (const similarity of probe.expectedSimilarities) {
    if (responseLower.includes(similarity.point.toLowerCase())) {
      elementsFound.push(`similarity: ${similarity.point}`);
      score += similarity.points;
    } else if (similarity.importance === 'critical') {
      elementsMissed.push(`similarity: ${similarity.point}`);
    }
  }
  
  // Check for differences
  for (const difference of probe.expectedDifferences) {
    if (responseLower.includes(difference.point.toLowerCase())) {
      elementsFound.push(`difference: ${difference.point}`);
      score += difference.points;
    } else if (difference.importance === 'critical') {
      elementsMissed.push(`difference: ${difference.point}`);
    }
  }
  
  // Normalize score
  const normalizedScore = Math.max(0, Math.min(1, score / probe.rubric.maxPoints));
  const passed = normalizedScore >= 0.5;
  
  return {
    probeId: probe.id,
    type: 'comparison',
    difficulty: probe.difficulty,
    score: normalizedScore,
    passed,
    elementsFound,
    elementsMissed,
  };
}

// ============================================================================
// Synthesis Probe Evaluation
// ============================================================================

function evaluateSynthesisProbe(
  response: ToolProbeResponse,
  probe: SynthesisProbe
): IndividualProbeResult {
  const responseLower = response.response.toLowerCase();
  
  const elementsFound: string[] = [];
  const elementsMissed: string[] = [];
  let score = 0;
  
  // Check for required elements
  for (const element of probe.expectedSynthesis.requiredElements) {
    if (responseLower.includes(element.element.toLowerCase())) {
      elementsFound.push(element.element);
      score += element.points;
    } else {
      elementsMissed.push(element.element);
    }
  }
  
  // Check constraint respect
  let constraintsRespected = 0;
  for (const constraint of probe.expectedSynthesis.constraints) {
    // Simple check: constraint shouldn't be violated
    // In practice, this would need more sophisticated checking
    if (!responseLower.includes('violat') || !responseLower.includes(constraint.toLowerCase())) {
      constraintsRespected++;
    }
  }
  
  const constraintScore = probe.expectedSynthesis.constraints.length > 0
    ? constraintsRespected / probe.expectedSynthesis.constraints.length
    : 1;
  
  // Normalize score
  const elementScore = probe.rubric.maxPoints > 0 ? score / probe.rubric.maxPoints : 0;
  const normalizedScore = (
    elementScore * probe.rubric.elementCoverageWeight +
    constraintScore * probe.rubric.constraintRespectWeight
  );
  
  const passed = normalizedScore >= 0.5;
  
  return {
    probeId: probe.id,
    type: 'synthesis',
    difficulty: probe.difficulty,
    score: normalizedScore,
    passed,
    elementsFound,
    elementsMissed,
  };
}

// ============================================================================
// Adversarial Probe Evaluation
// ============================================================================

function evaluateAdversarialProbe(
  response: ToolProbeResponse,
  probe: AdversarialProbe
): IndividualProbeResult {
  const responseLower = response.response.toLowerCase();
  
  const expected = probe.expectedBehavior;
  let score = 0;
  
  // Check if tool was fooled
  const wasFooled = expected.unacceptableResponses.some(unacceptable =>
    responseLower.includes(unacceptable.toLowerCase())
  );
  
  if (wasFooled && !expected.shouldBeFooled) {
    // Tool was fooled when it shouldn't have been
    score = expected.scoring.fooledPenalty;
  } else if (!wasFooled && expected.shouldBeFooled) {
    // Tool wasn't fooled when it should have been (suspicious)
    score = expected.scoring.partialCredit;
  } else {
    // Correct behavior
    const recognizedCorrectly = expected.acceptableResponses.some(acceptable =>
      responseLower.includes(acceptable.toLowerCase())
    );
    
    if (recognizedCorrectly) {
      score = expected.scoring.correctBehavior;
    } else {
      score = expected.scoring.partialCredit;
    }
  }
  
  // Normalize to 0-1
  const maxScore = expected.scoring.correctBehavior;
  const normalizedScore = Math.max(0, Math.min(1, score / maxScore));
  
  return {
    probeId: probe.id,
    type: 'adversarial',
    difficulty: probe.difficulty,
    score: normalizedScore,
    passed: normalizedScore >= 0.5,
    elementsFound: wasFooled ? [] : [probe.adversarialElement],
    elementsMissed: wasFooled ? [probe.adversarialElement] : [],
  };
}

// ============================================================================
// Result Aggregation
// ============================================================================

function aggregateProbeResults(results: IndividualProbeResult[]): ProbeResults {
  // By type
  const byType: Record<string, { scores: number[]; passed: number }> = {
    explanation: { scores: [], passed: 0 },
    prediction: { scores: [], passed: 0 },
    comparison: { scores: [], passed: 0 },
    synthesis: { scores: [], passed: 0 },
    adversarial: { scores: [], passed: 0 },
  };
  
  // By difficulty
  const byDifficulty: Record<string, { scores: number[]; passed: number }> = {
    easy: { scores: [], passed: 0 },
    medium: { scores: [], passed: 0 },
    hard: { scores: [], passed: 0 },
    expert: { scores: [], passed: 0 },
  };
  
  for (const result of results) {
    const typeData = byType[result.type];
    if (typeData) {
      typeData.scores.push(result.score);
      if (result.passed) {typeData.passed++;}
    }
    
    const diffData = byDifficulty[result.difficulty];
    if (diffData) {
      diffData.scores.push(result.score);
      if (result.passed) {diffData.passed++;}
    }
  }
  
  const toTypeResult = (data: { scores: number[]; passed: number }): ProbeTypeResult => ({
    score: data.scores.length > 0
      ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length
      : 0,
    count: data.scores.length,
    passRate: data.scores.length > 0 ? data.passed / data.scores.length : 0,
  });
  
  const allScores = results.map(r => r.score);
  const overallScore = allScores.length > 0
    ? (allScores.reduce((a, b) => a + b, 0) / allScores.length) * 100
    : 0;
  
  return {
    overallScore,
    byType: {
      explanation: toTypeResult(byType['explanation']!),
      prediction: toTypeResult(byType['prediction']!),
      comparison: toTypeResult(byType['comparison']!),
      synthesis: toTypeResult(byType['synthesis']!),
      adversarial: toTypeResult(byType['adversarial']!),
    },
    byDifficulty: {
      easy: toTypeResult(byDifficulty['easy']!),
      medium: toTypeResult(byDifficulty['medium']!),
      hard: toTypeResult(byDifficulty['hard']!),
      expert: toTypeResult(byDifficulty['expert']!),
    },
    individual: results,
  };
}
