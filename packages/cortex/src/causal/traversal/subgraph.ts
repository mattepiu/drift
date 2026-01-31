/**
 * Causal Subgraph Extractor
 * 
 * Extracts subgraphs from the causal graph containing
 * specific memories and their connections.
 * 
 * @module causal/traversal/subgraph
 */

import type {
  CausalEdge,
  CausalChain,
  CausalNode,
  CausalRelation,
} from '../../types/causal.js';
import type { ICausalStorage } from '../storage/interface.js';
import type { IMemoryStorage } from '../../storage/interface.js';

/**
 * Subgraph extraction options
 */
export interface SubgraphOptions {
  /** Include edges between the specified memories */
  includeInternalEdges?: boolean;
  /** Include immediate neighbors */
  includeNeighbors?: boolean;
  /** Depth for neighbor inclusion */
  neighborDepth?: number;
  /** Minimum edge strength */
  minStrength?: number;
  /** Relation types to include */
  relationTypes?: CausalRelation[];
  /** Include inferred edges */
  includeInferred?: boolean;
  /** Maximum nodes in subgraph */
  maxNodes?: number;
}

/**
 * Default subgraph options
 */
const DEFAULT_OPTIONS: Required<SubgraphOptions> = {
  includeInternalEdges: true,
  includeNeighbors: false,
  neighborDepth: 1,
  minStrength: 0.3,
  relationTypes: [],
  includeInferred: true,
  maxNodes: 100,
};

/**
 * Causal subgraph extractor
 */
export class CausalSubgraphExtractor {
  constructor(
    private causalStorage: ICausalStorage,
    private memoryStorage: IMemoryStorage
  ) {}

  /**
   * Extract a subgraph containing the specified memories
   */
  async extractSubgraph(
    memoryIds: string[],
    options?: SubgraphOptions
  ): Promise<CausalChain> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const nodeMap = new Map<string, CausalNode>();
    const edgeMap = new Map<string, CausalEdge>();

    // Add nodes for specified memories
    for (const memoryId of memoryIds) {
      if (nodeMap.size >= opts.maxNodes) break;

      const node = await this.createNode(memoryId, 0);
      if (node) {
        nodeMap.set(memoryId, node);
      }
    }

    // Get internal edges (between specified memories)
    if (opts.includeInternalEdges) {
      await this.addInternalEdges(memoryIds, edgeMap, opts);
    }

    // Include neighbors if requested
    if (opts.includeNeighbors) {
      await this.addNeighbors(memoryIds, nodeMap, edgeMap, opts);
    }

    // Update nodes with their edges
    const nodes = Array.from(nodeMap.values());
    const edges = Array.from(edgeMap.values());

    for (const node of nodes) {
      node.incomingEdges = edges.filter(e => e.targetId === node.memoryId);
      node.outgoingEdges = edges.filter(e => e.sourceId === node.memoryId);
    }

    // Compute chain confidence
    const chainConfidence = edges.length > 0
      ? edges.reduce((sum, e) => sum + e.strength, 0) / edges.length
      : 1.0;

