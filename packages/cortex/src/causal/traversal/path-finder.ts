/**
 * Causal Path Finder
 * 
 * Finds paths between two memories in the causal graph,
 * useful for understanding how two pieces of knowledge
 * are connected.
 * 
 * @module causal/traversal/path-finder
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
 * Path finding options
 */
export interface PathFinderOptions {
  /** Maximum path length */
  maxLength?: number;
  /** Minimum edge strength */
  minStrength?: number;
  /** Relation types to follow */
  relationTypes?: CausalRelation[];
  /** Include inferred edges */
  includeInferred?: boolean;
  /** Find all paths or just shortest */
  findAll?: boolean;
  /** Maximum paths to return */
  maxPaths?: number;
}

/**
 * A single path through the graph
 */
export interface CausalPath {
  /** Ordered list of memory IDs */
  memoryIds: string[];
  /** Edges in the path */
  edges: CausalEdge[];
  /** Path length (number of edges) */
  length: number;
  /** Path strength (product of edge strengths) */
  strength: number;
}

/**
 * Default path finder options
 */
const DEFAULT_OPTIONS: Required<PathFinderOptions> = {
  maxLength: 10,
  minStrength: 0.2,
  relationTypes: [],
  includeInferred: true,
  findAll: false,
  maxPaths: 5,
};

/**
 * Causal path finder
 * 
 * Uses BFS for shortest path and DFS for all paths.
 */
export class CausalPathFinder {
  constructor(
    private causalStorage: ICausalStorage,
    private memoryStorage: IMemoryStorage
  ) {}

  /**
   * Find a path between two memories
   * 
   * Returns the shortest path if findAll is false,
   * otherwise returns all paths up to maxPaths.
   */
  async findPath(
    fromId: string,
    toId: string,
    options?: PathFinderOptions
  ): Promise<CausalChain | null> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    if (fromId === toId) {
      return this.createSingleNodeChain(fromId);
    }

    const paths = opts.findAll
      ? await this.findAllPaths(fromId, toId, opts)
      : await this.findShortestPath(fromId, toId, opts);

    if (!paths || paths.length === 0) {
      return null;
    }

