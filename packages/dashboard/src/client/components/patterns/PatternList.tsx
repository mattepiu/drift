/**
 * Pattern List Components
 * 
 * Grouped and flat views for pattern display.
 */

import { useState } from 'react';

import { STATUS_CONFIG, CATEGORY_CONFIG } from './constants';
import { formatPercentage, getConfidenceColor } from './utils';

import type { CategoryGroup, DetectorGroup, ViewMode } from './types';
import type { Pattern } from '../../types';

// ============================================================================
// Pattern Row (Flat View)
// ============================================================================

interface PatternRowProps {
  pattern: Pattern;
  isSelected: boolean;
  onSelect: () => void;
}

function PatternRow({ pattern, isSelected, onSelect }: PatternRowProps) {
  const statusConfig = STATUS_CONFIG[pattern.status];
  const categoryConfig = CATEGORY_CONFIG[pattern.category];
  const confidenceColor = getConfidenceColor(pattern.confidence.score);

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-3 rounded-lg border transition-all ${
        isSelected
          ? 'bg-blue-500/10 border-blue-500/30'
          : 'bg-dark-surface border-dark-border hover:border-dark-muted'
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="text-lg shrink-0">{categoryConfig?.icon}</span>
          <div className="min-w-0">
            <div className="font-medium truncate">{pattern.name}</div>
            <div className="text-xs text-dark-muted">{categoryConfig?.label}</div>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <div className={`text-sm font-medium ${confidenceColor}`}>
              {formatPercentage(pattern.confidence.score)}
            </div>
            <div className="text-xs text-dark-muted">confidence</div>
          </div>

          <div className="text-right">
            <div className="text-sm font-medium text-status-approved">
              {pattern.locationCount}
            </div>
            <div className="text-xs text-dark-muted">locations</div>
          </div>

          {pattern.outlierCount > 0 && (
            <div className="text-right">
              <div className="text-sm font-medium text-severity-warning">
                {pattern.outlierCount}
              </div>
              <div className="text-xs text-dark-muted">outliers</div>
            </div>
          )}

          <span className={`px-2 py-1 rounded text-xs ${statusConfig?.bgColor} ${statusConfig?.color}`}>
            {statusConfig?.icon} {statusConfig?.label}
          </span>
        </div>
      </div>
    </button>
  );
}

// ============================================================================
// Detector Card (Grouped View)
// ============================================================================

interface DetectorCardProps {
  group: DetectorGroup;
  isExpanded: boolean;
  onToggle: () => void;
  selectedPatternId: string | null;
  onSelectPattern: (id: string) => void;
}

