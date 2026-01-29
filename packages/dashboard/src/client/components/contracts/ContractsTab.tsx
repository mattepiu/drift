/**
 * Contracts Tab Component
 * 
 * Enterprise-grade BE↔FE contract management interface with:
 * - Multiple view modes (list, by-endpoint, by-method)
 * - Advanced filtering and sorting
 * - Mismatch detection and analysis
 * - Detailed statistics
 */

import { useMemo, useState, useCallback } from 'react';

import { ContractDetail, ContractDetailEmpty } from './ContractDetail';
import { ContractFilters } from './ContractFilters';
import { ContractList } from './ContractList';
import { ContractStats } from './ContractStats';
import { calculateStatistics, sortContracts } from './utils';
import { useContracts } from '../../hooks';

import type { ViewMode, SortConfig } from './types';
import type { ContractFilters as ContractFiltersType } from '../../types';

export function ContractsTab() {
  // Local state
  const [filters, setFilters] = useState<ContractFiltersType>({});
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [sort, setSort] = useState<SortConfig>({ field: 'mismatches', direction: 'desc' });
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(true);

  // Data fetching
  const { data: contracts, isLoading, error } = useContracts(filters);

  // Sort contracts
  const sortedContracts = useMemo(() => {
    if (!contracts) {return [];}
    return sortContracts(contracts, sort);
  }, [contracts, sort]);

  // Calculate statistics
  const statistics = useMemo(() => {
    if (!contracts) {return null;}
    return calculateStatistics(contracts);
  }, [contracts]);

  // Handlers
  const handleSelectContract = useCallback((id: string) => {
    setSelectedContractId(id === selectedContractId ? null : id);
  }, [selectedContractId]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-dark-muted">Loading contracts...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <span className="text-4xl mb-4">⚠️</span>
        <h3 className="text-lg font-medium text-severity-error mb-2">Failed to load contracts</h3>
        <p className="text-dark-muted text-sm max-w-md">
          There was an error loading the contract data. Please try refreshing the page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
          <ContractStats statistics={statistics} />
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
        {/* Contract List Section */}
        <div className="flex-1 min-w-0">
          {/* Filters */}
          <div className="mb-4">
            <ContractFilters
              filters={filters}
              onFiltersChange={setFilters}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              sort={sort}
              onSortChange={setSort}
              resultCount={contracts?.length || 0}
            />
          </div>

          {/* Contract List */}
          <div className="max-h-[calc(100vh-400px)] overflow-y-auto scrollbar-dark pr-2">
            <ContractList
              contracts={sortedContracts}
              viewMode={viewMode}
              selectedContractId={selectedContractId}
              onSelectContract={handleSelectContract}
            />
          </div>
        </div>

        {/* Detail Panel */}
        <div className="w-96 shrink-0">
          <div className="sticky top-4 bg-dark-surface border border-dark-border rounded-xl p-5">
            {selectedContractId ? (
              <ContractDetail contractId={selectedContractId} />
            ) : (
              <ContractDetailEmpty />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
