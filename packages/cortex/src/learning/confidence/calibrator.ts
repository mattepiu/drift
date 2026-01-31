/**
 * Confidence Calibrator
 * 
 * Calculates and calibrates confidence scores based on
 * evidence, usage, and temporal factors.
 * 
 * @module learning/confidence/calibrator
 */

import type { Memory } from '../../types/memory.js';
import type {
  ConfidenceMetrics,
  CalculatedConfidence,
  ConfidenceFactor,
  ValidationReason,
} from '../../types/learning.js';

/**
 * Configuration for confidence calibration
 */
export interface CalibrationConfig {
  /** Weight for evidence factor (default: 0.3) */
  evidenceWeight: number;
  /** Weight for usage factor (default: 0.3) */
  usageWeight: number;
  /** Weight for temporal factor (default: 0.2) */
  temporalWeight: number;
  /** Weight for validation factor (default: 0.2) */
  validationWeight: number;
  /** Threshold below which validation is recommended */
  validationThreshold: number;
  /** Days after which memory is considered stale */
  staleThresholdDays: number;
}

/**
 * Default calibration configuration
 */
const DEFAULT_CONFIG: CalibrationConfig = {
  evidenceWeight: 0.3,
  usageWeight: 0.3,
  temporalWeight: 0.2,
  validationWeight: 0.2,
  validationThreshold: 0.5,
  staleThresholdDays: 90,
};

/**
 * Confidence Calibrator
 * 
 * Calculates calibrated confidence scores using multiple factors.
 */
export class ConfidenceCalibrator {
  private config: CalibrationConfig;

