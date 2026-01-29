/**
 * Patterns Tab Component
 * 
 * Enterprise-grade pattern management interface with:
 * - Multiple view modes (grouped, flat, table)
 * - Advanced filtering and sorting
 * - Bulk review workflows
 * - Real-time statistics
 * - Detailed pattern inspection
 */

import React, { useMemo, useState, useCallback } from 'react';

import { PatternDetail, PatternDetailEmpty } from './PatternDetail';
import { PatternFilters } from './PatternFilters';
import { PatternList } from './PatternList';
import { PatternStats } from './PatternStats';
import { QuickReviewPanel, NeedsReviewPanel } from './ReviewPanels';
import { calculateStatistics, groupPatternsByCategory, sortPatterns } from './utils';
import { usePatterns } from '../../hooks';
import { useDashboardStore } from '../../store';

import type { ViewMode, SortConfig } from './types';

export function PatternsTab(): React.ReactElement {
  // Global state
  const { patternFilters, setPatternFilters, selectedPattern, setSelectedPattern } = useDashboardStore();
  
  // Local state
  const [viewMode, setViewMode] = useState<ViewMode>('grouped');
  const [sort, setSort] = useState<SortConfig>({ field: 'confidence', direction: 'desc' });
  const [expandedDetectors, setExpandedDetectors] = useState<Set<string>>(new Set());
  const [showQuickReview, setShowQuickReview] = useState(false);
  const [showNeedsReview, setShowNeedsReview] = useState(false);
  const [showStats, setShowStats] = useState(true);

  // Data fetching
  const { data: patterns, isLoading, error } = usePatterns(patternFilters);

  // Computed data
  const sortedPatterns = useMemo(() => {
    if (!patterns) {return [];}
    return sortPatterns(patterns, sort);
  }, [patterns, sort]);

  const groupedPatterns = useMemo(() => {
    if (!patterns) {return [];}
    return groupPatternsByCategory(patterns);
  }, [patterns]);

  const statistics = useMemo(() => {
    if (!patterns) {return null;}
    return calculateStatistics(patterns);
  }, [patterns]);

  // Handlers
  const toggleDetector = useCallback((id: string) => {
    setExpandedDetectors((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectPattern = useCallback((id: string) => {
    setSelectedPattern(id === selectedPattern ? null : id);
  }, [selectedPattern, setSelectedPattern]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-dark-muted">Loading patterns...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <span className="text-4xl mb-4">⚠️</span>
        <h3 className="text-lg font-medium text-severity-error mb-2">Failed to load patterns</h3>
        <p className="text-dark-muted text-sm max-w-md">
          There was an error loading the pattern data. Please try refreshing the page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Review Modals */}
      {showQuickReview && patterns && (
        <QuickReviewPanel patterns={patterns} onClose={() => setShowQuickReview(false)} />
      )}
      {showNeedsReview && patterns && (
        <NeedsReviewPanel patterns={patterns} onClose={() => setShowNeedsReview(false)} />
      )}

      {/* Statistics Section */}
      {statistics && showStats && (
        <div className="relative">
          <button
            onClick={() => setShowStats(false)}
            className="absolute -top-1 -right-1 p-1 text-dark-muted hover:text-dark-text z-10"
            title="Hide statistics"
          >
            <span className="text-xs">✕</span>
          </button>
          <PatternStats
            statistics={statistics}
            onQuickReview={() => setShowQuickReview(true)}
            onNeedsReview={() => setShowNeedsReview(true)}
          />
        </div>
      )}

      {/* Show Stats Toggle (when hidden) */}
      {!showStats && (
        <button
          onClick={() => setShowStats(true)}
          className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          📊 Show statistics
        </button>
      )}

      {/* Main Content */}
      <div className="flex gap-6">
        {/* Pattern List Section */}
        <div className="flex-1 min-w-0">
          {/* Filters */}
          <div className="mb-4">
            <PatternFilters
              filters={patternFilters}
              onFiltersChange={setPatternFilters}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              sort={sort}
              onSortChange={setSort}
              resultCount={patterns?.length || 0}
            />
          </div>

          {/* Pattern List */}
          <div className="max-h-[calc(100vh-400px)] overflow-y-auto scrollbar-dark pr-2">
            <PatternList
              patterns={sortedPatterns}
              groupedPatterns={groupedPatterns}
              viewMode={viewMode}
              expandedDetectors={expandedDetectors}
              onToggleDetector={toggleDetector}
              selectedPatternId={selectedPattern}
              onSelectPattern={handleSelectPattern}
            />
          </div>
        </div>

        {/* Detail Panel */}
        <div className="w-96 shrink-0">
          <div className="sticky top-4 bg-dark-surface border border-dark-border rounded-xl p-5">
            {selectedPattern ? (
              <PatternDetail patternId={selectedPattern} />
            ) : (
              <PatternDetailEmpty />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