    // Convert best path to chain
    const bestPath = paths[0];
    if (!bestPath) {
      return null;
    }
    return this.pathToChain(bestPath);
  }

  /**
   * Find shortest path using BFS
   */
  async findShortestPath(
    fromId: string,
    toId: string,
    options: Required<PathFinderOptions>
  ): Promise<CausalPath[]> {
    const queue: Array<{ memoryId: string; path: CausalPath }> = [];
    const visited = new Set<string>();

    // Initialize with starting node
    queue.push({
      memoryId: fromId,
      path: { memoryIds: [fromId], edges: [], length: 0, strength: 1.0 },
    });
    visited.add(fromId);

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.path.length >= options.maxLength) {
        continue;
      }

      // Get outgoing edges
      const queryOpts: import('../storage/interface.js').CausalQueryOptions = {
        minStrength: options.minStrength,
        includeInferred: options.includeInferred,
      };
      if (options.relationTypes.length > 0) {
        queryOpts.relationTypes = options.relationTypes;
      }
      const edges = await this.causalStorage.getEdgesFrom(current.memoryId, queryOpts);

      for (const edge of edges) {
        const nextId = edge.targetId;

        // Found the target!
        if (nextId === toId) {
          return [{
            memoryIds: [...current.path.memoryIds, nextId],
            edges: [...current.path.edges, edge],
            length: current.path.length + 1,
            strength: current.path.strength * edge.strength,
          }];
        }

        // Continue searching if not visited
        if (!visited.has(nextId)) {
          visited.add(nextId);
          queue.push({
            memoryId: nextId,
            path: {
              memoryIds: [...current.path.memoryIds, nextId],
              edges: [...current.path.edges, edge],
              length: current.path.length + 1,
              strength: current.path.strength * edge.strength,
            },
          });
        }
      }
    }

    return [];
  }

  /**
   * Find all paths using DFS
   */
  async findAllPaths(
    fromId: string,
    toId: string,
    options: Required<PathFinderOptions>
  ): Promise<CausalPath[]> {
    const paths: CausalPath[] = [];
    const currentPath: CausalPath = {
      memoryIds: [fromId],
      edges: [],
      length: 0,
      strength: 1.0,
    };

    await this.dfs(fromId, toId, currentPath, new Set([fromId]), paths, options);

    // Sort by strength (descending) then length (ascending)
    paths.sort((a, b) => {
      if (Math.abs(a.strength - b.strength) > 0.01) {
        return b.strength - a.strength;
      }
      return a.length - b.length;
    });

    return paths.slice(0, options.maxPaths);
  }

  /**
   * Check if a path exists between two memories
   */
  async pathExists(
    fromId: string,
    toId: string,
    options?: PathFinderOptions
  ): Promise<boolean> {
    const path = await this.findPath(fromId, toId, { ...options, findAll: false });
    return path !== null;
  }

  /**
   * Get the distance (shortest path length) between two memories
   */
  async getDistance(
    fromId: string,
    toId: string,
    options?: PathFinderOptions
  ): Promise<number | null> {
    if (fromId === toId) return 0;

    const opts = { ...DEFAULT_OPTIONS, ...options };
    const paths = await this.findShortestPath(fromId, toId, opts);

    return paths.length > 0 && paths[0] ? paths[0].length : null;
  }

  // Private helpers

  private async dfs(
    currentId: string,
    targetId: string,
    currentPath: CausalPath,
    visited: Set<string>,
    paths: CausalPath[],
    options: Required<PathFinderOptions>
  ): Promise<void> {
    if (paths.length >= options.maxPaths) return;
    if (currentPath.length >= options.maxLength) return;

    const queryOpts: import('../storage/interface.js').CausalQueryOptions = {
      minStrength: options.minStrength,
      includeInferred: options.includeInferred,
    };
    if (options.relationTypes.length > 0) {
      queryOpts.relationTypes = options.relationTypes;
    }
    const edges = await this.causalStorage.getEdgesFrom(currentId, queryOpts);

    for (const edge of edges) {
      const nextId = edge.targetId;

      if (nextId === targetId) {
        // Found a path!
        paths.push({
          memoryIds: [...currentPath.memoryIds, nextId],
          edges: [...currentPath.edges, edge],
          length: currentPath.length + 1,
          strength: currentPath.strength * edge.strength,
        });
        continue;
      }

      if (!visited.has(nextId)) {
        visited.add(nextId);

        const newPath: CausalPath = {
          memoryIds: [...currentPath.memoryIds, nextId],
          edges: [...currentPath.edges, edge],
          length: currentPath.length + 1,
          strength: currentPath.strength * edge.strength,
        };

        await this.dfs(nextId, targetId, newPath, visited, paths, options);

        visited.delete(nextId);
      }
    }
  }

  private async createSingleNodeChain(memoryId: string): Promise<CausalChain | null> {
    const memory = await this.memoryStorage.read(memoryId);
    if (!memory) return null;

    const node: CausalNode = {
      memoryId,
      memoryType: memory.type,
      summary: memory.summary,
      depth: 0,
      incomingEdges: [],
      outgoingEdges: [],
    };

    return {
      rootId: memoryId,
      direction: 'bidirectional',
      nodes: [node],
      edges: [],
      maxDepth: 0,
      totalMemories: 1,
      chainConfidence: 1.0,
      computedAt: new Date().toISOString(),
    };
  }

  private async pathToChain(path: CausalPath): Promise<CausalChain> {
    const nodes: CausalNode[] = [];
    const rootId = path.memoryIds[0] ?? '';

    for (let i = 0; i < path.memoryIds.length; i++) {
      const memoryId = path.memoryIds[i];
      if (!memoryId) continue;
      
      const memory = await this.memoryStorage.read(memoryId);

      if (memory) {
        const prevEdge = path.edges[i - 1];
        const currEdge = path.edges[i];
        const incomingEdges: CausalEdge[] = i > 0 && prevEdge ? [prevEdge] : [];
        const outgoingEdges: CausalEdge[] = i < path.edges.length && currEdge ? [currEdge] : [];

        nodes.push({
          memoryId,
          memoryType: memory.type,
          summary: memory.summary,
          depth: i,
          incomingEdges,
          outgoingEdges,
        });
      }
    }

    return {
      rootId,
      direction: 'effects',
      nodes,
      edges: path.edges,
      maxDepth: path.length,
      totalMemories: nodes.length,
      chainConfidence: path.strength,
      computedAt: new Date().toISOString(),
    };
  }
}
