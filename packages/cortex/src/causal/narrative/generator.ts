/**
 * Narrative Generator
 * 
 * Generates human-readable narratives from causal chains,
 * explaining "why" something is the way it is.
 * 
 * @module causal/narrative/generator
 */

import type {
  CausalChain,
  CausalNode,
  CausalRelation,
} from '../../types/causal.js';
import {
  SECTION_TEMPLATES,
  getMemoryTypeDescription,
  getConfidenceDescription,
  getStrengthDescription,
} from './templates.js';

/**
 * Narrative output format
 */
export interface Narrative {
  /** Plain text narrative */
  text: string;
  /** Markdown formatted narrative */
  markdown: string;
  /** Structured sections */
  sections: NarrativeSection[];
  /** Summary (one paragraph) */
  summary: string;
  /** Key points */
  keyPoints: string[];
  /** Confidence in the narrative */
  confidence: number;
}

/**
 * A section of the narrative
 */
export interface NarrativeSection {
  /** Section title */
  title: string;
  /** Section content */
  content: string;
  /** Items in this section */
  items: NarrativeItem[];
}

/**
 * An item in a narrative section
 */
export interface NarrativeItem {
  /** Memory ID */
  memoryId: string;
  /** Memory type */
  memoryType: string;
  /** Memory summary */
  summary: string;
  /** Relation to the root */
  relation?: CausalRelation | undefined;
  /** Strength of connection */
  strength?: number | undefined;
  /** Depth in chain */
  depth: number;
}

/**
 * MCP-formatted output
 */
export interface MCPNarrativeOutput {
  /** Root memory ID */
  rootId: string;
  /** Direction of analysis */
  direction: string;
  /** Human-readable narrative */
  narrative: string;
  /** Summary */
  summary: string;
  /** Key points */
  keyPoints: string[];
  /** Chain statistics */
  stats: {
    totalMemories: number;
    maxDepth: number;
    chainConfidence: number;
    relationCounts: Record<string, number>;
  };
  /** Detailed chain (optional) */
  chain?: {
    nodes: Array<{
      id: string;
      type: string;
      summary: string;
      depth: number;
    }>;
    edges: Array<{
      from: string;
      to: string;
      relation: string;
      strength: number;
    }>;
  };
}

/**
 * Narrative generator
 * 
 * Converts causal chains into human-readable narratives.
 */
export class NarrativeGenerator {
  /**
   * Generate a full narrative from a causal chain
   */
  generateNarrative(chain: CausalChain): Narrative {
    const sections = this.generateSections(chain);
    const summary = this.generateSummary(chain);
    const keyPoints = this.extractKeyPoints(chain);
    const text = this.generatePlainText(sections, summary);
    const markdown = this.generateMarkdown(sections, summary, keyPoints);

    return {
      text,
      markdown,
      sections,
      summary,
      keyPoints,
      confidence: chain.chainConfidence,
    };
  }

  /**
   * Generate a short summary
   */
  generateSummary(chain: CausalChain): string {
    if (chain.nodes.length === 0) {
      return 'No causal information available.';
    }

    const rootNode = chain.nodes.find(n => n.memoryId === chain.rootId);
    if (!rootNode) {
      return 'Unable to generate summary.';
    }

    const directionText = chain.direction === 'origins'
      ? 'originated from'
      : chain.direction === 'effects'
        ? 'has influenced'
        : 'is connected to';

    const otherNodes = chain.nodes.filter(n => n.memoryId !== chain.rootId);

    if (otherNodes.length === 0) {
      return `This ${getMemoryTypeDescription(rootNode.memoryType)} has no recorded causal connections.`;
    }

    const confidenceDesc = getConfidenceDescription(chain.chainConfidence);

    return `This ${getMemoryTypeDescription(rootNode.memoryType)} ${directionText} ${otherNodes.length} other piece(s) of knowledge across ${chain.maxDepth} level(s) with ${confidenceDesc}.`;
  }

  /**
   * Format for MCP tool output
   */
  formatForMCP(chain: CausalChain, includeChain = false): MCPNarrativeOutput {
    const narrative = this.generateNarrative(chain);

    // Count relations
    const relationCounts: Record<string, number> = {};
    for (const edge of chain.edges) {
      relationCounts[edge.relation] = (relationCounts[edge.relation] || 0) + 1;
    }

    const output: MCPNarrativeOutput = {
      rootId: chain.rootId,
      direction: chain.direction,
      narrative: narrative.text,
      summary: narrative.summary,
      keyPoints: narrative.keyPoints,
      stats: {
        totalMemories: chain.totalMemories,
        maxDepth: chain.maxDepth,
        chainConfidence: chain.chainConfidence,
        relationCounts,
      },
    };

    if (includeChain) {
      output.chain = {
        nodes: chain.nodes.map(n => ({
          id: n.memoryId,
          type: n.memoryType,
          summary: n.summary,
          depth: n.depth,
        })),
        edges: chain.edges.map(e => ({
          from: e.sourceId,
          to: e.targetId,
          relation: e.relation,
          strength: e.strength,
        })),
      };
    }

    return output;
  }

  // Private methods

