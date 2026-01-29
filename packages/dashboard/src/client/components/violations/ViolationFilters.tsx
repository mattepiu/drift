/**
 * Violation Filters Component
 * 
 * Advanced filtering and search for violations.
 */

import { SEVERITY_ORDER, SEVERITY_CONFIG, VIEW_MODE_CONFIG, CATEGORY_CONFIG, CATEGORY_ORDER } from './constants';

import type { ViewMode, SortConfig, SortField } from './types';
import type { ViolationFilters as ViolationFiltersType, Severity } from '../../types';

interface ViolationFiltersProps {
  filters: ViolationFiltersType;
  onFiltersChange: (filters: ViolationFiltersType) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sort: SortConfig;
  onSortChange: (sort: SortConfig) => void;
  resultCount: number;
}

export function ViolationFilters({
  filters,
  onFiltersChange,
  viewMode,
  onViewModeChange,
  sort,
  onSortChange,
  resultCount,
}: ViolationFiltersProps) {
  const handleClearFilters = () => {
    onFiltersChange({});
  };

  const hasActiveFilters = !!(filters.severity || filters.file || filters.patternId || filters.search || (filters as any).category);

  return (
    <div className="space-y-3">
      {/* Search and View Controls */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search violations..."
            className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 pl-10 text-sm focus:outline-none focus:border-blue-500 transition-colors"
            value={filters.search || ''}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value || undefined })}
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-muted">🔍</span>
        </div>

        {/* View Mode Toggle */}
        <div className="flex bg-dark-bg border border-dark-border rounded-lg p-0.5">
          {(Object.keys(VIEW_MODE_CONFIG) as ViewMode[]).map((mode) => {
            const config = VIEW_MODE_CONFIG[mode];
            return (
              <button
                key={mode}
                onClick={() => onViewModeChange(mode)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  viewMode === mode
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'text-dark-muted hover:text-dark-text'
                }`}
                title={config.description}
              >
                {config.icon}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter Row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Severity Filter */}
        <select
          className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          value={filters.severity || ''}
          onChange={(e) => onFiltersChange({ 
            ...filters, 
            severity: e.target.value as Severity || undefined 
          })}
        >
          <option value="">All Severities</option>
          {SEVERITY_ORDER.map((severity) => {
            const config = SEVERITY_CONFIG[severity];
            return (
              <option key={severity} value={severity}>
                {config.icon} {config.label}
              </option>
            );
          })}
        </select>

        {/* Category Filter */}
        <select
          className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          value={(filters as any).category || ''}
          onChange={(e) => onFiltersChange({ 
            ...filters, 
            category: e.target.value || undefined 
          } as any)}
        >
          <option value="">All Categories</option>
          {CATEGORY_ORDER.map((category) => {
            const config = CATEGORY_CONFIG[category];
            return (
              <option key={category} value={category}>
                {config.icon} {config.label}
              </option>
            );
          })}
        </select>

        {/* File Filter */}
        <input
          type="text"
          placeholder="Filter by file..."
          className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 w-48"
          value={filters.file || ''}
          onChange={(e) => onFiltersChange({ ...filters, file: e.target.value || undefined })}
        />

        {/* Sort */}
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-xs text-dark-muted">Sort:</span>
          <select
            className="bg-dark-bg border border-dark-border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
            value={sort.field}
            onChange={(e) => onSortChange({ ...sort, field: e.target.value as SortField })}
          >
            <option value="severity">Severity</option>
            <option value="category">Category</option>
            <option value="file">File</option>
            <option value="pattern">Pattern</option>
            <option value="line">Line</option>
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
            {resultCount} violation{resultCount !== 1 ? 's' : ''}
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
          <div className="flex items-center gap-2 flex-wrap">
            {filters.severity && (
              <span className="px-2 py-0.5 bg-dark-bg border border-dark-border rounded text-xs">
                {SEVERITY_CONFIG[filters.severity]?.icon} {SEVERITY_CONFIG[filters.severity]?.label}
                <button
                  onClick={() => onFiltersChange({ ...filters, severity: undefined })}
                  className="ml-1 text-dark-muted hover:text-dark-text"
                >
                  ×
                </button>
              </span>
            )}
            {(filters as any).category && (
              <span className="px-2 py-0.5 bg-dark-bg border border-dark-border rounded text-xs">
                {CATEGORY_CONFIG[(filters as any).category]?.icon} {CATEGORY_CONFIG[(filters as any).category]?.label}
                <button
                  onClick={() => onFiltersChange({ ...filters, category: undefined } as any)}
                  className="ml-1 text-dark-muted hover:text-dark-text"
                >
                  ×
                </button>
              </span>
            )}
            {filters.file && (
              <span className="px-2 py-0.5 bg-dark-bg border border-dark-border rounded text-xs">
                📁 {filters.file.length > 20 ? filters.file.slice(0, 20) + '...' : filters.file}
                <button
                  onClick={() => onFiltersChange({ ...filters, file: undefined })}
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
