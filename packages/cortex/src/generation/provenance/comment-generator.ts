/**
 * Provenance Comment Generator
 * 
 * Generates code comments that document the provenance
 * of generated code. Helps developers understand what
 * influenced the generation.
 * 
 * @module generation/provenance/comment-generator
 */

import type { CodeProvenance, Influence } from '../types.js';

/**
 * Configuration for comment generation
 */
export interface CommentGeneratorConfig {
  /** Comment style */
  style: 'block' | 'line' | 'jsdoc';
  /** Include request ID */
  includeRequestId: boolean;
  /** Include timestamp */
  includeTimestamp: boolean;
  /** Include confidence */
  includeConfidence: boolean;
  /** Maximum influences to show */
  maxInfluences: number;
  /** Maximum warnings to show */
  maxWarnings: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: CommentGeneratorConfig = {
  style: 'block',
  includeRequestId: false,
  includeTimestamp: false,
  includeConfidence: true,
  maxInfluences: 5,
  maxWarnings: 3,
};

/**
 * Provenance Comment Generator
 * 
 * Generates code comments documenting provenance.
 */
export class ProvenanceCommentGenerator {
  private config: CommentGeneratorConfig;

  constructor(config?: Partial<CommentGeneratorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate provenance comment
   */
  generate(provenance: CodeProvenance): string {
    const lines: string[] = [];

    // Header
    lines.push(...this.formatHeader(provenance));

    // Influences
    if (provenance.influences.length > 0) {
      lines.push('');
      lines.push(...this.formatInfluences(provenance.influences));
    }

    // Warnings
    if (provenance.warnings.length > 0) {
      lines.push('');
      lines.push(...this.formatWarnings(provenance.warnings));
    }

    // Constraints
    if (provenance.appliedConstraints.length > 0) {
      lines.push('');
      lines.push(...this.formatConstraints(provenance.appliedConstraints));
    }

    // Anti-patterns
    if (provenance.avoidedAntiPatterns.length > 0) {
      lines.push('');
      lines.push(...this.formatAntiPatterns(provenance.avoidedAntiPatterns));
    }

    return this.wrapInCommentStyle(lines);
  }

  /**
   * Generate a compact single-line comment
   */
  generateCompact(provenance: CodeProvenance): string {
    const parts: string[] = ['Generated'];

    if (provenance.influences.length > 0) {
      const topInfluence = provenance.influences[0];
      if (topInfluence) {
        parts.push(`following ${this.formatInfluenceType(topInfluence.influenceType)}`);
      }
    }

    if (this.config.includeConfidence) {
      parts.push(`(confidence: ${Math.round(provenance.confidence * 100)}%)`);
    }

    return `// ${parts.join(' ')}`;
  }

  /**
   * Format header lines
   */
  private formatHeader(provenance: CodeProvenance): string[] {
    const lines: string[] = ['Generated Code Provenance'];

    if (this.config.includeRequestId) {
      lines.push(`Request ID: ${provenance.requestId}`);
    }

    if (this.config.includeTimestamp) {
      lines.push(`Generated: ${provenance.generatedAt}`);
    }

    if (this.config.includeConfidence) {
      lines.push(`Confidence: ${Math.round(provenance.confidence * 100)}%`);
    }

    return lines;
  }

  /**
   * Format influences
   */
  private formatInfluences(influences: Influence[]): string[] {
    const lines: string[] = ['Influences:'];
    const toShow = influences.slice(0, this.config.maxInfluences);

    for (const influence of toShow) {
      const type = this.formatInfluenceType(influence.influenceType);
      const strength = Math.round(influence.strength * 100);
      lines.push(`  - [${type}] ${influence.description} (${strength}%)`);
    }

    if (influences.length > this.config.maxInfluences) {
      lines.push(`  ... and ${influences.length - this.config.maxInfluences} more`);
    }

    return lines;
  }

  /**
   * Format warnings
   */
  private formatWarnings(warnings: string[]): string[] {
    const lines: string[] = ['Warnings:'];
    const toShow = warnings.slice(0, this.config.maxWarnings);

    for (const warning of toShow) {
      lines.push(`  ⚠️ ${warning}`);
    }

    if (warnings.length > this.config.maxWarnings) {
      lines.push(`  ... and ${warnings.length - this.config.maxWarnings} more`);
    }

    return lines;
  }

  /**
   * Format constraints
   */
  private formatConstraints(constraints: string[]): string[] {
    const lines: string[] = ['Applied Constraints:'];

    for (const constraint of constraints) {
      lines.push(`  ✓ ${constraint}`);
    }

    return lines;
  }

  /**
   * Format anti-patterns
   */
  private formatAntiPatterns(antiPatterns: string[]): string[] {
    const lines: string[] = ['Avoided Anti-Patterns:'];

    for (const antiPattern of antiPatterns) {
      lines.push(`  ✗ ${antiPattern}`);
    }

    return lines;
  }

  /**
   * Format influence type for display
   */
  private formatInfluenceType(type: string): string {
    switch (type) {
      case 'pattern_followed':
        return 'Pattern';
      case 'tribal_applied':
        return 'Tribal';
      case 'constraint_enforced':
        return 'Constraint';
      case 'antipattern_avoided':
        return 'Anti-Pattern';
      case 'example_used':
        return 'Example';
      case 'style_matched':
        return 'Style';
      default:
        return type;
    }
  }

  /**
   * Wrap lines in comment style
   */
  private wrapInCommentStyle(lines: string[]): string {
    switch (this.config.style) {
      case 'block':
        return this.wrapBlockComment(lines);
      case 'line':
        return this.wrapLineComment(lines);
      case 'jsdoc':
        return this.wrapJSDocComment(lines);
      default:
        return this.wrapBlockComment(lines);
    }
  }

  /**
   * Wrap in block comment style
   */
  private wrapBlockComment(lines: string[]): string {
    const result: string[] = ['/*'];
    for (const line of lines) {
      result.push(` * ${line}`);
    }
    result.push(' */');
    return result.join('\n');
  }

  /**
   * Wrap in line comment style
   */
  private wrapLineComment(lines: string[]): string {
    return lines.map(line => `// ${line}`).join('\n');
  }

  /**
   * Wrap in JSDoc comment style
   */
  private wrapJSDocComment(lines: string[]): string {
    const result: string[] = ['/**'];
    for (const line of lines) {
      result.push(` * ${line}`);
    }
    result.push(' */');
    return result.join('\n');
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<CommentGeneratorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
