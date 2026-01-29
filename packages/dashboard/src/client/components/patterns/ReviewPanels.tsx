/**
 * Review Panel Components
 * 
 * Quick Review and Needs Review modals for bulk pattern management.
 */

import React, { useState, useMemo } from 'react';

import { DISPLAY_LIMITS } from './constants';
import { getReviewablePatterns, formatPercentage, getConfidenceColor, truncatePath } from './utils';
import { usePattern, useApprovePattern, useIgnorePattern, useBulkApprovePatterns } from '../../hooks';

import type { Pattern } from '../../types';

// ============================================================================
// Shared Components
// ============================================================================

interface ModalProps {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

function Modal({ title, subtitle, onClose, children, footer }: ModalProps) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-dark-surface border border-dark-border rounded-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-dark-border">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">{title}</h2>
              <p className="text-sm text-dark-muted mt-1">{subtitle}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-dark-muted hover:text-dark-text hover:bg-dark-border/50 rounded-lg transition-colors"
            >
              <span className="text-xl">✕</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="p-4 border-t border-dark-border bg-dark-bg">{footer}</div>
        )}
      </div>
    </div>
  );
}

interface EmptyStateProps {
  icon: string;
  title: string;
  message: string;
  onClose: () => void;
}

function EmptyState({ icon, title, message, onClose }: EmptyStateProps) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-dark-surface border border-dark-border rounded-xl p-8 max-w-md text-center">
        <span className="text-5xl mb-4 block">{icon}</span>
        <h2 className="text-xl font-semibold mb-3">{title}</h2>
        <p className="text-dark-muted mb-6">{message}</p>
        <button onClick={onClose} className="btn btn-secondary w-full">
          Close
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Quick Review Panel
// ============================================================================

interface QuickReviewProps {
  patterns: Pattern[];
  onClose: () => void;
}

