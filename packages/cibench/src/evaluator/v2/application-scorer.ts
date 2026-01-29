/**
 * CIBench v2 Application Scorer (Level 3)
 * 
 * Evaluates practical application of understanding:
 * - Token efficiency (getting right context with minimal tokens)
 * - Compositional reasoning (combining knowledge pieces)
 * - Iterative refinement (improving with feedback)
 * - Negative knowledge (knowing what NOT to do)
 */

import type {
  EfficiencyScore,
  CompositionalScore,
  RefinementScore,
  NegativeKnowledgeScore,
} from './types.js';
import type {
  TokenEfficiencyGroundTruth,
  CompositionalGroundTruth,
  RefinementGroundTruth,
  NegativeKnowledgeGroundTruth,
} from '../../schema/v2/application.js';

// ============================================================================
// Token Efficiency Scoring
// ============================================================================

export interface ToolEfficiencyOutput {
  /** Files retrieved for task */
  retrievedFiles: {
    file: string;
    sections?: { startLine: number; endLine: number }[];
    tokens: number;
  }[];
  
  /** Patterns identified */
  identifiedPatterns: string[];
  
  /** Constraints identified */
  identifiedConstraints: string[];
  
  /** Total tokens used */
  totalTokens: number;
}


export function evaluateTokenEfficiency(
  toolOutput: ToolEfficiencyOutput,
  groundTruth: TokenEfficiencyGroundTruth,
  taskId: string
): EfficiencyScore {
  const task = groundTruth.tasks.find(t => t.id === taskId);
  if (!task) {
    return {
      score: 0,
      tokens: { used: toolOutput.totalTokens, optimal: 0, efficiency: 0 },
      relevance: { criticalCoverage: 0, importantCoverage: 0, noiseRatio: 1, weightedRelevance: 0 },
    };
  }
  
  const optimal = task.optimalContext;
  const retrievedSet = new Set(toolOutput.retrievedFiles.map(f => f.file));
  
  // Calculate coverage by importance
  const criticalFiles = optimal.requiredFiles.filter(f => f.relevance === 'critical');
  const importantFiles = optimal.requiredFiles.filter(f => f.relevance === 'important');
  const helpfulFiles = optimal.requiredFiles.filter(f => f.relevance === 'helpful');
  
  const criticalFound = criticalFiles.filter(f => retrievedSet.has(f.file)).length;
  const importantFound = importantFiles.filter(f => retrievedSet.has(f.file)).length;
  const helpfulFound = helpfulFiles.filter(f => retrievedSet.has(f.file)).length;
  
  const criticalCoverage = criticalFiles.length > 0 ? criticalFound / criticalFiles.length : 1;
  const importantCoverage = importantFiles.length > 0 ? importantFound / importantFiles.length : 1;
  const helpfulCoverage = helpfulFiles.length > 0 ? helpfulFound / helpfulFiles.length : 1;
  
  // Calculate noise
  const noiseFiles = task.noiseFiles.filter(n => retrievedSet.has(n.file));
  const noiseTokens = noiseFiles.reduce((sum, n) => sum + n.tokenCost, 0);
  const noiseRatio = toolOutput.totalTokens > 0 ? noiseTokens / toolOutput.totalTokens : 0;
  
  // Calculate weighted relevance
  const weightedRelevance = (
    criticalCoverage * 0.5 +
    importantCoverage * 0.3 +
    helpfulCoverage * 0.2
  );
  
  // Calculate efficiency
  const efficiency = toolOutput.totalTokens > 0
    ? (weightedRelevance * optimal.optimalTokens) / toolOutput.totalTokens
    : 0;
  
  // Calculate overall score
  // Penalize for missing critical files heavily
  // Penalize for excessive tokens
  // Reward for high relevance with low tokens
  const score = Math.min(100, (
    criticalCoverage * 40 +
    importantCoverage * 20 +
    (1 - noiseRatio) * 20 +
    Math.min(1, efficiency) * 20
  ));
  
  return {
    score,
    tokens: {
      used: toolOutput.totalTokens,
      optimal: optimal.optimalTokens,
      efficiency,
    },
    relevance: {
      criticalCoverage,
      importantCoverage,
      noiseRatio,
      weightedRelevance,
    },
  };
}

// ============================================================================
// Compositional Reasoning Scoring
// ============================================================================

