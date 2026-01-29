/**
 * Layout Engine
 * 
 * Force-directed layout algorithm for positioning tables in 3D space.
 * Groups tables by domain clusters and applies physics simulation.
 */

import { GALAXY_LAYOUT, DOMAIN_CLUSTERS } from '../constants/index.js';

import type { TableNode, EntryPointNode, Vector3D, TableRelationship } from '../types/index.js';

// ============================================================================
// Types
// ============================================================================

interface LayoutNode {
  id: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  mass: number;
  cluster: string;
  fixed: boolean;
}

interface LayoutLink {
  source: string;
  target: string;
  strength: number;
}

interface LayoutResult {
  tables: Map<string, Vector3D>;
  entryPoints: Map<string, Vector3D>;
  clusters: Map<string, Vector3D>;
}

// ============================================================================
// Cluster Detection
// ============================================================================

/**
 * Detect which cluster a table belongs to based on its name
 */
export function detectCluster(tableName: string): string {
  const name = tableName.toLowerCase();
  
  for (const [cluster, keywords] of Object.entries(DOMAIN_CLUSTERS)) {
    if (keywords.some((keyword) => name.includes(keyword))) {
      return cluster;
    }
  }
  
  return 'other';
}

/**
 * Group tables by cluster
 */
export function groupByCluster(tables: readonly TableNode[]): Map<string, TableNode[]> {
  const groups = new Map<string, TableNode[]>();
  
  for (const table of tables) {
    const cluster = table.cluster || detectCluster(table.name);
    const existing = groups.get(cluster) || [];
    groups.set(cluster, [...existing, table]);
  }
  
  return groups;
}

// ============================================================================
// Force Simulation
// ============================================================================

/**
 * Apply repulsion force between nodes
 */
function applyRepulsion(nodes: LayoutNode[], strength: number): void {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      
      if (a.fixed && b.fixed) {continue;}
      
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.1;
      
      // Stronger repulsion for same cluster
      const clusterMultiplier = a.cluster === b.cluster ? 0.5 : 1;
      const force = (strength * clusterMultiplier) / (dist * dist);
      
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      const fz = (dz / dist) * force;
      
      if (!a.fixed) {
        a.vx -= fx / a.mass;
        a.vy -= fy / a.mass;
        a.vz -= fz / a.mass;
      }
      
      if (!b.fixed) {
        b.vx += fx / b.mass;
        b.vy += fy / b.mass;
        b.vz += fz / b.mass;
      }
    }
  }
}

/**
 * Apply attraction force along links
 */
function applyAttraction(nodes: LayoutNode[], links: LayoutLink[], distance: number): void {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  
  for (const link of links) {
    const source = nodeMap.get(link.source);
    const target = nodeMap.get(link.target);
    
    if (!source || !target) {continue;}
    if (source.fixed && target.fixed) {continue;}
    
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const dz = target.z - source.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.1;
    
    const force = (dist - distance) * link.strength * 0.1;
    
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    const fz = (dz / dist) * force;
    
    if (!source.fixed) {
      source.vx += fx / source.mass;
      source.vy += fy / source.mass;
      source.vz += fz / source.mass;
    }
    
    if (!target.fixed) {
      target.vx -= fx / target.mass;
      target.vy -= fy / target.mass;
      target.vz -= fz / target.mass;
    }
  }
}

/**
 * Apply cluster centering force
 */
function applyClusterCentering(
  nodes: LayoutNode[],
  clusterCenters: Map<string, Vector3D>,
  strength: number
): void {
  for (const node of nodes) {
    if (node.fixed) {continue;}
    
    const center = clusterCenters.get(node.cluster);
    if (!center) {continue;}
    
    const dx = center.x - node.x;
    const dy = center.y - node.y;
    const dz = center.z - node.z;
    
    node.vx += dx * strength;
    node.vy += dy * strength;
    node.vz += dz * strength;
  }
}

/**
 * Apply velocity and damping
 */
function applyVelocity(nodes: LayoutNode[], damping: number): void {
  for (const node of nodes) {
    if (node.fixed) {continue;}
    
    node.x += node.vx;
    node.y += node.vy;
    node.z += node.vz;
    
    node.vx *= damping;
    node.vy *= damping;
    node.vz *= damping;
  }
}

