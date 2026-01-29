/**
 * Boundaries Tab Component
 * 
 * Main tab for viewing data access boundaries.
 */

import { useState, useMemo } from 'react';

import { BoundaryDetail, BoundaryDetailEmpty } from './BoundaryDetail';
import { BoundaryFiltersComponent } from './BoundaryFilters';
import { BoundaryList } from './BoundaryList';
import { BoundaryStats } from './BoundaryStats';
import { RuleEditor, type BoundaryRulesConfig } from './RuleEditor';
import {
  calculateMetrics,
  filterTables,
  filterSensitiveFields,
  sortTables,
  groupByFile,
} from './utils';

import type { ViewMode, BoundaryFilters, TableInfo, SensitiveField, BoundaryViolation } from './types';

// ============================================================================
// Mock Data (will be replaced with real API calls)
// ============================================================================

// This will be replaced with actual data from the server
const MOCK_TABLES: Record<string, TableInfo> = {};
const MOCK_SENSITIVE_FIELDS: SensitiveField[] = [];
const MOCK_VIOLATIONS: BoundaryViolation[] = [];

// ============================================================================
// Main Component
// ============================================================================

type TabMode = 'overview' | 'rules';

interface BoundariesTabProps {
  tables?: Record<string, TableInfo>;
  sensitiveFields?: SensitiveField[];
  violations?: BoundaryViolation[];
  rules?: BoundaryRulesConfig | null;
  onSaveRules?: (rules: BoundaryRulesConfig) => void;
}

export function BoundariesTab({
  tables = MOCK_TABLES,
  sensitiveFields = MOCK_SENSITIVE_FIELDS,
  violations = MOCK_VIOLATIONS,
  rules = null,
  onSaveRules,
}: BoundariesTabProps) {
  // Tab state
  const [tabMode, setTabMode] = useState<TabMode>('overview');
  
  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('tables');
  const [filters, setFilters] = useState<BoundaryFilters>({});
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  // Calculate metrics
  const metrics = useMemo(
    () => calculateMetrics(tables, sensitiveFields, violations.length),
    [tables, sensitiveFields, violations]
  );

  // Process tables
  const tableList = useMemo(() => Object.values(tables), [tables]);
  
  const filteredTables = useMemo(
    () => filterTables(tableList, filters),
    [tableList, filters]
  );

  const sortedTables = useMemo(
    () => sortTables(filteredTables, { field: 'accessCount', direction: 'desc' }),
    [filteredTables]
  );

  // Process file groups
  const fileGroups = useMemo(() => groupByFile(tables), [tables]);

  // Process sensitive fields
  const filteredSensitiveFields = useMemo(
    () => filterSensitiveFields(sensitiveFields, filters),
    [sensitiveFields, filters]
  );

  // Get selected table info
  const selectedTableInfo = selectedTable ? tables[selectedTable] : null;

  // Handle table selection
  const handleSelectTable = (name: string) => {
    setSelectedTable(prev => prev === name ? null : name);
  };

  // Handle rules save
  const handleSaveRules = (newRules: BoundaryRulesConfig) => {
    onSaveRules?.(newRules);
  };

  // Available tables and fields for rule editor
  const availableTables = useMemo(() => Object.keys(tables), [tables]);
  const availableFields = useMemo(() => {
    const fields: string[] = [];
    for (const [tableName, table] of Object.entries(tables)) {
      for (const field of table.fields) {
        fields.push(`${tableName}.${field}`);
      }
    }
    return fields;
  }, [tables]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-dark-border">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-bold">Data Boundaries</h1>
            <p className="text-dark-muted">
              Track which code accesses which database tables and fields
            </p>
          </div>
          
          {/* Tab Toggle */}
          <div className="flex bg-dark-bg rounded-lg p-1">
            <button
              onClick={() => setTabMode('overview')}
              className={`px-4 py-2 rounded text-sm transition-colors ${
                tabMode === 'overview'
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-dark-muted hover:text-dark-text'
              }`}
            >
              📊 Overview
            </button>
            <button
              onClick={() => setTabMode('rules')}
              className={`px-4 py-2 rounded text-sm transition-colors ${
                tabMode === 'rules'
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-dark-muted hover:text-dark-text'
              }`}
            >
              📋 Rules
            </button>
          </div>
        </div>
      </div>

      {tabMode === 'rules' ? (
        <RuleEditor
          rules={rules}
          onSave={handleSaveRules}
          availableTables={availableTables}
          availableFields={availableFields}
        />
      ) : (
        <>
          {/* Stats */}
          <div className="p-6 border-b border-dark-border">
            <BoundaryStats metrics={metrics} />
          </div>

          {/* Filters */}
          <div className="px-6 pt-4">
            <BoundaryFiltersComponent
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              filters={filters}
              onFiltersChange={setFilters}
            />
          </div>

          {/* Main Content */}
          <div className="flex-1 flex min-h-0">
            {/* List Panel */}
            <div className="w-1/2 border-r border-dark-border overflow-y-auto p-6">
              <BoundaryList
                tables={sortedTables}
                fileGroups={fileGroups}
                sensitiveFields={filteredSensitiveFields}
                viewMode={viewMode}
                selectedTable={selectedTable}
                onSelectTable={handleSelectTable}
              />
            </div>

            {/* Detail Panel */}
            <div className="w-1/2 overflow-hidden">
              {selectedTableInfo ? (
                <BoundaryDetail
                  table={selectedTableInfo}
                  violations={violations}
                  onClose={() => setSelectedTable(null)}
                />
              ) : (
                <BoundaryDetailEmpty />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
