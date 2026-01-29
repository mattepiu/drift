/**
 * Pattern Filters Component
 * 
 * Advanced filtering and search for patterns.
 */


import { CATEGORY_CONFIG, CATEGORY_ORDER, STATUS_CONFIG } from './constants';

import type { ViewMode, SortConfig, SortField } from './types';
import type { PatternFilters as PatternFiltersType } from '../../types';

interface PatternFiltersProps {
  filters: PatternFiltersType;
  onFiltersChange: (filters: PatternFiltersType) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sort: SortConfig;
  onSortChange: (sort: SortConfig) => void;
  resultCount: number;
}

export function PatternFilters({
  filters,
  onFiltersChange,
  viewMode,
  onViewModeChange,
  sort,
  onSortChange,
  resultCount,
}: PatternFiltersProps) {
  const handleClearFilters = () => {
    onFiltersChange({});
  };

  const hasActiveFilters = !!(filters.category || filters.status || filters.minConfidence || filters.search);

  return (
    <div className="space-y-3">
      {/* Search and View Controls */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search patterns..."
            className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 pl-10 text-sm focus:outline-none focus:border-blue-500 transition-colors"
            value={filters.search || ''}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value || undefined })}
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-muted">🔍</span>
        </div>

        {/* View Mode Toggle */}
        <div className="flex bg-dark-bg border border-dark-border rounded-lg p-0.5">
          {(['grouped', 'flat', 'table'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => onViewModeChange(mode)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                viewMode === mode
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-dark-muted hover:text-dark-text'
              }`}
              title={`${mode.charAt(0).toUpperCase() + mode.slice(1)} view`}
            >
              {mode === 'grouped' ? '📁' : mode === 'flat' ? '📋' : '📊'}
            </button>
          ))}
        </div>
      </div>

      {/* Filter Row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Category Filter */}
        <select
          className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          value={filters.category || ''}
          onChange={(e) => onFiltersChange({ 
            ...filters, 
            category: e.target.value as PatternFiltersType['category'] || undefined 
          })}
        >
          <option value="">All Categories</option>
          {CATEGORY_ORDER.map((cat) => {
            const config = CATEGORY_CONFIG[cat];
            return (
              <option key={cat} value={cat}>
                {config.icon} {config.label}
              </option>
            );
          })}
        </select>

        {/* Status Filter */}
        <select
          className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          value={filters.status || ''}
          onChange={(e) => onFiltersChange({ 
            ...filters, 
            status: e.target.value as PatternFiltersType['status'] || undefined 
          })}
        >
          <option value="">All Statuses</option>
          {Object.entries(STATUS_CONFIG).map(([status, config]) => (
            <option key={status} value={status}>
              {config.icon} {config.label}
            </option>
          ))}
        </select>

        {/* Confidence Filter */}
        <select
          className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          value={filters.minConfidence?.toString() || ''}
          onChange={(e) => onFiltersChange({ 
            ...filters, 
            minConfidence: e.target.value ? parseFloat(e.target.value) : undefined 
          })}
        >
          <option value="">Any Confidence</option>
          <option value="0.95">High (≥95%)</option>
          <option value="0.70">Medium+ (≥70%)</option>
          <option value="0.50">Low+ (≥50%)</option>
        </select>

        {/* Sort */}
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-xs text-dark-muted">Sort:</span>
          <select
            className="bg-dark-bg border border-dark-border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
            value={sort.field}
            onChange={(e) => onSortChange({ ...sort, field: e.target.value as SortField })}
          >
            <option value="confidence">Confidence</option>
            <option value="locations">Locations</option>
            <option value="outliers">Outliers</option>
            <option value="name">Name</option>
            <option value="category">Category</option>
            <option value="status">Status</option>
          </select>
          <button
            onClick={() => onSortChange({ 
              ...sort, 
              direction: sort.direction === 'asc' ? 'desc' : 'asc' 
            })}
            className="p-1.5 bg-dark-bg border border-dark-border rounded-lg text-sm hover:bg-dark-border/50 transition-colors"
            title={sort.direction === 'asc' ? 'Ascending' : 'Descending'}
          >
            {sort.direction === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>

      {/* Active Filters & Results */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="text-dark-muted">
            {resultCount} pattern{resultCount !== 1 ? 's' : ''}
          </span>
          {hasActiveFilters && (
            <>
              <span className="text-dark-border">•</span>
              <button
                onClick={handleClearFilters}
                className="text-blue-400 hover:text-blue-300 transition-colors"
              >
                Clear filters
              </button>
            </>
          )}
        </div>

        {/* Active Filter Pills */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2">
            {filters.category && (
              <span className="px-2 py-0.5 bg-dark-bg border border-dark-border rounded text-xs">
                {CATEGORY_CONFIG[filters.category]?.icon} {CATEGORY_CONFIG[filters.category]?.label}
                <button
                  onClick={() => onFiltersChange({ ...filters, category: undefined })}
                  className="ml-1 text-dark-muted hover:text-dark-text"
                >
                  ×
                </button>
              </span>
            )}
            {filters.status && (
              <span className="px-2 py-0.5 bg-dark-bg border border-dark-border rounded text-xs">
                {STATUS_CONFIG[filters.status]?.icon} {STATUS_CONFIG[filters.status]?.label}
                <button
                  onClick={() => onFiltersChange({ ...filters, status: undefined })}
                  className="ml-1 text-dark-muted hover:text-dark-text"
                >
                  ×
                </button>
              </span>
            )}
            {filters.minConfidence && (
              <span className="px-2 py-0.5 bg-dark-bg border border-dark-border rounded text-xs">
                ≥{Math.round(filters.minConfidence * 100)}%
                <button
                  onClick={() => onFiltersChange({ ...filters, minConfidence: undefined })}
                  className="ml-1 text-dark-muted hover:text-dark-text"
                >
                  ×
                </button>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