export function QuickReviewPanel({ patterns, onClose }: QuickReviewProps) {
  const bulkApproveMutation = useBulkApprovePatterns();
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [currentIndex, setCurrentIndex] = useState(0);

  const reviewablePatterns = useMemo(
    () => getReviewablePatterns(patterns, 'quick'),
    [patterns]
  );

  const includedPatterns = reviewablePatterns.filter((p) => !excludedIds.has(p.id));
  const currentPattern = reviewablePatterns[currentIndex];

  const toggleExclude = (id: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleApproveAll = async () => {
    const idsToApprove = includedPatterns.map((p) => p.id);
    if (idsToApprove.length === 0) {return;}
    await bulkApproveMutation.mutateAsync(idsToApprove);
    onClose();
  };

  if (reviewablePatterns.length === 0) {
    return (
      <EmptyState
        icon="⚡"
        title="Quick Review"
        message="No high-confidence patterns (≥95%) need review. All patterns either need manual review or are already approved."
        onClose={onClose}
      />
    );
  }

  return (
    <Modal
      title="⚡ Quick Review"
      subtitle={`${reviewablePatterns.length} high-confidence patterns (≥95%) ready for approval`}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between">
          <div className="text-sm">
            <span className="text-dark-muted">Selected: </span>
            <span className="font-semibold text-status-approved">{includedPatterns.length}</span>
            <span className="text-dark-muted"> of {reviewablePatterns.length}</span>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button
              onClick={handleApproveAll}
              disabled={includedPatterns.length === 0 || bulkApproveMutation.isPending}
              className="btn btn-primary"
            >
              {bulkApproveMutation.isPending
                ? '⏳ Approving...'
                : `✓ Approve ${includedPatterns.length} Patterns`}
            </button>
          </div>
        </div>
      }
    >
      <div className="flex h-[60vh]">
        {/* Pattern List */}
        <div className="w-80 border-r border-dark-border overflow-y-auto">
          <div className="p-3 space-y-1">
            {reviewablePatterns.map((pattern, idx) => (
              <button
                key={pattern.id}
                onClick={() => setCurrentIndex(idx)}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  currentIndex === idx
                    ? 'bg-blue-500/20 border border-blue-500/30'
                    : excludedIds.has(pattern.id)
                    ? 'bg-dark-bg/50 opacity-50'
                    : 'hover:bg-dark-border/50 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={!excludedIds.has(pattern.id)}
                    onChange={() => toggleExclude(pattern.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded border-dark-border"
                  />
                  <div className="min-w-0 flex-1">
                    <div className={`font-medium truncate ${excludedIds.has(pattern.id) ? 'line-through' : ''}`}>
                      {pattern.name}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs">
                      <span className="text-status-approved">
                        {formatPercentage(pattern.confidence.score)}
                      </span>
                      <span className="text-dark-muted">•</span>
                      <span className="text-dark-muted">{pattern.locationCount} locations</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Pattern Preview */}
        <div className="flex-1 overflow-y-auto p-5">
          {currentPattern && (
            <div className="space-y-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{currentPattern.name}</h3>
                  <div className="flex items-center gap-2 mt-1 text-sm text-dark-muted">
                    <span>{currentPattern.category}</span>
                    <span>•</span>
                    <span className="text-status-approved font-medium">
                      {formatPercentage(currentPattern.confidence.score)} confidence
                    </span>
                  </div>
                  <div className="text-xs text-dark-muted mt-2">{currentPattern.reviewReason}</div>
                </div>
                <button
                  onClick={() => toggleExclude(currentPattern.id)}
                  className={`btn text-sm ${excludedIds.has(currentPattern.id) ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {excludedIds.has(currentPattern.id) ? '✓ Include' : '✗ Exclude'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-dark-bg rounded-lg">
                  <div className="text-xs text-dark-muted mb-1">Consistent Locations</div>
                  <div className="text-2xl font-semibold text-status-approved">
                    {currentPattern.locationCount}
                  </div>
                </div>
                <div className="p-4 bg-dark-bg rounded-lg">
                  <div className="text-xs text-dark-muted mb-1">Outliers</div>
                  <div className={`text-2xl font-semibold ${currentPattern.outlierCount > 0 ? 'text-severity-warning' : 'text-dark-text'}`}>
                    {currentPattern.outlierCount}
                  </div>
                </div>
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between pt-4 border-t border-dark-border">
                <button
                  onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                  disabled={currentIndex === 0}
                  className="btn btn-secondary text-sm"
                >
                  ← Previous
                </button>
                <span className="text-sm text-dark-muted">
                  {currentIndex + 1} of {reviewablePatterns.length}
                </span>
                <button
                  onClick={() => setCurrentIndex(Math.min(reviewablePatterns.length - 1, currentIndex + 1))}
                  disabled={currentIndex === reviewablePatterns.length - 1}
                  className="btn btn-secondary text-sm"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ============================================================================
// Needs Review Panel
// ============================================================================

interface NeedsReviewPreviewProps {
  patternId: string;
}

function NeedsReviewPreview({ patternId }: NeedsReviewPreviewProps) {
  const { data: pattern, isLoading } = usePattern(patternId);

  if (isLoading) {
    return <div className="text-dark-muted text-sm py-8 text-center">Loading details...</div>;
  }

  if (!pattern) {
    return <div className="text-severity-error text-sm py-8 text-center">Failed to load</div>;
  }

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 bg-dark-bg rounded-lg">
          <div className="text-xs text-dark-muted mb-1">Confidence</div>
          <div className={`text-2xl font-semibold ${getConfidenceColor(pattern.confidence.score)}`}>
            {formatPercentage(pattern.confidence.score)}
          </div>
        </div>
        <div className="p-4 bg-dark-bg rounded-lg">
          <div className="text-xs text-dark-muted mb-1">Consistent</div>
          <div className="text-2xl font-semibold text-status-approved">{pattern.locations.length}</div>
        </div>
        <div className="p-4 bg-dark-bg rounded-lg">
          <div className="text-xs text-dark-muted mb-1">Outliers</div>
          <div className={`text-2xl font-semibold ${pattern.outliers.length > 0 ? 'text-severity-warning' : 'text-dark-text'}`}>
            {pattern.outliers.length}
          </div>
        </div>
      </div>

      {/* Outliers */}
      {pattern.outliers.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-3 text-severity-warning flex items-center gap-2">
            <span>⚠</span> Outliers - What's Wrong
          </h4>
          <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-dark">
            {pattern.outliers.slice(0, DISPLAY_LIMITS.NEEDS_REVIEW_OUTLIERS).map((outlier, i) => (
              <div
                key={i}
                className="p-3 bg-severity-warning/10 border border-severity-warning/20 rounded-lg text-sm"
              >
                <div className="flex items-start gap-2">
                  <span className="text-severity-warning shrink-0">⚠</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{outlier.file.split('/').pop()}</div>
                    <div className="text-xs text-dark-muted truncate">{truncatePath(outlier.file)}</div>
                    {outlier.name && (
                      <div className="text-xs text-blue-400 mt-1">
                        {outlier.kind && <span className="text-dark-muted">{outlier.kind}: </span>}
                        {outlier.name}
                      </div>
                    )}
                    {outlier.reason && (
                      <div className="text-xs text-severity-warning mt-1">{outlier.reason}</div>
                    )}
                    <div className="text-xs text-dark-muted mt-1">Line {outlier.range.start.line}</div>
                  </div>
                </div>
              </div>
            ))}
            {pattern.outliers.length > DISPLAY_LIMITS.NEEDS_REVIEW_OUTLIERS && (
              <div className="text-xs text-dark-muted text-center py-2">
                ... and {pattern.outliers.length - DISPLAY_LIMITS.NEEDS_REVIEW_OUTLIERS} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sample Locations */}
      {pattern.locations.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-3 text-status-approved flex items-center gap-2">
            <span>✓</span> Sample Consistent Locations
          </h4>
          <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-dark">
            {pattern.locations.slice(0, DISPLAY_LIMITS.NEEDS_REVIEW_LOCATIONS).map((loc, i) => (
              <div key={i} className="p-2 bg-dark-bg rounded text-xs flex items-center gap-2">
                <span className="text-status-approved">✓</span>
                <span className="truncate flex-1">{loc.file}</span>
                <span className="text-dark-muted shrink-0">L{loc.range.start.line}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface NeedsReviewProps {
  patterns: Pattern[];
  onClose: () => void;
}

export function NeedsReviewPanel({ patterns, onClose }: NeedsReviewProps) {
  const approveMutation = useApprovePattern();
  const ignoreMutation = useIgnorePattern();
  const [currentIndex, setCurrentIndex] = useState(0);

  const reviewablePatterns = useMemo(
    () => getReviewablePatterns(patterns, 'needs-review'),
    [patterns]
  );

  const currentPattern = reviewablePatterns[currentIndex];

  const handleAction = async (action: 'approve' | 'ignore') => {
    if (!currentPattern) {return;}

    const mutation = action === 'approve' ? approveMutation : ignoreMutation;
    await mutation.mutateAsync(currentPattern.id);

    // Move to next or close
    if (currentIndex >= reviewablePatterns.length - 1) {
      if (reviewablePatterns.length <= 1) {
        onClose();
      } else {
        setCurrentIndex(currentIndex - 1);
      }
    }
  };

  if (reviewablePatterns.length === 0) {
    return (
      <EmptyState
        icon="🔍"
        title="Needs Review"
        message="No patterns need manual review. All discovered patterns are high-confidence (≥95%)."
        onClose={onClose}
      />
    );
  }

  return (
    <Modal
      title="🔍 Needs Review"
      subtitle={`${reviewablePatterns.length} patterns with lower confidence (<95%) need your attention`}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
              disabled={currentIndex === 0}
              className="btn btn-secondary text-sm"
            >
              ← Previous
            </button>
            <span className="text-sm text-dark-muted">
              {currentIndex + 1} of {reviewablePatterns.length}
            </span>
            <button
              onClick={() => setCurrentIndex(Math.min(reviewablePatterns.length - 1, currentIndex + 1))}
              disabled={currentIndex === reviewablePatterns.length - 1}
              className="btn btn-secondary text-sm"
            >
              Next →
            </button>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => handleAction('ignore')}
              disabled={ignoreMutation.isPending || !currentPattern}
              className="btn btn-secondary"
            >
              {ignoreMutation.isPending ? '⏳...' : '✗ Ignore'}
            </button>
            <button
              onClick={() => handleAction('approve')}
              disabled={approveMutation.isPending || !currentPattern}
              className="btn btn-primary"
            >
              {approveMutation.isPending ? '⏳...' : '✓ Approve'}
            </button>
          </div>
        </div>
      }
    >
      <div className="flex h-[60vh]">
        {/* Pattern List */}
        <div className="w-80 border-r border-dark-border overflow-y-auto">
          <div className="p-3 space-y-1">
            {reviewablePatterns.map((pattern, idx) => (
              <button
                key={pattern.id}
                onClick={() => setCurrentIndex(idx)}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  currentIndex === idx
                    ? 'bg-blue-500/20 border border-blue-500/30'
                    : 'hover:bg-dark-border/50 border border-transparent'
                }`}
              >
                <div className="font-medium truncate">{pattern.name}</div>
                <div className="flex items-center gap-2 mt-1 text-xs">
                  <span className={getConfidenceColor(pattern.confidence.score)}>
                    {formatPercentage(pattern.confidence.score)}
                  </span>
                  <span className="text-dark-muted">•</span>
                  <span className="text-dark-muted">{pattern.category}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs">
                  <span className="text-status-approved">✓ {pattern.locationCount}</span>
                  {pattern.outlierCount > 0 && (
                    <span className="text-severity-warning">⚠ {pattern.outlierCount}</span>
                  )}
                </div>
                <div className="text-xs text-dark-muted mt-1">{pattern.reviewReason}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Pattern Details */}
        <div className="flex-1 overflow-y-auto p-5">
          {currentPattern && (
            <div className="space-y-5">
              <div>
                <h3 className="text-lg font-semibold">{currentPattern.name}</h3>
                <div className="flex items-center gap-2 mt-1 text-sm text-dark-muted">
                  <span>{currentPattern.category}</span>
                  <span>•</span>
                  <span className={getConfidenceColor(currentPattern.confidence.score)}>
                    {formatPercentage(currentPattern.confidence.score)} confidence
                  </span>
                </div>
              </div>
              <NeedsReviewPreview patternId={currentPattern.id} />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
