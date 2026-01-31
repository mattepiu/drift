/**
 * Narrative Templates
 * 
 * Templates for generating human-readable narratives
 * from causal relationships.
 * 
 * @module causal/narrative/templates
 */

import type { CausalRelation } from '../../types/causal.js';

/**
 * Relation descriptions for narrative generation
 */
export const RELATION_DESCRIPTIONS: Record<CausalRelation, RelationTemplate> = {
  caused: {
    verb: 'caused',
    pastTense: 'was caused by',
    connector: 'which led to',
    explanation: 'directly resulted in',
  },
  enabled: {
    verb: 'enabled',
    pastTense: 'was enabled by',
    connector: 'which made possible',
    explanation: 'provided the foundation for',
  },
  prevented: {
    verb: 'prevented',
    pastTense: 'was prevented by',
    connector: 'which blocked',
    explanation: 'stopped from happening',
  },
  contradicts: {
    verb: 'contradicts',
    pastTense: 'is contradicted by',
    connector: 'which conflicts with',
    explanation: 'presents an opposing view to',
  },
  supersedes: {
    verb: 'supersedes',
    pastTense: 'was superseded by',
    connector: 'which replaced',
    explanation: 'made obsolete',
  },
  supports: {
    verb: 'supports',
    pastTense: 'is supported by',
    connector: 'which reinforces',
    explanation: 'provides evidence for',
  },
  derived_from: {
    verb: 'derived from',
    pastTense: 'was derived from',
    connector: 'which was extracted from',
    explanation: 'originated from',
  },
  triggered_by: {
    verb: 'triggered by',
    pastTense: 'was triggered by',
    connector: 'which initiated',
    explanation: 'started as a result of',
  },
};

/**
 * Relation template structure
 */
export interface RelationTemplate {
  /** Active verb form */
  verb: string;
  /** Past tense form */
  pastTense: string;
  /** Connector for chaining */
  connector: string;
  /** Explanation phrase */
  explanation: string;
}

/**
 * Memory type descriptions
 */
export const MEMORY_TYPE_DESCRIPTIONS: Record<string, string> = {
  core: 'core project knowledge',
  tribal: 'tribal knowledge',
  procedural: 'procedural knowledge',
  semantic: 'semantic knowledge',
  episodic: 'interaction memory',
  pattern_rationale: 'pattern rationale',
  constraint_override: 'constraint override',
  decision_context: 'decision context',
  code_smell: 'code smell warning',
};

/**
 * Get human-readable memory type
 */
export function getMemoryTypeDescription(type: string): string {
  return MEMORY_TYPE_DESCRIPTIONS[type] || type;
}

/**
 * Narrative section templates
 */
export const SECTION_TEMPLATES = {
  origin: {
    title: 'Origin',
    intro: 'This knowledge originated from:',
    empty: 'No origin information available.',
  },
  chain: {
    title: 'Causal Chain',
    intro: 'The following chain of events led to this:',
    empty: 'No causal chain found.',
  },
  effects: {
    title: 'Effects',
    intro: 'This knowledge has influenced:',
    empty: 'No downstream effects recorded.',
  },
  conflicts: {
    title: 'Conflicts',
    intro: 'This knowledge conflicts with:',
    empty: 'No conflicts detected.',
  },
  support: {
    title: 'Supporting Evidence',
    intro: 'This knowledge is supported by:',
    empty: 'No supporting evidence recorded.',
  },
};

/**
 * Confidence level descriptions
 */
export function getConfidenceDescription(confidence: number): string {
  if (confidence >= 0.9) return 'very high confidence';
  if (confidence >= 0.7) return 'high confidence';
  if (confidence >= 0.5) return 'moderate confidence';
  if (confidence >= 0.3) return 'low confidence';
  return 'very low confidence';
}

/**
 * Strength level descriptions
 */
export function getStrengthDescription(strength: number): string {
  if (strength >= 0.9) return 'very strong';
  if (strength >= 0.7) return 'strong';
  if (strength >= 0.5) return 'moderate';
  if (strength >= 0.3) return 'weak';
  return 'very weak';
}

/**
 * Format a relation for display
 */
export function formatRelation(relation: CausalRelation): string {
  return relation.replace(/_/g, ' ');
}

/**
 * Generate a sentence describing a causal relationship
 */
export function generateRelationSentence(
  sourceType: string,
  sourceSummary: string,
  relation: CausalRelation,
  targetType: string,
  targetSummary: string,
  strength: number
): string {
  const template = RELATION_DESCRIPTIONS[relation];
  const strengthDesc = getStrengthDescription(strength);

  // Truncate summaries if too long
  const maxLen = 60;
  const srcSummary = sourceSummary.length > maxLen
    ? sourceSummary.slice(0, maxLen) + '...'
    : sourceSummary;
  const tgtSummary = targetSummary.length > maxLen
    ? targetSummary.slice(0, maxLen) + '...'
    : targetSummary;

  return `"${srcSummary}" (${getMemoryTypeDescription(sourceType)}) ${template.verb} "${tgtSummary}" (${getMemoryTypeDescription(targetType)}) with ${strengthDesc} connection.`;
}

/**
 * Generate a chain narrative
 */
export function generateChainNarrative(
  steps: Array<{
    sourceType: string;
    sourceSummary: string;
    relation: CausalRelation;
    targetType: string;
    targetSummary: string;
    strength: number;
  }>
): string {
  if (steps.length === 0) {
    return 'No causal chain found.';
  }

  const lines: string[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step) continue;

    const template = RELATION_DESCRIPTIONS[step.relation];
    const prefix = i === 0 ? 'Starting from' : template.connector;

    const srcSummary = step.sourceSummary.length > 50
      ? step.sourceSummary.slice(0, 50) + '...'
      : step.sourceSummary;

    if (i === 0) {
      lines.push(`${prefix} "${srcSummary}" (${getMemoryTypeDescription(step.sourceType)}),`);
    }

    const tgtSummary = step.targetSummary.length > 50
      ? step.targetSummary.slice(0, 50) + '...'
      : step.targetSummary;

    const ending = i === steps.length - 1 ? '.' : ',';
    lines.push(`  ${template.connector} "${tgtSummary}" (${getMemoryTypeDescription(step.targetType)})${ending}`);
  }

  return lines.join('\n');
}