  private generateSections(chain: CausalChain): NarrativeSection[] {
    const sections: NarrativeSection[] = [];

    // Group nodes by their relationship to root
    const origins: CausalNode[] = [];
    const effects: CausalNode[] = [];
    const supports: CausalNode[] = [];
    const conflicts: CausalNode[] = [];

    for (const node of chain.nodes) {
      if (node.memoryId === chain.rootId) continue;

      // Check incoming edges to determine relationship
      const incomingToRoot = chain.edges.filter(e => e.targetId === chain.rootId && e.sourceId === node.memoryId);
      const outgoingFromRoot = chain.edges.filter(e => e.sourceId === chain.rootId && e.targetId === node.memoryId);

      if (incomingToRoot.length > 0) {
        const firstEdge = incomingToRoot[0];
        if (firstEdge) {
          const relation = firstEdge.relation;
          if (relation === 'contradicts') {
            conflicts.push(node);
          } else if (relation === 'supports') {
            supports.push(node);
          } else {
            origins.push(node);
          }
        }
      } else if (outgoingFromRoot.length > 0) {
        effects.push(node);
      } else {
        // Indirect connection
        if (node.depth < 0 || chain.direction === 'origins') {
          origins.push(node);
        } else {
          effects.push(node);
        }
      }
    }

    // Origins section
    if (origins.length > 0 || chain.direction === 'origins') {
      sections.push(this.createSection('origin', origins, chain));
    }

    // Effects section
    if (effects.length > 0 || chain.direction === 'effects') {
      sections.push(this.createSection('effects', effects, chain));
    }

    // Support section
    if (supports.length > 0) {
      sections.push(this.createSection('support', supports, chain));
    }

    // Conflicts section
    if (conflicts.length > 0) {
      sections.push(this.createSection('conflicts', conflicts, chain));
    }

    return sections;
  }

  private createSection(
    type: keyof typeof SECTION_TEMPLATES,
    nodes: CausalNode[],
    chain: CausalChain
  ): NarrativeSection {
    const template = SECTION_TEMPLATES[type];

    const items: NarrativeItem[] = nodes.map(node => {
      // Find the edge connecting this node
      const edge = chain.edges.find(
        e => e.sourceId === node.memoryId || e.targetId === node.memoryId
      );

      return {
        memoryId: node.memoryId,
        memoryType: node.memoryType,
        summary: node.summary,
        relation: edge?.relation,
        strength: edge?.strength,
        depth: node.depth,
      };
    });

    // Sort by depth then strength
    items.sort((a, b) => {
      if (a.depth !== b.depth) return a.depth - b.depth;
      return (b.strength || 0) - (a.strength || 0);
    });

    const content = items.length > 0
      ? items.map(item => this.formatItem(item)).join('\n')
      : template.empty;

    return {
      title: template.title,
      content,
      items,
    };
  }

  private formatItem(item: NarrativeItem): string {
    const typeDesc = getMemoryTypeDescription(item.memoryType);
    const strengthDesc = item.strength ? ` (${getStrengthDescription(item.strength)})` : '';
    const relationDesc = item.relation ? ` [${item.relation.replace(/_/g, ' ')}]` : '';

    return `• ${item.summary} (${typeDesc})${relationDesc}${strengthDesc}`;
  }

  private extractKeyPoints(chain: CausalChain): string[] {
    const points: string[] = [];

    // Point about chain size
    if (chain.totalMemories > 1) {
      points.push(`Connected to ${chain.totalMemories - 1} other memories`);
    }

    // Point about depth
    if (chain.maxDepth > 0) {
      points.push(`Causal chain spans ${chain.maxDepth} level(s)`);
    }

    // Point about confidence
    points.push(`Overall chain confidence: ${Math.round(chain.chainConfidence * 100)}%`);

    // Point about strongest connections
    const strongEdges = chain.edges.filter(e => e.strength >= 0.7);
    if (strongEdges.length > 0) {
      points.push(`${strongEdges.length} strong causal connection(s)`);
    }

    // Point about inferred vs explicit
    const inferredCount = chain.edges.filter(e => e.inferred).length;
    const explicitCount = chain.edges.length - inferredCount;
    if (explicitCount > 0 && inferredCount > 0) {
      points.push(`${explicitCount} explicit and ${inferredCount} inferred connection(s)`);
    }

    return points;
  }

  private generatePlainText(sections: NarrativeSection[], summary: string): string {
    const lines: string[] = [summary, ''];

    for (const section of sections) {
      lines.push(`${section.title}:`);
      lines.push(section.content);
      lines.push('');
    }

    return lines.join('\n').trim();
  }

  private generateMarkdown(
    sections: NarrativeSection[],
    summary: string,
    keyPoints: string[]
  ): string {
    const lines: string[] = [];

    // Summary
    lines.push('## Summary');
    lines.push('');
    lines.push(summary);
    lines.push('');

    // Key points
    if (keyPoints.length > 0) {
      lines.push('## Key Points');
      lines.push('');
      for (const point of keyPoints) {
        lines.push(`- ${point}`);
      }
      lines.push('');
    }

    // Sections
    for (const section of sections) {
      lines.push(`## ${section.title}`);
      lines.push('');
      lines.push(section.content);
      lines.push('');
    }

    return lines.join('\n').trim();
  }
}
