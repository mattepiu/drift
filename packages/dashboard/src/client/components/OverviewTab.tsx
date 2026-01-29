/**
 * Overview Tab Component
 *
 * Displays health score, summary stats, and recent activity.
 */

import React from 'react';

import { useStats, useViolations } from '../hooks';
import { useDashboardStore } from '../store';
import { TrendsPanel } from './trends';

import type { Severity, PatternStatus } from '../types';

function StatCard({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string | number;
  subtext?: string;
}) {
  return (
    <div className="card">
      <div className="text-sm text-dark-muted mb-1">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
      {subtext && <div className="text-xs text-dark-muted mt-1">{subtext}</div>}
    </div>
  );
}

function HealthScore({ score }: { score: number }) {
  const getColor = () => {
    if (score >= 80) {return 'text-status-approved';}
    if (score >= 60) {return 'text-severity-warning';}
    return 'text-severity-error';
  };

  return (
    <div className="card flex flex-col items-center justify-center py-8">
      <div className="text-sm text-dark-muted mb-2">Health Score</div>
      <div className={`text-5xl font-bold ${getColor()}`}>{score}</div>
      <div className="text-xs text-dark-muted mt-2">out of 100</div>
    </div>
  );
}

function SeverityBreakdown({ bySeverity }: { bySeverity: Record<Severity, number> }) {
  const items: { severity: Severity; label: string; className: string }[] = [
    { severity: 'error', label: 'Errors', className: 'badge-error' },
    { severity: 'warning', label: 'Warnings', className: 'badge-warning' },
    { severity: 'info', label: 'Info', className: 'badge-info' },
    { severity: 'hint', label: 'Hints', className: 'badge-hint' },
  ];

  return (
    <div className="card">
      <div className="text-sm text-dark-muted mb-3">Violations by Severity</div>
      <div className="space-y-2">
        {items.map(({ severity, label, className }) => (
          <div key={severity} className="flex items-center justify-between">
            <span className={`px-2 py-0.5 rounded text-xs ${className}`}>{label}</span>
            <span className="font-medium">{bySeverity[severity] || 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBreakdown({ byStatus }: { byStatus: Record<PatternStatus, number> }) {
  const items: { status: PatternStatus; label: string; className: string }[] = [
    { status: 'discovered', label: 'Discovered', className: 'badge-discovered' },
    { status: 'approved', label: 'Approved', className: 'badge-approved' },
    { status: 'ignored', label: 'Ignored', className: 'badge-ignored' },
  ];

  return (
    <div className="card">
      <div className="text-sm text-dark-muted mb-3">Patterns by Status</div>
      <div className="space-y-2">
        {items.map(({ status, label, className }) => (
          <div key={status} className="flex items-center justify-between">
            <span className={`px-2 py-0.5 rounded text-xs ${className}`}>{label}</span>
            <span className="font-medium">{byStatus[status] || 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentViolations() {
  const { realtimeViolations } = useDashboardStore();
  const { data: violations } = useViolations();

  const displayViolations = realtimeViolations.length > 0 
    ? realtimeViolations.slice(0, 5)
    : (violations || []).slice(0, 5);

  if (displayViolations.length === 0) {
    return (
      <div className="card">
        <div className="text-sm text-dark-muted mb-3">Recent Violations</div>
        <div className="text-dark-muted text-sm">No violations detected</div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="text-sm text-dark-muted mb-3">Recent Violations</div>
      <div className="space-y-2">
        {displayViolations.map((v) => (
          <div
            key={v.id}
            className="flex items-start gap-2 p-2 rounded bg-dark-bg/50"
          >
            <span className={`px-1.5 py-0.5 rounded text-xs badge-${v.severity}`}>
              {v.severity}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{v.message}</div>
              <div className="text-xs text-dark-muted truncate">{v.file}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OverviewTab(): React.ReactElement {
  const { data: stats, isLoading, error } = useStats();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-dark-muted">Loading stats...</div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-severity-error">Failed to load stats</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top row: Health score and key stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <HealthScore score={stats.healthScore} />
        <StatCard
          label="Total Patterns"
          value={stats.patterns.total}
          subtext={`${stats.patterns.byStatus.approved || 0} approved`}
        />
        <StatCard
          label="Total Violations"
          value={stats.violations.total}
          subtext={`${stats.violations.bySeverity.error || 0} errors`}
        />
        <StatCard
          label="Files Scanned"
          value={stats.files.scanned}
          subtext={`of ${stats.files.total} total`}
        />
      </div>

      {/* Second row: Breakdowns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SeverityBreakdown bySeverity={stats.violations.bySeverity} />
        <StatusBreakdown byStatus={stats.patterns.byStatus} />
        <RecentViolations />
      </div>

      {/* Third row: Trends */}
      <div className="grid grid-cols-1 gap-4">
        <TrendsPanel />
      </div>

      {/* Last scan info */}
      {stats.lastScan && (
        <div className="text-sm text-dark-muted text-center">
          Last scan: {new Date(stats.lastScan).toLocaleString()}
        </div>
      )}
    </div>
  );
}
