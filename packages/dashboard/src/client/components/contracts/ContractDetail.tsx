/**
 * Contract Detail Panel
 * 
 * Detailed view of a selected contract with actions.
 */

import { useState } from 'react';

import { METHOD_CONFIG, STATUS_CONFIG, MISMATCH_TYPE_CONFIG, DISPLAY_LIMITS } from './constants';
import { getConfidenceColor, formatPercentage, analyzeContractHealth } from './utils';
import { useContract, useVerifyContract, useIgnoreContract } from '../../hooks';

import type { Contract, ContractField, FieldMismatch } from '../../types';

// ============================================================================
// Field List
// ============================================================================

interface FieldListProps {
  fields: ContractField[];
  title: string;
  color: string;
}

function FieldList({ fields, title, color }: FieldListProps) {
  const [showAll, setShowAll] = useState(false);
  const displayFields = showAll ? fields : fields.slice(0, DISPLAY_LIMITS.FIELDS_PREVIEW);

  return (
    <div>
      <div className="text-xs text-dark-muted mb-2">{title}</div>
      <div className="space-y-1">
        {displayFields.map((field, i) => (
          <div key={i} className="font-mono text-xs flex items-center gap-1">
            <span className={color}>{field.name}</span>
            <span className="text-dark-muted">:</span>
            <span className="text-purple-400">{field.type}</span>
            {field.optional && <span className="text-yellow-400">?</span>}
            {field.nullable && <span className="text-orange-400">| null</span>}
          </div>
        ))}
        {fields.length > DISPLAY_LIMITS.FIELDS_PREVIEW && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            {showAll ? 'Show less' : `Show ${fields.length - DISPLAY_LIMITS.FIELDS_PREVIEW} more`}
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Mismatch Card
// ============================================================================

interface MismatchCardProps {
  mismatch: FieldMismatch;
}

function MismatchCard({ mismatch }: MismatchCardProps) {
  const config = MISMATCH_TYPE_CONFIG[mismatch.mismatchType];
  const severityColor = 
    mismatch.severity === 'error' ? 'bg-severity-error/20 text-severity-error border-severity-error/30' :
    mismatch.severity === 'warning' ? 'bg-severity-warning/20 text-severity-warning border-severity-warning/30' :
    'bg-severity-info/20 text-severity-info border-severity-info/30';

  return (
    <div className="p-3 bg-dark-bg rounded-lg text-sm">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono text-blue-400">{mismatch.fieldPath}</span>
        <span className={`px-1.5 py-0.5 rounded text-xs border ${severityColor}`}>
          {mismatch.severity}
        </span>
      </div>
      <div className={`text-xs ${config.color} mb-1`}>
        {config.icon} {config.label}
      </div>
      <div className="text-xs text-dark-muted">{mismatch.description}</div>
    </div>
  );
}

// ============================================================================
// Actions Bar
// ============================================================================

interface ActionsBarProps {
  contract: Contract;
  onCopyForAI: () => void;
  isCopying: boolean;
  copySuccess: boolean;
}

function ActionsBar({ contract, onCopyForAI, isCopying, copySuccess }: ActionsBarProps) {
  const verifyMutation = useVerifyContract();
  const ignoreMutation = useIgnoreContract();

  return (
    <div className="flex flex-wrap gap-2">
      {(contract.status === 'discovered' || contract.status === 'mismatch') && (
        <>
          <button
            onClick={() => verifyMutation.mutate(contract.id)}
            disabled={verifyMutation.isPending}
            className="btn btn-primary text-sm flex items-center gap-1.5"
          >
            {verifyMutation.isPending ? <span className="animate-spin">⏳</span> : <span>✓</span>}
            Verify
          </button>
          <button
            onClick={() => ignoreMutation.mutate(contract.id)}
            disabled={ignoreMutation.isPending}
            className="btn btn-secondary text-sm flex items-center gap-1.5"
          >
            {ignoreMutation.isPending ? <span className="animate-spin">⏳</span> : <span>✗</span>}
            Ignore
          </button>
        </>
      )}
      
      <button
        onClick={onCopyForAI}
        disabled={isCopying}
        className={`btn text-sm flex items-center gap-1.5 ${copySuccess ? 'btn-primary' : 'btn-secondary'}`}
      >
        {isCopying ? <span className="animate-spin">⏳</span> : copySuccess ? <span>✓</span> : <span>📋</span>}
        {copySuccess ? 'Copied!' : 'Copy for AI'}
      </button>
    </div>
  );
}

// ============================================================================
// Main Detail Component
// ============================================================================

interface ContractDetailProps {
  contractId: string;
}

export function ContractDetail({ contractId }: ContractDetailProps) {
  const { data: contract, isLoading, error } = useContract(contractId);
  const [isCopying, setIsCopying] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const copyForAI = async () => {
    if (!contract) {return;}
    
    setIsCopying(true);
    setCopySuccess(false);

    try {
      const lines: string[] = [
        `# API Contract: ${contract.method} ${contract.endpoint}`,
        `Status: ${contract.status} | Confidence: ${formatPercentage(contract.confidence.score)}`,
        '',
        '## Backend Endpoint',
        `File: ${contract.backend.file}:${contract.backend.line}`,
        `Framework: ${contract.backend.framework}`,
        '',
        '### Response Fields:',
        ...contract.backend.responseFields.map(f => 
          `- ${f.name}: ${f.type}${f.optional ? ' (optional)' : ''}${f.nullable ? ' (nullable)' : ''}`
        ),
        '',
        '## Frontend API Calls',
        ...contract.frontend.flatMap(fe => [
          `### ${fe.file}:${fe.line}`,
          `Library: ${fe.library}`,
          fe.responseType ? `Response Type: ${fe.responseType}` : '',
          'Expected Fields:',
          ...fe.responseFields.map(f => 
            `- ${f.name}: ${f.type}${f.optional ? ' (optional)' : ''}`
          ),
          '',
        ]),
      ];

      if (contract.mismatches.length > 0) {
        lines.push('## ⚠️ Mismatches to Fix');
        lines.push('');
        for (const mismatch of contract.mismatches) {
          const config = MISMATCH_TYPE_CONFIG[mismatch.mismatchType];
          lines.push(`### ${mismatch.fieldPath}`);
          lines.push(`Type: ${config.icon} ${config.label}`);
          lines.push(`Description: ${mismatch.description}`);
          lines.push(`Severity: ${mismatch.severity}`);
          lines.push('');
        }
        lines.push('---');
        lines.push('Please fix these mismatches to ensure type safety between backend and frontend.');
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
        <div className="text-dark-muted">Loading contract details...</div>
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <span className="text-3xl mb-3">⚠️</span>
        <div className="text-severity-error">Failed to load contract</div>
      </div>
    );
  }

  const methodConfig = METHOD_CONFIG[contract.method];
  const statusConfig = STATUS_CONFIG[contract.status];
  const health = analyzeContractHealth(contract);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className={`font-mono text-lg font-bold px-2 py-1 rounded ${methodConfig.bgColor} ${methodConfig.color}`}>
            {contract.method}
          </span>
          <span className="font-mono text-lg truncate" title={contract.endpoint}>
            {contract.endpoint}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-2 py-1 rounded text-xs ${statusConfig.bgColor} ${statusConfig.color}`}>
            {statusConfig.icon} {statusConfig.label}
          </span>
          <span className={`text-sm ${getConfidenceColor(contract.confidence.score)}`}>
            {formatPercentage(contract.confidence.score)} confidence
          </span>
        </div>
      </div>

      {/* Health indicator */}
      {health.issues.length > 0 && (
        <div className={`p-3 rounded-lg text-sm ${
          health.status === 'critical' ? 'bg-severity-error/10 border border-severity-error/20' :
          health.status === 'warning' ? 'bg-severity-warning/10 border border-severity-warning/20' :
          'bg-status-approved/10 border border-status-approved/20'
        }`}>
          <div className="flex items-center gap-2 mb-1">
            <span>{health.status === 'critical' ? '🔴' : health.status === 'warning' ? '🟡' : '🟢'}</span>
            <span className="font-medium">Health Score: {health.score}</span>
          </div>
          <ul className="text-xs text-dark-muted list-disc list-inside">
            {health.issues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <ActionsBar
        contract={contract}
        onCopyForAI={copyForAI}
        isCopying={isCopying}
        copySuccess={copySuccess}
      />

      {/* Backend */}
      <div className="p-4 bg-dark-bg rounded-lg">
        <h4 className="text-sm font-medium mb-3 text-green-400 flex items-center gap-2">
          <span>🔧</span> Backend
        </h4>
        <div className="text-xs space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-dark-muted">File:</span>
            <span className="font-mono">{contract.backend.file}:{contract.backend.line}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-dark-muted">Framework:</span>
            <span>{contract.backend.framework}</span>
          </div>
          {contract.backend.responseFields.length > 0 && (
            <FieldList 
              fields={contract.backend.responseFields} 
              title="Response Fields:" 
              color="text-green-400"
            />
          )}
        </div>
      </div>

      {/* Frontend */}
      <div className="p-4 bg-dark-bg rounded-lg">
        <h4 className="text-sm font-medium mb-3 text-blue-400 flex items-center gap-2">
          <span>📱</span> Frontend ({contract.frontend.length})
        </h4>
        <div className="space-y-4">
          {contract.frontend.slice(0, DISPLAY_LIMITS.FRONTEND_CALLS_PREVIEW).map((fe, i) => (
            <div key={i} className="text-xs border-l-2 border-dark-border pl-3">
              <div className="font-mono">{fe.file}:{fe.line}</div>
              <div className="text-dark-muted">Library: {fe.library}</div>
              {fe.responseType && (
                <div className="text-dark-muted">
                  Type: <span className="text-purple-400">{fe.responseType}</span>
                </div>
              )}
              {fe.responseFields.length > 0 && (
                <FieldList 
                  fields={fe.responseFields} 
                  title="Expected Fields:" 
                  color="text-blue-400"
                />
              )}
            </div>
          ))}
          {contract.frontend.length > DISPLAY_LIMITS.FRONTEND_CALLS_PREVIEW && (
            <div className="text-xs text-dark-muted">
              ... and {contract.frontend.length - DISPLAY_LIMITS.FRONTEND_CALLS_PREVIEW} more
            </div>
          )}
        </div>
      </div>

      {/* Mismatches */}
      {contract.mismatches.length > 0 && (
        <div className="p-4 bg-severity-error/10 border border-severity-error/30 rounded-lg">
          <h4 className="text-sm font-medium mb-3 text-severity-error flex items-center gap-2">
            <span>⚠️</span> Mismatches ({contract.mismatches.length})
          </h4>
          <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-dark">
            {contract.mismatches.slice(0, DISPLAY_LIMITS.MISMATCHES_PREVIEW).map((mismatch, i) => (
              <MismatchCard key={i} mismatch={mismatch} />
            ))}
            {contract.mismatches.length > DISPLAY_LIMITS.MISMATCHES_PREVIEW && (
              <div className="text-xs text-dark-muted text-center py-2">
                ... and {contract.mismatches.length - DISPLAY_LIMITS.MISMATCHES_PREVIEW} more
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

export function ContractDetailEmpty() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <span className="text-4xl mb-4">🔗</span>
      <h3 className="text-lg font-medium mb-2">No contract selected</h3>
      <p className="text-dark-muted text-sm max-w-xs">
        Select a contract from the list to view its details, fields, and mismatches.
      </p>
    </div>
  );
}
