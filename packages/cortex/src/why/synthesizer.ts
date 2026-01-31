/**
 * Why Synthesizer
 * 
 * Main orchestrator for gathering "why" context.
 */

import type { IMemoryStorage } from '../storage/interface.js';
import { PatternContextGatherer } from './pattern-context.js';
import { DecisionContextGatherer } from './decision-context.js';
import { TribalContextGatherer } from './tribal-context.js';
import { WarningAggregator } from './warning-aggregator.js';

/**
 * Why context result
 */
export interface WhyContext {
  patterns: PatternContext[];
  decisions: DecisionContext[];
  tribal: TribalContext[];
  warnings: Warning[];
  summary: string;
}

export interface PatternContext {
  patternId: string;
  patternName: string;
  rationale?: string;
  businessContext?: string;
}

export interface DecisionContext {
  decisionId: string;
  summary: string;
  businessContext?: string;
  stillValid: boolean;
}

export interface TribalContext {
  topic: string;
  knowledge: string;
  severity: string;
  confidence: number;
}

export interface Warning {
  type: string;
  severity: string;
  message: string;
  source: string;
}

/**
 * Why synthesizer
 */
export class WhySynthesizer {
  private patternGatherer: PatternContextGatherer;
  private decisionGatherer: DecisionContextGatherer;
  private tribalGatherer: TribalContextGatherer;
  private warningAggregator: WarningAggregator;

  constructor(storage: IMemoryStorage) {
    this.patternGatherer = new PatternContextGatherer(storage);
    this.decisionGatherer = new DecisionContextGatherer(storage);
    this.tribalGatherer = new TribalContextGatherer(storage);
    this.warningAggregator = new WarningAggregator();
  }

  /**
   * Synthesize "why" context for a focus area
   */
  async synthesize(focus: string, patternIds?: string[]): Promise<WhyContext> {
    // Gather context from all sources
    const [patterns, decisions, tribal] = await Promise.all([
      this.patternGatherer.gather(patternIds || []),
      this.decisionGatherer.gather(focus),
      this.tribalGatherer.gather(focus),
    ]);

    // Aggregate warnings
    const warnings = this.warningAggregator.aggregate(tribal, patterns);

    // Generate summary
    const summary = this.generateSummary(patterns, decisions, tribal, warnings);

    return {
      patterns,
      decisions,
      tribal,
      warnings,
      summary,
    };
  }

  /**
   * Generate a summary of the context
   */
  private generateSummary(
    patterns: PatternContext[],
    decisions: DecisionContext[],
    tribal: TribalContext[],
    warnings: Warning[]
  ): string {
    const parts: string[] = [];

    if (patterns.length > 0) {
      parts.push(`${patterns.length} pattern rationales`);
    }
    if (decisions.length > 0) {
      parts.push(`${decisions.length} decision contexts`);
    }
    if (tribal.length > 0) {
      parts.push(`${tribal.length} tribal knowledge items`);
    }
    if (warnings.length > 0) {
      parts.push(`${warnings.length} warnings`);
    }

    return parts.length > 0
      ? `Context includes: ${parts.join(', ')}`
      : 'No relevant context found';
  }
}
