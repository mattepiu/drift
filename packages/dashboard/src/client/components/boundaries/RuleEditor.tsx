/**
 * Rule Editor Component
 * 
 * UI for creating and editing boundary rules.
 */

import { useState } from 'react';

import { OPERATION_CONFIG } from './constants';

import type { DataOperation } from './types';

// ============================================================================
// Types
// ============================================================================

export interface BoundaryRule {
  id: string;
  description: string;
  fields?: string[];
  tables?: string[];
  operations?: DataOperation[];
  allowedPaths: string[];
  excludePaths?: string[];
  severity: 'error' | 'warning' | 'info';
  enabled: boolean;
}

export interface BoundaryRulesConfig {
  version: '1.0';
  sensitivity: {
    critical: string[];
    sensitive: string[];
    general: string[];
  };
  boundaries: BoundaryRule[];
  globalExcludes?: string[];
}

interface RuleEditorProps {
  rules: BoundaryRulesConfig | null;
  onSave: (rules: BoundaryRulesConfig) => void;
  availableTables: string[];
  availableFields: string[];
}

// ============================================================================
// Rule Card Component
// ============================================================================

interface RuleCardProps {
  rule: BoundaryRule;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}

function RuleCard({ rule, onEdit, onDelete, onToggle }: RuleCardProps) {
  const severityColors = {
    error: 'border-red-500/50 bg-red-500/10',
    warning: 'border-yellow-500/50 bg-yellow-500/10',
    info: 'border-blue-500/50 bg-blue-500/10',
  };

  const severityIcons = {
    error: '🔴',
    warning: '🟡',
    info: '🔵',
  };

  return (
    <div className={`p-4 rounded-lg border ${rule.enabled ? severityColors[rule.severity] : 'border-dark-border bg-dark-surface opacity-60'}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span>{severityIcons[rule.severity]}</span>
          <span className="font-mono font-medium">{rule.id}</span>
          {!rule.enabled && (
            <span className="px-2 py-0.5 bg-dark-bg rounded text-xs text-dark-muted">disabled</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggle}
            className="p-1.5 hover:bg-dark-border rounded transition-colors text-sm"
            title={rule.enabled ? 'Disable rule' : 'Enable rule'}
          >
            {rule.enabled ? '✓' : '○'}
          </button>
          <button
            onClick={onEdit}
            className="p-1.5 hover:bg-dark-border rounded transition-colors text-sm"
            title="Edit rule"
          >
            ✏️
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 hover:bg-red-500/20 rounded transition-colors text-sm"
            title="Delete rule"
          >
            🗑️
          </button>
        </div>
      </div>

      <p className="text-sm text-dark-muted mb-3">{rule.description}</p>

      <div className="flex flex-wrap gap-2 text-xs">
        {rule.tables && rule.tables.length > 0 && (
          <span className="px-2 py-1 bg-dark-bg rounded">
            🗄️ {rule.tables.length} table{rule.tables.length !== 1 ? 's' : ''}
          </span>
        )}
        {rule.fields && rule.fields.length > 0 && (
          <span className="px-2 py-1 bg-dark-bg rounded">
            📋 {rule.fields.length} field{rule.fields.length !== 1 ? 's' : ''}
          </span>
        )}
        {rule.operations && rule.operations.length > 0 && (
          <span className="px-2 py-1 bg-dark-bg rounded">
            ⚡ {rule.operations.join(', ')}
          </span>
        )}
        <span className="px-2 py-1 bg-dark-bg rounded">
          ✓ {rule.allowedPaths.length} allowed path{rule.allowedPaths.length !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// Rule Form Component
// ============================================================================

interface RuleFormProps {
  rule: BoundaryRule | null;
  availableTables: string[];
  availableFields: string[];
  onSave: (rule: BoundaryRule) => void;
  onCancel: () => void;
}

function RuleForm({ rule, availableTables, onSave, onCancel }: RuleFormProps) {
  const [formData, setFormData] = useState<BoundaryRule>(rule ?? {
    id: '',
    description: '',
    tables: [],
    fields: [],
    operations: [],
    allowedPaths: [''],
    excludePaths: [],
    severity: 'warning',
    enabled: true,
  });

  const [newAllowedPath, setNewAllowedPath] = useState('');
  const [newExcludePath, setNewExcludePath] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.id || !formData.description || formData.allowedPaths.filter(p => p).length === 0) {
      return;
    }
    onSave({
      ...formData,
      allowedPaths: formData.allowedPaths.filter(p => p),
      excludePaths: formData.excludePaths?.filter(p => p),
    });
  };

  const addAllowedPath = () => {
    if (newAllowedPath) {
      setFormData(prev => ({
        ...prev,
        allowedPaths: [...prev.allowedPaths, newAllowedPath],
      }));
      setNewAllowedPath('');
    }
  };

  const removeAllowedPath = (index: number) => {
    setFormData(prev => ({
      ...prev,
      allowedPaths: prev.allowedPaths.filter((_, i) => i !== index),
    }));
  };

  const addExcludePath = () => {
    if (newExcludePath) {
      setFormData(prev => ({
        ...prev,
        excludePaths: [...(prev.excludePaths ?? []), newExcludePath],
      }));
      setNewExcludePath('');
    }
  };

  const removeExcludePath = (index: number) => {
    setFormData(prev => ({
      ...prev,
      excludePaths: prev.excludePaths?.filter((_, i) => i !== index),
    }));
  };

  const toggleTable = (table: string) => {
    setFormData(prev => ({
      ...prev,
      tables: prev.tables?.includes(table)
        ? prev.tables.filter(t => t !== table)
        : [...(prev.tables ?? []), table],
    }));
  };

  const toggleOperation = (op: DataOperation) => {
    setFormData(prev => ({
      ...prev,
      operations: prev.operations?.includes(op)
        ? prev.operations.filter(o => o !== op)
        : [...(prev.operations ?? []), op],
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Info */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Rule ID</label>
          <input
            type="text"
            value={formData.id}
            onChange={(e) => setFormData(prev => ({ ...prev, id: e.target.value.replace(/\s+/g, '-').toLowerCase() }))}
            placeholder="e.g., auth-owns-credentials"
            className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm focus:outline-none focus:border-blue-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Description</label>
          <input
            type="text"
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            placeholder="e.g., Only auth module can access credential fields"
            className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm focus:outline-none focus:border-blue-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Severity</label>
          <div className="flex gap-2">
            {(['error', 'warning', 'info'] as const).map(sev => (
              <button
                key={sev}
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, severity: sev }))}
                className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                  formData.severity === sev
                    ? sev === 'error' ? 'bg-red-500/20 text-red-400 border border-red-500/50'
                    : sev === 'warning' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50'
                    : 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                    : 'bg-dark-bg border border-dark-border hover:border-dark-muted'
                }`}
              >
                {sev === 'error' ? '🔴' : sev === 'warning' ? '🟡' : '🔵'} {sev}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tables */}
      <div>
        <label className="block text-sm font-medium mb-2">Tables (optional)</label>
        <div className="flex flex-wrap gap-2 p-3 bg-dark-bg rounded-lg border border-dark-border max-h-32 overflow-y-auto">
          {availableTables.length > 0 ? (
            availableTables.map(table => (
              <button
                key={table}
                type="button"
                onClick={() => toggleTable(table)}
                className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
                  formData.tables?.includes(table)
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                    : 'bg-dark-surface border border-dark-border hover:border-dark-muted'
                }`}
              >
                {table}
              </button>
            ))
          ) : (
            <span className="text-dark-muted text-sm">No tables discovered yet</span>
          )}
        </div>
      </div>

      {/* Operations */}
      <div>
        <label className="block text-sm font-medium mb-2">Operations (optional)</label>
        <div className="flex gap-2">
          {(['read', 'write', 'delete'] as DataOperation[]).map(op => {
            const config = OPERATION_CONFIG[op];
            return (
              <button
                key={op}
                type="button"
                onClick={() => toggleOperation(op)}
                className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                  formData.operations?.includes(op)
                    ? `${config.bgColor} ${config.color} border border-current`
                    : 'bg-dark-bg border border-dark-border hover:border-dark-muted'
                }`}
              >
                {config.icon} {config.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Allowed Paths */}
      <div>
        <label className="block text-sm font-medium mb-2">Allowed Paths (glob patterns)</label>
        <div className="space-y-2">
          {formData.allowedPaths.map((path, idx) => (
            <div key={idx} className="flex gap-2">
              <input
                type="text"
                value={path}
                onChange={(e) => {
                  const newPaths = [...formData.allowedPaths];
                  newPaths[idx] = e.target.value;
                  setFormData(prev => ({ ...prev, allowedPaths: newPaths }));
                }}
                placeholder="e.g., src/auth/**"
                className="flex-1 px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm font-mono focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => removeAllowedPath(idx)}
                className="px-3 py-2 bg-dark-bg border border-dark-border rounded-lg hover:bg-red-500/20 transition-colors"
              >
                ✕
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              type="text"
              value={newAllowedPath}
              onChange={(e) => setNewAllowedPath(e.target.value)}
              placeholder="Add allowed path..."
              className="flex-1 px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm font-mono focus:outline-none focus:border-blue-500"
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addAllowedPath())}
            />
            <button
              type="button"
              onClick={addAllowedPath}
              className="px-3 py-2 bg-blue-500/20 text-blue-400 border border-blue-500/50 rounded-lg hover:bg-blue-500/30 transition-colors"
            >
              + Add
            </button>
          </div>
        </div>
      </div>

      {/* Exclude Paths */}
      <div>
        <label className="block text-sm font-medium mb-2">Exclude Paths (optional)</label>
        <div className="space-y-2">
          {formData.excludePaths?.map((path, idx) => (
            <div key={idx} className="flex gap-2">
              <input
                type="text"
                value={path}
                onChange={(e) => {
                  const newPaths = [...(formData.excludePaths ?? [])];
                  newPaths[idx] = e.target.value;
                  setFormData(prev => ({ ...prev, excludePaths: newPaths }));
                }}
                className="flex-1 px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm font-mono focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => removeExcludePath(idx)}
                className="px-3 py-2 bg-dark-bg border border-dark-border rounded-lg hover:bg-red-500/20 transition-colors"
              >
                ✕
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              type="text"
              value={newExcludePath}
              onChange={(e) => setNewExcludePath(e.target.value)}
              placeholder="e.g., **/*.test.ts"
              className="flex-1 px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm font-mono focus:outline-none focus:border-blue-500"
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addExcludePath())}
            />
            <button
              type="button"
              onClick={addExcludePath}
              className="px-3 py-2 bg-dark-surface border border-dark-border rounded-lg hover:border-dark-muted transition-colors"
            >
              + Add
            </button>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t border-dark-border">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-dark-bg border border-dark-border rounded-lg hover:border-dark-muted transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          {rule ? 'Update Rule' : 'Create Rule'}
        </button>
      </div>
    </form>
  );
}

// ============================================================================
// Sensitivity Editor Component
// ============================================================================

interface SensitivityEditorProps {
  sensitivity: BoundaryRulesConfig['sensitivity'];
  onChange: (sensitivity: BoundaryRulesConfig['sensitivity']) => void;
  availableFields: string[];
}

function SensitivityEditor({ sensitivity, onChange }: SensitivityEditorProps) {
  const [newField, setNewField] = useState({ tier: 'sensitive' as 'critical' | 'sensitive', value: '' });

  const addField = (tier: 'critical' | 'sensitive') => {
    if (newField.value && newField.tier === tier) {
      onChange({
        ...sensitivity,
        [tier]: [...sensitivity[tier], newField.value],
      });
      setNewField({ tier, value: '' });
    }
  };

  const removeField = (tier: 'critical' | 'sensitive', index: number) => {
    onChange({
      ...sensitivity,
      [tier]: sensitivity[tier].filter((_, i) => i !== index),
    });
  };

  return (
    <div className="space-y-6">
      {/* Critical Fields */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-red-400">🔴</span>
          <h4 className="font-medium">Critical Fields</h4>
          <span className="text-xs text-dark-muted">Strictest protection</span>
        </div>
        <div className="space-y-2">
          {sensitivity.critical.map((field, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="flex-1 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-sm font-mono">
                {field}
              </span>
              <button
                onClick={() => removeField('critical', idx)}
                className="p-2 hover:bg-red-500/20 rounded transition-colors"
              >
                ✕
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              type="text"
              value={newField.tier === 'critical' ? newField.value : ''}
              onChange={(e) => setNewField({ tier: 'critical', value: e.target.value })}
              placeholder="e.g., users.password_hash"
              className="flex-1 px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm font-mono focus:outline-none focus:border-red-500"
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addField('critical'))}
            />
            <button
              onClick={() => addField('critical')}
              className="px-3 py-2 bg-red-500/20 text-red-400 border border-red-500/50 rounded-lg hover:bg-red-500/30 transition-colors"
            >
              + Add
            </button>
          </div>
        </div>
      </div>

      {/* Sensitive Fields */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-yellow-400">🟡</span>
          <h4 className="font-medium">Sensitive Fields</h4>
          <span className="text-xs text-dark-muted">Moderate protection</span>
        </div>
        <div className="space-y-2">
          {sensitivity.sensitive.map((field, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="flex-1 px-3 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm font-mono">
                {field}
              </span>
              <button
                onClick={() => removeField('sensitive', idx)}
                className="p-2 hover:bg-red-500/20 rounded transition-colors"
              >
                ✕
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              type="text"
              value={newField.tier === 'sensitive' ? newField.value : ''}
              onChange={(e) => setNewField({ tier: 'sensitive', value: e.target.value })}
              placeholder="e.g., users.email"
              className="flex-1 px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm font-mono focus:outline-none focus:border-yellow-500"
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addField('sensitive'))}
            />
            <button
              onClick={() => addField('sensitive')}
              className="px-3 py-2 bg-yellow-500/20 text-yellow-400 border border-yellow-500/50 rounded-lg hover:bg-yellow-500/30 transition-colors"
            >
              + Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Rule Editor Component
// ============================================================================

export function RuleEditor({ rules, onSave, availableTables, availableFields }: RuleEditorProps) {
  const [activeTab, setActiveTab] = useState<'rules' | 'sensitivity'>('rules');
  const [editingRule, setEditingRule] = useState<BoundaryRule | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Initialize with default config if null
  const config: BoundaryRulesConfig = rules ?? {
    version: '1.0',
    sensitivity: {
      critical: [],
      sensitive: [],
      general: [],
    },
    boundaries: [],
    globalExcludes: ['**/node_modules/**', '**/dist/**', '**/*.test.*', '**/*.spec.*'],
  };

  const handleSaveRule = (rule: BoundaryRule) => {
    const existingIndex = config.boundaries.findIndex(r => r.id === rule.id);
    const newBoundaries = existingIndex >= 0
      ? config.boundaries.map((r, i) => i === existingIndex ? rule : r)
      : [...config.boundaries, rule];

    onSave({
      ...config,
      boundaries: newBoundaries,
    });
    setEditingRule(null);
    setIsCreating(false);
  };

  const handleDeleteRule = (id: string) => {
    onSave({
      ...config,
      boundaries: config.boundaries.filter(r => r.id !== id),
    });
  };

  const handleToggleRule = (id: string) => {
    onSave({
      ...config,
      boundaries: config.boundaries.map(r =>
        r.id === id ? { ...r, enabled: !r.enabled } : r
      ),
    });
  };

  const handleSensitivityChange = (sensitivity: BoundaryRulesConfig['sensitivity']) => {
    onSave({
      ...config,
      sensitivity,
    });
  };

  // Show form if editing or creating
  if (editingRule || isCreating) {
    return (
      <div className="p-6">
        <h3 className="text-lg font-bold mb-6">
          {editingRule ? 'Edit Rule' : 'Create New Rule'}
        </h3>
        <RuleForm
          rule={editingRule}
          availableTables={availableTables}
          availableFields={availableFields}
          onSave={handleSaveRule}
          onCancel={() => {
            setEditingRule(null);
            setIsCreating(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-dark-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Boundary Rules</h2>
          <button
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            + New Rule
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('rules')}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              activeTab === 'rules'
                ? 'bg-blue-500/20 text-blue-400'
                : 'text-dark-muted hover:text-dark-text'
            }`}
          >
            📋 Rules ({config.boundaries.length})
          </button>
          <button
            onClick={() => setActiveTab('sensitivity')}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              activeTab === 'sensitivity'
                ? 'bg-blue-500/20 text-blue-400'
                : 'text-dark-muted hover:text-dark-text'
            }`}
          >
            🔒 Sensitivity Tiers
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'rules' ? (
          config.boundaries.length > 0 ? (
            <div className="space-y-3">
              {config.boundaries.map(rule => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  onEdit={() => setEditingRule(rule)}
                  onDelete={() => handleDeleteRule(rule.id)}
                  onToggle={() => handleToggleRule(rule.id)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="text-4xl mb-4">📋</span>
              <h3 className="text-lg font-medium mb-2">No rules configured</h3>
              <p className="text-dark-muted text-sm max-w-md mb-4">
                Create boundary rules to enforce data access policies
              </p>
              <button
                onClick={() => setIsCreating(true)}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Create First Rule
              </button>
            </div>
          )
        ) : (
          <SensitivityEditor
            sensitivity={config.sensitivity}
            onChange={handleSensitivityChange}
            availableFields={availableFields}
          />
        )}
      </div>
    </div>
  );
}
