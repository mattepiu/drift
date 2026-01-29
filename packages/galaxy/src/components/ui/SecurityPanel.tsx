/**
 * SecurityPanel Component
 * 
 * Displays security-focused information about the galaxy.
 * Shows sensitive data exposure, public endpoints, and untested paths.
 */

import { useMemo } from 'react';

import { SENSITIVITY_COLORS, SECURITY_TIER_COLORS } from '../../constants/index.js';
import { useGalaxyStore } from '../../store/index.js';

// ============================================================================
// Component
// ============================================================================

export function SecurityPanel() {
  const { isPanelOpen, activePanel, closePanel, galaxyData, setViewMode, setFilters } = useGalaxyStore();
  
  // Calculate security metrics
  const metrics = useMemo(() => {
    if (!galaxyData) {return null;}
    
    const publicEndpoints = galaxyData.entryPoints.filter(e => e.authLevel === 'public');
    const criticalTables = galaxyData.tables.filter(t => t.sensitivity === 'critical' || t.sensitivity === 'high');
    const untestedPaths = galaxyData.dataPaths.filter(p => !p.isTested);
    const p0Endpoints = galaxyData.entryPoints.filter(e => e.securityTier === 'P0');
    
    // Find public endpoints reaching sensitive data
    const publicToSensitive = publicEndpoints.filter(ep => 
      ep.reachableTables.some(tableId => 
        criticalTables.some(t => t.id === tableId)
      )
    );
    
    return {
      publicEndpoints,
      criticalTables,
      untestedPaths,
      p0Endpoints,
      publicToSensitive,
      healthScore: galaxyData.stats.healthScore,
    };
  }, [galaxyData]);
  
  if (!isPanelOpen || activePanel !== 'security') {return null;}
  if (!metrics) {return null;}
  
  const hasIssues = metrics.publicToSensitive.length > 0 || metrics.untestedPaths.length > 0;
  
  return (
    <div className="absolute right-4 top-4 w-80 max-h-[calc(100vh-8rem)] overflow-y-auto bg-slate-900/95 backdrop-blur-sm rounded-lg border border-slate-700 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <h2 className="text-lg font-semibold text-white">Security Overview</h2>
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
      <div className="p-4 space-y-4">
        {/* Health Score */}
        <div className="text-center p-4 rounded-lg bg-slate-800/50">
          <div className="text-4xl font-bold" style={{ color: getHealthColor(metrics.healthScore) }}>
            {metrics.healthScore}
          </div>
          <p className="text-slate-400 text-sm">Security Health Score</p>
        </div>
        
        {/* Critical Alert */}
        {metrics.publicToSensitive.length > 0 && (
          <div className="p-3 rounded bg-red-500/20 border border-red-500/50">
            <div className="flex items-center gap-2 text-red-400 font-medium">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {metrics.publicToSensitive.length} Public → Sensitive Paths
            </div>
            <p className="text-red-300 text-sm mt-1">
              Public endpoints can reach sensitive data without authentication
            </p>
            <button
              onClick={() => {
                setViewMode('security');
                setFilters({ publicOnly: true });
              }}
              className="mt-2 text-sm text-red-400 hover:text-red-300 underline"
            >
              View in Security Mode →
            </button>
          </div>
        )}
        
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <SecurityStat
            label="Public Endpoints"
            value={metrics.publicEndpoints.length}
            color={metrics.publicEndpoints.length > 0 ? '#ef4444' : '#22c55e'}
            onClick={() => { setFilters({ publicOnly: true }); }}
          />
          <SecurityStat
            label="P0 Endpoints"
            value={metrics.p0Endpoints.length}
            color={SECURITY_TIER_COLORS.P0}
          />
          <SecurityStat
            label="Sensitive Tables"
            value={metrics.criticalTables.length}
            color={SENSITIVITY_COLORS.high}
            onClick={() => { setFilters({ minSensitivity: 'high' }); }}
          />
          <SecurityStat
            label="Untested Paths"
            value={metrics.untestedPaths.length}
            color={metrics.untestedPaths.length > 0 ? '#f59e0b' : '#22c55e'}
            onClick={() => { setFilters({ untestedOnly: true }); }}
          />
        </div>
        
        {/* Sensitivity Breakdown */}
        <div>
          <h4 className="text-sm font-medium text-slate-300 mb-2">Sensitivity Distribution</h4>
          <div className="space-y-2">
            {(['critical', 'high', 'medium', 'low', 'public'] as const).map(level => {
              const count = galaxyData?.stats.sensitiveFields[level] || 0;
              const total = galaxyData?.stats.fieldCount || 1;
              const percentage = Math.round((count / total) * 100);
              
              return (
                <div key={level} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: SENSITIVITY_COLORS[level] }}
                  />
                  <span className="text-slate-300 text-sm capitalize flex-1">{level}</span>
                  <span className="text-slate-400 text-sm">{count}</span>
                  <div className="w-20 h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${percentage}%`,
                        backgroundColor: SENSITIVITY_COLORS[level],
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Quick Actions */}
        <div>
          <h4 className="text-sm font-medium text-slate-300 mb-2">Quick Actions</h4>
          <div className="space-y-2">
            <button
              onClick={() => { setViewMode('security'); }}
              className="w-full p-2 rounded bg-slate-800 hover:bg-slate-700 text-left text-sm text-slate-300 transition-colors"
            >
              🔒 Enable Security Mode
            </button>
            <button
              onClick={() => { setViewMode('coverage'); }}
              className="w-full p-2 rounded bg-slate-800 hover:bg-slate-700 text-left text-sm text-slate-300 transition-colors"
            >
              📊 View Test Coverage
            </button>
            <button
              onClick={() => { setFilters({ untestedOnly: true }); }}
              className="w-full p-2 rounded bg-slate-800 hover:bg-slate-700 text-left text-sm text-slate-300 transition-colors"
            >
              ⚠️ Show Untested Paths
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

interface SecurityStatProps {
  label: string;
  value: number;
  color: string;
  onClick?: () => void;
}

function SecurityStat({ label, value, color, onClick }: SecurityStatProps) {
  return (
    <button
      onClick={onClick}
      className="p-3 rounded bg-slate-800/50 hover:bg-slate-800 transition-colors text-left"
    >
      <p className="text-slate-400 text-xs">{label}</p>
      <p className="text-2xl font-bold" style={{ color }}>
        {value}
      </p>
    </button>
  );
}

function getHealthColor(score: number): string {
  if (score >= 80) {return '#22c55e';}
  if (score >= 60) {return '#eab308';}
  if (score >= 40) {return '#f97316';}
  return '#ef4444';
}