    return {
      rootId: memoryIds[0] || '',
      direction: 'bidirectional',
      nodes,
      edges,
      maxDepth: Math.max(0, ...nodes.map(n => n.depth)),
      totalMemories: nodes.length,
      chainConfidence,
      computedAt: new Date().toISOString(),
    };
  }

  /**
   * Extract the connected component containing a memory
   */
  async extractConnectedComponent(
    memoryId: string,
    options?: SubgraphOptions
  ): Promise<CausalChain> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const visited = new Set<string>();
    const nodeMap = new Map<string, CausalNode>();
    const edgeMap = new Map<string, CausalEdge>();

    await this.exploreComponent(memoryId, 0, visited, nodeMap, edgeMap, opts);

    const nodes = Array.from(nodeMap.values());
    const edges = Array.from(edgeMap.values());

    // Update nodes with their edges
    for (const node of nodes) {
      node.incomingEdges = edges.filter(e => e.targetId === node.memoryId);
      node.outgoingEdges = edges.filter(e => e.sourceId === node.memoryId);
    }

    const chainConfidence = edges.length > 0
      ? edges.reduce((sum, e) => sum + e.strength, 0) / edges.length
      : 1.0;

    return {
      rootId: memoryId,
      direction: 'bidirectional',
      nodes,
      edges,
      maxDepth: Math.max(0, ...nodes.map(n => n.depth)),
      totalMemories: nodes.length,
      chainConfidence,
      computedAt: new Date().toISOString(),
    };
  }

  /**
   * Get the induced subgraph (only edges between specified nodes)
   */
  async getInducedSubgraph(memoryIds: string[]): Promise<CausalChain> {
    return this.extractSubgraph(memoryIds, {
      includeInternalEdges: true,
      includeNeighbors: false,
    });
  }

  /**
   * Get ego network (node + immediate neighbors)
   */
  async getEgoNetwork(
    memoryId: string,
    depth = 1,
    options?: SubgraphOptions
  ): Promise<CausalChain> {
    return this.extractSubgraph([memoryId], {
      ...options,
      includeNeighbors: true,
      neighborDepth: depth,
    });
  }

  // Private helpers

  private async createNode(
    memoryId: string,
    depth: number
  ): Promise<CausalNode | null> {
    const memory = await this.memoryStorage.read(memoryId);
    if (!memory) return null;

    return {
      memoryId,
      memoryType: memory.type,
      summary: memory.summary,
      depth,
      incomingEdges: [],
      outgoingEdges: [],
    };
  }

  private async addInternalEdges(
    memoryIds: string[],
    edgeMap: Map<string, CausalEdge>,
    options: Required<SubgraphOptions>
  ): Promise<void> {
    const idSet = new Set(memoryIds);

    for (const memoryId of memoryIds) {
      const queryOpts: import('../storage/interface.js').CausalQueryOptions = {
        minStrength: options.minStrength,
        includeInferred: options.includeInferred,
      };
      if (options.relationTypes.length > 0) {
        queryOpts.relationTypes = options.relationTypes;
      }
      const edges = await this.causalStorage.getEdgesFrom(memoryId, queryOpts);

      for (const edge of edges) {
        if (idSet.has(edge.targetId) && !edgeMap.has(edge.id)) {
          edgeMap.set(edge.id, edge);
        }
      }
    }
  }

  private async addNeighbors(
    memoryIds: string[],
    nodeMap: Map<string, CausalNode>,
    edgeMap: Map<string, CausalEdge>,
    options: Required<SubgraphOptions>
  ): Promise<void> {
    const toExplore = [...memoryIds];
    const explored = new Set(memoryIds);

    for (let depth = 1; depth <= options.neighborDepth; depth++) {
      const nextLevel: string[] = [];

      for (const memoryId of toExplore) {
        if (nodeMap.size >= options.maxNodes) break;

        const queryOpts: import('../storage/interface.js').CausalQueryOptions = {
          minStrength: options.minStrength,
          includeInferred: options.includeInferred,
        };
        if (options.relationTypes.length > 0) {
          queryOpts.relationTypes = options.relationTypes;
        }

        // Get outgoing edges
        const outgoing = await this.causalStorage.getEdgesFrom(memoryId, queryOpts);

        // Get incoming edges
        const incoming = await this.causalStorage.getEdgesTo(memoryId, queryOpts);

        for (const edge of [...outgoing, ...incoming]) {
          if (!edgeMap.has(edge.id)) {
            edgeMap.set(edge.id, edge);
          }

          const neighborId = edge.sourceId === memoryId ? edge.targetId : edge.sourceId;

          if (!explored.has(neighborId) && nodeMap.size < options.maxNodes) {
            explored.add(neighborId);
            nextLevel.push(neighborId);

            const node = await this.createNode(neighborId, depth);
            if (node) {
              nodeMap.set(neighborId, node);
            }
          }
        }
      }

      toExplore.length = 0;
      toExplore.push(...nextLevel);
    }
  }

  private async exploreComponent(
    memoryId: string,
    depth: number,
    visited: Set<string>,
    nodeMap: Map<string, CausalNode>,
    edgeMap: Map<string, CausalEdge>,
    options: Required<SubgraphOptions>
  ): Promise<void> {
    if (visited.has(memoryId)) return;
    if (nodeMap.size >= options.maxNodes) return;

    visited.add(memoryId);

    const node = await this.createNode(memoryId, depth);
    if (node) {
      nodeMap.set(memoryId, node);
    }

    // Get all edges for this memory
    const queryOpts: import('../storage/interface.js').CausalQueryOptions = {
      minStrength: options.minStrength,
      includeInferred: options.includeInferred,
    };
    if (options.relationTypes.length > 0) {
      queryOpts.relationTypes = options.relationTypes;
    }
    const edges = await this.causalStorage.getEdgesFor(memoryId, queryOpts);

    for (const edge of edges) {
      if (!edgeMap.has(edge.id)) {
        edgeMap.set(edge.id, edge);
      }

      const neighborId = edge.sourceId === memoryId ? edge.targetId : edge.sourceId;

      if (!visited.has(neighborId)) {
        await this.exploreComponent(
          neighborId,
          depth + 1,
          visited,
          nodeMap,
          edgeMap,
          options
        );
      }
    }
  }
}
