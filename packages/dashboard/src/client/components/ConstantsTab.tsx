/**
 * Constants Tab Component
 *
 * Displays constants, enums, and related issues.
 */

import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';

// ============================================================================
// Types
// ============================================================================

interface ConstantData {
  id: string;
  name: string;
  qualifiedName: string;
  file: string;
  line: number;
  language: string;
  kind: string;
  category: string;
  value?: string | number | boolean | null;
  isExported: boolean;
}

interface EnumData {
  id: string;
  name: string;
  file: string;
  line: number;
  memberCount: number;
}

interface SecretIssue {
  name: string;
  file: string;
  line: number;
  severity: string;
  secretType: string;
  maskedValue: string;
}

interface InconsistentIssue {
  name: string;
  instances: Array<{
    file: string;
    line: number;
    value: string | number | boolean | null;
  }>;
}

interface ConstantsStats {
  totalConstants: number;
  totalEnums: number;
  byLanguage: Record<string, number>;
  byCategory: Record<string, number>;
  issues: {
    magicValues: number;
    deadConstants: number;
    potentialSecrets: number;
    inconsistentValues: number;
  };
}

type ViewMode = 'overview' | 'list' | 'secrets' | 'inconsistent';

// ============================================================================
// API Hooks
// ============================================================================

function useConstantsStats() {
  return useQuery<ConstantsStats>({
    queryKey: ['constants', 'status'],
    queryFn: async () => {
      const res = await fetch('/api/constants?action=status');
      const data = await res.json();
      return data.data;
    },
  });
}

function useConstantsList(category?: string, language?: string) {
  return useQuery<{ constants: ConstantData[]; enums: EnumData[]; total: number }>({
    queryKey: ['constants', 'list', category, language],
    queryFn: async () => {
      const params = new URLSearchParams({ action: 'list', limit: '50' });
      if (category) {params.set('category', category);}
      if (language) {params.set('language', language);}
      const res = await fetch(`/api/constants?${params}`);
      const data = await res.json();
      return data.data;
    },
  });
}

function useSecrets() {
  return useQuery<{ potentialSecrets: SecretIssue[]; total: number }>({
    queryKey: ['constants', 'secrets'],
    queryFn: async () => {
      const res = await fetch('/api/constants?action=secrets');
      const data = await res.json();
      return data.data;
    },
  });
}

function useInconsistent() {
  return useQuery<{ inconsistencies: InconsistentIssue[]; total: number }>({
    queryKey: ['constants', 'inconsistent'],
    queryFn: async () => {
      const res = await fetch('/api/constants?action=inconsistent');
      const data = await res.json();
      return data.data;
    },
  });
}

// ============================================================================
// Components
// ============================================================================

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

