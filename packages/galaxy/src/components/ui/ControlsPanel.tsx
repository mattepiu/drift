/**
 * ControlsPanel Component
 * 
 * Display settings and filter controls for the galaxy visualization.
 */

import { useState, useCallback } from 'react';

import { useGalaxySound } from '../../audio/index.js';
import { useGalaxyStore } from '../../store/index.js';

import type { ViewMode, SensitivityLevel, DataOperation } from '../../types/index.js';

// ============================================================================
// Component
// ============================================================================

export function ControlsPanel() {
  const {
    isPanelOpen,
    activePanel,
    closePanel,
    viewMode,
    setViewMode,
    filters,
    setFilters,
    resetFilters,
    display,
    setDisplay,
    resetCamera,
  } = useGalaxyStore();
  
  const { play, getConfig, setConfig, toggleMute, setVolume } = useGalaxySound();
  const [soundConfig, setSoundConfig] = useState(getConfig);
  
  // Handle sound toggle
  const handleSoundToggle = useCallback((enabled: boolean) => {
    setConfig({ enabled });
    setSoundConfig(prev => ({ ...prev, enabled }));
    if (enabled) {
      play('powerUp');
    }
  }, [setConfig, play]);
  
  // Handle mute toggle
  const handleMuteToggle = useCallback(() => {
    const newMuted = toggleMute();
    setSoundConfig(prev => ({ ...prev, muted: newMuted }));
    if (!newMuted) {
      play('click');
    }
  }, [toggleMute, play]);
  
  // Handle volume change
  const handleVolumeChange = useCallback((volume: number) => {
    setVolume(volume);
    setSoundConfig(prev => ({ ...prev, volume }));
  }, [setVolume]);
  
  if (!isPanelOpen || activePanel !== 'settings') {return null;}
  
  return (
    <div className="absolute right-4 top-4 w-72 max-h-[calc(100vh-8rem)] overflow-y-auto bg-slate-900/95 backdrop-blur-sm rounded-lg border border-slate-700 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <h2 className="text-lg font-semibold text-white">Controls</h2>
        <button
          onClick={closePanel}
          className="text-slate-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      {/* Content */}
      <div className="p-4 space-y-6">
        {/* View Mode */}
        <Section title="View Mode">
          <div className="grid grid-cols-2 gap-2">
            {VIEW_MODES.map(mode => (
              <button
                key={mode.value}
                onClick={() => { setViewMode(mode.value); }}
                className={`p-2 rounded text-sm transition-colors ${
                  viewMode === mode.value
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {mode.icon} {mode.label}
              </button>
            ))}
          </div>
        </Section>
        
        {/* Filters */}
        <Section title="Filters">
          <div className="space-y-3">
            {/* Sensitivity filter */}
            <div>
              <label className="text-xs text-slate-400 block mb-1">Min Sensitivity</label>
              <select
                value={filters.minSensitivity || ''}
                onChange={(e) => { setFilters({ minSensitivity: (e.target.value || null) as SensitivityLevel | null }); }}
                className="w-full p-2 rounded bg-slate-800 text-slate-300 text-sm border border-slate-700"
              >
                <option value="">All</option>
                <option value="low">Low+</option>
                <option value="medium">Medium+</option>
                <option value="high">High+</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            
            {/* Operation filter */}
            <div>
              <label className="text-xs text-slate-400 block mb-1">Operation Type</label>
              <select
                value={filters.operationType || ''}
                onChange={(e) => { setFilters({ operationType: (e.target.value || null) as DataOperation | null }); }}
                className="w-full p-2 rounded bg-slate-800 text-slate-300 text-sm border border-slate-700"
              >
                <option value="">All</option>
                <option value="read">Read</option>
                <option value="write">Write</option>
                <option value="delete">Delete</option>
              </select>
            </div>
            
            {/* Toggle filters */}
            <Toggle
              label="Untested paths only"
              checked={filters.untestedOnly}
              onChange={(checked) => { setFilters({ untestedOnly: checked }); }}
            />
            <Toggle
              label="Public endpoints only"
              checked={filters.publicOnly}
              onChange={(checked) => { setFilters({ publicOnly: checked }); }}
            />
            
            <button
              onClick={resetFilters}
              className="w-full p-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 text-sm transition-colors"
            >
              Reset Filters
            </button>
          </div>
        </Section>
        
        {/* Display Settings */}
        <Section title="Display">
          <div className="space-y-3">
            <Toggle
              label="Show field moons"
              checked={display.showFields}
              onChange={(checked) => { setDisplay({ showFields: checked }); }}
            />
            <Toggle
              label="Show data paths"
              checked={display.showPaths}
              onChange={(checked) => { setDisplay({ showPaths: checked }); }}
            />
            <Toggle
              label="Show relationships"
              checked={display.showRelationships}
              onChange={(checked) => { setDisplay({ showRelationships: checked }); }}
            />
            <Toggle
              label="Show labels"
              checked={display.showLabels}
              onChange={(checked) => { setDisplay({ showLabels: checked }); }}
            />
            <Toggle
              label="Enable bloom effect"
              checked={display.enableBloom}
              onChange={(checked) => { setDisplay({ enableBloom: checked }); }}
            />
            
            {/* Animation speed */}
            <div>
              <label className="text-xs text-slate-400 block mb-1">
                Animation Speed: {display.animationSpeed.toFixed(1)}x
              </label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={display.animationSpeed}
                onChange={(e) => { setDisplay({ animationSpeed: parseFloat(e.target.value) }); }}
                className="w-full"
              />
            </div>
            
            {/* Path opacity */}
            <div>
              <label className="text-xs text-slate-400 block mb-1">
                Path Opacity: {Math.round(display.pathOpacity * 100)}%
              </label>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.1"
                value={display.pathOpacity}
                onChange={(e) => { setDisplay({ pathOpacity: parseFloat(e.target.value) }); }}
                className="w-full"
              />
            </div>
          </div>
        </Section>
        
        {/* Camera */}
        <Section title="Camera">
          <button
            onClick={resetCamera}
            className="w-full p-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition-colors"
          >
            🎥 Reset Camera
          </button>
        </Section>
        
        {/* Sound Settings */}
        <Section title="Sound">
          <div className="space-y-3">
            <Toggle
              label="Enable sounds"
              checked={soundConfig.enabled}
              onChange={handleSoundToggle}
            />
            <Toggle
              label="Mute"
              checked={soundConfig.muted}
              onChange={handleMuteToggle}
            />
            
            {/* Volume slider */}
            <div>
              <label className="text-xs text-slate-400 block mb-1">
                Volume: {Math.round(soundConfig.volume * 100)}%
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={soundConfig.volume}
                onChange={(e) => { handleVolumeChange(parseFloat(e.target.value)); }}
                className="w-full"
                disabled={!soundConfig.enabled || soundConfig.muted}
              />
            </div>
            
            {/* Test sounds */}
            <div className="flex gap-2">
              <button
                onClick={() => { play('hover'); }}
                className="flex-1 p-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
                disabled={!soundConfig.enabled || soundConfig.muted}
              >
                🔊 Test
              </button>
              <button
                onClick={() => { play('alertCritical'); }}
                className="flex-1 p-2 rounded bg-red-900/50 hover:bg-red-800/50 text-red-300 text-xs transition-colors"
                disabled={!soundConfig.enabled || soundConfig.muted}
              >
                🚨 Alert
              </button>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

const VIEW_MODES: { value: ViewMode; label: string; icon: string }[] = [
  { value: 'overview', label: 'Overview', icon: '🌌' },
  { value: 'security', label: 'Security', icon: '🔒' },
  { value: 'coverage', label: 'Coverage', icon: '📊' },
  { value: 'blast-radius', label: 'Impact', icon: '💥' },
];

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <div>
      <h3 className="text-sm font-medium text-slate-300 mb-2">{title}</h3>
      {children}
    </div>
  );
}

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function Toggle({ label, checked, onChange }: ToggleProps) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-sm text-slate-300">{label}</span>
      <button
        onClick={() => { onChange(!checked); }}
        className={`w-10 h-5 rounded-full transition-colors ${
          checked ? 'bg-blue-500' : 'bg-slate-700'
        }`}
      >
        <div
          className={`w-4 h-4 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </label>
  );
}
