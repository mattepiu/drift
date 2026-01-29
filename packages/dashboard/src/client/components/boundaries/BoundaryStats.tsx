/**
 * Boundary Stats Component
 * 
 * Displays summary statistics for data boundaries.
 */

import { SENSITIVITY_CONFIG, OPERATION_CONFIG } from './constants';

import type { BoundaryMetrics } from './types';

interface BoundaryStatsProps {
  metrics: BoundaryMetrics;
}

export function BoundaryStats({ metrics }: BoundaryStatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {/* Tables */}
      <div className="bg-dark-surface border border-dark-border rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">🗄️</span>
          <span className="text-dark-muted text-sm">Tables</span>
        </div>
        <div className="text-2xl font-bold">{metrics.totalTables}</div>
      </div>

      {/* Access Points */}
      <div className="bg-dark-surface border border-dark-border rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">🔗</span>
          <span className="text-dark-muted text-sm">Access Points</span>
        </div>
        <div className="text-2xl font-bold">{metrics.totalAccessPoints}</div>
        <div className="flex gap-2 mt-2 text-xs">
          <span className={OPERATION_CONFIG.read.color}>
            {OPERATION_CONFIG.read.icon} {metrics.byOperation.read}
          </span>
          <span className={OPERATION_CONFIG.write.color}>
            {OPERATION_CONFIG.write.icon} {metrics.byOperation.write}
          </span>
          <span className={OPERATION_CONFIG.delete.color}>
            {OPERATION_CONFIG.delete.icon} {metrics.byOperation.delete}
          </span>
        </div>
      </div>

      {/* Sensitive Fields */}
      <div className="bg-dark-surface border border-dark-border rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">🔒</span>
          <span className="text-dark-muted text-sm">Sensitive Fields</span>
        </div>
        <div className="text-2xl font-bold text-yellow-400">
          {metrics.totalSensitiveFields}
        </div>
        {metrics.totalSensitiveFields > 0 && (
          <div className="flex flex-wrap gap-1 mt-2 text-xs">
            {metrics.bySensitivityType.credentials > 0 && (
              <span className={SENSITIVITY_CONFIG.credentials.color}>
                {SENSITIVITY_CONFIG.credentials.icon} {metrics.bySensitivityType.credentials}
              </span>
            )}
            {metrics.bySensitivityType.pii > 0 && (
              <span className={SENSITIVITY_CONFIG.pii.color}>
                {SENSITIVITY_CONFIG.pii.icon} {metrics.bySensitivityType.pii}
              </span>
            )}
            {metrics.bySensitivityType.financial > 0 && (
              <span className={SENSITIVITY_CONFIG.financial.color}>
                {SENSITIVITY_CONFIG.financial.icon} {metrics.bySensitivityType.financial}
              </span>
            )}
            {metrics.bySensitivityType.health > 0 && (
              <span className={SENSITIVITY_CONFIG.health.color}>
                {SENSITIVITY_CONFIG.health.icon} {metrics.bySensitivityType.health}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Violations */}
      <div className="bg-dark-surface border border-dark-border rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">⚠️</span>
          <span className="text-dark-muted text-sm">Violations</span>
        </div>
        <div className={`text-2xl font-bold ${metrics.totalViolations > 0 ? 'text-red-400' : 'text-green-400'}`}>
          {metrics.totalViolations}
        </div>
        {metrics.totalViolations === 0 && (
          <div className="text-xs text-green-400 mt-2">✓ All boundaries respected</div>
        )}
      </div>
    </div>
  );
}
