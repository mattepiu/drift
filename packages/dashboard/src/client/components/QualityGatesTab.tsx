/**
 * Quality Gates Tab Component
 *
 * Displays quality gate results, policies, and run history.
 * 
 * @license Apache-2.0
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';

// ============================================================================
// Types
// ============================================================================

interface GateResult {
  gateId: string;
  gateName: string;
  status: 'passed' | 'failed' | 'warned' | 'skipped' | 'errored';
  passed: boolean;
  score: number;
  summary: string;
  violations: Violation[];
  warnings: string[];
  executionTimeMs: number;
}

interface Violation {
  id: string;
  gateId: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  file: string;
  line: number;
  column: number;
  message: string;
  explanation: string;
  ruleId: string;
  suggestedFix?: string;
}

interface QualityGateResult {
  passed: boolean;
  status: 'passed' | 'failed' | 'warned' | 'skipped' | 'errored';
  score: number;
  summary: string;
  gates: Record<string, GateResult>;
  violations: Violation[];
  warnings: string[];
  policy: {
    id: string;
    name: string;
  };
  metadata: {
    executionTimeMs: number;
    filesChecked: number;
    gatesRun: string[];
    gatesSkipped: string[];
    timestamp: string;
    branch: string;
    commitSha?: string;
    ci: boolean;
  };
}

interface GateRunRecord {
  id: string;
  timestamp: string;
  branch: string;
  commitSha?: string;
  policyId: string;
  passed: boolean;
  score: number;
  gates: Record<string, { passed: boolean; score: number }>;
  violationCount: number;
  executionTimeMs: number;
}

interface Policy {
  id: string;
  name: string;
  description: string;
  version: string;
}

type ViewMode = 'overview' | 'run' | 'history' | 'policies';

// ============================================================================
// API Hooks
// ============================================================================

function useLatestRun() {
  return useQuery<QualityGateResult | null>({
    queryKey: ['quality-gates', 'latest'],
    queryFn: async () => {
      const res = await fetch('/api/quality-gates?action=latest');
      const data = await res.json();
      return data.data;
    },
  });
}

function useRunHistory(limit = 10) {
  return useQuery<{ runs: GateRunRecord[]; total: number }>({
    queryKey: ['quality-gates', 'history', limit],
    queryFn: async () => {
      const res = await fetch(`/api/quality-gates?action=history&limit=${limit}`);
      const data = await res.json();
      return data.data;
    },
  });
}

function usePolicies() {
  return useQuery<{ policies: Policy[] }>({
    queryKey: ['quality-gates', 'policies'],
    queryFn: async () => {
      const res = await fetch('/api/quality-gates?action=policies');
      const data = await res.json();
      return data.data;
    },
  });
}

function useRunGates() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (options: { policy?: string; files?: string[] }) => {
      const res = await fetch('/api/quality-gates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run', ...options }),
      });
      const data = await res.json();
      return data.data as QualityGateResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quality-gates'] });
    },
  });
}

// ============================================================================
// Components
// ============================================================================

function StatusBadge({ status, size = 'md' }: { status: string; size?: 'sm' | 'md' | 'lg' }) {
  const colors: Record<string, string> = {
    passed: 'bg-green-500/20 text-green-400 border-green-500/30',
    failed: 'bg-red-500/20 text-red-400 border-red-500/30',
    warned: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    skipped: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    errored: 'bg-red-600/20 text-red-500 border-red-600/30',
  };

  const sizes: Record<string, string> = {
    sm: 'px-1.5 py-0.5 text-xs',
    md: 'px-2 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base',
  };

  return (
    <span className={`rounded border ${colors[status] || colors.skipped} ${sizes[size]}`}>
      {status.toUpperCase()}
    </span>
  );
}

function ScoreGauge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' | 'lg' }) {
  const getColor = (s: number) => {
    if (s >= 80) {return 'text-green-400';}
    if (s >= 60) {return 'text-yellow-400';}
    return 'text-red-400';
  };

  const sizes: Record<string, string> = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-4xl',
  };

  return (
    <div className={`font-bold ${getColor(score)} ${sizes[size]}`}>
      {score}<span className="text-dark-muted text-sm">/100</span>
    </div>
  );
}

function StatCard({
  label,
  value,
  subtext,
  color,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  color?: string;
}) {
  return (
    <div className="card">
      <div className="text-sm text-dark-muted mb-1">{label}</div>
      <div className={`text-2xl font-semibold ${color || ''}`}>{value}</div>
      {subtext && <div className="text-xs text-dark-muted mt-1">{subtext}</div>}
    </div>
  );
}

function GateResultCard({ gate }: { gate: GateResult }) {
  const [expanded, setExpanded] = useState(false);

  const statusIcon: Record<string, string> = {
    passed: '✅',
    failed: '❌',
    warned: '⚠️',
    skipped: '⏭️',
    errored: '💥',
  };

  return (
    <div className="card">
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{statusIcon[gate.status]}</span>
          <div>
            <div className="font-medium">{gate.gateName}</div>
            <div className="text-sm text-dark-muted">{gate.summary}</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <ScoreGauge score={gate.score} size="sm" />
          <span className="text-dark-muted">{expanded ? '▼' : '▶'}</span>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-dark-border">
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <div className="text-xs text-dark-muted">Violations</div>
              <div className="font-medium">{gate.violations.length}</div>
            </div>
            <div>
              <div className="text-xs text-dark-muted">Warnings</div>
              <div className="font-medium">{gate.warnings.length}</div>
            </div>
            <div>
              <div className="text-xs text-dark-muted">Time</div>
              <div className="font-medium">{gate.executionTimeMs}ms</div>
            </div>
          </div>

          {gate.violations.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm text-dark-muted">Violations:</div>
              {gate.violations.slice(0, 5).map((v, i) => (
                <div key={i} className="p-2 rounded bg-red-500/10 text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`px-1 rounded text-xs ${
                      v.severity === 'error' ? 'bg-red-500 text-white' :
                      v.severity === 'warning' ? 'bg-yellow-500 text-black' :
                      'bg-blue-500 text-white'
                    }`}>
                      {v.severity}
                    </span>
                    <span className="text-dark-muted">{v.file}:{v.line}</span>
                  </div>
                  <div className="mt-1">{v.message}</div>
                </div>
              ))}
              {gate.violations.length > 5 && (
                <div className="text-sm text-dark-muted">
                  ... and {gate.violations.length - 5} more
                </div>
              )}
            </div>
          )}

          {gate.warnings.length > 0 && (
            <div className="mt-4 space-y-1">
              <div className="text-sm text-dark-muted">Warnings:</div>
              {gate.warnings.map((w, i) => (
                <div key={i} className="text-sm text-yellow-400">⚠️ {w}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OverviewView({ result }: { result: QualityGateResult }) {
  const gateResults = Object.values(result.gates);
  const passedGates = gateResults.filter(g => g.passed).length;
  const failedGates = gateResults.filter(g => !g.passed && g.status !== 'skipped').length;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-4xl">
              {result.passed ? '✅' : '❌'}
            </div>
            <div>
              <div className="text-xl font-semibold">
                Quality Gate {result.passed ? 'PASSED' : 'FAILED'}
              </div>
              <div className="text-dark-muted">{result.summary}</div>
            </div>
          </div>
          <ScoreGauge score={result.score} size="lg" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Gates Passed"
          value={`${passedGates}/${gateResults.length}`}
          color={passedGates === gateResults.length ? 'text-green-400' : 'text-yellow-400'}
        />
        <StatCard
          label="Violations"
          value={result.violations.length}
          color={result.violations.length > 0 ? 'text-red-400' : 'text-green-400'}
        />
        <StatCard
          label="Files Checked"
          value={result.metadata.filesChecked}
        />
        <StatCard
          label="Execution Time"
          value={`${result.metadata.executionTimeMs}ms`}
        />
      </div>

      {/* Policy info */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-dark-muted">Policy</div>
            <div className="font-medium">{result.policy.name}</div>
          </div>
          <div>
            <div className="text-sm text-dark-muted">Branch</div>
            <div className="font-medium">{result.metadata.branch}</div>
          </div>
          <div>
            <div className="text-sm text-dark-muted">Timestamp</div>
            <div className="font-medium">
              {new Date(result.metadata.timestamp).toLocaleString()}
            </div>
          </div>
          {result.metadata.commitSha && (
            <div>
              <div className="text-sm text-dark-muted">Commit</div>
              <div className="font-mono text-sm">{result.metadata.commitSha.slice(0, 7)}</div>
            </div>
          )}
        </div>
      </div>

      {/* Gate results */}
      <div>
        <div className="text-lg font-medium mb-4">Gate Results</div>
        <div className="space-y-3">
          {gateResults.map(gate => (
            <GateResultCard key={gate.gateId} gate={gate} />
          ))}
        </div>
      </div>

      {/* Violations summary */}
      {result.violations.length > 0 && (
        <div className="card">
          <div className="text-lg font-medium mb-4">
            All Violations ({result.violations.length})
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {result.violations.map((v, i) => (
              <div key={i} className="p-3 rounded bg-dark-bg/50">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-1.5 py-0.5 rounded text-xs ${
                    v.severity === 'error' ? 'bg-red-500 text-white' :
                    v.severity === 'warning' ? 'bg-yellow-500 text-black' :
                    'bg-blue-500 text-white'
                  }`}>
                    {v.severity}
                  </span>
                  <span className="text-sm text-dark-muted">[{v.gateId}]</span>
                  <span className="text-sm font-mono">{v.file}:{v.line}:{v.column}</span>
                </div>
                <div className="text-sm">{v.message}</div>
                {v.explanation && (
                  <div className="text-xs text-dark-muted mt-1">{v.explanation}</div>
                )}
                {v.suggestedFix && (
                  <div className="text-xs text-cyan-400 mt-1">
                    💡 {v.suggestedFix}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RunView({ onRun }: { onRun: (options: { policy?: string }) => void }) {
  const [selectedPolicy, setSelectedPolicy] = useState<string>('default');
  const { data: policiesData } = usePolicies();

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="text-lg font-medium mb-4">Run Quality Gates</div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-dark-muted mb-2">Policy</label>
            <select
              value={selectedPolicy}
              onChange={(e) => setSelectedPolicy(e.target.value)}
              className="w-full bg-dark-bg border border-dark-border rounded px-3 py-2"
            >
              {policiesData?.policies.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => onRun({ policy: selectedPolicy })}
            className="w-full bg-accent-primary hover:bg-accent-primary/80 text-white rounded px-4 py-2 font-medium transition-colors"
          >
            Run Quality Gates
          </button>
        </div>
      </div>

      <div className="card">
        <div className="text-sm text-dark-muted mb-2">CLI Command</div>
        <code className="block bg-dark-bg p-3 rounded text-sm font-mono">
          drift gate --policy {selectedPolicy}
        </code>
      </div>
    </div>
  );
}

function HistoryView() {
  const { data, isLoading } = useRunHistory(20);

  if (isLoading) {
    return <div className="text-dark-muted">Loading history...</div>;
  }

  if (!data || data.runs.length === 0) {
    return (
      <div className="card">
        <div className="text-dark-muted">No gate runs recorded yet.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-lg font-medium">Run History ({data.total})</div>
      
      <div className="space-y-2">
        {data.runs.map(run => (
          <div key={run.id} className="card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-xl">{run.passed ? '✅' : '❌'}</span>
                <div>
                  <div className="font-medium">
                    {new Date(run.timestamp).toLocaleString()}
                  </div>
                  <div className="text-sm text-dark-muted">
                    {run.branch}
                    {run.commitSha && ` • ${run.commitSha.slice(0, 7)}`}
                    {' • '}{run.policyId}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <ScoreGauge score={run.score} size="sm" />
                  <div className="text-xs text-dark-muted">
                    {run.violationCount} violations
                  </div>
                </div>
                <div className="text-xs text-dark-muted">
                  {run.executionTimeMs}ms
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PoliciesView() {
  const { data, isLoading } = usePolicies();

  if (isLoading) {
    return <div className="text-dark-muted">Loading policies...</div>;
  }

  if (!data || data.policies.length === 0) {
    return (
      <div className="card">
        <div className="text-dark-muted">No policies found.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-lg font-medium">Available Policies</div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.policies.map(policy => (
          <div key={policy.id} className="card">
            <div className="flex items-start justify-between mb-2">
              <div className="font-medium">{policy.name}</div>
              <span className="px-2 py-0.5 rounded text-xs bg-dark-bg text-dark-muted">
                v{policy.version}
              </span>
            </div>
            <div className="text-sm text-dark-muted mb-3">{policy.description}</div>
            <div className="text-xs font-mono text-cyan-400">ID: {policy.id}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="text-sm text-dark-muted mb-2">Create Custom Policy</div>
        <div className="text-sm">
          Create a <code className="bg-dark-bg px-1 rounded">.drift/quality-gates/policies/custom/</code> directory
          and add JSON policy files.
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function QualityGatesTab(): React.ReactElement {
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const { data: latestRun, isLoading, error } = useLatestRun();
  const runGates = useRunGates();

  const handleRun = async (options: { policy?: string }) => {
    try {
      await runGates.mutateAsync(options);
      setViewMode('overview');
    } catch (err) {
      console.error('Failed to run gates:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-dark-muted">Loading quality gates...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* View mode tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setViewMode('overview')}
          className={`px-3 py-1.5 rounded text-sm ${viewMode === 'overview' ? 'bg-accent-primary text-white' : 'bg-dark-bg text-dark-muted hover:text-white'}`}
        >
          Latest Run
        </button>
        <button
          onClick={() => setViewMode('run')}
          className={`px-3 py-1.5 rounded text-sm ${viewMode === 'run' ? 'bg-accent-primary text-white' : 'bg-dark-bg text-dark-muted hover:text-white'}`}
        >
          Run Gates
        </button>
        <button
          onClick={() => setViewMode('history')}
          className={`px-3 py-1.5 rounded text-sm ${viewMode === 'history' ? 'bg-accent-primary text-white' : 'bg-dark-bg text-dark-muted hover:text-white'}`}
        >
          History
        </button>
        <button
          onClick={() => setViewMode('policies')}
          className={`px-3 py-1.5 rounded text-sm ${viewMode === 'policies' ? 'bg-accent-primary text-white' : 'bg-dark-bg text-dark-muted hover:text-white'}`}
        >
          Policies
        </button>
      </div>

      {/* Running indicator */}
      {runGates.isPending && (
        <div className="card bg-blue-500/10 border-blue-500/30">
          <div className="flex items-center gap-3">
            <div className="animate-spin">⏳</div>
            <div>Running quality gates...</div>
          </div>
        </div>
      )}

      {/* Error display */}
      {runGates.isError && (
        <div className="card bg-red-500/10 border-red-500/30">
          <div className="text-red-400">
            Failed to run gates: {(runGates.error).message}
          </div>
        </div>
      )}

      {/* Overview mode */}
      {viewMode === 'overview' && (
        latestRun ? (
          <OverviewView result={latestRun} />
        ) : (
          <div className="card">
            <div className="text-center py-8">
              <div className="text-4xl mb-4">🚦</div>
              <div className="text-lg font-medium mb-2">No Quality Gate Runs Yet</div>
              <div className="text-dark-muted mb-4">
                Run quality gates to check your code against established patterns.
              </div>
              <button
                onClick={() => setViewMode('run')}
                className="bg-accent-primary hover:bg-accent-primary/80 text-white rounded px-4 py-2 font-medium transition-colors"
              >
                Run Quality Gates
              </button>
            </div>
          </div>
        )
      )}

      {/* Run mode */}
      {viewMode === 'run' && <RunView onRun={handleRun} />}

      {/* History mode */}
      {viewMode === 'history' && <HistoryView />}

      {/* Policies mode */}
      {viewMode === 'policies' && <PoliciesView />}
    </div>
  );
}