function DetectorCard({
  group,
  isExpanded,
  onToggle,
  selectedPatternId,
  onSelectPattern,
}: DetectorCardProps) {
  const statusConfig = STATUS_CONFIG[group.dominantStatus];
  const confidenceColor = getConfidenceColor(group.metrics.avgConfidence);

  return (
    <div className="border border-dark-border rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full text-left p-4 bg-dark-surface hover:bg-dark-border/30 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-dark-muted text-sm">{isExpanded ? '▼' : '▶'}</span>
            <span className="font-medium">{group.detectorName}</span>
            {group.patterns.length > 1 && (
              <span className="px-2 py-0.5 bg-dark-bg rounded text-xs text-dark-muted">
                {group.patterns.length} variants
              </span>
            )}
          </div>
          <span className={`px-2 py-1 rounded text-xs ${statusConfig?.bgColor} ${statusConfig?.color}`}>
            {statusConfig?.icon} {statusConfig?.label}
          </span>
        </div>

        <div className="flex items-center gap-6 mt-3 ml-7 text-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-status-approved">✓</span>
            <span className="text-dark-muted">{group.metrics.totalLocations} consistent</span>
          </div>
          {group.metrics.totalOutliers > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-severity-warning">⚠</span>
              <span className="text-dark-muted">{group.metrics.totalOutliers} outliers</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <span className={confidenceColor}>{formatPercentage(group.metrics.avgConfidence)}</span>
            <span className="text-dark-muted">confidence</span>
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-dark-border bg-dark-bg p-2 space-y-1">
          {group.patterns.map((pattern) => (
            <button
              key={pattern.id}
              onClick={() => onSelectPattern(pattern.id)}
              className={`w-full text-left p-3 rounded-lg transition-colors ${
                selectedPatternId === pattern.id
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'hover:bg-dark-border/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="truncate font-medium">{pattern.name}</span>
                <span className={`px-2 py-0.5 rounded text-xs ${STATUS_CONFIG[pattern.status]?.bgColor} ${STATUS_CONFIG[pattern.status]?.color}`}>
                  {STATUS_CONFIG[pattern.status]?.label}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-2 text-xs text-dark-muted">
                <span className="text-status-approved">✓ {pattern.locationCount}</span>
                {pattern.outlierCount > 0 && (
                  <span className="text-severity-warning">⚠ {pattern.outlierCount}</span>
                )}
                <span className={getConfidenceColor(pattern.confidence.score)}>
                  {formatPercentage(pattern.confidence.score)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Category Section (Grouped View)
// ============================================================================

interface CategorySectionProps {
  group: CategoryGroup;
  expandedDetectors: Set<string>;
  onToggleDetector: (id: string) => void;
  selectedPatternId: string | null;
  onSelectPattern: (id: string) => void;
}

function CategorySection({
  group,
  expandedDetectors,
  onToggleDetector,
  selectedPatternId,
  onSelectPattern,
}: CategorySectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const config = CATEGORY_CONFIG[group.category];

  return (
    <div className="mb-6">
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full text-left group"
      >
        <div className="flex items-center gap-3 mb-2">
          <span className="text-dark-muted text-sm">{isCollapsed ? '▶' : '▼'}</span>
          <span className="text-xl">{config?.icon}</span>
          <span className="text-lg font-semibold group-hover:text-blue-400 transition-colors">
            {config?.label}
          </span>
          <span className="px-2 py-0.5 bg-dark-bg rounded text-xs text-dark-muted">
            {group.patternCount}
          </span>
        </div>
        <p className="text-xs text-dark-muted ml-10 mb-2">{config?.description}</p>
        <div className="flex items-center gap-4 text-xs ml-10">
          <span className="text-dark-muted">
            {group.detectors.length} detector{group.detectors.length !== 1 ? 's' : ''}
          </span>
          <span className="text-status-approved">
            ✓ {group.metrics.totalLocations} consistent
          </span>
          {group.metrics.totalOutliers > 0 && (
            <span className="text-severity-warning">
              ⚠ {group.metrics.totalOutliers} outliers
            </span>
          )}
        </div>
      </button>

      {!isCollapsed && (
        <div className="space-y-2 ml-6 mt-4">
          {group.detectors.map((detector) => (
            <DetectorCard
              key={detector.id}
              group={detector}
              isExpanded={expandedDetectors.has(detector.id)}
              onToggle={() => onToggleDetector(detector.id)}
              selectedPatternId={selectedPatternId}
              onSelectPattern={onSelectPattern}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Pattern List
// ============================================================================

interface PatternListProps {
  patterns: Pattern[];
  groupedPatterns: CategoryGroup[];
  viewMode: ViewMode;
  expandedDetectors: Set<string>;
  onToggleDetector: (id: string) => void;
  selectedPatternId: string | null;
  onSelectPattern: (id: string) => void;
}

export function PatternList({
  patterns,
  groupedPatterns,
  viewMode,
  expandedDetectors,
  onToggleDetector,
  selectedPatternId,
  onSelectPattern,
}: PatternListProps) {
  if (patterns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <span className="text-4xl mb-4">🔍</span>
        <h3 className="text-lg font-medium mb-2">No patterns found</h3>
        <p className="text-dark-muted text-sm max-w-md">
          Try adjusting your filters or run a scan to detect patterns in your codebase.
        </p>
      </div>
    );
  }

  if (viewMode === 'flat') {
    return (
      <div className="space-y-2">
        {patterns.map((pattern) => (
          <PatternRow
            key={pattern.id}
            pattern={pattern}
            isSelected={selectedPatternId === pattern.id}
            onSelect={() => onSelectPattern(pattern.id)}
          />
        ))}
      </div>
    );
  }

  if (viewMode === 'table') {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-dark-border text-left">
              <th className="pb-3 font-medium text-dark-muted">Pattern</th>
              <th className="pb-3 font-medium text-dark-muted">Category</th>
              <th className="pb-3 font-medium text-dark-muted text-right">Confidence</th>
              <th className="pb-3 font-medium text-dark-muted text-right">Locations</th>
              <th className="pb-3 font-medium text-dark-muted text-right">Outliers</th>
              <th className="pb-3 font-medium text-dark-muted">Status</th>
            </tr>
          </thead>
          <tbody>
            {patterns.map((pattern) => {
              const statusConfig = STATUS_CONFIG[pattern.status];
              const categoryConfig = CATEGORY_CONFIG[pattern.category];
              
              return (
                <tr
                  key={pattern.id}
                  onClick={() => onSelectPattern(pattern.id)}
                  className={`border-b border-dark-border/50 cursor-pointer transition-colors ${
                    selectedPatternId === pattern.id
                      ? 'bg-blue-500/10'
                      : 'hover:bg-dark-surface'
                  }`}
                >
                  <td className="py-3 font-medium">{pattern.name}</td>
                  <td className="py-3">
                    <span className="flex items-center gap-2">
                      <span>{categoryConfig?.icon}</span>
                      <span className="text-dark-muted">{categoryConfig?.label}</span>
                    </span>
                  </td>
                  <td className={`py-3 text-right ${getConfidenceColor(pattern.confidence.score)}`}>
                    {formatPercentage(pattern.confidence.score)}
                  </td>
                  <td className="py-3 text-right text-status-approved">{pattern.locationCount}</td>
                  <td className={`py-3 text-right ${pattern.outlierCount > 0 ? 'text-severity-warning' : 'text-dark-muted'}`}>
                    {pattern.outlierCount}
                  </td>
                  <td className="py-3">
                    <span className={`px-2 py-1 rounded text-xs ${statusConfig?.bgColor} ${statusConfig?.color}`}>
                      {statusConfig?.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // Grouped view (default)
  return (
    <div>
      {groupedPatterns.map((group) => (
        <CategorySection
          key={group.category}
          group={group}
          expandedDetectors={expandedDetectors}
          onToggleDetector={onToggleDetector}
          selectedPatternId={selectedPatternId}
          onSelectPattern={onSelectPattern}
        />
      ))}
    </div>
  );
}
