/**
 * Pattern Statistics Component
 * 
 * Enterprise-grade statistics dashboard for pattern overview.
 */


import { STATUS_CONFIG, CONFIDENCE_CONFIG } from './constants';
import { formatPercentage } from './utils';

import type { PatternStatistics } from './types';

interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  icon?: string;
  color?: string;
  trend?: 'up' | 'down' | 'neutral';
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
                      status === 'approved' ? 'bg-status-approved' :
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

interface ConfidenceBreakdownProps {
  byConfidenceLevel: {
    high: number;
    medium: number;
    low: number;
    uncertain: number;
  };
  total: number;
}

function ConfidenceBreakdown({ byConfidenceLevel, total }: ConfidenceBreakdownProps) {
  const levels = ['high', 'medium', 'low', 'uncertain'] as const;
  
  return (
    <div className="p-4 bg-dark-surface border border-dark-border rounded-lg">
      <div className="text-xs text-dark-muted uppercase tracking-wide mb-3">By Confidence</div>
      <div className="flex gap-1 h-8 rounded overflow-hidden">
        {levels.map(level => {
          const count = byConfidenceLevel[level];
          const percentage = total > 0 ? (count / total) * 100 : 0;
          const config = CONFIDENCE_CONFIG[level];
          
          if (percentage === 0) {return null;}
          
          return (
            <div
              key={level}
              className={`${config.bgColor} flex items-center justify-center transition-all`}
              style={{ width: `${percentage}%` }}
              title={`${config.label}: ${count} (${Math.round(percentage)}%)`}
            >
              {percentage > 15 && (
                <span className={`text-xs font-medium ${config.color}`}>{count}</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-2 text-xs">
        {levels.map(level => {
          const config = CONFIDENCE_CONFIG[level];
          const count = byConfidenceLevel[level];
          if (count === 0) {return null;}
          
          return (
            <div key={level} className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full ${config.bgColor}`} />
              <span className="text-dark-muted">{config.label.split(' ')[0]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface PatternStatsProps {
  statistics: PatternStatistics;
  onQuickReview?: () => void;
  onNeedsReview?: () => void;
}

export function PatternStats({ 
  statistics, 
  onQuickReview, 
  onNeedsReview 
}: PatternStatsProps) {
  return (
    <div className="space-y-4">
      {/* Primary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Total Patterns"
          value={statistics.total}
          icon="📊"
        />
        <StatCard
          label="Compliance Rate"
          value={formatPercentage(statistics.complianceRate)}
          subValue={`${statistics.totalOutliers} outliers`}
          icon="✓"
          color={statistics.complianceRate >= 0.9 ? 'text-status-approved' : 'text-severity-warning'}
        />
        <StatCard
          label="Avg Confidence"
          value={formatPercentage(statistics.avgConfidence)}
          icon="🎯"
          color={statistics.avgConfidence >= 0.8 ? 'text-status-approved' : 'text-severity-warning'}
        />
        <StatCard
          label="Categories"
          value={Object.keys(statistics.byCategory).length}
          icon="📁"
        />
      </div>

      {/* Action Cards */}
      {(statistics.readyForApproval > 0 || statistics.needsReview > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {statistics.readyForApproval > 0 && (
            <button
              onClick={onQuickReview}
              className="p-4 bg-status-approved/10 border border-status-approved/20 rounded-lg text-left hover:bg-status-approved/20 transition-colors group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-status-approved">
                    ⚡ Quick Approve
                  </div>
                  <div className="text-xs text-dark-muted mt-1">
                    {statistics.readyForApproval} high-confidence patterns ready
                  </div>
                </div>
                <span className="text-2xl font-semibold text-status-approved group-hover:scale-110 transition-transform">
                  {statistics.readyForApproval}
                </span>
              </div>
            </button>
          )}
          
          {statistics.needsReview > 0 && (
            <button
              onClick={onNeedsReview}
              className="p-4 bg-severity-warning/10 border border-severity-warning/20 rounded-lg text-left hover:bg-severity-warning/20 transition-colors group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-severity-warning">
                    🔍 Needs Review
                  </div>
                  <div className="text-xs text-dark-muted mt-1">
                    {statistics.needsReview} patterns need attention
                  </div>
                </div>
                <span className="text-2xl font-semibold text-severity-warning group-hover:scale-110 transition-transform">
                  {statistics.needsReview}
                </span>
              </div>
            </button>
          )}
        </div>
      )}

      {/* Breakdowns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <StatusBreakdown byStatus={statistics.byStatus} total={statistics.total} />
        <ConfidenceBreakdown byConfidenceLevel={statistics.byConfidenceLevel} total={statistics.total} />
      </div>
    </div>
  );
}
