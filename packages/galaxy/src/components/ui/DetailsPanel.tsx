/**
 * DetailsPanel Component
 * 
 * Displays detailed information about the selected node.
 * Shows table fields, entry point details, or path information.
 */

import { SENSITIVITY_COLORS, AUTH_LEVEL_COLORS } from '../../constants/index.js';
import { useGalaxyStore, useSelectedTable, useSelectedEntryPoint, useSelectedTablePaths } from '../../store/index.js';

// ============================================================================
// Component
// ============================================================================

export function DetailsPanel() {
  const { isPanelOpen, activePanel, closePanel, selection } = useGalaxyStore();
  const selectedTable = useSelectedTable();
  const selectedEntryPoint = useSelectedEntryPoint();
  const tablePaths = useSelectedTablePaths();
  
  if (!isPanelOpen || activePanel !== 'details') {return null;}
  
  return (
    <div className="absolute right-4 top-4 w-80 max-h-[calc(100vh-8rem)] overflow-y-auto bg-slate-900/95 backdrop-blur-sm rounded-lg border border-slate-700 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <h2 className="text-lg font-semibold text-white">Details</h2>
        <button
          onClick={closePanel}
          className="text-slate-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      {/* Content */}
      <div className="p-4">
        {selectedTable && <TableDetails table={selectedTable} paths={tablePaths} />}
        {selectedEntryPoint && <EntryPointDetails entryPoint={selectedEntryPoint} />}
        {!selectedTable && !selectedEntryPoint && (
          <p className="text-slate-400 text-sm">Select a node to view details</p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Table Details
// ============================================================================

interface TableDetailsProps {
  table: NonNullable<ReturnType<typeof useSelectedTable>>;
  paths: ReturnType<typeof useSelectedTablePaths>;
}

function TableDetails({ table, paths }: TableDetailsProps) {
  const sensitiveFields = table.fields.filter(f => f.sensitivity !== 'public' && f.sensitivity !== 'low');
  const untestedPaths = paths.filter(p => !p.isTested);
  
  return (
    <div className="space-y-4">
      {/* Table name and sensitivity */}
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-xl font-bold text-white">{table.name}</h3>
          <span
            className="px-2 py-0.5 rounded text-xs font-medium"
            style={{ backgroundColor: SENSITIVITY_COLORS[table.sensitivity] + '33', color: SENSITIVITY_COLORS[table.sensitivity] }}
          >
            {table.sensitivity}
          </span>
        </div>
        {table.schema && <p className="text-slate-400 text-sm">{table.schema}</p>}
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Fields" value={table.fields.length} />
        <StatCard label="Accesses" value={table.accessCount} />
        <StatCard label="Sensitive" value={sensitiveFields.length} color={sensitiveFields.length > 0 ? '#f59e0b' : undefined} />
        <StatCard label="Untested Paths" value={untestedPaths.length} color={untestedPaths.length > 0 ? '#ef4444' : undefined} />
      </div>
      
      {/* Fields list */}
      <div>
        <h4 className="text-sm font-medium text-slate-300 mb-2">Fields ({table.fields.length})</h4>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {table.fields.map(field => (
            <div
              key={field.id}
              className="flex items-center justify-between p-2 rounded bg-slate-800/50 text-sm"
            >
              <div className="flex items-center gap-2">
                {field.isPrimaryKey && <span title="Primary Key">🔑</span>}
                {field.isForeignKey && <span title="Foreign Key">🔗</span>}
                <span className="text-white">{field.name}</span>
                <span className="text-slate-500">{field.dataType}</span>
              </div>
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: SENSITIVITY_COLORS[field.sensitivity] }}
                title={field.sensitivity}
              />
            </div>
          ))}
        </div>
      </div>
      
      {/* Access paths */}
      {paths.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-slate-300 mb-2">Access Paths ({paths.length})</h4>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {paths.slice(0, 10).map(path => (
              <div
                key={path.id}
                className="flex items-center justify-between p-2 rounded bg-slate-800/50 text-sm"
              >
                <span className="text-slate-300">{path.operation}</span>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">depth: {path.depth}</span>
                  {!path.isTested && <span className="text-red-400 text-xs">untested</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Entry Point Details
// ============================================================================

interface EntryPointDetailsProps {
  entryPoint: NonNullable<ReturnType<typeof useSelectedEntryPoint>>;
}

function EntryPointDetails({ entryPoint }: EntryPointDetailsProps) {
  return (
    <div className="space-y-4">
      {/* Path and method */}
      <div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs font-bold ${getMethodClass(entryPoint.method)}`}>
            {entryPoint.method}
          </span>
          <h3 className="text-lg font-bold text-white truncate">{entryPoint.path}</h3>
        </div>
        <p className="text-slate-400 text-sm mt-1">{entryPoint.framework}</p>
      </div>
      
      {/* Auth level warning */}
      {entryPoint.authLevel === 'public' && (
        <div className="p-3 rounded bg-red-500/20 border border-red-500/50">
          <div className="flex items-center gap-2 text-red-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="font-medium">Public Endpoint</span>
          </div>
          <p className="text-red-300 text-sm mt-1">This endpoint is accessible without authentication</p>
        </div>
      )}
      
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Auth Level"
          value={entryPoint.authLevel}
          color={AUTH_LEVEL_COLORS[entryPoint.authLevel]}
        />
        <StatCard label="Security Tier" value={entryPoint.securityTier} />
        <StatCard label="Reachable Tables" value={entryPoint.reachableTables.length} />
      </div>
      
      {/* Source location */}
      <div>
        <h4 className="text-sm font-medium text-slate-300 mb-2">Source</h4>
        <div className="p-2 rounded bg-slate-800/50 text-sm font-mono">
          <span className="text-slate-400">{entryPoint.file}</span>
          <span className="text-slate-500">:{entryPoint.line}</span>
        </div>
      </div>
      
      {/* Reachable tables */}
      {entryPoint.reachableTables.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-slate-300 mb-2">Reachable Tables</h4>
          <div className="flex flex-wrap gap-1">
            {entryPoint.reachableTables.map(tableId => (
              <span
                key={tableId}
                className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-xs"
              >
                {tableId}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

interface StatCardProps {
  label: string;
  value: string | number;
  color?: string;
}

function StatCard({ label, value, color }: StatCardProps) {
  return (
    <div className="p-3 rounded bg-slate-800/50">
      <p className="text-slate-400 text-xs">{label}</p>
      <p className="text-lg font-semibold" style={{ color: color || '#f8fafc' }}>
        {value}
      </p>
    </div>
  );
}

function getMethodClass(method: string): string {
  const classes: Record<string, string> = {
    GET: 'bg-green-500/20 text-green-400',
    POST: 'bg-blue-500/20 text-blue-400',
    PUT: 'bg-amber-500/20 text-amber-400',
    PATCH: 'bg-purple-500/20 text-purple-400',
    DELETE: 'bg-red-500/20 text-red-400',
    ALL: 'bg-slate-500/20 text-slate-400',
  };
  return classes[method] || classes.ALL;
}