  constructor(config: Partial<CalibrationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Calculate calibrated confidence for a memory
   */
  calculate(memory: Memory, metrics: ConfidenceMetrics): CalculatedConfidence {
    const factors: ConfidenceFactor[] = [];

    // Base confidence factor
    const baseFactor = this.calculateBaseFactor(metrics.baseConfidence);
    factors.push(baseFactor);

    // Evidence factor
    const evidenceFactor = this.calculateEvidenceFactor(metrics);
    factors.push(evidenceFactor);

    // Usage factor
    const usageFactor = this.calculateUsageFactor(metrics);
    factors.push(usageFactor);

    // Temporal factor
    const temporalFactor = this.calculateTemporalFactor(memory, metrics);
    factors.push(temporalFactor);

    // Validation factor
    const validationFactor = this.calculateValidationFactor(metrics);
    factors.push(validationFactor);

    // Calculate weighted sum
    const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
    const weightedSum = factors.reduce((sum, f) => sum + f.contribution, 0);
    const confidence = Math.max(0, Math.min(1, weightedSum / totalWeight));

    // Determine if validation is needed
    const validationResult = this.determineValidationNeed(
      confidence,
      metrics,
      memory
    );

    const result: CalculatedConfidence = {
      confidence,
      factors,
      needsValidation: validationResult.needsValidation,
    };
    
    if (validationResult.validationReason) {
      result.validationReason = validationResult.validationReason;
    }

    return result;
  }

  /**
   * Check if user should be asked to validate
   */
  shouldAskUser(memory: Memory, confidence: number): boolean {
    // Ask if confidence is below threshold
    if (confidence < this.config.validationThreshold) {
      return true;
    }

    // Ask if memory is important but has low confidence
    if (memory.importance === 'critical' && confidence < 0.7) {
      return true;
    }

    // Ask if memory has never been validated and is old
    if (!memory.lastValidated) {
      const ageInDays = this.calculateAge(memory.createdAt);
      if (ageInDays > this.config.staleThresholdDays / 2) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generate a validation prompt for a memory
   */
  generateValidationPrompt(memory: Memory, confidence: number): string {
    const confidencePercent = Math.round(confidence * 100);
    const importanceLabel = memory.importance === 'critical' ? 'critical' : 
                           memory.importance === 'high' ? 'important' : 'standard';

    let prompt = `I have a ${importanceLabel} memory with ${confidencePercent}% confidence:\n\n`;
    prompt += `"${memory.summary}"\n\n`;

    if (confidence < 0.5) {
      prompt += 'This memory has low confidence. ';
    }

    if (!memory.lastValidated) {
      prompt += 'It has never been validated. ';
    }

    prompt += 'Is this still accurate and relevant?\n\n';
    prompt += 'Options:\n';
    prompt += '1. Confirm - Yes, this is correct\n';
    prompt += '2. Reject - No, this is wrong\n';
    prompt += '3. Modify - Partially correct, needs updates\n';
    prompt += '4. Skip - Not sure, ask later';

    return prompt;
  }

  /**
   * Apply evidence-based adjustments
   */
  applyEvidenceAdjustments(
    base: number,
    metrics: ConfidenceMetrics
  ): number {
    const supporting = metrics.supportingEvidenceCount;
    const contradicting = metrics.contradictingEvidenceCount;

    if (supporting === 0 && contradicting === 0) {
      return base;
    }

    // Calculate evidence ratio
    const total = supporting + contradicting;
    const supportRatio = supporting / total;

    // Adjust confidence based on evidence
    // More supporting evidence increases confidence
    // More contradicting evidence decreases confidence
    const adjustment = (supportRatio - 0.5) * 0.4;

    return Math.max(0, Math.min(1, base + adjustment));
  }

  /**
   * Apply usage-based adjustments
   */
  applyUsageAdjustments(
    confidence: number,
    metrics: ConfidenceMetrics
  ): number {
    const successful = metrics.successfulUses;
    const rejected = metrics.rejectedUses;
    const total = successful + rejected;

    if (total === 0) {
      return confidence;
    }

    // Calculate success rate
    const successRate = successful / total;

    // Adjust confidence based on usage
    const adjustment = (successRate - 0.5) * 0.3;

    return Math.max(0, Math.min(1, confidence + adjustment));
  }

  /**
   * Apply temporal decay
   */
  applyTemporalDecay(confidence: number, memory: Memory): number {
    const ageInDays = this.calculateAge(memory.createdAt);

    // Get half-life based on memory type
    const halfLife = this.getHalfLife(memory.type);

    // Apply exponential decay
    const decayFactor = Math.pow(0.5, ageInDays / halfLife);

    // Don't decay below 50% of original
    const minConfidence = confidence * 0.5;
    const decayed = confidence * decayFactor;

    return Math.max(minConfidence, decayed);
  }

  /**
   * Calculate base confidence factor
   */
  private calculateBaseFactor(baseConfidence: number): ConfidenceFactor {
    return {
      name: 'base',
      weight: 0.2,
      value: baseConfidence,
      contribution: baseConfidence * 0.2,
      description: 'Original confidence from memory creation',
    };
  }

  /**
   * Calculate evidence factor
   */
  private calculateEvidenceFactor(metrics: ConfidenceMetrics): ConfidenceFactor {
    const supporting = metrics.supportingEvidenceCount;
    const contradicting = metrics.contradictingEvidenceCount;
    const total = supporting + contradicting;

    let value: number;
    let description: string;

    if (total === 0) {
      value = 0.5;
      description = 'No evidence available';
    } else {
      value = supporting / total;
      description = `${supporting} supporting, ${contradicting} contradicting`;
    }

    return {
      name: 'evidence',
      weight: this.config.evidenceWeight,
      value,
      contribution: value * this.config.evidenceWeight,
      description,
    };
  }

  /**
   * Calculate usage factor
   */
  private calculateUsageFactor(metrics: ConfidenceMetrics): ConfidenceFactor {
    const successful = metrics.successfulUses;
    const rejected = metrics.rejectedUses;
    const total = successful + rejected;

    let value: number;
    let description: string;

    if (total === 0) {
      value = 0.5;
      description = 'No usage data available';
    } else {
      value = successful / total;
      description = `${successful} successful, ${rejected} rejected uses`;
    }

    return {
      name: 'usage',
      weight: this.config.usageWeight,
      value,
      contribution: value * this.config.usageWeight,
      description,
    };
  }

  /**
   * Calculate temporal factor
   */
  private calculateTemporalFactor(
    memory: Memory,
    metrics: ConfidenceMetrics
  ): ConfidenceFactor {
    const ageInDays = metrics.ageInDays;
    const halfLife = this.getHalfLife(memory.type);

    // Calculate decay factor
    const decayFactor = Math.pow(0.5, ageInDays / halfLife);

    // Recent validation resets decay
    let value = decayFactor;
    let description = `${ageInDays} days old (half-life: ${halfLife} days)`;

    if (metrics.lastValidated) {
      const daysSinceValidation = this.calculateAge(metrics.lastValidated);
      if (daysSinceValidation < 30) {
        value = Math.max(value, 0.8);
        description += `, validated ${daysSinceValidation} days ago`;
      }
    }

    return {
      name: 'temporal',
      weight: this.config.temporalWeight,
      value,
      contribution: value * this.config.temporalWeight,
      description,
    };
  }

  /**
   * Calculate validation factor
   */
  private calculateValidationFactor(metrics: ConfidenceMetrics): ConfidenceFactor {
    const confirmations = metrics.userConfirmations;
    const rejections = metrics.userRejections;
    const total = confirmations + rejections;

    let value: number;
    let description: string;

    if (total === 0) {
      value = 0.5;
      description = 'No user validation';
    } else {
      value = confirmations / total;
      description = `${confirmations} confirmations, ${rejections} rejections`;
    }

    return {
      name: 'validation',
      weight: this.config.validationWeight,
      value,
      contribution: value * this.config.validationWeight,
      description,
    };
  }

  /**
   * Determine if validation is needed
   */
  private determineValidationNeed(
    confidence: number,
    metrics: ConfidenceMetrics,
    memory: Memory
  ): { needsValidation: boolean; validationReason?: ValidationReason } {
    // Low confidence
    if (confidence < this.config.validationThreshold) {
      return {
        needsValidation: true,
        validationReason: 'low_confidence',
      };
    }

    // Conflicting evidence
    if (
      metrics.supportingEvidenceCount > 0 &&
      metrics.contradictingEvidenceCount > 0 &&
      metrics.contradictingEvidenceCount >= metrics.supportingEvidenceCount * 0.5
    ) {
      return {
        needsValidation: true,
        validationReason: 'conflicting_evidence',
      };
    }

    // Stale memory
    if (metrics.ageInDays > this.config.staleThresholdDays) {
      return {
        needsValidation: true,
        validationReason: 'stale',
      };
    }

    // Never validated
    if (!metrics.lastValidated && metrics.ageInDays > 30) {
      return {
        needsValidation: true,
        validationReason: 'never_validated',
      };
    }

    // High importance but low confidence
    if (
      (memory.importance === 'critical' || memory.importance === 'high') &&
      confidence < 0.7
    ) {
      return {
        needsValidation: true,
        validationReason: 'high_importance_low_confidence',
      };
    }

    // Frequent rejection
    if (
      metrics.rejectedUses > 2 &&
      metrics.rejectedUses > metrics.successfulUses
    ) {
      return {
        needsValidation: true,
        validationReason: 'frequent_rejection',
      };
    }

    return { needsValidation: false };
  }

  /**
   * Get half-life for memory type in days
   */
  private getHalfLife(type: string): number {
    const halfLives: Record<string, number> = {
      core: 730,           // 2 years
      tribal: 365,         // 1 year
      procedural: 180,     // 6 months
      semantic: 365,       // 1 year
      episodic: 30,        // 1 month
      pattern_rationale: 180,  // 6 months
      constraint_override: 90, // 3 months
      decision_context: 180,   // 6 months
      code_smell: 90,      // 3 months
    };

    return halfLives[type] || 180;
  }

  /**
   * Calculate age in days
   */
  private calculateAge(dateString: string): number {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }
}
