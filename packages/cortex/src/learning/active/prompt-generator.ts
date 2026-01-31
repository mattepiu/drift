/**
 * Validation Prompt Generator
 * 
 * Generates user-friendly validation prompts for memories
 * that need confirmation, rejection, or modification.
 * 
 * @module learning/active/prompt-generator
 */

import type { Memory } from '../../types/memory.js';
import type {
  ValidationPrompt,
  ValidationAction,
  ValidationReason,
} from '../../types/learning.js';

/**
 * Prompt template configuration
 */
export interface PromptConfig {
  /** Include confidence percentage */
  showConfidence: boolean;
  /** Include memory type */
  showType: boolean;
  /** Include age information */
  showAge: boolean;
  /** Include usage statistics */
  showUsage: boolean;
  /** Maximum summary length */
  maxSummaryLength: number;
}

/**
 * Default prompt configuration
 */
const DEFAULT_CONFIG: PromptConfig = {
  showConfidence: true,
  showType: true,
  showAge: true,
  showUsage: false,
  maxSummaryLength: 200,
};

/**
 * Validation Prompt Generator
 * 
 * Creates clear, actionable prompts for memory validation.
 */
export class ValidationPromptGenerator {
  private config: PromptConfig;

  constructor(config: Partial<PromptConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate a validation prompt for a memory
   */
  generate(memory: Memory, confidence: number): ValidationPrompt {
    const reason = this.determineReason(memory, confidence);
    const promptText = this.formatPromptText(memory, confidence, reason);
    const memorySummary = this.formatMemorySummary(memory);
    const actions = this.getAvailableActions(reason);

    return {
      memoryId: memory.id,
      promptText,
      memorySummary,
      currentConfidence: confidence,
      reason,
      actions,
    };
  }

  /**
   * Format the memory summary for display
   */
  formatMemorySummary(memory: Memory): string {
    let summary = memory.summary;

    // Truncate if too long
    if (summary.length > this.config.maxSummaryLength) {
      summary = summary.slice(0, this.config.maxSummaryLength - 3) + '...';
    }

    return summary;
  }

  /**
   * Format confidence explanation
   */
  formatConfidenceExplanation(confidence: number): string {
    const percent = Math.round(confidence * 100);

    if (confidence < 0.3) {
      return `Very low confidence (${percent}%) - this memory is uncertain`;
    } else if (confidence < 0.5) {
      return `Low confidence (${percent}%) - this memory needs verification`;
    } else if (confidence < 0.7) {
      return `Moderate confidence (${percent}%) - could benefit from confirmation`;
    } else if (confidence < 0.9) {
      return `Good confidence (${percent}%) - likely accurate`;
    } else {
      return `High confidence (${percent}%) - very likely accurate`;
    }
  }

  /**
   * Format available options for the user
   */
  formatOptions(): string[] {
    return [
      '✓ Confirm - This is correct and still relevant',
      '✗ Reject - This is incorrect or no longer applies',
      '✎ Modify - This needs updates or corrections',
      '→ Skip - Not sure, ask me later',
    ];
  }

  /**
   * Generate prompt text
   */
  private formatPromptText(
    memory: Memory,
    confidence: number,
    reason: ValidationReason
  ): string {
    const parts: string[] = [];

    // Header
    parts.push('📋 Memory Validation Request\n');

    // Reason explanation
    parts.push(this.getReasonExplanation(reason));
    parts.push('');

    // Memory details
    if (this.config.showType) {
      parts.push(`Type: ${this.formatMemoryType(memory.type)}`);
    }

    if (this.config.showConfidence) {
      parts.push(this.formatConfidenceExplanation(confidence));
    }

    if (this.config.showAge) {
      parts.push(`Age: ${this.formatAge(memory.createdAt)}`);
    }

    parts.push('');

    // Memory content
    parts.push('Memory:');
    parts.push(`"${this.formatMemorySummary(memory)}"`);
    parts.push('');

    // Question
    parts.push('Is this memory still accurate and relevant?');
    parts.push('');

    // Options
    parts.push('Options:');
    for (const option of this.formatOptions()) {
      parts.push(`  ${option}`);
    }

    return parts.join('\n');
  }

  /**
   * Get explanation for validation reason
   */
  private getReasonExplanation(reason: ValidationReason): string {
    const explanations: Record<ValidationReason, string> = {
      low_confidence: '⚠️ This memory has low confidence and needs verification.',
      conflicting_evidence: '⚡ There is conflicting evidence about this memory.',
      stale: '🕐 This memory is old and may be outdated.',
      never_validated: '🆕 This memory has never been validated by a user.',
      high_importance_low_confidence: '❗ This is an important memory with uncertain accuracy.',
      frequent_rejection: '🔄 This memory has been frequently rejected in use.',
      user_requested: '👤 You requested to validate this memory.',
    };

    return explanations[reason] || '❓ This memory needs validation.';
  }

  /**
   * Format memory type for display
   */
  private formatMemoryType(type: string): string {
    const typeNames: Record<string, string> = {
      core: 'Core Knowledge',
      tribal: 'Tribal Knowledge',
      procedural: 'Procedural',
      semantic: 'Semantic',
      episodic: 'Episodic',
      pattern_rationale: 'Pattern Rationale',
      constraint_override: 'Constraint Override',
      decision_context: 'Decision Context',
      code_smell: 'Code Smell',
    };

    return typeNames[type] || type;
  }

  /**
   * Format age for display
   */
  private formatAge(createdAt: string): string {
    const created = new Date(createdAt);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return 'Created today';
    } else if (days === 1) {
      return 'Created yesterday';
    } else if (days < 7) {
      return `Created ${days} days ago`;
    } else if (days < 30) {
      const weeks = Math.floor(days / 7);
      return `Created ${weeks} week${weeks > 1 ? 's' : ''} ago`;
    } else if (days < 365) {
      const months = Math.floor(days / 30);
      return `Created ${months} month${months > 1 ? 's' : ''} ago`;
    } else {
      const years = Math.floor(days / 365);
      return `Created ${years} year${years > 1 ? 's' : ''} ago`;
    }
  }

