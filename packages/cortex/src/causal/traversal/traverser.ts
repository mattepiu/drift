/**
 * Causal Graph Traverser
 * 
 * Traverses the causal graph to trace origins and effects
 * of memories, building causal chains for narrative generation.
 * 
 * @module causal/traversal/traverser
 */

import type {
  CausalEdge,
  CausalChain,
  CausalNode,
  GraphTraversalOptions,
} from '../../types/causal.js';
import type { ICausalStorage } from '../storage/interface.js';
import type { IMemoryStorage } from '../../storage/interface.js';

/**
 * Default traversal options
 */
const DEFAULT_OPTIONS: Required<GraphTraversalOptions> = {
  maxDepth: 5,
  minStrength: 0.3,
  relationTypes: [],
  includeInferred: true,
  maxNodes: 50,
  computeConfidence: true,
};

/**
 * Causal graph traverser
 * 
 * Provides methods to traverse the causal graph and build
 * chains of causally connected memories.
 */
export class CausalGraphTraverser {
  constructor(
    private causalStorage: ICausalStorage,
    private memoryStorage: IMemoryStorage
  ) {}

  /**
   * Trace the origins of a memory (what caused it)
   * 
   * Traverses backwards through the causal graph to find
   * all memories that contributed to this one.
   */
  async traceOrigins(
    memoryId: string,
    options?: GraphTraversalOptions
  ): Promise<CausalChain> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const visited = new Set<string>();
    const nodes: CausalNode[] = [];
    const edges: CausalEdge[] = [];

    await this.traverseBackward(memoryId, 0, opts, visited, nodes, edges);

    const chainConfidence = opts.computeConfidence
      ? this.computeChainConfidence(edges)
      : 1.0;

