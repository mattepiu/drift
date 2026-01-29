/**
 * Contract Filters Component
 * 
 * Advanced filtering and search for contracts.
 */

import { METHOD_ORDER, METHOD_CONFIG, STATUS_CONFIG, VIEW_MODE_CONFIG } from './constants';

import type { ViewMode, SortConfig, SortField } from './types';
import type { ContractFilters as ContractFiltersType, ContractStatus, HttpMethod } from '../../types';

interface ContractFiltersProps {
  filters: ContractFiltersType;
  onFiltersChange: (filters: ContractFiltersType) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sort: SortConfig;
  onSortChange: (sort: SortConfig) => void;
  resultCount: number;
}

export function ContractFilters({
  filters,
  onFiltersChange,
  viewMode,
  onViewModeChange,
  sort,
  onSortChange,
  resultCount,
}: ContractFiltersProps) {
  const handleClearFilters = () => {
    onFiltersChange({});
  };

  const hasActiveFilters = !!(filters.status || filters.method || filters.hasMismatches || filters.search);

  return (
    <div className="space-y-3">
      {/* Search and View Controls */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search endpoints..."
            className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 pl-10 text-sm focus:outline-none focus:border-blue-500 transition-colors font-mono"
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
        {/* Status Filter */}
        <select
          className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          value={filters.status || ''}
          onChange={(e) => onFiltersChange({ 
            ...filters, 
            status: e.target.value as ContractStatus || undefined 
          })}
        >
          <option value="">All Statuses</option>
          {Object.entries(STATUS_CONFIG).map(([status, config]) => (
            <option key={status} value={status}>
              {config.icon} {config.label}
            </option>
          ))}
        </select>

        {/* Method Filter */}
        <select
          className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          value={filters.method || ''}
          onChange={(e) => onFiltersChange({ 
            ...filters, 
            method: e.target.value as HttpMethod || undefined 
          })}
        >
          <option value="">All Methods</option>
          {METHOD_ORDER.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
        </select>

        {/* Has Mismatches Toggle */}
        <label className="flex items-center gap-2 px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm cursor-pointer hover:bg-dark-border/50 transition-colors">
          <input
            type="checkbox"
            checked={filters.hasMismatches || false}
            onChange={(e) => onFiltersChange({ ...filters, hasMismatches: e.target.checked || undefined })}
            className="rounded border-dark-border"
          />
          <span className="text-severity-warning">⚠️</span>
          <span>Has Mismatches</span>
        </label>

        {/* Sort */}
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-xs text-dark-muted">Sort:</span>
          <select
            className="bg-dark-bg border border-dark-border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
            value={sort.field}
            onChange={(e) => onSortChange({ ...sort, field: e.target.value as SortField })}
          >
            <option value="mismatches">Mismatches</option>
            <option value="endpoint">Endpoint</option>
            <option value="method">Method</option>
            <option value="status">Status</option>
            <option value="confidence">Confidence</option>
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
            {resultCount} contract{resultCount !== 1 ? 's' : ''}
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
            {filters.method && (
              <span className={`px-2 py-0.5 bg-dark-bg border border-dark-border rounded text-xs font-mono ${METHOD_CONFIG[filters.method]?.color}`}>
                {filters.method}
                <button
                  onClick={() => onFiltersChange({ ...filters, method: undefined })}
                  className="ml-1 text-dark-muted hover:text-dark-text"
                >
                  ×
                </button>
              </span>
            )}
            {filters.hasMismatches && (
              <span className="px-2 py-0.5 bg-dark-bg border border-dark-border rounded text-xs">
                ⚠️ Has Mismatches
                <button
                  onClick={() => onFiltersChange({ ...filters, hasMismatches: undefined })}
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
