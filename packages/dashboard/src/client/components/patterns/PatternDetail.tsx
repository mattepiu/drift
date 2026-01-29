/**
 * Pattern Detail Panel
 * 
 * Detailed view of a selected pattern with actions.
 */

import { useState } from 'react';

import { STATUS_CONFIG, CATEGORY_CONFIG, DISPLAY_LIMITS } from './constants';
import { formatPercentage, getConfidenceColor, truncatePath } from './utils';
import { usePattern, useApprovePattern, useIgnorePattern, useDeletePattern } from '../../hooks';

import type { PatternWithLocations, SemanticLocation } from '../../types';

// ============================================================================
// Location Item
// ============================================================================

interface LocationItemProps {
  location: SemanticLocation;
  variant: 'consistent' | 'outlier';
}

function LocationItem({ location, variant }: LocationItemProps) {
  const isOutlier = variant === 'outlier';
  const filename = location.file.split('/').pop() || location.file;

  return (
    <div className={`p-3 rounded-lg text-sm ${
      isOutlier 
        ? 'bg-severity-warning/10 border border-severity-warning/20' 
        : 'bg-dark-bg'
    }`}>
      <div className="flex items-start gap-2">
        <span className={`shrink-0 ${isOutlier ? 'text-severity-warning' : 'text-status-approved'}`}>
          {isOutlier ? '⚠' : '✓'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate" title={location.file}>
            {filename}
          </div>
          <div className="text-xs text-dark-muted truncate" title={location.file}>
            {truncatePath(location.file)}
          </div>
          {location.name && (
            <div className="text-xs text-blue-400 mt-1">
              {location.kind && <span className="text-dark-muted">{location.kind}: </span>}
              {location.name}
            </div>
          )}
          {location.reason && (
            <div className={`text-xs mt-1 ${isOutlier ? 'text-severity-warning' : 'text-dark-muted'}`}>
              {location.reason}
            </div>
          )}
          <div className="text-xs text-dark-muted mt-1">
            Line {location.range.start.line}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Actions Bar
// ============================================================================

interface ActionsBarProps {
  pattern: PatternWithLocations;
  onCopyForAI: () => void;
  isCopying: boolean;
  copySuccess: boolean;
}

function ActionsBar({ pattern, onCopyForAI, isCopying, copySuccess }: ActionsBarProps) {
  const approveMutation = useApprovePattern();
  const ignoreMutation = useIgnorePattern();
  const deleteMutation = useDeletePattern();

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this pattern? This action cannot be undone.')) {
      deleteMutation.mutate(pattern.id);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {pattern.status === 'discovered' && (
        <>
          <button
            onClick={() => approveMutation.mutate(pattern.id)}
            disabled={approveMutation.isPending}
            className="btn btn-primary text-sm flex items-center gap-1.5"
          >
            {approveMutation.isPending ? (
              <span className="animate-spin">⏳</span>
            ) : (
              <span>✓</span>
            )}
            Approve
          </button>
          <button
            onClick={() => ignoreMutation.mutate(pattern.id)}
            disabled={ignoreMutation.isPending}
            className="btn btn-secondary text-sm flex items-center gap-1.5"
          >
            {ignoreMutation.isPending ? (
              <span className="animate-spin">⏳</span>
            ) : (
              <span>✗</span>
            )}
            Ignore
          </button>
        </>
      )}
      
      <button
        onClick={onCopyForAI}
        disabled={isCopying}
        className={`btn text-sm flex items-center gap-1.5 ${
          copySuccess ? 'btn-primary' : 'btn-secondary'
        }`}
      >
        {isCopying ? (
          <span className="animate-spin">⏳</span>
        ) : copySuccess ? (
          <span>✓</span>
        ) : (
          <span>📋</span>
        )}
        {copySuccess ? 'Copied!' : 'Copy for AI'}
      </button>

      <button
        onClick={handleDelete}
        disabled={deleteMutation.isPending}
        className="btn btn-danger text-sm flex items-center gap-1.5 ml-auto"
      >
        {deleteMutation.isPending ? (
          <span className="animate-spin">⏳</span>
        ) : (
          <span>🗑️</span>
        )}
        Delete
      </button>
    </div>
  );
}

// ============================================================================
// Stats Grid
// ============================================================================

interface StatsGridProps {
  pattern: PatternWithLocations;
}

function StatsGrid({ pattern }: StatsGridProps) {
  const confidenceColor = getConfidenceColor(pattern.confidence.score);
  const complianceRate = pattern.locations.length / (pattern.locations.length + pattern.outliers.length);

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="p-3 bg-dark-bg rounded-lg">
        <div className="text-xs text-dark-muted mb-1">Confidence</div>
        <div className={`text-xl font-semibold ${confidenceColor}`}>
          {formatPercentage(pattern.confidence.score)}
        </div>
        <div className="text-xs text-dark-muted capitalize">{pattern.confidence.level}</div>
      </div>
      
      <div className="p-3 bg-dark-bg rounded-lg">
        <div className="text-xs text-dark-muted mb-1">Compliance</div>
        <div className={`text-xl font-semibold ${complianceRate >= 0.9 ? 'text-status-approved' : 'text-severity-warning'}`}>
          {formatPercentage(complianceRate)}
        </div>
        <div className="text-xs text-dark-muted">
          {pattern.locations.length} / {pattern.locations.length + pattern.outliers.length}
        </div>
      </div>

      <div className="p-3 bg-status-approved/10 rounded-lg">
        <div className="text-xs text-dark-muted mb-1">Consistent</div>
        <div className="text-xl font-semibold text-status-approved">
          {pattern.locations.length}
        </div>
        <div className="text-xs text-dark-muted">locations</div>
      </div>

      {pattern.outliers.length > 0 && (
        <div className="p-3 bg-severity-warning/10 rounded-lg">
          <div className="text-xs text-dark-muted mb-1">Outliers</div>
          <div className="text-xl font-semibold text-severity-warning">
            {pattern.outliers.length}
          </div>
          <div className="text-xs text-dark-muted">need fixing</div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Detail Component
// ============================================================================

interface PatternDetailProps {
  patternId: string;
}

export function PatternDetail({ patternId }: PatternDetailProps) {
  const { data: pattern, isLoading, error } = usePattern(patternId);
  const [isCopying, setIsCopying] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const copyForAI = async () => {
    if (!pattern) {return;}
    
    setIsCopying(true);
    setCopySuccess(false);

    try {
      const lines: string[] = [
        `# Pattern: ${pattern.name}`,
        `Category: ${pattern.category} | Status: ${pattern.status} | Confidence: ${formatPercentage(pattern.confidence.score)}`,
        '',
      ];

      if (pattern.locations.length > 0) {
        lines.push(`## Established Pattern (${pattern.locations.length} locations)`);
        lines.push('These files follow the pattern correctly:');
        lines.push('');

        const locationsToShow = pattern.locations.slice(0, DISPLAY_LIMITS.QUICK_REVIEW_LOCATIONS);
        for (const loc of locationsToShow) {
          try {
            const response = await fetch(
              `/api/snippet?file=${encodeURIComponent(loc.file)}&line=${loc.range.start.line}&context=2`
            );
            if (response.ok) {
              const snippet = await response.json();
              lines.push(`### ${loc.file}:${loc.range.start.line}`);
              lines.push('```' + snippet.language);
              lines.push(snippet.code);
              lines.push('```');
              lines.push('');
            }
          } catch {
            lines.push(`- ${loc.file}:${loc.range.start.line}`);
          }
        }

        if (pattern.locations.length > DISPLAY_LIMITS.QUICK_REVIEW_LOCATIONS) {
          lines.push(`... and ${pattern.locations.length - DISPLAY_LIMITS.QUICK_REVIEW_LOCATIONS} more locations`);
          lines.push('');
        }
      }

      if (pattern.outliers.length > 0) {
        lines.push(`## ⚠️ Outliers to Fix (${pattern.outliers.length} violations)`);
        lines.push('These files deviate from the established pattern:');
        lines.push('');

        const outliersToShow = pattern.outliers.slice(0, DISPLAY_LIMITS.QUICK_REVIEW_OUTLIERS);
        for (const outlier of outliersToShow) {
          try {
            const response = await fetch(
              `/api/snippet?file=${encodeURIComponent(outlier.file)}&line=${outlier.range.start.line}&context=3`
            );
            if (response.ok) {
              const snippet = await response.json();
              lines.push(`### ${outlier.file}:${outlier.range.start.line}`);
              if (outlier.reason) {
                lines.push(`Reason: ${outlier.reason}`);
              }
              lines.push('```' + snippet.language);
              lines.push(snippet.code);
              lines.push('```');
              lines.push('');
            }
          } catch {
            lines.push(`- ${outlier.file}:${outlier.range.start.line}${outlier.reason ? ` - ${outlier.reason}` : ''}`);
          }
        }

        if (pattern.outliers.length > DISPLAY_LIMITS.QUICK_REVIEW_OUTLIERS) {
          lines.push(`... and ${pattern.outliers.length - DISPLAY_LIMITS.QUICK_REVIEW_OUTLIERS} more outliers`);
          lines.push('');
        }

        lines.push('---');
        lines.push('Please fix these outliers to match the established pattern shown above.');
      }

      await navigator.clipboard.writeText(lines.join('\n'));
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    } finally {
      setIsCopying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-dark-muted">Loading pattern details...</div>
      </div>
    );
  }

  if (error || !pattern) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <span className="text-3xl mb-3">⚠️</span>
        <div className="text-severity-error">Failed to load pattern</div>
        <div className="text-xs text-dark-muted mt-1">Pattern may have been deleted</div>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[pattern.status];
  const categoryConfig = CATEGORY_CONFIG[pattern.category];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold leading-tight">{pattern.name}</h3>
          <span className={`px-2 py-1 rounded text-xs shrink-0 ${statusConfig?.bgColor} ${statusConfig?.color}`}>
            {statusConfig?.icon} {statusConfig?.label}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-2 text-sm text-dark-muted">
          <span>{categoryConfig?.icon}</span>
          <span>{categoryConfig?.label}</span>
        </div>
      </div>

      {/* Actions */}
      <ActionsBar
        pattern={pattern}
        onCopyForAI={copyForAI}
        isCopying={isCopying}
        copySuccess={copySuccess}
      />

      {/* Stats */}
      <StatsGrid pattern={pattern} />

      {/* Consistent Locations */}
      <div>
        <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
          <span className="text-status-approved">✓</span>
          Consistent Locations ({pattern.locations.length})
        </h4>
        <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-dark">
          {pattern.locations.slice(0, DISPLAY_LIMITS.LOCATIONS_PREVIEW).map((loc, i) => (
            <LocationItem key={i} location={loc} variant="consistent" />
          ))}
          {pattern.locations.length > DISPLAY_LIMITS.LOCATIONS_PREVIEW && (
            <div className="text-xs text-dark-muted text-center py-2">
              ... and {pattern.locations.length - DISPLAY_LIMITS.LOCATIONS_PREVIEW} more
            </div>
          )}
        </div>
      </div>

      {/* Outliers */}
      {pattern.outliers.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2 text-severity-warning">
            <span>⚠</span>
            Outliers ({pattern.outliers.length})
          </h4>
          <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-dark">
            {pattern.outliers.slice(0, DISPLAY_LIMITS.OUTLIERS_PREVIEW).map((loc, i) => (
              <LocationItem key={i} location={loc} variant="outlier" />
            ))}
            {pattern.outliers.length > DISPLAY_LIMITS.OUTLIERS_PREVIEW && (
              <div className="text-xs text-dark-muted text-center py-2">
                ... and {pattern.outliers.length - DISPLAY_LIMITS.OUTLIERS_PREVIEW} more
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Empty State
// ============================================================================

export function PatternDetailEmpty() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <span className="text-4xl mb-4">📋</span>
      <h3 className="text-lg font-medium mb-2">No pattern selected</h3>
      <p className="text-dark-muted text-sm max-w-xs">
        Select a pattern from the list to view its details, locations, and outliers.
      </p>
    </div>
  );
}
