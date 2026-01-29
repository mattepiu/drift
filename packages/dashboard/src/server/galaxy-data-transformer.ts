/**
 * Galaxy Data Transformer
 *
 * Transforms Drift's boundary scanner and call graph data into the
 * Galaxy visualization format. This is the bridge between Drift's
 * semantic analysis and the 3D visualization.
 *
 * Data Sources:
 * - BoundaryScanner: Tables, fields, sensitive fields, access points
 * - CallGraph: Entry points, functions, call paths
 * - SecurityPrioritizer: Security tiers, risk scores
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type {
  DataAccessMap,
  DataAccessPoint,
  SensitiveField,
  TableAccessInfo,
} from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

/**
 * Sensitivity level for Galaxy visualization
 */
export type GalaxySensitivity = 'critical' | 'high' | 'medium' | 'low' | 'public';

/**
 * Security tier (P0 = most critical)
 */
export type GalaxySecurityTier = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';

/**
 * Data operation type
 */
export type GalaxyOperation = 'read' | 'write' | 'delete' | 'unknown';

/**
 * Authentication level
 */
export type GalaxyAuthLevel = 'public' | 'authenticated' | 'admin' | 'internal';

/**
 * Raw table data for Galaxy
 */
export interface GalaxyRawTable {
  id: string;
  name: string;
  schema?: string;
  rowCount: number;
  accessCount: number;
  sensitivity: GalaxySensitivity;
  securityTier: GalaxySecurityTier;
  cluster?: string;
  fields: GalaxyRawField[];
}

/**
 * Raw field data for Galaxy
 */
export interface GalaxyRawField {
  id: string;
  name: string;
  dataType: string;
  sensitivity: GalaxySensitivity;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  foreignKeyTarget?: string;
  accessCount: number;
  isTested: boolean;
}

/**
 * Raw entry point data for Galaxy
 */
export interface GalaxyRawEntryPoint {
  id: string;
  path: string;
  method: string;
  authLevel: GalaxyAuthLevel;
  securityTier: GalaxySecurityTier;
  file: string;
  line: number;
  framework: string;
  reachableTables: string[];
}

/**
 * Raw data path for Galaxy
 */
export interface GalaxyRawDataPath {
  id: string;
  sourceId: string;
  sourceType: 'entryPoint' | 'function';
  targetTableId: string;
  targetFieldId?: string;
  operation: GalaxyOperation;
  frequency: number;
  depth: number;
  isTested: boolean;
  callChain: string[];
  sensitivity: GalaxySensitivity;
}

/**
 * Raw relationship for Galaxy
 */
export interface GalaxyRawRelationship {
  id: string;
  sourceTableId: string;
  sourceFieldId: string;
  targetTableId: string;
  targetFieldId: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
}

/**
 * Complete raw Galaxy data
 */
export interface GalaxyRawData {
  tables: GalaxyRawTable[];
  entryPoints: GalaxyRawEntryPoint[];
  dataPaths: GalaxyRawDataPath[];
  relationships: GalaxyRawRelationship[];
  stats: GalaxyStats;
  lastUpdated: string;
}

/**
 * Galaxy statistics
 */
export interface GalaxyStats {
  tableCount: number;
  fieldCount: number;
  entryPointCount: number;
  pathCount: number;
  sensitiveFields: Record<GalaxySensitivity, number>;
  untestedPaths: number;
  deadCodeCount: number;
  healthScore: number;
}

/**
 * Call graph data structure (from stored JSON)
 */
interface StoredCallGraph {
  version: string;
  generatedAt: string;
  projectRoot: string;
  functions: Record<string, StoredFunction>;
  entryPoints: string[];
  dataAccessors: string[];
  stats: {
    totalFunctions: number;
    totalCallSites: number;
    resolvedCallSites: number;
    unresolvedCallSites: number;
    totalDataAccessors: number;
  };
}

