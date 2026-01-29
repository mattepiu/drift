/**
 * Contracts Tab Utilities
 * 
 * Data transformation, aggregation, and helper functions.
 */

import { METHOD_ORDER, MISMATCH_TYPE_CONFIG, DISPLAY_LIMITS } from './constants';

import type { 
  ContractMetrics, 
  ContractStatistics, 
  EndpointGroup, 
  MethodGroup,
  SortConfig,
  ContractHealth,
  MismatchSummary,
} from './types';
import type { Contract, ContractStatus, HttpMethod, FieldMismatch } from '../../types';

// ============================================================================
// Metrics Calculation
// ============================================================================

export function calculateMetrics(contracts: Contract[]): ContractMetrics {
  const byStatus: Record<ContractStatus, number> = {
    discovered: 0,
    verified: 0,
    mismatch: 0,
    ignored: 0,
  };

  const byMethod: Record<HttpMethod, number> = {
    GET: 0,
    POST: 0,
    PUT: 0,
    PATCH: 0,
    DELETE: 0,
  };

  const mismatchesByType: Record<string, number> = {};
  let totalMismatches = 0;

  for (const contract of contracts) {
    byStatus[contract.status]++;
    byMethod[contract.method]++;
    totalMismatches += contract.mismatchCount;

    for (const mismatch of contract.mismatches) {
      mismatchesByType[mismatch.mismatchType] = (mismatchesByType[mismatch.mismatchType] || 0) + 1;
    }
  }

  const total = contracts.length;
  const verifiedRate = total > 0 ? byStatus.verified / total : 0;
  const healthScore = calculateHealthScore(contracts);

  return {
    total,
    byStatus,
    byMethod,
    totalMismatches,
    mismatchesByType,
    verifiedRate,
    healthScore,
  };
}

export function calculateStatistics(contracts: Contract[]): ContractStatistics {
  const metrics = calculateMetrics(contracts);

  const mismatchesBySeverity = { error: 0, warning: 0, info: 0 };
  for (const contract of contracts) {
    for (const mismatch of contract.mismatches) {
      mismatchesBySeverity[mismatch.severity]++;
    }
  }

  const topMismatchedEndpoints = contracts
    .filter(c => c.mismatchCount > 0)
    .sort((a, b) => b.mismatchCount - a.mismatchCount)
    .slice(0, DISPLAY_LIMITS.TOP_MISMATCHED)
    .map(c => ({ endpoint: c.endpoint, method: c.method, count: c.mismatchCount }));

  return {
    ...metrics,
    mismatchesBySeverity,
    topMismatchedEndpoints,
  };
}

function calculateHealthScore(contracts: Contract[]): number {
  if (contracts.length === 0) {return 100;}

  let score = 100;
  const total = contracts.length;

  // Deduct for mismatches
  const mismatchedCount = contracts.filter(c => c.status === 'mismatch').length;
  score -= (mismatchedCount / total) * 40;

  // Deduct for unverified
  const unverifiedCount = contracts.filter(c => c.status === 'discovered').length;
  score -= (unverifiedCount / total) * 20;

  // Deduct for low confidence
  const lowConfidenceCount = contracts.filter(c => c.confidence.score < 0.7).length;
  score -= (lowConfidenceCount / total) * 10;

  return Math.max(0, Math.round(score));
}

// ============================================================================
// Grouping Functions
// ============================================================================

export function groupByEndpoint(contracts: Contract[]): EndpointGroup[] {
  const groups = new Map<string, Contract[]>();

  for (const contract of contracts) {
    // Extract base path (first two segments)
    const parts = contract.endpoint.split('/').filter(Boolean);
    const basePath = '/' + parts.slice(0, 2).join('/');

    const existing = groups.get(basePath);
    if (existing) {
      existing.push(contract);
    } else {
      groups.set(basePath, [contract]);
    }
  }

  return Array.from(groups.entries())
    .map(([basePath, groupContracts]) => ({
      basePath,
      contracts: groupContracts.sort((a, b) => a.endpoint.localeCompare(b.endpoint)),
      metrics: {
        total: groupContracts.length,
        mismatches: groupContracts.reduce((sum, c) => sum + c.mismatchCount, 0),
        verified: groupContracts.filter(c => c.status === 'verified').length,
      },
    }))
    .sort((a, b) => b.metrics.mismatches - a.metrics.mismatches || b.metrics.total - a.metrics.total);
}

