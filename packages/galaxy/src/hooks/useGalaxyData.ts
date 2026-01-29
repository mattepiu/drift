/**
 * useGalaxyData Hook
 * 
 * Fetches and transforms data from Drift's boundary scanner and call graph
 * into the galaxy visualization format.
 */

import { useEffect, useCallback } from 'react';

import { useGalaxyStore } from '../store/index.js';
import { computeGalaxyLayout } from '../utils/layout-engine.js';

import type { GalaxyData, TableNode, EntryPointNode, DataPath, TableRelationship, GalaxyStats } from '../types/index.js';

// ============================================================================
// Types
// ============================================================================

export interface UseGalaxyDataOptions {
  /** Auto-fetch on mount */
  autoFetch?: boolean;
  /** Refresh interval in ms (0 = disabled) */
  refreshInterval?: number;
  /** Data source endpoint or function */
  dataSource?: string | (() => Promise<RawGalaxyData>);
}

export interface RawGalaxyData {
  tables: RawTable[];
  entryPoints: RawEntryPoint[];
  dataPaths: RawDataPath[];
  relationships?: RawRelationship[];
}

interface RawTable {
  id: string;
  name: string;
  schema?: string;
  rowCount?: number;
  accessCount?: number;
  sensitivity?: string;
  securityTier?: string;
  cluster?: string;
  fields: RawField[];
}

interface RawField {
  id: string;
  name: string;
  dataType: string;
  sensitivity?: string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  foreignKeyTarget?: string;
  accessCount?: number;
  isTested?: boolean;
}

interface RawEntryPoint {
  id: string;
  path: string;
  method: string;
  authLevel?: string;
  securityTier?: string;
  file: string;
  line: number;
  framework?: string;
  reachableTables?: string[];
}

interface RawDataPath {
  id: string;
  sourceId: string;
  sourceType: string;
  targetTableId: string;
  targetFieldId?: string;
  operation?: string;
  frequency?: number;
  depth?: number;
  isTested?: boolean;
  callChain?: string[];
  sensitivity?: string;
}

