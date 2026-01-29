/**
 * Violation List Components
 * 
 * Multiple view modes for violation display.
 */

import { useState } from 'react';

import { SEVERITY_CONFIG, CATEGORY_CONFIG } from './constants';
import { 
  formatFilePath, 
  formatLineRange, 
  getFileName, 
  groupByFile, 
  groupByPattern,
  groupByCategory,
  groupBySeverity,
  getCategoryConfig,
} from './utils';

import type { ViewMode, FileGroup, PatternGroup, CategoryGroup, SeverityGroup } from './types';
import type { Violation, Severity } from '../../types';

// ============================================================================
// Violation Card (List View)
// ============================================================================

interface ViolationCardProps {
  violation: Violation;
  isExpanded: boolean;
  onToggle: () => void;
}

function ViolationCard({ violation, isExpanded, onToggle }: ViolationCardProps) {
  const severityConfig = SEVERITY_CONFIG[violation.severity];

  return (
    <div className={`border rounded-lg overflow-hidden ${severityConfig.borderColor} ${severityConfig.bgColor}`}>
      <button
        onClick={onToggle}
        className="w-full text-left p-4 hover:bg-dark-border/20 transition-colors"
      >
        <div className="flex items-start gap-3">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${severityConfig.bgColor} ${severityConfig.color} border ${severityConfig.borderColor} shrink-0`}>
            {severityConfig.icon} {severityConfig.label}
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-medium">{violation.message}</div>
            <div className="flex items-center gap-2 mt-1 text-sm text-dark-muted flex-wrap">
              <span className="truncate" title={violation.file}>{formatFilePath(violation.file)}</span>
              <span>•</span>
              <span>Line {violation.range.start.line}</span>
              <span>•</span>
              <span className="text-blue-400">{violation.patternName}</span>
            </div>
          </div>
          <span className="text-dark-muted shrink-0">
            {isExpanded ? '▼' : '▶'}
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className="p-4 pt-0 space-y-4 border-t border-dark-border/50">
          {/* Expected vs Actual */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-dark-muted mb-2">Expected</div>
              <div className="p-3 bg-status-approved/10 border border-status-approved/20 rounded-lg font-mono text-sm">
                {violation.expected}
              </div>
            </div>
            <div>
              <div className="text-xs text-dark-muted mb-2">Actual</div>
              <div className="p-3 bg-severity-error/10 border border-severity-error/20 rounded-lg font-mono text-sm">
                {violation.actual}
              </div>
            </div>
          </div>

          {/* Code Snippet */}
          {violation.codeSnippet && (
            <div>
              <div className="text-xs text-dark-muted mb-2">Code</div>
              <pre className="p-3 bg-dark-bg rounded-lg overflow-x-auto font-mono text-xs leading-relaxed">
                {violation.codeSnippet}
              </pre>
            </div>
          )}

          {/* Metadata */}
          <div className="flex items-center gap-4 text-xs text-dark-muted">
            <span>Pattern: {violation.patternId}</span>
            <span>Range: {formatLineRange(violation.range.start, violation.range.end)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// File Group Card (By File View)
// ============================================================================

interface FileGroupCardProps {
  group: FileGroup;
  isExpanded: boolean;
  onToggle: () => void;
  expandedViolations: Set<string>;
  onToggleViolation: (id: string) => void;
}

function FileGroupCard({ 
  group, 
  isExpanded, 
  onToggle, 
  expandedViolations, 
  onToggleViolation 
}: FileGroupCardProps) {
  const maxSeverityConfig = SEVERITY_CONFIG[group.metrics.maxSeverity];

  return (
    <div className="border border-dark-border rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full text-left p-4 bg-dark-surface hover:bg-dark-border/30 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-dark-muted">{isExpanded ? '▼' : '▶'}</span>
            <span className="text-lg">📄</span>
            <div className="min-w-0">
              <div className="font-medium truncate" title={group.file}>
                {getFileName(group.file)}
              </div>
              <div className="text-xs text-dark-muted truncate" title={group.file}>
                {formatFilePath(group.file)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className={`px-2 py-1 rounded text-xs ${maxSeverityConfig.bgColor} ${maxSeverityConfig.color}`}>
              {group.metrics.total} violation{group.metrics.total !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Severity breakdown */}
        <div className="flex items-center gap-3 mt-2 ml-10 text-xs">
          {Object.entries(group.metrics.bySeverity).map(([severity, count]) => {
            if (count === 0) {return null;}
            const config = SEVERITY_CONFIG[severity as keyof typeof SEVERITY_CONFIG];
            return (
              <span key={severity} className={config.color}>
                {config.icon} {count}
              </span>
            );
          })}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-dark-border bg-dark-bg p-3 space-y-2">
          {group.violations.map((violation) => (
            <ViolationCard
              key={violation.id}
              violation={violation}
              isExpanded={expandedViolations.has(violation.id)}
              onToggle={() => onToggleViolation(violation.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Pattern Group Card (By Pattern View)
// ============================================================================

interface PatternGroupCardProps {
  group: PatternGroup;
  isExpanded: boolean;
  onToggle: () => void;
  expandedViolations: Set<string>;
  onToggleViolation: (id: string) => void;
}

function PatternGroupCard({ 
  group, 
  isExpanded, 
  onToggle, 
  expandedViolations, 
  onToggleViolation 
}: PatternGroupCardProps) {
  return (
    <div className="border border-dark-border rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full text-left p-4 bg-dark-surface hover:bg-dark-border/30 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-dark-muted">{isExpanded ? '▼' : '▶'}</span>
            <span className="text-lg">🔍</span>
            <div className="min-w-0">
              <div className="font-medium truncate">{group.patternName}</div>
              <div className="text-xs text-dark-muted">
                {group.metrics.affectedFiles} file{group.metrics.affectedFiles !== 1 ? 's' : ''} affected
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="px-2 py-1 rounded text-xs bg-severity-warning/10 text-severity-warning">
              {group.metrics.total} violation{group.metrics.total !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Severity breakdown */}
        <div className="flex items-center gap-3 mt-2 ml-10 text-xs">
          {Object.entries(group.metrics.bySeverity).map(([severity, count]) => {
            if (count === 0) {return null;}
            const config = SEVERITY_CONFIG[severity as keyof typeof SEVERITY_CONFIG];
            return (
              <span key={severity} className={config.color}>
                {config.icon} {count}
              </span>
            );
          })}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-dark-border bg-dark-bg p-3 space-y-2">
          {group.violations.map((violation) => (
            <ViolationCard
              key={violation.id}
              violation={violation}
              isExpanded={expandedViolations.has(violation.id)}
              onToggle={() => onToggleViolation(violation.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Category Group Card (By Category View)
// ============================================================================

interface CategoryGroupCardProps {
  group: CategoryGroup;
  isExpanded: boolean;
  onToggle: () => void;
  expandedViolations: Set<string>;
  onToggleViolation: (id: string) => void;
}

function CategoryGroupCard({ 
  group, 
  isExpanded, 
  onToggle, 
  expandedViolations, 
  onToggleViolation 
}: CategoryGroupCardProps) {
  const config = getCategoryConfig(group.category);
  const maxSeverity = group.metrics.bySeverity.error > 0 ? 'error' 
    : group.metrics.bySeverity.warning > 0 ? 'warning'
    : group.metrics.bySeverity.info > 0 ? 'info' : 'hint';
  const maxSeverityConfig = SEVERITY_CONFIG[maxSeverity];

  return (
    <div className={`border rounded-lg overflow-hidden ${config.bgColor} border-dark-border`}>
      <button
        onClick={onToggle}
        className="w-full text-left p-4 hover:bg-dark-border/20 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-dark-muted">{isExpanded ? '▼' : '▶'}</span>
            <span className="text-2xl">{group.icon}</span>
            <div className="min-w-0">
              <div className={`font-semibold ${config.color}`}>{group.displayName}</div>
              <div className="text-xs text-dark-muted">
                {group.metrics.patterns.length} pattern{group.metrics.patterns.length !== 1 ? 's' : ''} • {group.metrics.affectedFiles} file{group.metrics.affectedFiles !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${maxSeverityConfig.bgColor} ${maxSeverityConfig.color}`}>
              {group.metrics.total} violation{group.metrics.total !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Severity breakdown */}
        <div className="flex items-center gap-4 mt-3 ml-10 text-sm">
          {Object.entries(group.metrics.bySeverity).map(([severity, count]) => {
            if (count === 0) {return null;}
            const severityConfig = SEVERITY_CONFIG[severity as keyof typeof SEVERITY_CONFIG];
            return (
              <span key={severity} className={`flex items-center gap-1 ${severityConfig.color}`}>
                {severityConfig.icon} {count}
              </span>
            );
          })}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-dark-border bg-dark-bg p-3 space-y-2">
          {group.violations.map((violation) => (
            <ViolationCard
              key={violation.id}
              violation={violation}
              isExpanded={expandedViolations.has(violation.id)}
              onToggle={() => onToggleViolation(violation.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Severity Group Card (By Severity View)
// ============================================================================

interface SeverityGroupCardProps {
  group: SeverityGroup;
  isExpanded: boolean;
  onToggle: () => void;
  expandedCategories: Set<string>;
  onToggleCategory: (id: string) => void;
  expandedViolations: Set<string>;
  onToggleViolation: (id: string) => void;
}

function SeverityGroupCard({ 
  group, 
  isExpanded, 
  onToggle,
  expandedCategories,
  onToggleCategory,
  expandedViolations, 
  onToggleViolation 
}: SeverityGroupCardProps) {
  const config = SEVERITY_CONFIG[group.severity];

  return (
    <div className={`border-2 rounded-xl overflow-hidden ${config.borderColor} ${config.bgColor}`}>
      <button
        onClick={onToggle}
        className="w-full text-left p-5 hover:bg-dark-border/10 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-dark-muted text-lg">{isExpanded ? '▼' : '▶'}</span>
            <span className="text-3xl">{config.icon}</span>
            <div>
              <div className={`text-xl font-bold ${config.color}`}>{config.label}</div>
              <div className="text-sm text-dark-muted">{config.description}</div>
            </div>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="text-right">
              <div className={`text-3xl font-bold ${config.color}`}>{group.violations.length}</div>
              <div className="text-xs text-dark-muted">violation{group.violations.length !== 1 ? 's' : ''}</div>
            </div>
          </div>
        </div>

        {/* Category breakdown preview */}
        {group.categories.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mt-4 ml-14">
            {group.categories.slice(0, 5).map((cat) => {
              const catConfig = getCategoryConfig(cat.category);
              return (
                <span 
                  key={cat.category} 
                  className={`px-2 py-1 rounded text-xs ${catConfig.bgColor} ${catConfig.color} border border-dark-border/30`}
                >
                  {cat.icon} {cat.displayName} ({cat.metrics.total})
                </span>
              );
            })}
            {group.categories.length > 5 && (
              <span className="text-xs text-dark-muted">
                +{group.categories.length - 5} more
              </span>
            )}
          </div>
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-dark-border bg-dark-bg p-4 space-y-3">
          {group.categories.map((category) => (
            <CategoryGroupCard
              key={category.category}
              group={category}
              isExpanded={expandedCategories.has(category.category)}
              onToggle={() => onToggleCategory(category.category)}
              expandedViolations={expandedViolations}
              onToggleViolation={onToggleViolation}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Violation List
// ============================================================================

interface ViolationListProps {
  violations: Violation[];
  viewMode: ViewMode;
  expandedViolations: Set<string>;
  onToggleViolation: (id: string) => void;
}

export function ViolationList({
  violations,
  viewMode,
  expandedViolations,
  onToggleViolation,
}: ViolationListProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleCategory = (id: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (violations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <span className="text-4xl mb-4">✅</span>
        <h3 className="text-lg font-medium mb-2">No violations found</h3>
        <p className="text-dark-muted text-sm max-w-md">
          Great job! Your codebase is following all detected patterns consistently.
        </p>
      </div>
    );
  }

  // List view
  if (viewMode === 'list') {
    return (
      <div className="space-y-3">
        {violations.map((violation) => (
          <ViolationCard
            key={violation.id}
            violation={violation}
            isExpanded={expandedViolations.has(violation.id)}
            onToggle={() => onToggleViolation(violation.id)}
          />
        ))}
      </div>
    );
  }

  // By Severity view (hierarchical: severity -> category -> violations)
  if (viewMode === 'by-severity') {
    const severityGroups = groupBySeverity(violations);
    return (
      <div className="space-y-4">
        {severityGroups.map((group) => (
          <SeverityGroupCard
            key={group.severity}
            group={group}
            isExpanded={expandedGroups.has(group.severity)}
            onToggle={() => toggleGroup(group.severity)}
            expandedCategories={expandedCategories}
            onToggleCategory={toggleCategory}
            expandedViolations={expandedViolations}
            onToggleViolation={onToggleViolation}
          />
        ))}
      </div>
    );
  }

  // By Category view
  if (viewMode === 'by-category') {
    const categoryGroups = groupByCategory(violations);
    return (
      <div className="space-y-3">
        {categoryGroups.map((group) => (
          <CategoryGroupCard
            key={group.category}
            group={group}
            isExpanded={expandedGroups.has(group.category)}
            onToggle={() => toggleGroup(group.category)}
            expandedViolations={expandedViolations}
            onToggleViolation={onToggleViolation}
          />
        ))}
      </div>
    );
  }

  // By File view
  if (viewMode === 'by-file') {
    const fileGroups = groupByFile(violations);
    return (
      <div className="space-y-3">
        {fileGroups.map((group) => (
          <FileGroupCard
            key={group.file}
            group={group}
            isExpanded={expandedGroups.has(group.file)}
            onToggle={() => toggleGroup(group.file)}
            expandedViolations={expandedViolations}
            onToggleViolation={onToggleViolation}
          />
        ))}
      </div>
    );
  }

  // By Pattern view (default)
  const patternGroups = groupByPattern(violations);
  return (
    <div className="space-y-3">
      {patternGroups.map((group) => (
        <PatternGroupCard
          key={group.patternId}
          group={group}
          isExpanded={expandedGroups.has(group.patternId)}
          onToggle={() => toggleGroup(group.patternId)}
          expandedViolations={expandedViolations}
          onToggleViolation={onToggleViolation}
        />
      ))}
    </div>
  );
}