interface StoredFunction {
  id: string;
  name: string;
  qualifiedName: string;
  file: string;
  startLine: number;
  endLine: number;
  language: string;
  calls: StoredCallSite[];
  calledBy: StoredCallSite[];
  dataAccess: DataAccessPoint[];
  className?: string;
  moduleName?: string;
  isExported: boolean;
  isConstructor: boolean;
  isAsync: boolean;
  decorators: string[];
  parameters: { name: string; type?: string; hasDefault: boolean; isRest: boolean }[];
  returnType?: string;
}

interface StoredCallSite {
  callerId: string;
  calleeId: string | null;
  calleeName: string;
  receiver?: string;
  file: string;
  line: number;
  column: number;
  resolved: boolean;
  resolvedCandidates: string[];
  confidence: number;
  resolutionReason?: string;
  argumentCount: number;
}

// ============================================================================
// Sensitivity Mapping
// ============================================================================

/**
 * Map Drift sensitivity types to Galaxy sensitivity levels
 */
function mapSensitivityType(type: string | undefined): GalaxySensitivity {
  switch (type?.toLowerCase()) {
    case 'credentials':
      return 'critical';
    case 'financial':
    case 'health':
      return 'high';
    case 'pii':
      return 'medium';
    case 'unknown':
    default:
      return 'low';
  }
}

/**
 * Calculate table sensitivity from its fields
 */
function calculateTableSensitivity(fields: GalaxyRawField[]): GalaxySensitivity {
  const priorities: GalaxySensitivity[] = ['critical', 'high', 'medium', 'low', 'public'];
  
  for (const priority of priorities) {
    if (fields.some(f => f.sensitivity === priority)) {
      return priority;
    }
  }
  
  return 'public';
}

/**
 * Calculate security tier from sensitivity and access patterns
 */
function calculateSecurityTier(
  sensitivity: GalaxySensitivity,
  hasWriteAccess: boolean,
  isPubliclyAccessible: boolean
): GalaxySecurityTier {
  if (sensitivity === 'critical') {
    return hasWriteAccess ? 'P0' : 'P1';
  }
  if (sensitivity === 'high') {
    return hasWriteAccess ? 'P1' : 'P2';
  }
  if (sensitivity === 'medium') {
    return isPubliclyAccessible ? 'P2' : 'P3';
  }
  return 'P4';
}

// ============================================================================
// Cluster Detection
// ============================================================================

/**
 * Detect domain cluster from table name
 */
function detectCluster(tableName: string): string {
  const name = tableName.toLowerCase();
  
  // Auth cluster
  if (/^(user|account|session|token|auth|login|password|credential|role|permission)/.test(name)) {
    return 'auth';
  }
  
  // Commerce cluster
  if (/^(order|product|cart|payment|invoice|transaction|subscription|price|discount)/.test(name)) {
    return 'commerce';
  }
  
  // Content cluster
  if (/^(post|article|comment|media|file|document|image|video|content)/.test(name)) {
    return 'content';
  }
  
  // Analytics cluster
  if (/^(event|log|audit|metric|analytics|tracking|stat)/.test(name)) {
    return 'analytics';
  }
  
  // Communication cluster
  if (/^(message|notification|email|chat|conversation)/.test(name)) {
    return 'communication';
  }
  
  // Organization cluster
  if (/^(team|organization|company|member|department|group)/.test(name)) {
    return 'organization';
  }
  
  return 'general';
}

// ============================================================================
// Entry Point Detection
// ============================================================================

/**
 * Detect HTTP method from decorators/function name
 */
function detectHttpMethod(decorators: string[], name: string): string {
  const decoratorStr = decorators.join(' ').toLowerCase();
  const nameLower = name.toLowerCase();
  
  if (decoratorStr.includes('post') || nameLower.includes('create') || nameLower.includes('add')) {
    return 'POST';
  }
  if (decoratorStr.includes('put') || nameLower.includes('update')) {
    return 'PUT';
  }
  if (decoratorStr.includes('patch')) {
    return 'PATCH';
  }
  if (decoratorStr.includes('delete') || nameLower.includes('delete') || nameLower.includes('remove')) {
    return 'DELETE';
  }
  return 'GET';
}

/**
 * Extract route path from decorators
 */