export function groupByMethod(contracts: Contract[]): MethodGroup[] {
  const groups = new Map<HttpMethod, Contract[]>();

  for (const contract of contracts) {
    const existing = groups.get(contract.method);
    if (existing) {
      existing.push(contract);
    } else {
      groups.set(contract.method, [contract]);
    }
  }

  return METHOD_ORDER
    .filter(method => groups.has(method))
    .map(method => ({
      method,
      contracts: groups.get(method)!.sort((a, b) => a.endpoint.localeCompare(b.endpoint)),
      metrics: {
        total: groups.get(method)!.length,
        mismatches: groups.get(method)!.reduce((sum, c) => sum + c.mismatchCount, 0),
      },
    }));
}

// ============================================================================
// Sorting Functions
// ============================================================================

export function sortContracts(contracts: Contract[], config: SortConfig): Contract[] {
  const sorted = [...contracts];
  const multiplier = config.direction === 'asc' ? 1 : -1;

  sorted.sort((a, b) => {
    switch (config.field) {
      case 'endpoint':
        return multiplier * a.endpoint.localeCompare(b.endpoint);
      case 'method':
        return multiplier * METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method);
      case 'status':
        return multiplier * a.status.localeCompare(b.status);
      case 'mismatches':
        return multiplier * (a.mismatchCount - b.mismatchCount);
      case 'confidence':
        return multiplier * (a.confidence.score - b.confidence.score);
      default:
        return 0;
    }
  });

  return sorted;
}

// ============================================================================
// Health Analysis
// ============================================================================

export function analyzeContractHealth(contract: Contract): ContractHealth {
  const issues: string[] = [];
  let score = 100;

  if (contract.mismatchCount > 0) {
    score -= Math.min(50, contract.mismatchCount * 10);
    issues.push(`${contract.mismatchCount} field mismatch${contract.mismatchCount !== 1 ? 'es' : ''}`);
  }

  if (contract.confidence.score < 0.7) {
    score -= 20;
    issues.push('Low confidence match');
  }

  if (contract.frontend.length === 0) {
    score -= 30;
    issues.push('No frontend consumers found');
  }

  const status: ContractHealth['status'] = 
    score >= 80 ? 'healthy' : 
    score >= 50 ? 'warning' : 
    'critical';

  return { score: Math.max(0, score), status, issues };
}

export function summarizeMismatches(mismatches: FieldMismatch[]): MismatchSummary[] {
  const byType = new Map<FieldMismatch['mismatchType'], number>();

  for (const mismatch of mismatches) {
    byType.set(mismatch.mismatchType, (byType.get(mismatch.mismatchType) || 0) + 1);
  }

  return Array.from(byType.entries()).map(([type, count]) => {
    const config = MISMATCH_TYPE_CONFIG[type];
    return {
      type,
      count,
      severity: config.severity,
      description: config.description,
    };
  });
}

// ============================================================================
// Format Helpers
// ============================================================================

export function formatEndpoint(endpoint: string, maxLength = 40): string {
  if (endpoint.length <= maxLength) {return endpoint;}
  return endpoint.slice(0, maxLength - 3) + '...';
}

export function formatFieldType(type: string): string {
  // Simplify complex types for display
  if (type.length > 30) {
    return type.slice(0, 27) + '...';
  }
  return type;
}

export function getConfidenceColor(score: number): string {
  if (score >= 0.9) {return 'text-status-approved';}
  if (score >= 0.7) {return 'text-severity-warning';}
  return 'text-severity-error';
}

export function formatPercentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}
