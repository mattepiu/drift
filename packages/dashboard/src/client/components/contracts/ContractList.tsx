/**
 * Contract List Components
 * 
 * Multiple view modes for contract display.
 */

import { useState } from 'react';

import { METHOD_CONFIG, STATUS_CONFIG } from './constants';
import { getConfidenceColor, formatPercentage, groupByEndpoint, groupByMethod } from './utils';

import type { ViewMode, EndpointGroup, MethodGroup } from './types';
import type { Contract } from '../../types';

// ============================================================================
// Contract Card (List View)
// ============================================================================

interface ContractCardProps {
  contract: Contract;
  isSelected: boolean;
  onSelect: () => void;
}

function ContractCard({ contract, isSelected, onSelect }: ContractCardProps) {
  const methodConfig = METHOD_CONFIG[contract.method];
  const statusConfig = STATUS_CONFIG[contract.status];

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-4 rounded-lg border transition-all ${
        isSelected
          ? 'bg-blue-500/10 border-blue-500/30'
          : 'bg-dark-surface border-dark-border hover:border-dark-muted'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`font-mono text-xs font-bold px-2 py-1 rounded ${methodConfig.bgColor} ${methodConfig.color}`}>
            {contract.method}
          </span>
          <span className="font-mono text-sm truncate" title={contract.endpoint}>
            {contract.endpoint}
          </span>
        </div>
        <span className={`px-2 py-1 rounded text-xs shrink-0 ${statusConfig.bgColor} ${statusConfig.color}`}>
          {statusConfig.icon} {statusConfig.label}
        </span>
      </div>

      <div className="flex items-center gap-4 text-xs text-dark-muted">
        <span title="Backend framework">
          🔧 {contract.backend.framework}
        </span>
        <span title="Frontend calls">
          📱 {contract.frontend.length} call{contract.frontend.length !== 1 ? 's' : ''}
        </span>
        {contract.mismatchCount > 0 && (
          <span className="text-severity-error" title="Field mismatches">
            ⚠️ {contract.mismatchCount} mismatch{contract.mismatchCount !== 1 ? 'es' : ''}
          </span>
        )}
        <span className={getConfidenceColor(contract.confidence.score)} title="Confidence">
          {formatPercentage(contract.confidence.score)}
        </span>
      </div>
    </button>
  );
}

// ============================================================================
// Endpoint Group Card (By Endpoint View)
// ============================================================================

interface EndpointGroupCardProps {
  group: EndpointGroup;
  isExpanded: boolean;
  onToggle: () => void;
  selectedContractId: string | null;
  onSelectContract: (id: string) => void;
}

function EndpointGroupCard({
  group,
  isExpanded,
  onToggle,
  selectedContractId,
  onSelectContract,
}: EndpointGroupCardProps) {
  return (
    <div className="border border-dark-border rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full text-left p-4 bg-dark-surface hover:bg-dark-border/30 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-dark-muted">{isExpanded ? '▼' : '▶'}</span>
            <span className="text-lg">🔗</span>
            <span className="font-mono font-medium">{group.basePath}</span>
            <span className="px-2 py-0.5 bg-dark-bg rounded text-xs text-dark-muted">
              {group.contracts.length} endpoint{group.contracts.length !== 1 ? 's' : ''}
            </span>
          </div>
          {group.metrics.mismatches > 0 && (
            <span className="text-severity-error text-sm">
              ⚠️ {group.metrics.mismatches}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 mt-2 ml-10 text-xs text-dark-muted">
          <span className="text-status-approved">✓ {group.metrics.verified} verified</span>
          {group.metrics.mismatches > 0 && (
            <span className="text-severity-error">⚠ {group.metrics.mismatches} mismatches</span>
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-dark-border bg-dark-bg p-3 space-y-2">
          {group.contracts.map((contract) => (
            <ContractCard
              key={contract.id}
              contract={contract}
              isSelected={selectedContractId === contract.id}
              onSelect={() => onSelectContract(contract.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Method Group Card (By Method View)
// ============================================================================

interface MethodGroupCardProps {
  group: MethodGroup;
  isExpanded: boolean;
  onToggle: () => void;
  selectedContractId: string | null;
  onSelectContract: (id: string) => void;
}

function MethodGroupCard({
  group,
  isExpanded,
  onToggle,
  selectedContractId,
  onSelectContract,
}: MethodGroupCardProps) {
  const methodConfig = METHOD_CONFIG[group.method];

  return (
    <div className="border border-dark-border rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full text-left p-4 bg-dark-surface hover:bg-dark-border/30 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-dark-muted">{isExpanded ? '▼' : '▶'}</span>
            <span className={`font-mono text-lg font-bold px-3 py-1 rounded ${methodConfig.bgColor} ${methodConfig.color}`}>
              {group.method}
            </span>
            <span className="text-dark-muted text-sm">
              {methodConfig.description}
            </span>
            <span className="px-2 py-0.5 bg-dark-bg rounded text-xs text-dark-muted">
              {group.contracts.length}
            </span>
          </div>
          {group.metrics.mismatches > 0 && (
            <span className="text-severity-error text-sm">
              ⚠️ {group.metrics.mismatches}
            </span>
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-dark-border bg-dark-bg p-3 space-y-2">
          {group.contracts.map((contract) => (
            <ContractCard
              key={contract.id}
              contract={contract}
              isSelected={selectedContractId === contract.id}
              onSelect={() => onSelectContract(contract.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Contract List
// ============================================================================

interface ContractListProps {
  contracts: Contract[];
  viewMode: ViewMode;
  selectedContractId: string | null;
  onSelectContract: (id: string) => void;
}

export function ContractList({
  contracts,
  viewMode,
  selectedContractId,
  onSelectContract,
}: ContractListProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (contracts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <span className="text-4xl mb-4">📋</span>
        <h3 className="text-lg font-medium mb-2">No contracts found</h3>
        <p className="text-dark-muted text-sm max-w-md">
          Run <code className="bg-dark-bg px-2 py-0.5 rounded font-mono text-xs">drift scan --contracts</code> to detect BE↔FE contracts
        </p>
      </div>
    );
  }

  // List view
  if (viewMode === 'list') {
    return (
      <div className="space-y-2">
        {contracts.map((contract) => (
          <ContractCard
            key={contract.id}
            contract={contract}
            isSelected={selectedContractId === contract.id}
            onSelect={() => onSelectContract(contract.id)}
          />
        ))}
      </div>
    );
  }

  // By Endpoint view
  if (viewMode === 'by-endpoint') {
    const endpointGroups = groupByEndpoint(contracts);
    return (
      <div className="space-y-3">
        {endpointGroups.map((group) => (
          <EndpointGroupCard
            key={group.basePath}
            group={group}
            isExpanded={expandedGroups.has(group.basePath)}
            onToggle={() => toggleGroup(group.basePath)}
            selectedContractId={selectedContractId}
            onSelectContract={onSelectContract}
          />
        ))}
      </div>
    );
  }

  // By Method view
  const methodGroups = groupByMethod(contracts);
  return (
    <div className="space-y-3">
      {methodGroups.map((group) => (
        <MethodGroupCard
          key={group.method}
          group={group}
          isExpanded={expandedGroups.has(group.method)}
          onToggle={() => toggleGroup(group.method)}
          selectedContractId={selectedContractId}
          onSelectContract={onSelectContract}
        />
      ))}
    </div>
  );
}