function extractRoutePath(decorators: string[]): string | null {
  for (const dec of decorators) {
    // Express/Flask style: @app.route('/path')
    const routeMatch = dec.match(/route\s*\(\s*['"]([^'"]+)['"]/i);
    if (routeMatch?.[1]) {return routeMatch[1];}
    
    // FastAPI style: @router.get('/path')
    const fastApiMatch = dec.match(/(?:get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/i);
    if (fastApiMatch?.[1]) {return fastApiMatch[1];}
    
    // Spring style: @GetMapping("/path")
    const springMatch = dec.match(/(?:Get|Post|Put|Patch|Delete)?Mapping\s*\(\s*(?:value\s*=\s*)?['"]([^'"]+)['"]/i);
    if (springMatch?.[1]) {return springMatch[1];}
    
    // ASP.NET style: [HttpGet("path")]
    const aspMatch = dec.match(/Http(?:Get|Post|Put|Patch|Delete)\s*\(\s*['"]([^'"]+)['"]/i);
    if (aspMatch?.[1]) {return aspMatch[1];}
  }
  
  return null;
}

/**
 * Detect framework from decorators
 */
function detectFramework(decorators: string[]): string {
  const decoratorStr = decorators.join(' ').toLowerCase();
  
  if (decoratorStr.includes('@app.') || decoratorStr.includes('@router.')) {
    return decoratorStr.includes('fastapi') ? 'FastAPI' : 'Flask';
  }
  if (decoratorStr.includes('mapping') || decoratorStr.includes('@rest')) {
    return 'Spring';
  }
  if (decoratorStr.includes('http') && decoratorStr.includes('[')) {
    return 'ASP.NET';
  }
  if (decoratorStr.includes('route') || decoratorStr.includes('controller')) {
    return 'Express';
  }
  
  return 'unknown';
}

/**
 * Detect auth level from decorators and function context
 */
function detectAuthLevel(decorators: string[], name: string): GalaxyAuthLevel {
  const decoratorStr = decorators.join(' ').toLowerCase();
  const nameLower = name.toLowerCase();
  
  if (decoratorStr.includes('admin') || nameLower.includes('admin')) {
    return 'admin';
  }
  if (decoratorStr.includes('internal') || nameLower.includes('internal')) {
    return 'internal';
  }
  if (decoratorStr.includes('public') || decoratorStr.includes('allowanonymous')) {
    return 'public';
  }
  if (decoratorStr.includes('auth') || decoratorStr.includes('login') || 
      decoratorStr.includes('protected') || decoratorStr.includes('authorize')) {
    return 'authenticated';
  }
  
  // Default to authenticated for safety
  return 'authenticated';
}

// ============================================================================
// Galaxy Data Transformer
// ============================================================================

export class GalaxyDataTransformer {
  private readonly driftDir: string;

  constructor(driftDir: string) {
    this.driftDir = driftDir;
  }

  /**
   * Transform Drift data into Galaxy format
   */
  async transform(): Promise<GalaxyRawData> {
    // Load data sources
    const accessMap = await this.loadAccessMap();
    const callGraph = await this.loadCallGraph();

    // Transform tables
    const tables = this.transformTables(accessMap);
    
    // Transform entry points from call graph
    const entryPoints = this.transformEntryPoints(callGraph, accessMap);
    
    // Transform data paths
    const dataPaths = this.transformDataPaths(accessMap, callGraph, entryPoints);
    
    // Extract relationships from foreign keys
    const relationships = this.extractRelationships(tables);
    
    // Calculate stats
    const stats = this.calculateStats(tables, entryPoints, dataPaths);

    return {
      tables,
      entryPoints,
      dataPaths,
      relationships,
      stats,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Load access map from .drift/boundaries
   */
  private async loadAccessMap(): Promise<DataAccessMap> {
    const accessMapPath = path.join(this.driftDir, 'boundaries', 'access-map.json');
    
    try {
      const content = await fs.readFile(accessMapPath, 'utf-8');
      return JSON.parse(content) as DataAccessMap;
    } catch {
      // Return empty access map if not found
      return {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        projectRoot: '',
        models: [],
        tables: {},
        accessPoints: {},
        sensitiveFields: [],
        stats: {
          totalTables: 0,
          totalAccessPoints: 0,
          totalSensitiveFields: 0,
          totalModels: 0,
        },
      };
    }
  }

  /**
   * Load call graph from .drift/lake/callgraph (primary) or legacy paths
   */
  private async loadCallGraph(): Promise<StoredCallGraph | null> {
    // Primary: Load from lake storage (sharded format)
    const lakeIndexPath = path.join(this.driftDir, 'lake', 'callgraph', 'index.json');
    try {
      const content = await fs.readFile(lakeIndexPath, 'utf-8');
      const index = JSON.parse(content);
      // Convert lake index format to StoredCallGraph format
      return {
        version: index.version || '1.0.0',
        generatedAt: index.generatedAt,
        projectRoot: this.driftDir.replace('/.drift', ''),
        stats: {
          totalFunctions: index.summary?.totalFunctions || 0,
          totalCallSites: index.summary?.totalCalls || 0,
          resolvedCallSites: index.summary?.totalCalls || 0,
          unresolvedCallSites: 0,
          totalDataAccessors: index.summary?.dataAccessors || 0,
        },
        functions: {}, // Empty - would need to load shards for full data
        entryPoints: index.topEntryPoints?.map((ep: { id: string }) => ep.id) || [],
        dataAccessors: index.topDataAccessors?.map((da: { id: string }) => da.id) || [],
      };
    } catch {
      // Fall through to legacy paths
    }

    // Legacy: Try old paths for backwards compatibility
    const legacyPaths = [
      path.join(this.driftDir, 'call-graph', 'graph.json'),
      path.join(this.driftDir, 'callgraph', 'graph.json'),
    ];

    for (const graphPath of legacyPaths) {
      try {
        const content = await fs.readFile(graphPath, 'utf-8');
        return JSON.parse(content) as StoredCallGraph;
      } catch {
        // Try next path
      }
    }

    return null;
  }

  /**
   * Transform tables from access map
   */
  private transformTables(accessMap: DataAccessMap): GalaxyRawTable[] {
    const tables: GalaxyRawTable[] = [];

    for (const [tableName, tableInfo] of Object.entries(accessMap.tables)) {
      const fields = this.transformFields(tableName, tableInfo, accessMap.sensitiveFields);
      const sensitivity = calculateTableSensitivity(fields);
      const hasWriteAccess = tableInfo.accessedBy.some(a => a.operation === 'write' || a.operation === 'delete');
      
      tables.push({
        id: tableName,
        name: tableName,
        rowCount: 0, // Not available from boundary scanner
        accessCount: tableInfo.accessedBy.length,
        sensitivity,
        securityTier: calculateSecurityTier(sensitivity, hasWriteAccess, false),
        cluster: detectCluster(tableName),
        fields,
      });
    }

    return tables;
  }

  /**
   * Transform fields for a table
   */
  private transformFields(
    tableName: string,
    tableInfo: TableAccessInfo,
    sensitiveFields: SensitiveField[]
  ): GalaxyRawField[] {
    const fields: GalaxyRawField[] = [];
    const fieldSet = new Set<string>();

    // Add known fields from table info
    for (const fieldName of tableInfo.fields) {
      if (fieldSet.has(fieldName)) {continue;}
      fieldSet.add(fieldName);

      const sensitiveField = sensitiveFields.find(
        sf => sf.field === fieldName && (sf.table === tableName || sf.table === null)
      );

      const foreignKeyTarget = this.inferForeignKeyTarget(fieldName);
      const fieldData: GalaxyRawField = {
        id: `${tableName}.${fieldName}`,
        name: fieldName,
        dataType: 'unknown',
        sensitivity: sensitiveField ? mapSensitivityType(sensitiveField.sensitivityType) : 'low',
        isPrimaryKey: fieldName === 'id' || fieldName.endsWith('_id'),
        isForeignKey: fieldName.endsWith('_id') && fieldName !== 'id',
        accessCount: tableInfo.accessedBy.filter(a => a.fields.includes(fieldName)).length,
        isTested: true, // Would need test coverage data
      };
      if (foreignKeyTarget) {
        fieldData.foreignKeyTarget = foreignKeyTarget;
      }
      fields.push(fieldData);
    }

    // Add sensitive fields not in known fields
    for (const sf of sensitiveFields) {
      if (sf.table === tableName && !fieldSet.has(sf.field)) {
        fieldSet.add(sf.field);
        fields.push({
          id: `${tableName}.${sf.field}`,
          name: sf.field,
          dataType: 'unknown',
          sensitivity: mapSensitivityType(sf.sensitivityType),
          isPrimaryKey: false,
          isForeignKey: false,
          accessCount: 0,
          isTested: true,
        });
      }
    }

    return fields;
  }

  /**
   * Infer foreign key target from field name
   */
  private inferForeignKeyTarget(fieldName: string): string | undefined {
    if (!fieldName.endsWith('_id') || fieldName === 'id') {
      return undefined;
    }

    // user_id -> users.id
    const baseName = fieldName.replace(/_id$/, '');
    return `${baseName}s.id`;
  }

  /**
   * Transform entry points from call graph
   */
  private transformEntryPoints(
    callGraph: StoredCallGraph | null,
    accessMap: DataAccessMap
  ): GalaxyRawEntryPoint[] {
    const entryPoints: GalaxyRawEntryPoint[] = [];

    if (!callGraph) {
      return entryPoints;
    }

    for (const entryPointId of callGraph.entryPoints) {
      const func = callGraph.functions[entryPointId];
      if (!func) {continue;}

      const routePath = extractRoutePath(func.decorators);
      if (!routePath) {continue;} // Skip non-HTTP entry points

      const method = detectHttpMethod(func.decorators, func.name);
      const authLevel = detectAuthLevel(func.decorators, func.name);
      const framework = detectFramework(func.decorators);

      // Find reachable tables through data access
      const reachableTables = this.findReachableTables(func, callGraph);

      // Calculate security tier based on reachable data
      const maxSensitivity = this.getMaxSensitivityForTables(reachableTables, accessMap);
      const securityTier = calculateSecurityTier(
        maxSensitivity,
        method !== 'GET',
        authLevel === 'public'
      );

      entryPoints.push({
        id: `ep-${func.id}`,
        path: routePath,
        method,
        authLevel,
        securityTier,
        file: func.file,
        line: func.startLine,
        framework,
        reachableTables,
      });
    }

    return entryPoints;
  }

  /**
   * Find tables reachable from a function through call graph
   */
  private findReachableTables(
    func: StoredFunction,
    callGraph: StoredCallGraph
  ): string[] {
    const tables = new Set<string>();
    const visited = new Set<string>();

    const traverse = (funcId: string, depth: number) => {
      if (depth > 10 || visited.has(funcId)) {return;}
      visited.add(funcId);

      const f = callGraph.functions[funcId];
      if (!f) {return;}

      // Add directly accessed tables
      for (const access of f.dataAccess) {
        if (access.table !== 'unknown') {
          tables.add(access.table);
        }
      }

      // Traverse called functions
      for (const call of f.calls) {
        if (call.calleeId) {
          traverse(call.calleeId, depth + 1);
        }
      }
    };

    traverse(func.id, 0);
    return Array.from(tables);
  }

  /**
   * Get maximum sensitivity level for a set of tables
   */
  private getMaxSensitivityForTables(
    tableNames: string[],
    accessMap: DataAccessMap
  ): GalaxySensitivity {
    let maxSensitivity: GalaxySensitivity = 'public';
    const priorities: GalaxySensitivity[] = ['critical', 'high', 'medium', 'low', 'public'];

    for (const tableName of tableNames) {
      const tableInfo = accessMap.tables[tableName];
      if (!tableInfo) {continue;}

      for (const sf of tableInfo.sensitiveFields) {
        const sensitivity = mapSensitivityType(sf.sensitivityType);
        if (priorities.indexOf(sensitivity) < priorities.indexOf(maxSensitivity)) {
          maxSensitivity = sensitivity;
        }
      }
    }

    return maxSensitivity;
  }

  /**
   * Transform data paths from access points
   */
  private transformDataPaths(
    accessMap: DataAccessMap,
    callGraph: StoredCallGraph | null,
    entryPoints: GalaxyRawEntryPoint[]
  ): GalaxyRawDataPath[] {
    const paths: GalaxyRawDataPath[] = [];
    let pathId = 0;

    // Create paths from entry points to their reachable tables
    for (const ep of entryPoints) {
      for (const tableName of ep.reachableTables) {
        const tableInfo = accessMap.tables[tableName];
        const sensitivity = tableInfo 
          ? calculateTableSensitivity(this.transformFields(tableName, tableInfo, accessMap.sensitiveFields))
          : 'low';

        // Determine operation from HTTP method
        let operation: GalaxyOperation = 'read';
        if (ep.method === 'POST') {operation = 'write';}
        else if (ep.method === 'PUT' || ep.method === 'PATCH') {operation = 'write';}
        else if (ep.method === 'DELETE') {operation = 'delete';}

        paths.push({
          id: `path-${++pathId}`,
          sourceId: ep.id,
          sourceType: 'entryPoint',
          targetTableId: tableName,
          operation,
          frequency: tableInfo?.accessedBy.length ?? 1,
          depth: 1, // Would need call graph traversal for accurate depth
          isTested: true, // Would need test coverage data
          callChain: [],
          sensitivity,
        });
      }
    }

    // Also create paths from direct access points if no call graph
    if (!callGraph) {
      for (const accessPoint of Object.values(accessMap.accessPoints)) {
        if (accessPoint.table === 'unknown') {continue;}

        const tableInfo = accessMap.tables[accessPoint.table];
        const sensitivity = tableInfo
          ? calculateTableSensitivity(this.transformFields(accessPoint.table, tableInfo, accessMap.sensitiveFields))
          : 'low';

        paths.push({
          id: `path-${++pathId}`,
          sourceId: `func-${accessPoint.file}:${accessPoint.line}`,
          sourceType: 'function',
          targetTableId: accessPoint.table,
          operation: accessPoint.operation as GalaxyOperation,
          frequency: 1,
          depth: 1,
          isTested: true,
          callChain: [],
          sensitivity,
        });
      }
    }

    return paths;
  }

  /**
   * Extract relationships from foreign keys
   */
  private extractRelationships(tables: GalaxyRawTable[]): GalaxyRawRelationship[] {
    const relationships: GalaxyRawRelationship[] = [];
    let relId = 0;

    for (const table of tables) {
      for (const field of table.fields) {
        if (field.isForeignKey && field.foreignKeyTarget) {
          const [targetTable, targetField] = field.foreignKeyTarget.split('.');
          
          if (targetTable && tables.some(t => t.id === targetTable)) {
            relationships.push({
              id: `rel-${++relId}`,
              sourceTableId: table.id,
              sourceFieldId: field.id,
              targetTableId: targetTable,
              targetFieldId: `${targetTable}.${targetField || 'id'}`,
              type: 'one-to-many',
            });
          }
        }
      }
    }

    return relationships;
  }

  /**
   * Calculate Galaxy statistics
   */
  private calculateStats(
    tables: GalaxyRawTable[],
    entryPoints: GalaxyRawEntryPoint[],
    paths: GalaxyRawDataPath[]
  ): GalaxyStats {
    const sensitiveFields: Record<GalaxySensitivity, number> = {
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

    // Calculate health score
    let healthScore = 100;
    healthScore -= Math.min(30, untestedPaths * 2);
    // Penalize public endpoints accessing sensitive data
    const publicEndpoints = entryPoints.filter(e => e.authLevel === 'public').length;
    healthScore -= Math.min(30, publicEndpoints * 5);
    healthScore -= Math.min(20, (sensitiveFields.critical + sensitiveFields.high) * 0.5);
    healthScore = Math.max(0, Math.round(healthScore));

    return {
      tableCount: tables.length,
      fieldCount,
      entryPointCount: entryPoints.length,
      pathCount: paths.length,
      sensitiveFields,
      untestedPaths,
      deadCodeCount: 0,
      healthScore,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a new Galaxy data transformer
 */
export function createGalaxyDataTransformer(driftDir: string): GalaxyDataTransformer {
  return new GalaxyDataTransformer(driftDir);
}
