/**
 * Boundary Filters Component
 * 
 * Filter controls for boundary data.
 */

import { VIEW_MODE_CONFIG, SENSITIVITY_CONFIG, OPERATION_CONFIG } from './constants';

import type { ViewMode, BoundaryFilters, SensitivityType, DataOperation } from './types';

interface BoundaryFiltersProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  filters: BoundaryFilters;
  onFiltersChange: (filters: BoundaryFilters) => void;
}

export function BoundaryFiltersComponent({
  viewMode,
  onViewModeChange,
  filters,
  onFiltersChange,
}: BoundaryFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 mb-6">
      {/* View Mode Toggle */}
      <div className="flex bg-dark-bg rounded-lg p-1">
        {(Object.keys(VIEW_MODE_CONFIG) as ViewMode[]).map((mode) => {
          const config = VIEW_MODE_CONFIG[mode];
          return (
            <button
              key={mode}
              onClick={() => onViewModeChange(mode)}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                viewMode === mode
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-dark-muted hover:text-dark-text'
              }`}
              title={config.description}
            >
              {config.icon} {config.label}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="flex-1 min-w-[200px]">
        <input
          type="text"
          placeholder="Search tables, fields, files..."
          value={filters.search ?? ''}
          onChange={(e) => onFiltersChange({ ...filters, search: e.target.value || undefined })}
          className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Sensitivity Type Filter */}
      <select
        value={filters.sensitivityType ?? ''}
        onChange={(e) => onFiltersChange({
          ...filters,
          sensitivityType: e.target.value as SensitivityType || undefined,
        })}
        className="px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm focus:outline-none focus:border-blue-500"
      >
        <option value="">All Sensitivity</option>
        {(Object.keys(SENSITIVITY_CONFIG) as SensitivityType[]).map((type) => {
          const config = SENSITIVITY_CONFIG[type];
          return (
            <option key={type} value={type}>
              {config.icon} {config.label}
            </option>
          );
        })}
      </select>

      {/* Operation Filter */}
      {viewMode !== 'sensitive' && (
        <select
          value={filters.operation ?? ''}
          onChange={(e) => onFiltersChange({
            ...filters,
            operation: e.target.value as DataOperation || undefined,
          })}
          className="px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm focus:outline-none focus:border-blue-500"
        >
          <option value="">All Operations</option>
          {(Object.keys(OPERATION_CONFIG) as DataOperation[]).filter(op => op !== 'unknown').map((op) => {
            const config = OPERATION_CONFIG[op];
            return (
              <option key={op} value={op}>
                {config.icon} {config.label}
              </option>
            );
          })}
        </select>
      )}

      {/* Clear Filters */}
      {(filters.search || filters.sensitivityType || filters.operation) && (
        <button
          onClick={() => onFiltersChange({})}
          className="px-3 py-2 text-sm text-dark-muted hover:text-dark-text transition-colors"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
