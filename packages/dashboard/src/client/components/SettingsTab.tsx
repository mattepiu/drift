/**
 * Settings Tab Component
 *
 * Displays and allows editing of drift configuration.
 */

import React, { useState } from 'react';

import { useConfig, useUpdateConfig } from '../hooks';

import type { DetectorConfig, PatternCategory, Severity } from '../types';

function DetectorToggle({
  detector,
  onToggle,
}: {
  detector: DetectorConfig;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 bg-dark-bg rounded">
      <div>
        <div className="font-medium">{detector.name}</div>
        <div className="text-xs text-dark-muted mt-0.5">
          {detector.category} • {detector.id}
        </div>
      </div>
      <button
        onClick={() => onToggle(!detector.enabled)}
        className={`w-12 h-6 rounded-full transition-colors ${
          detector.enabled ? 'bg-status-approved' : 'bg-dark-border'
        }`}
      >
        <div
          className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
            detector.enabled ? 'translate-x-6' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

function IgnorePatternsEditor({
  patterns,
  onChange,
}: {
  patterns: string[];
  onChange: (patterns: string[]) => void;
}) {
  const [newPattern, setNewPattern] = useState('');

  const handleAdd = () => {
    if (newPattern.trim() && !patterns.includes(newPattern.trim())) {
      onChange([...patterns, newPattern.trim()]);
      setNewPattern('');
    }
  };

  const handleRemove = (pattern: string) => {
    onChange(patterns.filter((p) => p !== pattern));
  };

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          placeholder="Add ignore pattern (e.g., **/test/**)"
          className="flex-1 bg-dark-bg border border-dark-border rounded px-3 py-1.5 text-sm"
          value={newPattern}
          onChange={(e) => setNewPattern(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button onClick={handleAdd} className="btn btn-secondary text-sm">
          Add
        </button>
      </div>
      <div className="space-y-1">
        {patterns.map((pattern) => (
          <div
            key={pattern}
            className="flex items-center justify-between p-2 bg-dark-bg rounded text-sm"
          >
            <code className="font-mono">{pattern}</code>
            <button
              onClick={() => handleRemove(pattern)}
              className="text-dark-muted hover:text-severity-error"
            >
              ✕
            </button>
          </div>
        ))}
        {patterns.length === 0 && (
          <div className="text-dark-muted text-sm">No ignore patterns configured</div>
        )}
      </div>
    </div>
  );
}

function SeverityOverridesEditor({
  overrides,
  onChange,
}: {
  overrides: Record<string, Severity>;
  onChange: (overrides: Record<string, Severity>) => void;
}) {
  const [newPatternId, setNewPatternId] = useState('');
  const [newSeverity, setNewSeverity] = useState<Severity>('warning');

  const handleAdd = () => {
    if (newPatternId.trim()) {
      onChange({ ...overrides, [newPatternId.trim()]: newSeverity });
      setNewPatternId('');
    }
  };

  const handleRemove = (patternId: string) => {
    const newOverrides = { ...overrides };
    delete newOverrides[patternId];
    onChange(newOverrides);
  };

  const severities: Severity[] = ['error', 'warning', 'info', 'hint'];

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          placeholder="Pattern ID"
          className="flex-1 bg-dark-bg border border-dark-border rounded px-3 py-1.5 text-sm"
          value={newPatternId}
          onChange={(e) => setNewPatternId(e.target.value)}
        />
        <select
          className="bg-dark-bg border border-dark-border rounded px-3 py-1.5 text-sm"
          value={newSeverity}
          onChange={(e) => setNewSeverity(e.target.value as Severity)}
        >
          {severities.map((sev) => (
            <option key={sev} value={sev}>{sev}</option>
          ))}
        </select>
        <button onClick={handleAdd} className="btn btn-secondary text-sm">
          Add
        </button>
      </div>
      <div className="space-y-1">
        {Object.entries(overrides).map(([patternId, severity]) => (
          <div
            key={patternId}
            className="flex items-center justify-between p-2 bg-dark-bg rounded text-sm"
          >
            <code className="font-mono">{patternId}</code>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-xs badge-${severity}`}>
                {severity}
              </span>
              <button
                onClick={() => handleRemove(patternId)}
                className="text-dark-muted hover:text-severity-error"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
        {Object.keys(overrides).length === 0 && (
          <div className="text-dark-muted text-sm">No severity overrides configured</div>
        )}
      </div>
    </div>
  );
}

export function SettingsTab(): React.ReactElement {
  const { data: config, isLoading, error } = useConfig();
  const updateMutation = useUpdateConfig();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-dark-muted">Loading configuration...</div>
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-severity-error">Failed to load configuration</div>
      </div>
    );
  }

  const handleDetectorToggle = (detectorId: string, enabled: boolean) => {
    const updatedDetectors = config.detectors.map((d) =>
      d.id === detectorId ? { ...d, enabled } : d
    );
    updateMutation.mutate({ detectors: updatedDetectors });
  };

  const handleIgnorePatternsChange = (ignorePatterns: string[]) => {
    updateMutation.mutate({ ignorePatterns });
  };

  const handleSeverityOverridesChange = (severityOverrides: Record<string, Severity>) => {
    updateMutation.mutate({ severityOverrides });
  };

  // Group detectors by category
  const detectorsByCategory = config.detectors.reduce((acc, detector) => {
    const category = detector.category;
    if (!acc[category]) {acc[category] = [];}
    acc[category].push(detector);
    return acc;
  }, {} as Record<PatternCategory, DetectorConfig[]>);

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Version info */}
      <div className="card">
        <h3 className="font-medium mb-2">Configuration</h3>
        <div className="text-sm text-dark-muted">Version: {config.version}</div>
      </div>

      {/* Detectors */}
      <div className="card">
        <h3 className="font-medium mb-4">Detectors</h3>
        <div className="space-y-4">
          {Object.entries(detectorsByCategory).map(([category, detectors]) => (
            <div key={category}>
              <h4 className="text-sm text-dark-muted mb-2 capitalize">{category}</h4>
              <div className="space-y-2">
                {detectors.map((detector) => (
                  <DetectorToggle
                    key={detector.id}
                    detector={detector}
                    onToggle={(enabled) => handleDetectorToggle(detector.id, enabled)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Ignore patterns */}
      <div className="card">
        <h3 className="font-medium mb-4">Ignore Patterns</h3>
        <IgnorePatternsEditor
          patterns={config.ignorePatterns}
          onChange={handleIgnorePatternsChange}
        />
      </div>

      {/* Severity overrides */}
      <div className="card">
        <h3 className="font-medium mb-4">Severity Overrides</h3>
        <SeverityOverridesEditor
          overrides={config.severityOverrides}
          onChange={handleSeverityOverridesChange}
        />
      </div>

      {/* Save indicator */}
      {updateMutation.isPending && (
        <div className="text-sm text-dark-muted">Saving...</div>
      )}
      {updateMutation.isError && (
        <div className="text-sm text-severity-error">Failed to save changes</div>
      )}
    </div>
  );
}