    return {
      rootId: memoryId,
      direction: 'origins',
      nodes,
      edges,
      maxDepth: Math.max(0, ...nodes.map(n => n.depth)),
      totalMemories: nodes.length,
      chainConfidence,
      computedAt: new Date().toISOString(),
    };
  }

  /**
   * Trace the effects of a memory (what it caused)
   * 
   * Traverses forward through the causal graph to find
   * all memories that were influenced by this one.
   */
  async traceEffects(
    memoryId: string,
    options?: GraphTraversalOptions
  ): Promise<CausalChain> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const visited = new Set<string>();
    const nodes: CausalNode[] = [];
    const edges: CausalEdge[] = [];

    await this.traverseForward(memoryId, 0, opts, visited, nodes, edges);

    const chainConfidence = opts.computeConfidence
      ? this.computeChainConfidence(edges)
      : 1.0;

    return {
      rootId: memoryId,
      direction: 'effects',
      nodes,
      edges,
      maxDepth: Math.max(0, ...nodes.map(n => n.depth)),
      totalMemories: nodes.length,
      chainConfidence,
      computedAt: new Date().toISOString(),
    };
  }

  /**
   * Trace both origins and effects
   */
  async traceBidirectional(
    memoryId: string,
    options?: GraphTraversalOptions
  ): Promise<CausalChain> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const visited = new Set<string>();
    const nodes: CausalNode[] = [];
    const edges: CausalEdge[] = [];

    // Trace origins
    await this.traverseBackward(memoryId, 0, opts, visited, nodes, edges);

    // Reset visited for forward traversal but keep the root
    visited.clear();
    visited.add(memoryId);

    // Trace effects
    await this.traverseForward(memoryId, 0, opts, visited, nodes, edges);

    // Deduplicate nodes
    const uniqueNodes = this.deduplicateNodes(nodes);

    const chainConfidence = opts.computeConfidence
      ? this.computeChainConfidence(edges)
      : 1.0;

    return {
      rootId: memoryId,
      direction: 'bidirectional',
      nodes: uniqueNodes,
      edges,
      maxDepth: Math.max(0, ...uniqueNodes.map(n => n.depth)),
      totalMemories: uniqueNodes.length,
      chainConfidence,
      computedAt: new Date().toISOString(),
    };
  }

  /**
   * Get immediate neighbors (one hop)
   */
  async getNeighbors(
    memoryId: string,
    options?: GraphTraversalOptions
  ): Promise<{ incoming: CausalNode[]; outgoing: CausalNode[] }> {
    const opts = { ...DEFAULT_OPTIONS, ...options, maxDepth: 1 };

    const queryOpts: import('../storage/interface.js').CausalQueryOptions = {
      minStrength: opts.minStrength,
      includeInferred: opts.includeInferred,
    };
    if (opts.relationTypes.length > 0) {
      queryOpts.relationTypes = opts.relationTypes;
    }

    const incomingEdges = await this.causalStorage.getEdgesTo(memoryId, queryOpts);
    const outgoingEdges = await this.causalStorage.getEdgesFrom(memoryId, queryOpts);

    const incoming: CausalNode[] = [];
    const outgoing: CausalNode[] = [];

    for (const edge of incomingEdges) {
      const node = await this.createNode(edge.sourceId, 1, [], [edge]);
      if (node) incoming.push(node);
    }

    for (const edge of outgoingEdges) {
      const node = await this.createNode(edge.targetId, 1, [edge], []);
      if (node) outgoing.push(node);
    }

    return { incoming, outgoing };
  }

  // Private traversal methods

  private async traverseBackward(
    memoryId: string,
    depth: number,
    options: Required<GraphTraversalOptions>,
    visited: Set<string>,
    nodes: CausalNode[],
    edges: CausalEdge[]
  ): Promise<void> {
    if (visited.has(memoryId)) return;
    if (depth > options.maxDepth) return;
    if (nodes.length >= options.maxNodes) return;

    visited.add(memoryId);

    const queryOpts: import('../storage/interface.js').CausalQueryOptions = {
      minStrength: options.minStrength,
      includeInferred: options.includeInferred,
    };
    if (options.relationTypes.length > 0) {
      queryOpts.relationTypes = options.relationTypes;
    }

    // Get edges pointing TO this memory (causes)
    const incomingEdges = await this.causalStorage.getEdgesTo(memoryId, queryOpts);

    // Get edges FROM this memory for the node
    const outgoingEdges = await this.causalStorage.getEdgesFrom(memoryId, queryOpts);

    // Create node for this memory
    const node = await this.createNode(memoryId, depth, outgoingEdges, incomingEdges);
    if (node) {
      nodes.push(node);
    }

    // Add edges to collection
    for (const edge of incomingEdges) {
      if (!edges.find(e => e.id === edge.id)) {
        edges.push(edge);
      }
    }

    // Recursively traverse causes
    for (const edge of incomingEdges) {
      if (nodes.length < options.maxNodes) {
        await this.traverseBackward(
          edge.sourceId,
          depth + 1,
          options,
          visited,
          nodes,
          edges
        );
      }
    }
  }

  private async traverseForward(
    memoryId: string,
    depth: number,
    options: Required<GraphTraversalOptions>,
    visited: Set<string>,
    nodes: CausalNode[],
    edges: CausalEdge[]
  ): Promise<void> {
    if (visited.has(memoryId)) return;
    if (depth > options.maxDepth) return;
    if (nodes.length >= options.maxNodes) return;

    visited.add(memoryId);

    const queryOpts: import('../storage/interface.js').CausalQueryOptions = {
      minStrength: options.minStrength,
      includeInferred: options.includeInferred,
    };
    if (options.relationTypes.length > 0) {
      queryOpts.relationTypes = options.relationTypes;
    }

    // Get edges FROM this memory (effects)
    const outgoingEdges = await this.causalStorage.getEdgesFrom(memoryId, queryOpts);

    // Get edges TO this memory for the node
    const incomingEdges = await this.causalStorage.getEdgesTo(memoryId, queryOpts);

    // Create node for this memory
    const node = await this.createNode(memoryId, depth, outgoingEdges, incomingEdges);
    if (node) {
      nodes.push(node);
    }

    // Add edges to collection
    for (const edge of outgoingEdges) {
      if (!edges.find(e => e.id === edge.id)) {
        edges.push(edge);
      }
    }

    // Recursively traverse effects
    for (const edge of outgoingEdges) {
      if (nodes.length < options.maxNodes) {
        await this.traverseForward(
          edge.targetId,
          depth + 1,
          options,
          visited,
          nodes,
          edges
        );
      }
    }
  }

  private async createNode(
    memoryId: string,
    depth: number,
    outgoingEdges: CausalEdge[],
    incomingEdges: CausalEdge[]
  ): Promise<CausalNode | null> {
    const memory = await this.memoryStorage.read(memoryId);
    if (!memory) return null;

    return {
      memoryId,
      memoryType: memory.type,
      summary: memory.summary,
      depth,
      incomingEdges,
      outgoingEdges,
    };
  }

  private computeChainConfidence(edges: CausalEdge[]): number {
    if (edges.length === 0) return 1.0;

    // Chain confidence is the product of edge strengths
    // (weakest link principle)
    const strengths = edges.map(e => e.strength);
    const minStrength = Math.min(...strengths);
    const avgStrength = strengths.reduce((a, b) => a + b, 0) / strengths.length;

    // Weighted combination: 60% min, 40% average
    return minStrength * 0.6 + avgStrength * 0.4;
  }

  private deduplicateNodes(nodes: CausalNode[]): CausalNode[] {
    const seen = new Map<string, CausalNode>();

    for (const node of nodes) {
      const existing = seen.get(node.memoryId);
      if (!existing || node.depth < existing.depth) {
        seen.set(node.memoryId, node);
      }
    }

    return Array.from(seen.values());
  }
}