/**
 * Constrain nodes to galaxy bounds
 */
function constrainToBounds(nodes: LayoutNode[], radius: number, height: number): void {
  for (const node of nodes) {
    const dist = Math.sqrt(node.x * node.x + node.z * node.z);
    if (dist > radius) {
      const scale = radius / dist;
      node.x *= scale;
      node.z *= scale;
    }
    
    node.y = Math.max(-height / 2, Math.min(height / 2, node.y));
  }
}

// ============================================================================
// Main Layout Function
// ============================================================================

/**
 * Calculate cluster center positions
 */
function calculateClusterCenters(clusters: string[]): Map<string, Vector3D> {
  const centers = new Map<string, Vector3D>();
  const angleStep = (2 * Math.PI) / clusters.length;
  const radius = GALAXY_LAYOUT.RADIUS * 0.6;
  
  clusters.forEach((cluster, i) => {
    const angle = i * angleStep;
    centers.set(cluster, {
      x: Math.cos(angle) * radius,
      y: (Math.random() - 0.5) * GALAXY_LAYOUT.HEIGHT * 0.3,
      z: Math.sin(angle) * radius,
    });
  });
  
  return centers;
}

/**
 * Initialize node positions
 */
function initializeNodes(
  tables: readonly TableNode[],
  clusterCenters: Map<string, Vector3D>
): LayoutNode[] {
  return tables.map((table) => {
    const cluster = table.cluster || detectCluster(table.name);
    const center = clusterCenters.get(cluster) || { x: 0, y: 0, z: 0 };
    
    // Start near cluster center with some randomness
    const spread = GALAXY_LAYOUT.CLUSTER_SEPARATION * 0.3;
    
    return {
      id: table.id,
      x: center.x + (Math.random() - 0.5) * spread,
      y: center.y + (Math.random() - 0.5) * spread,
      z: center.z + (Math.random() - 0.5) * spread,
      vx: 0,
      vy: 0,
      vz: 0,
      mass: 1 + Math.log10(table.accessCount + 1),
      cluster,
      fixed: false,
    };
  });
}

/**
 * Create links from relationships
 */
function createLinks(relationships: readonly TableRelationship[]): LayoutLink[] {
  return relationships.map((rel) => ({
    source: rel.sourceTableId,
    target: rel.targetTableId,
    strength: rel.type === 'one-to-one' ? 1 : 0.5,
  }));
}

/**
 * Position entry points around the galaxy edge
 */
function positionEntryPoints(
  entryPoints: readonly EntryPointNode[],
  tables: readonly TableNode[],
  tablePositions: Map<string, Vector3D>
): Map<string, Vector3D> {
  const positions = new Map<string, Vector3D>();
  const radius = GALAXY_LAYOUT.RADIUS + 15;
  
  // Group entry points by their primary reachable table cluster
  const grouped = new Map<string, EntryPointNode[]>();
  
  for (const ep of entryPoints) {
    // Find the most common cluster among reachable tables
    const clusterCounts = new Map<string, number>();
    for (const tableId of ep.reachableTables) {
      const table = tables.find((t) => t.id === tableId);
      if (table) {
        const cluster = table.cluster || detectCluster(table.name);
        clusterCounts.set(cluster, (clusterCounts.get(cluster) || 0) + 1);
      }
    }
    
    let maxCluster = 'other';
    let maxCount = 0;
    for (const [cluster, count] of clusterCounts) {
      if (count > maxCount) {
        maxCluster = cluster;
        maxCount = count;
      }
    }
    
    const existing = grouped.get(maxCluster) || [];
    grouped.set(maxCluster, [...existing, ep]);
  }
  
  // Position each group
  let globalIndex = 0;
  for (const [_cluster, eps] of grouped) {
    for (let i = 0; i < eps.length; i++) {
      const angle = (globalIndex / entryPoints.length) * 2 * Math.PI;
      const height = (Math.random() - 0.5) * GALAXY_LAYOUT.HEIGHT;
      
      positions.set(eps[i].id, {
        x: Math.cos(angle) * radius,
        y: height,
        z: Math.sin(angle) * radius,
      });
      
      globalIndex++;
    }
  }
  
  return positions;
}