function CategoryBreakdown({ byCategory }: { byCategory: Record<string, number> }) {
  const categories = Object.entries(byCategory)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a);

  const categoryColors: Record<string, string> = {
    config: 'bg-blue-500',
    api: 'bg-green-500',
    status: 'bg-purple-500',
    error: 'bg-red-500',
    feature_flag: 'bg-yellow-500',
    limit: 'bg-cyan-500',
    security: 'bg-red-600',
    uncategorized: 'bg-gray-500',
  };

  return (
    <div className="card">
      <div className="text-sm text-dark-muted mb-3">By Category</div>
      <div className="space-y-2">
        {categories.map(([category, count]) => (
          <div key={category} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${categoryColors[category] || 'bg-gray-400'}`} />
              <span className="text-sm">{category}</span>
            </div>
            <span className="font-medium">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LanguageBreakdown({ byLanguage }: { byLanguage: Record<string, number> }) {
  const languages = Object.entries(byLanguage)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a);

  return (
    <div className="card">
      <div className="text-sm text-dark-muted mb-3">By Language</div>
      <div className="space-y-2">
        {languages.map(([language, count]) => (
          <div key={language} className="flex items-center justify-between">
            <span className="text-sm">{language}</span>
            <span className="font-medium">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function IssuesSummary({
  issues,
  onViewSecrets,
  onViewInconsistent,
}: {
  issues: ConstantsStats['issues'];
  onViewSecrets: () => void;
  onViewInconsistent: () => void;
}) {
  const totalIssues =
    issues.magicValues + issues.deadConstants + issues.potentialSecrets + issues.inconsistentValues;

  if (totalIssues === 0) {
    return (
      <div className="card">
        <div className="text-sm text-dark-muted mb-3">Issues</div>
        <div className="text-status-approved flex items-center gap-2">
          <span>✓</span>
          <span>No issues found</span>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="text-sm text-dark-muted mb-3">Issues ({totalIssues})</div>
      <div className="space-y-2">
        {issues.potentialSecrets > 0 && (
          <button
            onClick={onViewSecrets}
            className="w-full flex items-center justify-between p-2 rounded bg-red-500/10 hover:bg-red-500/20 transition-colors"
          >
            <span className="text-red-400">🔐 Potential Secrets</span>
            <span className="font-medium text-red-400">{issues.potentialSecrets}</span>
          </button>
        )}
        {issues.inconsistentValues > 0 && (
          <button
            onClick={onViewInconsistent}
            className="w-full flex items-center justify-between p-2 rounded bg-yellow-500/10 hover:bg-yellow-500/20 transition-colors"
          >
            <span className="text-yellow-400">⚡ Inconsistent Values</span>
            <span className="font-medium text-yellow-400">{issues.inconsistentValues}</span>
          </button>
        )}
        {issues.deadConstants > 0 && (
          <div className="flex items-center justify-between p-2 rounded bg-gray-500/10">
            <span className="text-gray-400">💀 Unused Constants</span>
            <span className="font-medium text-gray-400">{issues.deadConstants}</span>
          </div>
        )}
        {issues.magicValues > 0 && (
          <div className="flex items-center justify-between p-2 rounded bg-blue-500/10">
            <span className="text-blue-400">✨ Magic Values</span>
            <span className="font-medium text-blue-400">{issues.magicValues}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ConstantsList({
  category,
  language,
}: {
  category?: string;
  language?: string;
}) {
  const { data, isLoading } = useConstantsList(category, language);

  if (isLoading) {
    return <div className="text-dark-muted">Loading constants...</div>;
  }

  if (!data || (data.constants.length === 0 && data.enums.length === 0)) {
    return <div className="text-dark-muted">No constants found</div>;
  }

  return (
    <div className="space-y-4">
      {data.constants.length > 0 && (
        <div className="card">
          <div className="text-sm text-dark-muted mb-3">
            Constants ({data.constants.length})
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {data.constants.map((c) => (
              <div
                key={c.id}
                className="flex items-start gap-2 p-2 rounded bg-dark-bg/50 hover:bg-dark-bg transition-colors"
              >
                <span className={`px-1.5 py-0.5 rounded text-xs ${c.isExported ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'}`}>
                  {c.kind}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{c.name}</div>
                  <div className="text-xs text-dark-muted truncate">
                    {c.file}:{c.line}
                  </div>
                  {c.value !== undefined && (
                    <div className="text-xs text-cyan-400 truncate mt-1">
                      = {String(c.value).slice(0, 50)}
                    </div>
                  )}
                </div>
                <span className="px-1.5 py-0.5 rounded text-xs bg-dark-bg text-dark-muted">
                  {c.category}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.enums.length > 0 && (
        <div className="card">
          <div className="text-sm text-dark-muted mb-3">
            Enums ({data.enums.length})
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {data.enums.map((e) => (
              <div
                key={e.id}
                className="flex items-start gap-2 p-2 rounded bg-dark-bg/50 hover:bg-dark-bg transition-colors"
              >
                <span className="px-1.5 py-0.5 rounded text-xs bg-purple-500/20 text-purple-400">
                  enum
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{e.name}</div>
                  <div className="text-xs text-dark-muted truncate">
                    {e.file}:{e.line}
                  </div>
                </div>
                <span className="text-xs text-dark-muted">
                  {e.memberCount} members
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SecretsView() {
  const { data, isLoading } = useSecrets();

  if (isLoading) {
    return <div className="text-dark-muted">Loading secrets...</div>;
  }

  if (!data || data.potentialSecrets.length === 0) {
    return (
      <div className="card">
        <div className="text-status-approved flex items-center gap-2">
          <span>✓</span>
          <span>No hardcoded secrets detected</span>
        </div>
      </div>
    );
  }

  const severityColors: Record<string, string> = {
    critical: 'bg-red-600 text-white',
    high: 'bg-red-500 text-white',
    medium: 'bg-yellow-500 text-black',
    low: 'bg-blue-500 text-white',
    info: 'bg-gray-500 text-white',
  };

  return (
    <div className="card">
      <div className="text-sm text-dark-muted mb-3">
        Potential Secrets ({data.total})
      </div>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {data.potentialSecrets.map((secret, i) => (
          <div
            key={i}
            className="flex items-start gap-2 p-2 rounded bg-red-500/10"
          >
            <span className={`px-1.5 py-0.5 rounded text-xs ${severityColors[secret.severity] || 'bg-gray-500'}`}>
              {secret.severity}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{secret.name}</div>
              <div className="text-xs text-dark-muted truncate">
                {secret.file}:{secret.line}
              </div>
              <div className="text-xs text-red-400 mt-1">
                Type: {secret.secretType}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 p-3 rounded bg-yellow-500/10 text-yellow-400 text-sm">
        ⚠️ Move secrets to environment variables or a secrets manager
      </div>
    </div>
  );
}

function InconsistentView() {
  const { data, isLoading } = useInconsistent();

  if (isLoading) {
    return <div className="text-dark-muted">Loading...</div>;
  }

  if (!data || data.inconsistencies.length === 0) {
    return (
      <div className="card">
        <div className="text-status-approved flex items-center gap-2">
          <span>✓</span>
          <span>No inconsistent constants found</span>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="text-sm text-dark-muted mb-3">
        Inconsistent Constants ({data.total})
      </div>
      <div className="space-y-4 max-h-96 overflow-y-auto">
        {data.inconsistencies.map((inc, i) => (
          <div key={i} className="p-3 rounded bg-yellow-500/10">
            <div className="text-sm font-medium text-yellow-400 mb-2">
              {inc.name}
            </div>
            <div className="space-y-1">
              {inc.instances.slice(0, 5).map((inst, j) => (
                <div key={j} className="text-xs flex justify-between">
                  <span className="text-dark-muted truncate flex-1">
                    {inst.file}:{inst.line}
                  </span>
                  <span className="text-cyan-400 ml-2">
                    = {String(inst.value).slice(0, 20)}
                  </span>
                </div>
              ))}
              {inc.instances.length > 5 && (
                <div className="text-xs text-dark-muted">
                  ... and {inc.instances.length - 5} more
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ConstantsTab(): React.ReactElement {
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [selectedLanguage, setSelectedLanguage] = useState<string | undefined>();

  const { data: stats, isLoading, error } = useConstantsStats();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-dark-muted">Loading constants...</div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-dark-muted">
          No constants data found. Run <code className="bg-dark-bg px-1 rounded">drift scan</code> first.
        </div>
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
          Overview
        </button>
        <button
          onClick={() => setViewMode('list')}
          className={`px-3 py-1.5 rounded text-sm ${viewMode === 'list' ? 'bg-accent-primary text-white' : 'bg-dark-bg text-dark-muted hover:text-white'}`}
        >
          Browse
        </button>
        <button
          onClick={() => setViewMode('secrets')}
          className={`px-3 py-1.5 rounded text-sm ${viewMode === 'secrets' ? 'bg-accent-primary text-white' : 'bg-dark-bg text-dark-muted hover:text-white'}`}
        >
          Secrets {stats.issues.potentialSecrets > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-xs">
              {stats.issues.potentialSecrets}
            </span>
          )}
        </button>
        <button
          onClick={() => setViewMode('inconsistent')}
          className={`px-3 py-1.5 rounded text-sm ${viewMode === 'inconsistent' ? 'bg-accent-primary text-white' : 'bg-dark-bg text-dark-muted hover:text-white'}`}
        >
          Inconsistent {stats.issues.inconsistentValues > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-yellow-500 text-black text-xs">
              {stats.issues.inconsistentValues}
            </span>
          )}
        </button>
      </div>

      {/* Overview mode */}
      {viewMode === 'overview' && (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard
              label="Total Constants"
              value={stats.totalConstants}
            />
            <StatCard
              label="Total Enums"
              value={stats.totalEnums}
            />
            <StatCard
              label="Languages"
              value={Object.keys(stats.byLanguage).length}
            />
            <StatCard
              label="Categories"
              value={Object.keys(stats.byCategory).length}
            />
          </div>

          {/* Breakdowns row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <CategoryBreakdown byCategory={stats.byCategory} />
            <LanguageBreakdown byLanguage={stats.byLanguage} />
            <IssuesSummary
              issues={stats.issues}
              onViewSecrets={() => setViewMode('secrets')}
              onViewInconsistent={() => setViewMode('inconsistent')}
            />
          </div>
        </>
      )}

      {/* List mode */}
      {viewMode === 'list' && (
        <>
          {/* Filters */}
          <div className="flex gap-4">
            <select
              value={selectedCategory || ''}
              onChange={(e) => setSelectedCategory(e.target.value || undefined)}
              className="bg-dark-bg border border-dark-border rounded px-3 py-1.5 text-sm"
            >
              <option value="">All Categories</option>
              {Object.keys(stats.byCategory).map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <select
              value={selectedLanguage || ''}
              onChange={(e) => setSelectedLanguage(e.target.value || undefined)}
              className="bg-dark-bg border border-dark-border rounded px-3 py-1.5 text-sm"
            >
              <option value="">All Languages</option>
              {Object.keys(stats.byLanguage).map((lang) => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>
          </div>

          <ConstantsList category={selectedCategory} language={selectedLanguage} />
        </>
      )}

      {/* Secrets mode */}
      {viewMode === 'secrets' && <SecretsView />}

      {/* Inconsistent mode */}
      {viewMode === 'inconsistent' && <InconsistentView />}
    </div>
  );
}
