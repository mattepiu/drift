/**
 * Violations Tab Component
 * 
 * Enterprise-grade violation management interface with:
 * - Multiple view modes (list, by-file, by-pattern)
 * - Advanced filtering and sorting
 * - Real-time violation updates
 * - Detailed statistics
 */

import { useMemo, useState, useCallback } from 'react';

import { calculateStatistics, sortViolations, mergeViolations } from './utils';
import { ViolationFilters } from './ViolationFilters';
import { ViolationList } from './ViolationList';
import { ViolationStats } from './ViolationStats';
import { useViolations } from '../../hooks';
import { useDashboardStore } from '../../store';

import type { ViewMode, SortConfig } from './types';

export function ViolationsTab() {
  // Global state
  const { 
    violationFilters, 
    setViolationFilters, 
    expandedViolations, 
    toggleViolationExpanded,
    realtimeViolations,
  } = useDashboardStore();

  // Local state
  const [viewMode, setViewMode] = useState<ViewMode>('by-severity');
  const [sort, setSort] = useState<SortConfig>({ field: 'severity', direction: 'desc' });
  const [showStats, setShowStats] = useState(true);

  // Data fetching
  const { data: fetchedViolations, isLoading, error } = useViolations(violationFilters);

  // Merge realtime violations with fetched ones
  const allViolations = useMemo(() => {
    if (!fetchedViolations) {return realtimeViolations;}
    return mergeViolations(fetchedViolations, realtimeViolations);
  }, [fetchedViolations, realtimeViolations]);

  // Sort violations
  const sortedViolations = useMemo(() => {
    return sortViolations(allViolations, sort);
  }, [allViolations, sort]);

  // Calculate statistics
  const statistics = useMemo(() => {
    return calculateStatistics(allViolations, realtimeViolations.length);
  }, [allViolations, realtimeViolations.length]);

  // Handlers
  const handleToggleViolation = useCallback((id: string) => {
    toggleViolationExpanded(id);
  }, [toggleViolationExpanded]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-dark-muted">Loading violations...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <span className="text-4xl mb-4">⚠️</span>
        <h3 className="text-lg font-medium text-severity-error mb-2">Failed to load violations</h3>
        <p className="text-dark-muted text-sm max-w-md">
          There was an error loading the violation data. Please try refreshing the page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Statistics Section */}
      {showStats && (
        <div className="relative">
          <button
            onClick={() => setShowStats(false)}
            className="absolute -top-1 -right-1 p-1 text-dark-muted hover:text-dark-text z-10"
            title="Hide statistics"
          >
            <span className="text-xs">✕</span>
          </button>
          <ViolationStats statistics={statistics} />
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

      {/* Filters */}
      <ViolationFilters
        filters={violationFilters}
        onFiltersChange={setViolationFilters}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        sort={sort}
        onSortChange={setSort}
        resultCount={sortedViolations.length}
      />

      {/* Violation List */}
      <div className="max-h-[calc(100vh-400px)] overflow-y-auto scrollbar-dark pr-2">
        <ViolationList
          violations={sortedViolations}
          viewMode={viewMode}
          expandedViolations={expandedViolations}
          onToggleViolation={handleToggleViolation}
        />
      </div>
    </div>
  );
}