/**
 * Main layout calculation
 */
export function calculateLayout(
  tables: readonly TableNode[],
  entryPoints: readonly EntryPointNode[],
  relationships: readonly TableRelationship[]
): LayoutResult {
  // Get unique clusters
  const clusters = [...new Set(tables.map((t) => t.cluster || detectCluster(t.name)))];
  
  // Calculate cluster centers
  const clusterCenters = calculateClusterCenters(clusters);
  
  // Initialize nodes
  const nodes = initializeNodes(tables, clusterCenters);
  
  // Create links
  const links = createLinks(relationships);
  
  // Run simulation
  const iterations = GALAXY_LAYOUT.SIMULATION_ITERATIONS;
  const damping = 0.9;
  
  for (let i = 0; i < iterations; i++) {
    const alpha = 1 - i / iterations;
    
    applyRepulsion(nodes, GALAXY_LAYOUT.FORCE_STRENGTH * alpha);
    applyAttraction(nodes, links, GALAXY_LAYOUT.LINK_DISTANCE);
    applyClusterCentering(nodes, clusterCenters, 0.05 * alpha);
    applyVelocity(nodes, damping);
    constrainToBounds(nodes, GALAXY_LAYOUT.RADIUS, GALAXY_LAYOUT.HEIGHT);
  }
  
  // Extract final positions
  const tablePositions = new Map<string, Vector3D>();
  for (const node of nodes) {
    tablePositions.set(node.id, { x: node.x, y: node.y, z: node.z });
  }
  
  // Position entry points
  const entryPointPositions = positionEntryPoints(entryPoints, tables, tablePositions);
  
  return {
    tables: tablePositions,
    entryPoints: entryPointPositions,
    clusters: clusterCenters,
  };
}

/**
 * Apply layout to galaxy data (mutates positions)
 */
export function applyLayout(
  tables: TableNode[],
  entryPoints: EntryPointNode[],
  relationships: readonly TableRelationship[]
): void {
  const layout = calculateLayout(tables, entryPoints, relationships);
  
  for (const table of tables) {
    const pos = layout.tables.get(table.id);
    if (pos) {
      (table as { position?: Vector3D }).position = pos;
    }
  }
  
  for (const ep of entryPoints) {
    const pos = layout.entryPoints.get(ep.id);
    if (pos) {
      (ep as { position?: Vector3D }).position = pos;
    }
  }
}


/**
 * Compute galaxy layout and return tables/entryPoints with positions
 */
export function computeGalaxyLayout(
  tables: readonly TableNode[],
  entryPoints: readonly EntryPointNode[],
  dataPaths: readonly { sourceId: string; targetTableId: string }[]
): { tables: TableNode[]; entryPoints: EntryPointNode[] } {
  // Create relationships from data paths for layout
  const relationships: TableRelationship[] = [];
  const seenPairs = new Set<string>();
  
  for (const path of dataPaths) {
    const key = `${path.sourceId}-${path.targetTableId}`;
    if (!seenPairs.has(key)) {
      seenPairs.add(key);
      // Only create relationships between tables
      const sourceTable = tables.find(t => t.id === path.sourceId);
      if (sourceTable) {
        relationships.push({
          id: key,
          sourceTableId: path.sourceId,
          sourceFieldId: '',
          targetTableId: path.targetTableId,
          targetFieldId: '',
          type: 'one-to-many',
        });
      }
    }
  }
  
  // Calculate layout
  const layout = calculateLayout(tables, entryPoints, relationships);
  
  // Apply positions to copies
  const tablesWithPositions: TableNode[] = tables.map(table => ({
    ...table,
    position: layout.tables.get(table.id),
  }));
  
  const entryPointsWithPositions: EntryPointNode[] = entryPoints.map(ep => ({
    ...ep,
    position: layout.entryPoints.get(ep.id),
  }));
  
  return {
    tables: tablesWithPositions,
    entryPoints: entryPointsWithPositions,
  };
}