export interface ToolCompositionalOutput {
  /** Knowledge pieces identified */
  knowledgePieces: {
    id: string;
    type: string;
    content: string;
    source?: { file: string; line: number };
  }[];
  
  /** Composition steps taken */
  compositionSteps: {
    step: number;
    inputs: string[];
    operation: string;
    output: string;
  }[];
  
  /** Final output */
  finalOutput: string;
}

export function evaluateCompositionalReasoning(
  toolOutput: ToolCompositionalOutput,
  groundTruth: CompositionalGroundTruth,
  taskId: string
): CompositionalScore {
  const task = groundTruth.tasks.find(t => t.id === taskId);
  if (!task) {
    return {
      score: 0,
      knowledgeIdentification: { found: 0, total: 0, accuracy: 0 },
      composition: { stepsCorrect: 0, totalSteps: 0, accuracy: 0 },
      outputQuality: 0,
    };
  }
  
  // Evaluate knowledge identification
  const expectedKnowledge = new Set(task.requiredKnowledge.map(k => k.id));
  const foundKnowledge = new Set(toolOutput.knowledgePieces.map(k => k.id));
  
  const knowledgeFound = [...expectedKnowledge].filter(k => foundKnowledge.has(k)).length;
  const knowledgeAccuracy = expectedKnowledge.size > 0 ? knowledgeFound / expectedKnowledge.size : 1;
  
  // Evaluate composition steps
  let stepsCorrect = 0;
  for (let i = 0; i < Math.min(task.composition.length, toolOutput.compositionSteps.length); i++) {
    const expectedStep = task.composition[i];
    const foundStep = toolOutput.compositionSteps[i];
    
    if (!expectedStep || !foundStep) {continue;}
    
    // Check if operation matches
    if (foundStep.operation === expectedStep.operation) {
      // Check if inputs match
      const expectedInputs = new Set(expectedStep.inputs);
      const foundInputs = new Set(foundStep.inputs);
      const inputOverlap = [...expectedInputs].filter(inp => foundInputs.has(inp)).length;
      
      if (inputOverlap >= expectedInputs.size * 0.7) {
        stepsCorrect++;
      }
    }
  }
  
  const compositionAccuracy = task.composition.length > 0
    ? stepsCorrect / task.composition.length
    : 1;
  
  // Evaluate output quality
  const outputQuality = evaluateOutputQuality(toolOutput.finalOutput, task.expectedOutput);
  
  // Calculate overall score
  const score = (
    knowledgeAccuracy * 30 +
    compositionAccuracy * 40 +
    outputQuality * 30
  );
  
  return {
    score,
    knowledgeIdentification: {
      found: knowledgeFound,
      total: expectedKnowledge.size,
      accuracy: knowledgeAccuracy,
    },
    composition: {
      stepsCorrect,
      totalSteps: task.composition.length,
      accuracy: compositionAccuracy,
    },
    outputQuality,
  };
}

function evaluateOutputQuality(
  output: string,
  expected: { type: string; criteria: string[] }
): number {
  const outputLower = output.toLowerCase();
  
  // Check criteria
  let criteriaMatched = 0;
  
  for (const criterion of expected.criteria) {
    if (outputLower.includes(criterion.toLowerCase())) {
      criteriaMatched++;
    }
  }
  
  return expected.criteria.length > 0 ? criteriaMatched / expected.criteria.length : 0;
}

// ============================================================================
// Iterative Refinement Scoring
// ============================================================================

export interface ToolRefinementOutput {
  /** Iterations */
  iterations: {
    iteration: number;
    output: string;
    quality: number; // Self-assessed or evaluated
  }[];
  
  /** Feedback utilized */
  feedbackUtilized: string[];
}

