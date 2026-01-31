/**
 * Explanation Builder
 * 
 * Builds human-readable explanations of generated code
 * based on provenance information. Helps developers
 * understand why code was generated a certain way.
 * 
 * @module generation/provenance/explanation-builder
 */

import type { CodeProvenance, Influence, GenerationContext } from '../types.js';

/**
 * Configuration for explanation builder
 */
export interface ExplanationBuilderConfig {
  /** Detail level */
  detailLevel: 'brief' | 'normal' | 'detailed';
  /** Include examples */
  includeExamples: boolean;
  /** Include alternatives */
  includeAlternatives: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ExplanationBuilderConfig = {
  detailLevel: 'normal',
  includeExamples: true,
  includeAlternatives: false,
};

/**
 * Explanation Builder
 * 
 * Builds human-readable explanations of generated code.
 */
export class ExplanationBuilder {
  private config: ExplanationBuilderConfig;

  constructor(config?: Partial<ExplanationBuilderConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Build explanation from provenance
   */
  build(provenance: CodeProvenance): string {
    const sections: string[] = [];

    // Opening summary
    sections.push(this.buildSummary(provenance));

    // Influences section
    if (provenance.influences.length > 0) {
      sections.push(this.summarizeInfluences(provenance.influences));
    }

    // Warnings section
    if (provenance.warnings.length > 0) {
      sections.push(this.summarizeWarnings(provenance.warnings));
    }

    // Constraints section
    if (provenance.appliedConstraints.length > 0) {
      sections.push(this.summarizeConstraints(provenance.appliedConstraints));
    }

    // Anti-patterns section
    if (provenance.avoidedAntiPatterns.length > 0) {
      sections.push(this.summarizeAntiPatterns(provenance.avoidedAntiPatterns));
    }

    // Confidence note
    sections.push(this.buildConfidenceNote(provenance.confidence));

    return sections.join('\n\n');
  }

  /**
   * Build explanation from generation context
   */
  buildFromContext(context: GenerationContext): string {
    const sections: string[] = [];

    // Opening
    sections.push(`This code was generated for ${context.target.filePath} based on the following context:`);

    // Patterns
    if (context.patterns.length > 0) {
      const patternNames = context.patterns.map(p => p.patternName).slice(0, 3);
      sections.push(`**Patterns followed:** ${patternNames.join(', ')}${context.patterns.length > 3 ? ` and ${context.patterns.length - 3} more` : ''}`);
    }

    // Tribal knowledge
    if (context.tribal.length > 0) {
      const topics = context.tribal.map(t => t.topic).slice(0, 3);
      sections.push(`**Tribal knowledge applied:** ${topics.join(', ')}${context.tribal.length > 3 ? ` and ${context.tribal.length - 3} more` : ''}`);
    }

    // Constraints
    if (context.constraints.length > 0) {
      const constraintNames = context.constraints.map(c => c.constraintName).slice(0, 3);
      sections.push(`**Constraints enforced:** ${constraintNames.join(', ')}${context.constraints.length > 3 ? ` and ${context.constraints.length - 3} more` : ''}`);
    }

    // Anti-patterns
    if (context.antiPatterns.length > 0) {
      const antiPatternNames = context.antiPatterns.map(a => a.name).slice(0, 3);
      sections.push(`**Anti-patterns avoided:** ${antiPatternNames.join(', ')}${context.antiPatterns.length > 3 ? ` and ${context.antiPatterns.length - 3} more` : ''}`);
    }

    return sections.join('\n\n');
  }

  /**
   * Build brief explanation (one sentence)
   */
  buildBrief(provenance: CodeProvenance): string {
    const influenceCount = provenance.influences.length;
    const warningCount = provenance.warnings.length;
    const constraintCount = provenance.appliedConstraints.length;

    const parts: string[] = [];

    if (influenceCount > 0) {
      parts.push(`${influenceCount} pattern${influenceCount > 1 ? 's' : ''}`);
    }

    if (constraintCount > 0) {
      parts.push(`${constraintCount} constraint${constraintCount > 1 ? 's' : ''}`);
    }

    if (warningCount > 0) {
      parts.push(`${warningCount} warning${warningCount > 1 ? 's' : ''}`);
    }

    const confidence = Math.round(provenance.confidence * 100);

    if (parts.length === 0) {
      return `Generated with ${confidence}% confidence.`;
    }

    return `Generated following ${parts.join(', ')} with ${confidence}% confidence.`;
  }

  /**
   * Build summary section
   */
  private buildSummary(provenance: CodeProvenance): string {
    const confidence = Math.round(provenance.confidence * 100);
    const influenceCount = provenance.influences.length;

    if (this.config.detailLevel === 'brief') {
      return this.buildBrief(provenance);
    }

    return `This code was generated with ${confidence}% confidence based on ${influenceCount} influence${influenceCount !== 1 ? 's' : ''} from the codebase memory.`;
  }

  /**
   * Summarize influences
   */
  private summarizeInfluences(influences: Influence[]): string {
    const grouped = this.groupInfluencesByType(influences);
    const parts: string[] = ['**What influenced this code:**'];

    for (const [type, items] of Object.entries(grouped)) {
      const typeName = this.formatInfluenceTypeName(type);
      const descriptions = items.map(i => i.description);

      if (this.config.detailLevel === 'detailed') {
        parts.push(`\n*${typeName}:*`);
        for (const desc of descriptions) {
          parts.push(`- ${desc}`);
        }
      } else {
        parts.push(`- ${typeName}: ${descriptions.slice(0, 2).join('; ')}${descriptions.length > 2 ? ` (+${descriptions.length - 2} more)` : ''}`);
      }
    }

    return parts.join('\n');
  }

  /**
   * Summarize warnings
   */
  private summarizeWarnings(warnings: string[]): string {
    const parts: string[] = ['**Warnings to be aware of:**'];

    for (const warning of warnings.slice(0, 5)) {
      parts.push(`⚠️ ${warning}`);
    }

    if (warnings.length > 5) {
      parts.push(`... and ${warnings.length - 5} more warnings`);
    }

    return parts.join('\n');
  }

  /**
   * Summarize constraints
   */
  private summarizeConstraints(constraints: string[]): string {
    const parts: string[] = ['**Constraints that were enforced:**'];

    for (const constraint of constraints) {
      parts.push(`✓ ${this.formatConstraintName(constraint)}`);
    }

    return parts.join('\n');
  }

  /**
   * Summarize anti-patterns
   */
  private summarizeAntiPatterns(antiPatterns: string[]): string {
    const parts: string[] = ['**Anti-patterns that were avoided:**'];

    for (const antiPattern of antiPatterns) {
      parts.push(`✗ ${antiPattern}`);
    }

    return parts.join('\n');
  }

  /**
   * Build confidence note
   */
  private buildConfidenceNote(confidence: number): string {
    const percent = Math.round(confidence * 100);

    if (percent >= 80) {
      return `**Confidence:** High (${percent}%) - This code closely follows established patterns.`;
    } else if (percent >= 60) {
      return `**Confidence:** Medium (${percent}%) - This code follows most patterns but may need review.`;
    } else {
      return `**Confidence:** Low (${percent}%) - This code may deviate from patterns. Please review carefully.`;
    }
  }

  /**
   * Group influences by type
   */
  private groupInfluencesByType(influences: Influence[]): Record<string, Influence[]> {
    const grouped: Record<string, Influence[]> = {};

    for (const influence of influences) {
      const type = influence.influenceType;
      if (!grouped[type]) {
        grouped[type] = [];
      }
      grouped[type].push(influence);
    }

    return grouped;
  }

  /**
   * Format influence type name
   */
  private formatInfluenceTypeName(type: string): string {
    switch (type) {
      case 'pattern_followed':
        return 'Patterns Followed';
      case 'tribal_applied':
        return 'Tribal Knowledge Applied';
      case 'constraint_enforced':
        return 'Constraints Enforced';
      case 'antipattern_avoided':
        return 'Anti-Patterns Avoided';
      case 'example_used':
        return 'Examples Used';
      case 'style_matched':
        return 'Styles Matched';
      default:
        return type;
    }
  }

  /**
   * Format constraint name
   */
  private formatConstraintName(constraintId: string): string {
    return constraintId
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ExplanationBuilderConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
