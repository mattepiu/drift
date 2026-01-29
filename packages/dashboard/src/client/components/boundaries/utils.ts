/**
 * Boundaries Component Utilities
 * 
 * Helper functions for boundary data processing.
 */

import type {
  TableInfo,
  DataAccessPoint,
  SensitiveField,
  BoundaryMetrics,
  TableMetrics,
  SortConfig,
  BoundaryFilters,
  DataOperation,
  SensitivityType,
} from './types';

// ============================================================================
// Metrics Calculation
// ============================================================================

export function calculateMetrics(
  tables: Record<string, TableInfo>,
  sensitiveFields: SensitiveField[],
  violations: number
): BoundaryMetrics {
  const tableList = Object.values(tables);
  
  const bySensitivityType: Record<SensitivityType, number> = {
    pii: 0,
    credentials: 0,
    financial: 0,
    health: 0,
    unknown: 0,
  };
  
  const byOperation: Record<DataOperation, number> = {
    read: 0,
    write: 0,
    delete: 0,
    unknown: 0,
  };

  // Count sensitive fields by type
  for (const field of sensitiveFields) {
    bySensitivityType[field.sensitivityType]++;
  }

  // Count operations
  let totalAccessPoints = 0;
  for (const table of tableList) {
    for (const ap of table.accessedBy) {
      totalAccessPoints++;
      byOperation[ap.operation]++;
    }
  }

  return {
    totalTables: tableList.length,
    totalAccessPoints,
    totalSensitiveFields: sensitiveFields.length,
    totalViolations: violations,
    bySensitivityType,
    byOperation,
  };
}

export function calculateTableMetrics(table: TableInfo): TableMetrics {
  const fileSet = new Set(table.accessedBy.map(ap => ap.file));
  
  let readCount = 0;
  let writeCount = 0;
  let deleteCount = 0;

  for (const ap of table.accessedBy) {
    switch (ap.operation) {
      case 'read':
        readCount++;
        break;
      case 'write':
        writeCount++;
        break;
      case 'delete':
        deleteCount++;
        break;
    }
  }

  return {
    accessCount: table.accessedBy.length,
    fileCount: fileSet.size,
    sensitiveCount: table.sensitiveFields.length,
    readCount,
    writeCount,
    deleteCount,
  };
}

// ============================================================================
// Sorting
// ============================================================================

export function sortTables(
  tables: TableInfo[],
  config: SortConfig
): TableInfo[] {
  const sorted = [...tables];
  
  sorted.sort((a, b) => {
    let comparison = 0;
    
    switch (config.field) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'accessCount':
        comparison = a.accessedBy.length - b.accessedBy.length;
        break;
      case 'sensitiveCount':
        comparison = a.sensitiveFields.length - b.sensitiveFields.length;
        break;
    }
    
    return config.direction === 'desc' ? -comparison : comparison;
  });
  
  return sorted;
}

// ============================================================================
// Filtering
// ============================================================================

export function filterTables(
  tables: TableInfo[],
  filters: BoundaryFilters
): TableInfo[] {
  return tables.filter(table => {
    // Search filter
    if (filters.search) {
      const search = filters.search.toLowerCase();
      if (!table.name.toLowerCase().includes(search) &&
          !table.model?.toLowerCase().includes(search)) {
        return false;
      }
    }

    // Sensitivity type filter
    if (filters.sensitivityType) {
      const hasSensitiveType = table.sensitiveFields.some(
        f => f.sensitivityType === filters.sensitivityType
      );
      if (!hasSensitiveType) {return false;}
    }

    // Operation filter
    if (filters.operation) {
      const hasOperation = table.accessedBy.some(
        ap => ap.operation === filters.operation
      );
      if (!hasOperation) {return false;}
    }

    return true;
  });
}

export function filterSensitiveFields(
  fields: SensitiveField[],
  filters: BoundaryFilters
): SensitiveField[] {
  return fields.filter(field => {
    // Search filter
    if (filters.search) {
      const search = filters.search.toLowerCase();
      if (!field.field.toLowerCase().includes(search) &&
          !field.table?.toLowerCase().includes(search) &&
          !field.file.toLowerCase().includes(search)) {
        return false;
      }
    }

    // Sensitivity type filter
    if (filters.sensitivityType && field.sensitivityType !== filters.sensitivityType) {
      return false;
    }

    return true;
  });
}

// ============================================================================
// Grouping
// ============================================================================

export interface FileGroup {
  file: string;
  tables: string[];
  accessPoints: DataAccessPoint[];
  metrics: {
    tableCount: number;
    accessCount: number;
    readCount: number;
    writeCount: number;
    deleteCount: number;
  };
}

export function groupByFile(tables: Record<string, TableInfo>): FileGroup[] {
  const fileMap = new Map<string, FileGroup>();

  for (const [tableName, table] of Object.entries(tables)) {
    for (const ap of table.accessedBy) {
      if (!fileMap.has(ap.file)) {
        fileMap.set(ap.file, {
          file: ap.file,
          tables: [],
          accessPoints: [],
          metrics: {
            tableCount: 0,
            accessCount: 0,
            readCount: 0,
            writeCount: 0,
            deleteCount: 0,
          },
        });
      }

      const group = fileMap.get(ap.file)!;
      group.accessPoints.push(ap);
      
      if (!group.tables.includes(tableName)) {
        group.tables.push(tableName);
      }

      group.metrics.accessCount++;
      switch (ap.operation) {
        case 'read':
          group.metrics.readCount++;
          break;
        case 'write':
          group.metrics.writeCount++;
          break;
        case 'delete':
          group.metrics.deleteCount++;
          break;
      }
    }
  }

  // Update table counts
  for (const group of fileMap.values()) {
    group.metrics.tableCount = group.tables.length;
  }

  return Array.from(fileMap.values()).sort(
    (a, b) => b.metrics.accessCount - a.metrics.accessCount
  );
}

// ============================================================================
// Formatting
// ============================================================================

export function formatFieldPath(table: string | null, field: string): string {
  return table ? `${table}.${field}` : field;
}

export function formatConfidence(score: number): string {
  return `${Math.round(score * 100)}%`;
}

export function getConfidenceColor(score: number): string {
  if (score >= 0.85) {return 'text-green-400';}
  if (score >= 0.65) {return 'text-yellow-400';}
  if (score >= 0.45) {return 'text-orange-400';}
  return 'text-red-400';
}

export function truncatePath(path: string, maxLength: number = 40): string {
  if (path.length <= maxLength) {return path;}
  
  const parts = path.split('/');
  if (parts.length <= 2) {return path;}
  
  // Keep first and last parts
  return `${parts[0]}/.../${parts[parts.length - 1]}`;
}