export function evaluateIterativeRefinement(
  toolOutput: ToolRefinementOutput,
  groundTruth: RefinementGroundTruth,
  scenarioId: string
): RefinementScore {
  const scenario = groundTruth.scenarios.find(s => s.id === scenarioId);
  if (!scenario) {
    return {
      score: 0,
      improvementRate: 0,
      finalQuality: 0,
      iterationsNeeded: 0,
      feedbackUtilization: 0,
    };
  }
  
  // Calculate improvement rate
  const qualities = toolOutput.iterations.map(iter => iter.quality);
  let improvementRate = 0;
  
  if (qualities.length >= 2) {
    const improvements: number[] = [];
    for (let idx = 1; idx < qualities.length; idx++) {
      const prev = qualities[idx - 1];
      const curr = qualities[idx];
      if (prev !== undefined && curr !== undefined) {
        improvements.push(curr - prev);
      }
    }
    improvementRate = improvements.length > 0 
      ? improvements.reduce((a, b) => a + b, 0) / improvements.length 
      : 0;
  }
  
  // Final quality
  const lastQuality = qualities[qualities.length - 1];
  const finalQuality = lastQuality !== undefined ? lastQuality : 0;
  
  // Iterations needed
  const iterationsNeeded = toolOutput.iterations.length;
  const iterationEfficiency = scenario.maxIterations > 0
    ? Math.max(0, 1 - (iterationsNeeded - 1) / scenario.maxIterations)
    : 1;
  
  // Feedback utilization
  const expectedFeedback = scenario.feedbackSequence.length;
  const utilizedFeedback = toolOutput.feedbackUtilized.length;
  const feedbackUtilization = expectedFeedback > 0
    ? Math.min(1, utilizedFeedback / expectedFeedback)
    : 1;
  
  // Calculate overall score
  const score = (
    Math.max(0, improvementRate) * 20 +
    finalQuality * 40 +
    iterationEfficiency * 20 +
    feedbackUtilization * 20
  );
  
  return {
    score,
    improvementRate,
    finalQuality,
    iterationsNeeded,
    feedbackUtilization,
  };
}

// ============================================================================
// Negative Knowledge Scoring
// ============================================================================

export interface ToolNegativeKnowledgeOutput {
  /** Recognized avoidances */
  recognizedAvoidances: string[];
  
  /** Recognized anti-patterns */
  recognizedAntiPatterns: string[];
  
  /** Respected danger zones */
  respectedDangerZones: string[];
  
  /** Violations (things that should have been avoided but weren't) */
  violations: {
    type: 'avoidance' | 'anti-pattern' | 'danger-zone';
    id: string;
    description: string;
  }[];
}

export function evaluateNegativeKnowledge(
  toolOutput: ToolNegativeKnowledgeOutput,
  groundTruth: NegativeKnowledgeGroundTruth
): NegativeKnowledgeScore {
  // Evaluate avoidance recognition
  const expectedAvoidances = new Set(groundTruth.avoidances.map(a => a.id));
  const recognizedAvoidances = new Set(toolOutput.recognizedAvoidances);
  const avoidanceRecognized = [...expectedAvoidances].filter(a => recognizedAvoidances.has(a)).length;
  const avoidanceAccuracy = expectedAvoidances.size > 0
    ? avoidanceRecognized / expectedAvoidances.size
    : 1;
  
  // Evaluate anti-pattern awareness
  const expectedAntiPatterns = new Set(groundTruth.antiPatterns.map(a => a.id));
  const recognizedAntiPatterns = new Set(toolOutput.recognizedAntiPatterns);
  const antiPatternRecognized = [...expectedAntiPatterns].filter(a => recognizedAntiPatterns.has(a)).length;
  const antiPatternAccuracy = expectedAntiPatterns.size > 0
    ? antiPatternRecognized / expectedAntiPatterns.size
    : 1;
  
  // Evaluate danger zone respect
  const expectedDangerZones = new Set(groundTruth.dangerZones.map(d => d.id));
  const respectedDangerZones = new Set(toolOutput.respectedDangerZones);
  const dangerZoneRespected = [...expectedDangerZones].filter(d => respectedDangerZones.has(d)).length;
  const dangerZoneAccuracy = expectedDangerZones.size > 0
    ? dangerZoneRespected / expectedDangerZones.size
    : 1;
  
  // Penalize violations
  const violationPenalty = toolOutput.violations.length * 0.1;
  
  // Calculate overall score
  const rawScore = (
    avoidanceAccuracy * 30 +
    antiPatternAccuracy * 35 +
    dangerZoneAccuracy * 35
  );
  
  const score = Math.max(0, rawScore - violationPenalty * 100);
  
  return {
    score,
    avoidances: {
      recognized: avoidanceRecognized,
      total: expectedAvoidances.size,
      accuracy: avoidanceAccuracy,
    },
    antiPatterns: {
      recognized: antiPatternRecognized,
      total: expectedAntiPatterns.size,
      accuracy: antiPatternAccuracy,
    },
    dangerZones: {
      respected: dangerZoneRespected,
      total: expectedDangerZones.size,
      accuracy: dangerZoneAccuracy,
    },
  };
}