  /**
   * Determine validation reason from memory state
   */
  private determineReason(memory: Memory, confidence: number): ValidationReason {
    if (confidence < 0.3) {
      return 'low_confidence';
    }

    if (!memory.lastValidated) {
      const ageInDays = this.calculateAge(memory.createdAt);
      if (ageInDays > 30) {
        return 'never_validated';
      }
    }

    const ageInDays = this.calculateAge(memory.createdAt);
    if (ageInDays > 90) {
      return 'stale';
    }

    if (memory.importance === 'critical' || memory.importance === 'high') {
      if (confidence < 0.7) {
        return 'high_importance_low_confidence';
      }
    }

    return 'low_confidence';
  }

  /**
   * Get available validation actions
   */
  private getAvailableActions(_reason: ValidationReason): ValidationAction[] {
    const actions: ValidationAction[] = [
      {
        type: 'confirm',
        label: 'Confirm',
        description: 'This memory is correct and still relevant',
      },
      {
        type: 'reject',
        label: 'Reject',
        description: 'This memory is incorrect or no longer applies',
      },
      {
        type: 'modify',
        label: 'Modify',
        description: 'This memory needs updates or corrections',
      },
      {
        type: 'skip',
        label: 'Skip',
        description: 'Not sure, ask me later',
      },
    ];

    return actions;
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

  /**
   * Generate a compact prompt for inline display
   */
  generateCompact(memory: Memory, confidence: number): string {
    const percent = Math.round(confidence * 100);
    return `[${percent}%] "${memory.summary.slice(0, 50)}..." - Still accurate? (y/n/m/s)`;
  }

  /**
   * Generate a batch validation prompt
   */
  generateBatch(memories: Array<{ memory: Memory; confidence: number }>): string {
    const parts: string[] = [];

    parts.push('📋 Batch Memory Validation\n');
    parts.push(`${memories.length} memories need validation:\n`);

    for (let i = 0; i < memories.length; i++) {
      const item = memories[i];
      if (!item) continue;
      const { memory, confidence } = item;
      const percent = Math.round(confidence * 100);
      parts.push(`${i + 1}. [${percent}%] ${memory.summary.slice(0, 60)}...`);
    }

    parts.push('\nEnter numbers to validate (e.g., "1,3,5") or "all":');

    return parts.join('\n');
  }
}
