/**
 * App Component
 *
 * Main application shell with header, tab navigation, and content area.
 */

import React, { Suspense, lazy } from 'react';

import { OverviewTab, PatternsTab, ViolationsTab, FilesTab, SettingsTab, ContractsTab, QualityGatesTab } from './components';
import { useWebSocket } from './hooks';
import { useDashboardStore } from './store';

import type { TabId, ConnectionStatus } from './types';

// Lazy load Galaxy tab since it includes heavy Three.js dependencies
const GalaxyTab = lazy(() => import('./components/GalaxyTab').then(m => ({ default: m.GalaxyTab })));

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'patterns', label: 'Patterns' },
  { id: 'contracts', label: 'Contracts' },
  { id: 'violations', label: 'Violations' },
  { id: 'files', label: 'Files' },
  { id: 'quality-gates', label: '🚦 Quality Gates' },
  { id: 'galaxy', label: '🌌 Galaxy' },
  { id: 'settings', label: 'Settings' },
];

function ConnectionIndicator({ status }: { status: ConnectionStatus }) {
  const config = {
    connected: { color: 'bg-status-approved', label: 'Connected' },
    connecting: { color: 'bg-severity-warning', label: 'Connecting...' },
    disconnected: { color: 'bg-dark-muted', label: 'Disconnected' },
  }[status];

  return (
    <div className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${config.color}`} />
      <span className="text-sm text-dark-muted">{config.label}</span>
    </div>
  );
}

function GalaxyLoadingFallback() {
  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] bg-slate-950 rounded-lg">
      <div className="text-6xl mb-4 animate-pulse">🌌</div>
      <p className="text-slate-400">Loading Galaxy...</p>
    </div>
  );
}

function TabContent({ tab }: { tab: TabId }) {
  switch (tab) {
    case 'overview':
      return <OverviewTab />;
    case 'patterns':
      return <PatternsTab />;
    case 'contracts':
      return <ContractsTab />;
    case 'violations':
      return <ViolationsTab />;
    case 'files':
      return <FilesTab />;
    case 'quality-gates':
      return <QualityGatesTab />;
    case 'galaxy':
      return (
        <Suspense fallback={<GalaxyLoadingFallback />}>
          <GalaxyTab />
        </Suspense>
      );
    case 'settings':
      return <SettingsTab />;
    default:
      return null;
  }
}

/**
 * Main application component
 */
export function App(): React.ReactElement {
  const { connectionStatus, activeTab, setActiveTab } = useDashboardStore();
  
  // Initialize WebSocket connection
  useWebSocket();

  return (
    <div className="min-h-screen bg-dark-bg text-dark-text">
      {/* Header */}
      <header className="border-b border-dark-border bg-dark-surface px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">Drift Dashboard</h1>
          </div>
          <ConnectionIndicator status={connectionStatus} />
        </div>
      </header>

      {/* Tab Bar */}
      <nav className="border-b border-dark-border bg-dark-surface">
        <div className="flex gap-1 px-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'text-dark-text border-blue-500'
                  : 'text-dark-muted hover:text-dark-text border-transparent hover:border-dark-border'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className="p-6">
        <TabContent tab={activeTab} />
      </main>
    </div>
  );
}
