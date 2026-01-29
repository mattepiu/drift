/**
 * Trends Panel Component
 * 
 * Displays pattern regressions and improvements over time.
 */

import React, { useState } from 'react';

import { useTrends } from '../../hooks';

type Period = '7d' | '30d' | '90d';

interface TrendItemProps {
  patternName: string;
  category: string;
  type: 'regression' | 'improvement';
  metric: string;
  previousValue: number;
  currentValue: number;
  changePercent: number;
  severity: 'critical' | 'warning' | 'info';
  details: string;
}

function TrendItem({ 
  patternName, 
  category, 
  type, 
  previousValue, 
  currentValue, 
  changePercent,
  severity,
  details 
}: TrendItemProps) {
  const isRegression = type === 'regression';
  
  const severityStyles = {
    critical: 'border-l-severity-error bg-severity-error/5',
    warning: 'border-l-severity-warning bg-severity-warning/5',
    info: 'border-l-status-approved bg-status-approved/5',
  };

  const changeColor = isRegression ? 'text-severity-error' : 'text-status-approved';
  const arrow = isRegression ? '↓' : '↑';

  return (
    <div className={`p-3 rounded-lg border-l-4 ${severityStyles[severity]}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{patternName}</div>
          <div className="text-xs text-dark-muted mt-0.5">{category}</div>
        </div>
        <div className={`text-right ${changeColor}`}>
          <div className="font-semibold text-sm">
            {arrow} {Math.abs(changePercent).toFixed(0)}%
          </div>
          <div className="text-xs text-dark-muted">
            {(previousValue * 100).toFixed(0)}% → {(currentValue * 100).toFixed(0)}%
          </div>
        </div>
      </div>
      <div className="text-xs text-dark-muted mt-2">{details}</div>
    </div>
  );
}

function PeriodSelector({ 
  period, 
  onChange 
}: { 
  period: Period; 
  onChange: (p: Period) => void;
}) {
  const periods: { value: Period; label: string }[] = [
    { value: '7d', label: '7 days' },
    { value: '30d', label: '30 days' },
    { value: '90d', label: '90 days' },
  ];

  return (
    <div className="flex gap-1 bg-dark-bg rounded-lg p-1">
      {periods.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => onChange(value)}
          className={`px-3 py-1 text-xs rounded transition-colors ${
            period === value
              ? 'bg-dark-surface text-dark-text'
              : 'text-dark-muted hover:text-dark-text'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function OverallTrendBadge({ 
  trend, 
  healthDelta 
}: { 
  trend: 'improving' | 'declining' | 'stable';
  healthDelta: number;
}) {
  const config = {
    improving: { 
      icon: '📈', 
      label: 'Improving', 
      color: 'text-status-approved',
      bg: 'bg-status-approved/10'
    },
    declining: { 
      icon: '📉', 
      label: 'Declining', 
      color: 'text-severity-error',
      bg: 'bg-severity-error/10'
    },
    stable: { 
      icon: '➡️', 
      label: 'Stable', 
      color: 'text-dark-muted',
      bg: 'bg-dark-surface'
    },
  }[trend];

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${config.bg}`}>
      <span>{config.icon}</span>
      <span className={`text-sm font-medium ${config.color}`}>{config.label}</span>
      {healthDelta !== 0 && (
        <span className={`text-xs ${config.color}`}>
          ({healthDelta > 0 ? '+' : ''}{(healthDelta * 100).toFixed(1)}%)
        </span>
      )}
    </div>
  );
}

export function TrendsPanel() {
  const [period, setPeriod] = useState<Period>('7d');
  const { data: trends, isLoading, error } = useTrends(period);

  if (isLoading) {
    return (
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-dark-muted uppercase tracking-wide">
            Pattern Trends
          </h3>
        </div>
        <div className="text-dark-muted text-sm">Loading trends...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-dark-muted uppercase tracking-wide">
            Pattern Trends
          </h3>
        </div>
        <div className="text-severity-error text-sm">Failed to load trends</div>
      </div>
    );
  }

  const hasData = trends && (trends.regressions?.length > 0 || trends.improvements?.length > 0);
  const regressions = trends?.regressions || [];
  const improvements = trends?.improvements || [];

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-dark-muted uppercase tracking-wide">
          Pattern Trends
        </h3>
        <PeriodSelector period={period} onChange={setPeriod} />
      </div>

      {!hasData ? (
        <div className="text-center py-8">
          <div className="text-4xl mb-2">📊</div>
          <div className="text-dark-muted text-sm">
            Not enough history data yet.
          </div>
          <div className="text-dark-muted text-xs mt-1">
            Run more scans to see pattern trends over time.
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Overall trend */}
          <div className="flex items-center justify-between">
            <OverallTrendBadge 
              trend={trends.overallTrend} 
              healthDelta={trends.healthDelta} 
            />
            <div className="text-xs text-dark-muted">
              {trends.startDate} → {trends.endDate}
            </div>
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-2 bg-severity-error/10 rounded">
              <div className="text-lg font-semibold text-severity-error">
                {regressions.length}
              </div>
              <div className="text-xs text-dark-muted">Regressions</div>
            </div>
            <div className="p-2 bg-status-approved/10 rounded">
              <div className="text-lg font-semibold text-status-approved">
                {improvements.length}
              </div>
              <div className="text-xs text-dark-muted">Improvements</div>
            </div>
            <div className="p-2 bg-dark-surface rounded">
              <div className="text-lg font-semibold text-dark-muted">
                {trends.stable}
              </div>
              <div className="text-xs text-dark-muted">Stable</div>
            </div>
          </div>

          {/* Regressions */}
          {regressions.length > 0 && (
            <div>
              <div className="text-xs font-medium text-severity-error mb-2 flex items-center gap-1">
                <span>📉</span> Regressions ({regressions.length})
              </div>
              <div className="space-y-2">
                {regressions.slice(0, 5).map((r, i) => (
                  <TrendItem
                    key={`${r.patternId}-${i}`}
                    patternName={r.patternName}
                    category={r.category}
                    type="regression"
                    metric={r.metric}
                    previousValue={r.previousValue}
                    currentValue={r.currentValue}
                    changePercent={r.changePercent}
                    severity={r.severity}
                    details={r.details}
                  />
                ))}
                {regressions.length > 5 && (
                  <div className="text-xs text-dark-muted text-center">
                    +{regressions.length - 5} more regressions
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Improvements */}
          {improvements.length > 0 && (
            <div>
              <div className="text-xs font-medium text-status-approved mb-2 flex items-center gap-1">
                <span>📈</span> Improvements ({improvements.length})
              </div>
              <div className="space-y-2">
                {improvements.slice(0, 3).map((r, i) => (
                  <TrendItem
                    key={`${r.patternId}-${i}`}
                    patternName={r.patternName}
                    category={r.category}
                    type="improvement"
                    metric={r.metric}
                    previousValue={r.previousValue}
                    currentValue={r.currentValue}
                    changePercent={r.changePercent}
                    severity={r.severity}
                    details={r.details}
                  />
                ))}
                {improvements.length > 3 && (
                  <div className="text-xs text-dark-muted text-center">
                    +{improvements.length - 3} more improvements
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
