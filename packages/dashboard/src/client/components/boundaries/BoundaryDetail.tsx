/**
 * Boundary Detail Component
 * 
 * Detailed view of a selected table's data access.
 */

import { OPERATION_CONFIG, SENSITIVITY_CONFIG } from './constants';
import { truncatePath } from './utils';

import type { TableInfo, DataAccessPoint, BoundaryViolation } from './types';

// ============================================================================
// Empty State
// ============================================================================

export function BoundaryDetailEmpty() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <span className="text-4xl mb-4">👈</span>
      <h3 className="text-lg font-medium mb-2">Select a table</h3>
      <p className="text-dark-muted text-sm">
        Choose a table from the list to view its access details
      </p>
    </div>
  );
}

// ============================================================================
// Access Point Row
// ============================================================================

interface AccessPointRowProps {
  accessPoint: DataAccessPoint;
}

function AccessPointRow({ accessPoint }: AccessPointRowProps) {
  const opConfig = OPERATION_CONFIG[accessPoint.operation];

  return (
    <div className="flex items-start gap-3 p-3 bg-dark-bg rounded-lg">
      <span className={`px-2 py-1 rounded text-xs font-medium ${opConfig.bgColor} ${opConfig.color}`}>
        {accessPoint.operation}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-sm" title={accessPoint.file}>
            {truncatePath(accessPoint.file, 40)}
          </span>
          <span className="text-dark-muted text-xs">line {accessPoint.line}</span>
          {accessPoint.isRawSql && (
            <span className="px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded text-xs">
              raw SQL
            </span>
          )}
        </div>
        {accessPoint.fields.length > 0 && (
          <div className="text-xs text-dark-muted">
            Fields: {accessPoint.fields.join(', ')}
          </div>
        )}
        {accessPoint.context && (
          <div className="mt-2 p-2 bg-dark-surface rounded text-xs font-mono text-dark-muted overflow-x-auto">
            {accessPoint.context}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Violation Row
// ============================================================================

interface ViolationRowProps {
  violation: BoundaryViolation;
}

function ViolationRow({ violation }: ViolationRowProps) {
  const severityColors = {
    error: 'text-red-400 bg-red-500/20',
    warning: 'text-yellow-400 bg-yellow-500/20',
    info: 'text-blue-400 bg-blue-500/20',
    hint: 'text-gray-400 bg-gray-500/20',
  };

  return (
    <div className="p-3 bg-dark-bg rounded-lg border-l-2 border-red-500">
      <div className="flex items-center gap-2 mb-2">
        <span className={`px-2 py-0.5 rounded text-xs ${severityColors[violation.severity]}`}>
          {violation.severity}
        </span>
        <span className="font-mono text-sm">{violation.ruleId}</span>
      </div>
      <p className="text-sm mb-2">{violation.message}</p>
      <div className="text-xs text-dark-muted">
        📁 {truncatePath(violation.file, 40)}:{violation.line}
      </div>
      {violation.suggestion && (
        <div className="mt-2 p-2 bg-dark-surface rounded text-xs text-dark-muted">
          💡 {violation.suggestion}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Detail Component
// ============================================================================

interface BoundaryDetailProps {
  table: TableInfo;
  violations: BoundaryViolation[];
  onClose: () => void;
}

export function BoundaryDetail({ table, violations, onClose }: BoundaryDetailProps) {
  const tableViolations = violations.filter(v => v.table === table.name);

  // Group access points by file
  const byFile = new Map<string, DataAccessPoint[]>();
  for (const ap of table.accessedBy) {
    if (!byFile.has(ap.file)) {
      byFile.set(ap.file, []);
    }
    byFile.get(ap.file)!.push(ap);
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-dark-border">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🗄️</span>
          <div>
            <h2 className="text-lg font-bold font-mono">{table.name}</h2>
            {table.model && (
              <p className="text-sm text-dark-muted">Model: {table.model}</p>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-dark-border rounded transition-colors"
          title="Close"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Fields */}
        {table.fields.length > 0 && (
          <section>
            <h3 className="text-sm font-medium text-dark-muted mb-3">Fields</h3>
            <div className="flex flex-wrap gap-2">
              {table.fields.map(field => (
                <span key={field} className="px-2 py-1 bg-dark-bg rounded font-mono text-xs">
                  {field}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Sensitive Fields */}
        {table.sensitiveFields.length > 0 && (
          <section>
            <h3 className="text-sm font-medium text-yellow-400 mb-3">
              🔒 Sensitive Fields ({table.sensitiveFields.length})
            </h3>
            <div className="space-y-2">
              {table.sensitiveFields.map((field, idx) => {
                const config = SENSITIVITY_CONFIG[field.sensitivityType];
                return (
                  <div key={idx} className="flex items-center gap-3 p-2 bg-dark-bg rounded">
                    <span className={`px-2 py-0.5 rounded text-xs ${config.bgColor} ${config.color}`}>
                      {config.icon} {config.label}
                    </span>
                    <span className="font-mono text-sm">{field.field}</span>
                    <span className="text-xs text-dark-muted">
                      {truncatePath(field.file, 30)}:{field.line}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Violations */}
        {tableViolations.length > 0 && (
          <section>
            <h3 className="text-sm font-medium text-red-400 mb-3">
              ⚠️ Violations ({tableViolations.length})
            </h3>
            <div className="space-y-2">
              {tableViolations.map(violation => (
                <ViolationRow key={violation.id} violation={violation} />
              ))}
            </div>
          </section>
        )}

        {/* Access Points by File */}
        <section>
          <h3 className="text-sm font-medium text-dark-muted mb-3">
            Access Points ({table.accessedBy.length})
          </h3>
          <div className="space-y-4">
            {Array.from(byFile.entries()).map(([file, accessPoints]) => (
              <div key={file}>
                <div className="text-xs text-dark-muted mb-2 font-mono">
                  📁 {file}
                </div>
                <div className="space-y-2 ml-4">
                  {accessPoints.map((ap, idx) => (
                    <AccessPointRow key={idx} accessPoint={ap} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
