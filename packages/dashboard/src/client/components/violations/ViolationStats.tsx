/**
 * Violation Statistics Component
 * 
 * Enterprise-grade statistics dashboard for violation overview.
 */

import { SEVERITY_ORDER, SEVERITY_CONFIG, CATEGORY_CONFIG } from './constants';
import { getFileName } from './utils';

import type { ViolationStatistics } from './types';

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
// Severity Breakdown
// ============================================================================

interface SeverityBreakdownProps {
  bySeverity: Record<string, number>;
  total: number;
}

function SeverityBreakdown({ bySeverity, total }: SeverityBreakdownProps) {
  return (
    <div className="p-4 bg-dark-surface border border-dark-border rounded-lg">
      <div className="text-xs text-dark-muted uppercase tracking-wide mb-3">By Severity</div>
      
      {/* Stacked bar */}
      <div className="flex h-3 rounded-full overflow-hidden bg-dark-bg mb-3">
        {SEVERITY_ORDER.map(severity => {
          const count = bySeverity[severity] || 0;
          const percentage = total > 0 ? (count / total) * 100 : 0;
          if (percentage === 0) {return null;}
          
          const config = SEVERITY_CONFIG[severity];
          return (
            <div
              key={severity}
              className={`${config.bgColor} transition-all`}
              style={{ width: `${percentage}%` }}
              title={`${config.label}: ${count} (${Math.round(percentage)}%)`}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-2">
        {SEVERITY_ORDER.map(severity => {
          const count = bySeverity[severity] || 0;
          const config = SEVERITY_CONFIG[severity];
          
          return (
            <div key={severity} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span>{config.icon}</span>
                <span className={config.color}>{config.label}</span>
              </div>
              <span className="font-medium">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Top Items List
// ============================================================================

interface TopItemsProps {
  title: string;
  icon: string;
  items: Array<{ label: string; count: number }>;
  emptyMessage: string;
}

function TopItems({ title, icon, items, emptyMessage }: TopItemsProps) {
  return (
    <div className="p-4 bg-dark-surface border border-dark-border rounded-lg">
      <div className="flex items-center gap-2 mb-3">
        <span>{icon}</span>
        <span className="text-xs text-dark-muted uppercase tracking-wide">{title}</span>
      </div>
      
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="truncate text-dark-muted" title={item.label}>
                {item.label}
              </span>
              <span className="font-medium ml-2 shrink-0">{item.count}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-dark-muted">{emptyMessage}</div>
      )}
    </div>
  );
}

// ============================================================================
// Category Breakdown
// ============================================================================

interface CategoryBreakdownProps {
  byCategory: Record<string, number>;
  total: number;
}

function CategoryBreakdown({ byCategory, total }: CategoryBreakdownProps) {
  const sortedCategories = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <div className="p-4 bg-dark-surface border border-dark-border rounded-lg">
      <div className="text-xs text-dark-muted uppercase tracking-wide mb-3">By Category</div>
      
      {sortedCategories.length > 0 ? (
        <div className="space-y-2">
          {sortedCategories.map(([category, count]) => {
            const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.other;
            const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
            
            return (
              <div key={category} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span>{config.icon}</span>
                    <span className={config.color}>{config.label}</span>
                  </div>
                  <span className="font-medium">{count}</span>
                </div>
                <div className="h-1.5 bg-dark-bg rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${config.bgColor} transition-all`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-sm text-dark-muted">No category data</div>
      )}
    </div>
  );
}

// ============================================================================
// Main Stats Component
// ============================================================================

interface ViolationStatsProps {
  statistics: ViolationStatistics;
}

export function ViolationStats({ statistics }: ViolationStatsProps) {
  const criticalCount = (statistics.bySeverity.error || 0) + (statistics.bySeverity.warning || 0);
  
  return (
    <div className="space-y-4">
      {/* Primary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Total Violations"
          value={statistics.total}
          icon="⚠️"
          color={statistics.total > 0 ? 'text-severity-warning' : 'text-status-approved'}
        />
        <StatCard
          label="Critical"
          value={criticalCount}
          subValue="errors + warnings"
          icon="🔴"
          color={criticalCount > 0 ? 'text-severity-error' : 'text-status-approved'}
        />
        <StatCard
          label="Affected Files"
          value={statistics.affectedFiles}
          icon="📁"
        />
        <StatCard
          label="Patterns"
          value={statistics.byPattern.size}
          subValue="with violations"
          icon="🔍"
        />
      </div>

      {/* Realtime indicator */}
      {statistics.realtimeCount > 0 && (
        <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
          </span>
          <span className="text-sm text-blue-400">
            {statistics.realtimeCount} new violation{statistics.realtimeCount !== 1 ? 's' : ''} detected in real-time
          </span>
        </div>
      )}

      {/* Breakdowns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <SeverityBreakdown bySeverity={statistics.bySeverity} total={statistics.total} />
        
        <CategoryBreakdown byCategory={statistics.byCategory} total={statistics.total} />
        
        <TopItems
          title="Top Files"
          icon="📄"
          items={statistics.topFiles.map(f => ({ 
            label: getFileName(f.file), 
            count: f.count 
          }))}
          emptyMessage="No files with violations"
        />
        
        <TopItems
          title="Top Patterns"
          icon="🔍"
          items={statistics.topPatterns.map(p => ({ 
            label: p.name, 
            count: p.count 
          }))}
          emptyMessage="No pattern violations"
        />
      </div>
    </div>
  );
}
