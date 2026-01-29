/**
 * Contract Statistics Component
 * 
 * Enterprise-grade statistics dashboard for contract overview.
 */

import { METHOD_ORDER, METHOD_CONFIG, STATUS_CONFIG, MISMATCH_TYPE_CONFIG } from './constants';
import { formatPercentage } from './utils';

import type { ContractStatistics } from './types';

// ============================================================================
// Stat Card
// ============================================================================

interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  icon?: string;
  color?: string;
}

function StatCard({ label, value, subValue, icon, color = 'text-dark-text' }: StatCardProps) {
  return (
    <div className="p-4 bg-dark-surface border border-dark-border rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-dark-muted uppercase tracking-wide">{label}</span>
        {icon && <span className="text-lg">{icon}</span>}
      </div>
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
      {subValue && (
        <div className="text-xs text-dark-muted mt-1">{subValue}</div>
      )}
    </div>
  );
}

// ============================================================================
// Health Score Gauge
// ============================================================================

interface HealthGaugeProps {
  score: number;
}

function HealthGauge({ score }: HealthGaugeProps) {
  const color = score >= 80 ? 'text-status-approved' : score >= 50 ? 'text-severity-warning' : 'text-severity-error';
  const bgColor = score >= 80 ? 'bg-status-approved' : score >= 50 ? 'bg-severity-warning' : 'bg-severity-error';
  
  return (
    <div className="p-4 bg-dark-surface border border-dark-border rounded-lg">
      <div className="text-xs text-dark-muted uppercase tracking-wide mb-3">Contract Health</div>
      <div className="flex items-center gap-4">
        <div className={`text-3xl font-bold ${color}`}>{score}</div>
        <div className="flex-1">
          <div className="h-2 bg-dark-bg rounded-full overflow-hidden">
            <div 
              className={`h-full ${bgColor} transition-all`}
              style={{ width: `${score}%` }}
            />
          </div>
          <div className="text-xs text-dark-muted mt-1">
            {score >= 80 ? 'Healthy' : score >= 50 ? 'Needs attention' : 'Critical issues'}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Status Breakdown
// ============================================================================

interface StatusBreakdownProps {
  byStatus: Record<string, number>;
  total: number;
}

function StatusBreakdown({ byStatus, total }: StatusBreakdownProps) {
  return (
    <div className="p-4 bg-dark-surface border border-dark-border rounded-lg">
      <div className="text-xs text-dark-muted uppercase tracking-wide mb-3">By Status</div>
      <div className="space-y-2">
        {Object.entries(byStatus).map(([status, count]) => {
          const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];
          const percentage = total > 0 ? (count / total) * 100 : 0;
          
          return (
            <div key={status} className="flex items-center gap-3">
              <span className="text-sm w-6">{config?.icon}</span>
              <div className="flex-1">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className={config?.color}>{config?.label || status}</span>
                  <span className="text-dark-muted">{count}</span>
                </div>
                <div className="h-1.5 bg-dark-bg rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all ${
                      status === 'verified' ? 'bg-status-approved' :
                      status === 'mismatch' ? 'bg-severity-error' :
                      status === 'ignored' ? 'bg-dark-muted' :
                      'bg-blue-500'
                    }`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Method Breakdown
// ============================================================================

interface MethodBreakdownProps {
  byMethod: Record<string, number>;
}

function MethodBreakdown({ byMethod }: MethodBreakdownProps) {
  return (
    <div className="p-4 bg-dark-surface border border-dark-border rounded-lg">
      <div className="text-xs text-dark-muted uppercase tracking-wide mb-3">By Method</div>
      <div className="flex gap-2 flex-wrap">
        {METHOD_ORDER.map(method => {
          const count = byMethod[method] || 0;
          if (count === 0) {return null;}
          const config = METHOD_CONFIG[method];
          
          return (
            <div 
              key={method}
              className={`px-3 py-2 rounded-lg ${config.bgColor} border border-dark-border`}
            >
              <div className={`font-mono text-sm font-bold ${config.color}`}>{method}</div>
              <div className="text-xs text-dark-muted">{count}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Mismatch Summary
// ============================================================================

interface MismatchSummaryProps {
  mismatchesByType: Record<string, number>;
  mismatchesBySeverity: { error: number; warning: number; info: number };
  total: number;
}

function MismatchSummary({ mismatchesByType, mismatchesBySeverity, total }: MismatchSummaryProps) {
  if (total === 0) {
    return (
      <div className="p-4 bg-status-approved/10 border border-status-approved/20 rounded-lg">
        <div className="flex items-center gap-3">
          <span className="text-2xl">✅</span>
          <div>
            <div className="font-medium text-status-approved">No Mismatches</div>
            <div className="text-xs text-dark-muted">All contracts are type-safe</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-severity-error/10 border border-severity-error/20 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-dark-muted uppercase tracking-wide">Mismatches</div>
        <span className="text-lg font-semibold text-severity-error">{total}</span>
      </div>
      
      {/* By severity */}
      <div className="flex gap-4 mb-3 text-sm">
        {mismatchesBySeverity.error > 0 && (
          <span className="text-severity-error">🔴 {mismatchesBySeverity.error} errors</span>
        )}
        {mismatchesBySeverity.warning > 0 && (
          <span className="text-severity-warning">🟡 {mismatchesBySeverity.warning} warnings</span>
        )}
        {mismatchesBySeverity.info > 0 && (
          <span className="text-severity-info">🔵 {mismatchesBySeverity.info} info</span>
        )}
      </div>

      {/* By type */}
      <div className="space-y-1">
        {Object.entries(mismatchesByType).map(([type, count]) => {
          const config = MISMATCH_TYPE_CONFIG[type as keyof typeof MISMATCH_TYPE_CONFIG];
          if (!config) {return null;}
          
          return (
            <div key={type} className="flex items-center justify-between text-xs">
              <span className={config.color}>{config.icon} {config.label}</span>
              <span className="text-dark-muted">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Main Stats Component
// ============================================================================

interface ContractStatsProps {
  statistics: ContractStatistics;
}

export function ContractStats({ statistics }: ContractStatsProps) {
  return (
    <div className="space-y-4">
      {/* Primary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Total Contracts"
          value={statistics.total}
          icon="🔗"
        />
        <StatCard
          label="Verified"
          value={statistics.byStatus.verified || 0}
          subValue={formatPercentage(statistics.verifiedRate)}
          icon="✓"
          color="text-status-approved"
        />
        <StatCard
          label="With Mismatches"
          value={statistics.byStatus.mismatch || 0}
          icon="⚠️"
          color={statistics.byStatus.mismatch > 0 ? 'text-severity-error' : 'text-dark-text'}
        />
        <HealthGauge score={statistics.healthScore} />
      </div>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatusBreakdown byStatus={statistics.byStatus} total={statistics.total} />
        <MethodBreakdown byMethod={statistics.byMethod} />
        <MismatchSummary 
          mismatchesByType={statistics.mismatchesByType}
          mismatchesBySeverity={statistics.mismatchesBySeverity}
          total={statistics.totalMismatches}
        />
      </div>

      {/* Top Mismatched Endpoints */}
      {statistics.topMismatchedEndpoints.length > 0 && (
        <div className="p-4 bg-dark-surface border border-dark-border rounded-lg">
          <div className="text-xs text-dark-muted uppercase tracking-wide mb-3">
            Top Mismatched Endpoints
          </div>
          <div className="space-y-2">
            {statistics.topMismatchedEndpoints.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className={`font-mono text-xs font-bold ${METHOD_CONFIG[item.method].color}`}>
                    {item.method}
                  </span>
                  <span className="font-mono text-dark-muted truncate">{item.endpoint}</span>
                </div>
                <span className="text-severity-error font-medium">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