interface RawRelationship {
  id: string;
  sourceTableId: string;
  sourceFieldId: string;
  targetTableId: string;
  targetFieldId: string;
  type?: string;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useGalaxyData(options: UseGalaxyDataOptions = {}) {
  const { autoFetch = true, refreshInterval = 0, dataSource } = options;
  
  const { setGalaxyData, setLoading, setError, isLoading, error, galaxyData } = useGalaxyStore();
  
  // Transform raw data to galaxy format
  const transformData = useCallback((raw: RawGalaxyData): GalaxyData => {
    // Transform tables
    const tables: TableNode[] = raw.tables.map(t => ({
      id: t.id,
      name: t.name,
      schema: t.schema,
      rowCount: t.rowCount || 0,
      accessCount: t.accessCount || 0,
      sensitivity: (t.sensitivity as any) || 'public',
      securityTier: (t.securityTier as any) || 'P4',
      cluster: t.cluster,
      fields: t.fields.map(f => ({
        id: f.id,
        name: f.name,
        tableId: t.id,
        dataType: f.dataType,
        sensitivity: (f.sensitivity as any) || 'public',
        isPrimaryKey: f.isPrimaryKey || false,
        isForeignKey: f.isForeignKey || false,
        foreignKeyTarget: f.foreignKeyTarget,
        accessCount: f.accessCount || 0,
        isTested: f.isTested ?? true,
      })),
    }));
    
    // Transform entry points
    const entryPoints: EntryPointNode[] = raw.entryPoints.map(e => ({
      id: e.id,
      path: e.path,
      method: (e.method as any) || 'GET',
      authLevel: (e.authLevel as any) || 'authenticated',
      securityTier: (e.securityTier as any) || 'P4',
      file: e.file,
      line: e.line,
      framework: e.framework || 'unknown',
      reachableTables: e.reachableTables || [],
    }));
    
    // Transform data paths
    const dataPaths: DataPath[] = raw.dataPaths.map(p => ({
      id: p.id,
      sourceId: p.sourceId,
      sourceType: (p.sourceType as any) || 'entryPoint',
      targetTableId: p.targetTableId,
      targetFieldId: p.targetFieldId,
      operation: (p.operation as any) || 'read',
      frequency: p.frequency || 1,
      depth: p.depth || 1,
      isTested: p.isTested ?? true,
      callChain: p.callChain || [],
      sensitivity: (p.sensitivity as any) || 'public',
    }));
    
    // Transform relationships
    const relationships: TableRelationship[] = (raw.relationships || []).map(r => ({
      id: r.id,
      sourceTableId: r.sourceTableId,
      sourceFieldId: r.sourceFieldId,
      targetTableId: r.targetTableId,
      targetFieldId: r.targetFieldId,
      type: (r.type as any) || 'one-to-many',
    }));
    
    // Compute layout positions
    const { tables: layoutTables, entryPoints: layoutEntryPoints } = computeGalaxyLayout(tables, entryPoints, dataPaths);
    
    // Calculate stats
    const stats = calculateStats(layoutTables, layoutEntryPoints, dataPaths);
    
    return {
      tables: layoutTables,
      entryPoints: layoutEntryPoints,
      dataPaths,
      relationships,
      stats,
      lastUpdated: new Date().toISOString(),
    };
  }, []);

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    
    try {
      let raw: RawGalaxyData;
      
      if (typeof dataSource === 'function') {
        raw = await dataSource();
      } else if (typeof dataSource === 'string') {
        const response = await fetch(dataSource);
        if (!response.ok) {throw new Error(`HTTP ${response.status}`);}
        raw = await response.json();
      } else {
        // Default: try to fetch from Drift MCP or local endpoint
        const response = await fetch('/api/drift/galaxy');
        if (!response.ok) {throw new Error(`HTTP ${response.status}`);}
        raw = await response.json();
      }
      
      const data = transformData(raw);
      setGalaxyData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch galaxy data');
    }
  }, [dataSource, transformData, setGalaxyData, setLoading, setError]);
  
  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch) {
      fetchData();
    }
  }, [autoFetch, fetchData]);
  
  // Refresh interval
  useEffect(() => {
    if (refreshInterval > 0) {
      const interval = setInterval(fetchData, refreshInterval);
      return () => { clearInterval(interval); };
    }
    return undefined;
  }, [refreshInterval, fetchData]);
  
  return {
    data: galaxyData,
    isLoading,
    error,
    refetch: fetchData,
  };
}

// ============================================================================
// Stats Calculation
// ============================================================================

function calculateStats(
  tables: TableNode[],
  entryPoints: EntryPointNode[],
  paths: DataPath[]
): GalaxyStats {
  const sensitiveFields: Record<string, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    public: 0,
  };
  
  let fieldCount = 0;
  for (const table of tables) {
    for (const field of table.fields) {
      fieldCount++;
      sensitiveFields[field.sensitivity]++;
    }
  }
  
  const untestedPaths = paths.filter(p => !p.isTested).length;
  const publicEndpoints = entryPoints.filter(e => e.authLevel === 'public').length;
  const criticalTables = tables.filter(t => t.sensitivity === 'critical' || t.sensitivity === 'high').length;
  
  // Calculate health score (0-100)
  let healthScore = 100;
  healthScore -= Math.min(30, untestedPaths * 2); // -2 per untested path, max -30
  healthScore -= Math.min(30, publicEndpoints * 5); // -5 per public endpoint, max -30
  healthScore -= Math.min(20, (sensitiveFields.critical + sensitiveFields.high) * 0.5); // -0.5 per sensitive field
  healthScore = Math.max(0, Math.round(healthScore));
  
  return {
    tableCount: tables.length,
    fieldCount,
    entryPointCount: entryPoints.length,
    pathCount: paths.length,
    sensitiveFields: sensitiveFields as any,
    untestedPaths,
    deadCodeCount: 0, // Would need call graph analysis
    healthScore,
  };
}
