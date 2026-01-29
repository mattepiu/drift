/**
 * StatsOverlay Component
 * 
 * Displays galaxy statistics in the corner of the visualization.
 */

import { useGalaxyStore } from '../../store/index.js';
import { getHealthScoreColor } from '../../utils/color-utils.js';

// ============================================================================
// Component
// ============================================================================

export function StatsOverlay() {
  const { galaxyData, viewMode, isLiveMode } = useGalaxyStore();
  
  if (!galaxyData) {return null;}
  
  const { stats } = galaxyData;
  
  return (
    <div className="absolute left-4 bottom-4 flex items-end gap-4">
      {/* Main stats */}
      <div className="bg-slate-900/80 backdrop-blur-sm rounded-lg p-3 border border-slate-700">
        <div className="flex items-center gap-4 text-sm">
          <Stat icon="🪐" value={stats.tableCount} label="Tables" />
          <Stat icon="🛸" value={stats.entryPointCount} label="Endpoints" />
          <Stat icon="🔗" value={stats.pathCount} label="Paths" />
          <div className="w-px h-8 bg-slate-700" />
          <div className="text-center">
            <div className="text-lg font-bold" style={{ color: getHealthScoreColor(stats.healthScore) }}>
              {stats.healthScore}
            </div>
            <div className="text-slate-500 text-xs">Health</div>
          </div>
        </div>
      </div>
      
      {/* View mode indicator */}
      <div className="bg-slate-900/80 backdrop-blur-sm rounded-lg px-3 py-2 border border-slate-700">
        <span className="text-slate-400 text-sm">
          {VIEW_MODE_LABELS[viewMode]}
        </span>
      </div>
      
      {/* Live mode indicator */}
      {isLiveMode && (
        <div className="bg-green-500/20 backdrop-blur-sm rounded-lg px-3 py-2 border border-green-500/50 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-green-400 text-sm">Live</span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

interface StatProps {
  icon: string;
  value: number;
  label: string;
}

function Stat({ icon, value, label }: StatProps) {
  return (
    <div className="text-center">
      <div className="flex items-center gap-1">
        <span>{icon}</span>
        <span className="text-white font-medium">{value}</span>
      </div>
      <div className="text-slate-500 text-xs">{label}</div>
    </div>
  );
}

const VIEW_MODE_LABELS: Record<string, string> = {
  overview: '🌌 Overview',
  security: '🔒 Security',
  coverage: '📊 Coverage',
  'blast-radius': '💥 Impact',
  timeline: '📅 Timeline',
};
