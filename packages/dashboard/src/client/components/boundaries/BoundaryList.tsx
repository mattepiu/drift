/**
 * Boundary List Components
 * 
 * List views for tables, files, and sensitive fields.
 */

import { useState } from 'react';

import { OPERATION_CONFIG, SENSITIVITY_CONFIG } from './constants';
import { calculateTableMetrics, truncatePath, type FileGroup } from './utils';

import type { TableInfo, SensitiveField, ViewMode } from './types';

// ============================================================================
// Table Card
// ============================================================================

interface TableCardProps {
  table: TableInfo;
  isSelected: boolean;
  onSelect: () => void;
}

function TableCard({ table, isSelected, onSelect }: TableCardProps) {
  const metrics = calculateTableMetrics(table);
  const hasSensitive = table.sensitiveFields.length > 0;

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-4 rounded-lg border transition-all ${
        isSelected
          ? 'bg-blue-500/10 border-blue-500/30'
          : 'bg-dark-surface border-dark-border hover:border-dark-muted'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className="text-xl">🗄️</span>
          <span className="font-mono font-medium">{table.name}</span>
          {table.model && (
            <span className="text-xs text-dark-muted">({table.model})</span>
          )}
        </div>
        {hasSensitive && (
          <span className="px-2 py-1 rounded text-xs bg-yellow-500/20 text-yellow-400">
            🔒 {table.sensitiveFields.length} sensitive
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 text-xs text-dark-muted">
        <span title="Access points">
          🔗 {metrics.accessCount} access points
        </span>
        <span title="Files accessing this table">
          📁 {metrics.fileCount} files
        </span>
        <span className={OPERATION_CONFIG.read.color}>
          {OPERATION_CONFIG.read.icon} {metrics.readCount}
        </span>
        <span className={OPERATION_CONFIG.write.color}>
          {OPERATION_CONFIG.write.icon} {metrics.writeCount}
        </span>
        {metrics.deleteCount > 0 && (
          <span className={OPERATION_CONFIG.delete.color}>
            {OPERATION_CONFIG.delete.icon} {metrics.deleteCount}
          </span>
        )}
      </div>
    </button>
  );
}

// ============================================================================
// File Card
// ============================================================================

interface FileCardProps {
  group: FileGroup;
  isExpanded: boolean;
  onToggle: () => void;
}

function FileCard({ group, isExpanded, onToggle }: FileCardProps) {
  return (
    <div className="border border-dark-border rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full text-left p-4 bg-dark-surface hover:bg-dark-border/30 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-dark-muted">{isExpanded ? '▼' : '▶'}</span>
            <span className="text-lg">📁</span>
            <span className="font-mono text-sm" title={group.file}>
              {truncatePath(group.file, 50)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-dark-bg rounded text-xs text-dark-muted">
              {group.metrics.tableCount} tables
            </span>
            <span className="px-2 py-0.5 bg-dark-bg rounded text-xs text-dark-muted">
              {group.metrics.accessCount} access
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-2 ml-10 text-xs text-dark-muted">
          <span className={OPERATION_CONFIG.read.color}>
            {OPERATION_CONFIG.read.icon} {group.metrics.readCount}
          </span>
          <span className={OPERATION_CONFIG.write.color}>
            {OPERATION_CONFIG.write.icon} {group.metrics.writeCount}
          </span>
          {group.metrics.deleteCount > 0 && (
            <span className={OPERATION_CONFIG.delete.color}>
              {OPERATION_CONFIG.delete.icon} {group.metrics.deleteCount}
            </span>
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-dark-border bg-dark-bg p-3">
          <div className="text-xs text-dark-muted mb-2">Tables accessed:</div>
          <div className="flex flex-wrap gap-2 mb-3">
            {group.tables.map(table => (
              <span key={table} className="px-2 py-1 bg-dark-surface rounded font-mono text-xs">
                {table}
              </span>
            ))}
          </div>
          <div className="text-xs text-dark-muted mb-2">Access points:</div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {group.accessPoints.slice(0, 20).map((ap, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs">
                <span className={`px-1.5 py-0.5 rounded ${OPERATION_CONFIG[ap.operation].bgColor} ${OPERATION_CONFIG[ap.operation].color}`}>
                  {ap.operation}
                </span>
                <span className="font-mono">{ap.table}</span>
                <span className="text-dark-muted">line {ap.line}</span>
              </div>
            ))}
            {group.accessPoints.length > 20 && (
              <div className="text-dark-muted text-xs">
                ... and {group.accessPoints.length - 20} more
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Sensitive Field Card
// ============================================================================

interface SensitiveFieldCardProps {
  field: SensitiveField;
}

function SensitiveFieldCard({ field }: SensitiveFieldCardProps) {
  const config = SENSITIVITY_CONFIG[field.sensitivityType];

  return (
    <div className="p-4 bg-dark-surface border border-dark-border rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className={`px-2 py-1 rounded text-xs ${config.bgColor} ${config.color}`}>
            {config.icon} {config.label}
          </span>
          <span className="font-mono font-medium">
            {field.table ? `${field.table}.` : ''}{field.field}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-4 text-xs text-dark-muted">
        <span title="File location">
          📁 {truncatePath(field.file, 40)}:{field.line}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// Main List Component
// ============================================================================

interface BoundaryListProps {
  tables: TableInfo[];
  fileGroups: FileGroup[];
  sensitiveFields: SensitiveField[];
  viewMode: ViewMode;
  selectedTable: string | null;
  onSelectTable: (name: string) => void;
}

export function BoundaryList({
  tables,
  fileGroups,
  sensitiveFields,
  viewMode,
  selectedTable,
  onSelectTable,
}: BoundaryListProps) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const toggleFile = (file: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(file)) {
        next.delete(file);
      } else {
        next.add(file);
      }
      return next;
    });
  };

  // Empty state
  if (viewMode === 'tables' && tables.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <span className="text-4xl mb-4">🗄️</span>
        <h3 className="text-lg font-medium mb-2">No tables found</h3>
        <p className="text-dark-muted text-sm max-w-md">
          Run <code className="bg-dark-bg px-2 py-0.5 rounded font-mono text-xs">drift scan</code> to detect data access patterns
        </p>
      </div>
    );
  }

  if (viewMode === 'files' && fileGroups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <span className="text-4xl mb-4">📁</span>
        <h3 className="text-lg font-medium mb-2">No data access found</h3>
        <p className="text-dark-muted text-sm max-w-md">
          No files with data access patterns detected
        </p>
      </div>
    );
  }

  if (viewMode === 'sensitive' && sensitiveFields.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <span className="text-4xl mb-4">✅</span>
        <h3 className="text-lg font-medium mb-2">No sensitive fields detected</h3>
        <p className="text-dark-muted text-sm max-w-md">
          No PII, credentials, financial, or health data patterns found
        </p>
      </div>
    );
  }

  // Tables view
  if (viewMode === 'tables') {
    return (
      <div className="space-y-2">
        {tables.map((table) => (
          <TableCard
            key={table.name}
            table={table}
            isSelected={selectedTable === table.name}
            onSelect={() => onSelectTable(table.name)}
          />
        ))}
      </div>
    );
  }

  // Files view
  if (viewMode === 'files') {
    return (
      <div className="space-y-3">
        {fileGroups.map((group) => (
          <FileCard
            key={group.file}
            group={group}
            isExpanded={expandedFiles.has(group.file)}
            onToggle={() => toggleFile(group.file)}
          />
        ))}
      </div>
    );
  }

  // Sensitive fields view
  return (
    <div className="space-y-2">
      {sensitiveFields.map((field, idx) => (
        <SensitiveFieldCard key={`${field.file}:${field.line}:${idx}`} field={field} />
      ))}
    </div>
  );
}
