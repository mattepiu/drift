/**
 * GalaxyTab Component
 *
 * 3D database galaxy visualization tab.
 * Renders tables as planets, fields as moons, and data paths as hyperspace lanes.
 * 
 * Data Flow:
 * 1. Fetches real data from /api/galaxy (transformed from boundary scanner + call graph)
 * 2. Falls back to mock data for development/demo purposes
 * 3. Uses layout engine to compute 3D positions
 * 4. Renders via Three.js/React Three Fiber
 */

import {
  GalaxyCanvas,
  useGalaxyStore,
  DetailsPanel,
  SecurityPanel,
  ControlsPanel,
  SearchOverlay,
  StatsOverlay,
  computeGalaxyLayout,
} from 'driftdetect-galaxy';
import React, { useEffect, useState, useCallback } from 'react';

import type { RawGalaxyData } from 'driftdetect-galaxy';

// ============================================================================
// Mock Data Generator (fallback for development/demo)
// ============================================================================

function generateMockData(): RawGalaxyData {
  const tables = [
    { id: 'users', name: 'users', sensitivity: 'high', cluster: 'auth', fields: [
      { id: 'users.id', name: 'id', dataType: 'uuid', isPrimaryKey: true, sensitivity: 'low' },
      { id: 'users.email', name: 'email', dataType: 'varchar', sensitivity: 'high' },
      { id: 'users.password_hash', name: 'password_hash', dataType: 'varchar', sensitivity: 'critical' },
      { id: 'users.name', name: 'name', dataType: 'varchar', sensitivity: 'medium' },
      { id: 'users.created_at', name: 'created_at', dataType: 'timestamp', sensitivity: 'low' },
    ]},
    { id: 'sessions', name: 'sessions', sensitivity: 'high', cluster: 'auth', fields: [
      { id: 'sessions.id', name: 'id', dataType: 'uuid', isPrimaryKey: true, sensitivity: 'low' },
      { id: 'sessions.user_id', name: 'user_id', dataType: 'uuid', isForeignKey: true, foreignKeyTarget: 'users.id', sensitivity: 'medium' },
      { id: 'sessions.token', name: 'token', dataType: 'varchar', sensitivity: 'critical' },
      { id: 'sessions.expires_at', name: 'expires_at', dataType: 'timestamp', sensitivity: 'low' },
    ]},
    { id: 'orders', name: 'orders', sensitivity: 'high', cluster: 'commerce', fields: [
      { id: 'orders.id', name: 'id', dataType: 'uuid', isPrimaryKey: true, sensitivity: 'low' },
      { id: 'orders.user_id', name: 'user_id', dataType: 'uuid', isForeignKey: true, foreignKeyTarget: 'users.id', sensitivity: 'medium' },
      { id: 'orders.total', name: 'total', dataType: 'decimal', sensitivity: 'high' },
      { id: 'orders.status', name: 'status', dataType: 'varchar', sensitivity: 'low' },
    ]},
    { id: 'products', name: 'products', sensitivity: 'low', cluster: 'commerce', fields: [
      { id: 'products.id', name: 'id', dataType: 'uuid', isPrimaryKey: true, sensitivity: 'low' },
      { id: 'products.name', name: 'name', dataType: 'varchar', sensitivity: 'public' },
      { id: 'products.price', name: 'price', dataType: 'decimal', sensitivity: 'public' },
      { id: 'products.inventory', name: 'inventory', dataType: 'integer', sensitivity: 'low' },
    ]},
    { id: 'payments', name: 'payments', sensitivity: 'critical', cluster: 'commerce', fields: [
      { id: 'payments.id', name: 'id', dataType: 'uuid', isPrimaryKey: true, sensitivity: 'low' },
      { id: 'payments.order_id', name: 'order_id', dataType: 'uuid', isForeignKey: true, foreignKeyTarget: 'orders.id', sensitivity: 'medium' },
      { id: 'payments.card_last4', name: 'card_last4', dataType: 'varchar', sensitivity: 'high' },
      { id: 'payments.amount', name: 'amount', dataType: 'decimal', sensitivity: 'high' },
    ]},
    { id: 'audit_logs', name: 'audit_logs', sensitivity: 'medium', cluster: 'analytics', fields: [
      { id: 'audit_logs.id', name: 'id', dataType: 'uuid', isPrimaryKey: true, sensitivity: 'low' },
      { id: 'audit_logs.user_id', name: 'user_id', dataType: 'uuid', sensitivity: 'medium' },
      { id: 'audit_logs.action', name: 'action', dataType: 'varchar', sensitivity: 'low' },
      { id: 'audit_logs.timestamp', name: 'timestamp', dataType: 'timestamp', sensitivity: 'low' },
    ]},
  ];

  const entryPoints = [
    { id: 'ep-login', path: '/api/auth/login', method: 'POST', authLevel: 'public', securityTier: 'P0', file: 'src/routes/auth.ts', line: 15, framework: 'Express', reachableTables: ['users', 'sessions'] },
    { id: 'ep-register', path: '/api/auth/register', method: 'POST', authLevel: 'public', securityTier: 'P1', file: 'src/routes/auth.ts', line: 45, framework: 'Express', reachableTables: ['users'] },
    { id: 'ep-profile', path: '/api/users/profile', method: 'GET', authLevel: 'authenticated', securityTier: 'P2', file: 'src/routes/users.ts', line: 10, framework: 'Express', reachableTables: ['users'] },
    { id: 'ep-orders', path: '/api/orders', method: 'GET', authLevel: 'authenticated', securityTier: 'P2', file: 'src/routes/orders.ts', line: 20, framework: 'Express', reachableTables: ['orders', 'products'] },
    { id: 'ep-checkout', path: '/api/checkout', method: 'POST', authLevel: 'authenticated', securityTier: 'P0', file: 'src/routes/checkout.ts', line: 30, framework: 'Express', reachableTables: ['orders', 'payments', 'products'] },
    { id: 'ep-products', path: '/api/products', method: 'GET', authLevel: 'public', securityTier: 'P4', file: 'src/routes/products.ts', line: 5, framework: 'Express', reachableTables: ['products'] },
    { id: 'ep-admin-users', path: '/api/admin/users', method: 'GET', authLevel: 'admin', securityTier: 'P1', file: 'src/routes/admin.ts', line: 10, framework: 'Express', reachableTables: ['users', 'orders', 'audit_logs'] },
  ];

  const dataPaths = [
    { id: 'path-1', sourceId: 'ep-login', sourceType: 'entryPoint', targetTableId: 'users', operation: 'read', frequency: 1000, depth: 1, isTested: true, sensitivity: 'high' },
    { id: 'path-2', sourceId: 'ep-login', sourceType: 'entryPoint', targetTableId: 'sessions', operation: 'write', frequency: 1000, depth: 2, isTested: true, sensitivity: 'critical' },
    { id: 'path-3', sourceId: 'ep-register', sourceType: 'entryPoint', targetTableId: 'users', operation: 'write', frequency: 100, depth: 1, isTested: false, sensitivity: 'high' },
    { id: 'path-4', sourceId: 'ep-profile', sourceType: 'entryPoint', targetTableId: 'users', operation: 'read', frequency: 500, depth: 1, isTested: true, sensitivity: 'high' },
    { id: 'path-5', sourceId: 'ep-orders', sourceType: 'entryPoint', targetTableId: 'orders', operation: 'read', frequency: 300, depth: 1, isTested: true, sensitivity: 'high' },
    { id: 'path-6', sourceId: 'ep-checkout', sourceType: 'entryPoint', targetTableId: 'orders', operation: 'write', frequency: 50, depth: 1, isTested: false, sensitivity: 'high' },
    { id: 'path-7', sourceId: 'ep-checkout', sourceType: 'entryPoint', targetTableId: 'payments', operation: 'write', frequency: 50, depth: 2, isTested: false, sensitivity: 'critical' },
    { id: 'path-8', sourceId: 'ep-products', sourceType: 'entryPoint', targetTableId: 'products', operation: 'read', frequency: 2000, depth: 1, isTested: true, sensitivity: 'public' },
    { id: 'path-9', sourceId: 'ep-admin-users', sourceType: 'entryPoint', targetTableId: 'users', operation: 'read', frequency: 10, depth: 1, isTested: true, sensitivity: 'high' },
    { id: 'path-10', sourceId: 'ep-admin-users', sourceType: 'entryPoint', targetTableId: 'audit_logs', operation: 'read', frequency: 10, depth: 2, isTested: false, sensitivity: 'medium' },
  ];

  const relationships = [
    { id: 'rel-1', sourceTableId: 'sessions', sourceFieldId: 'sessions.user_id', targetTableId: 'users', targetFieldId: 'users.id', type: 'one-to-many' },
    { id: 'rel-2', sourceTableId: 'orders', sourceFieldId: 'orders.user_id', targetTableId: 'users', targetFieldId: 'users.id', type: 'one-to-many' },
    { id: 'rel-3', sourceTableId: 'payments', sourceFieldId: 'payments.order_id', targetTableId: 'orders', targetFieldId: 'orders.id', type: 'one-to-one' },
  ];

  return {
    tables: tables.map(t => ({ ...t, rowCount: Math.floor(Math.random() * 100000), accessCount: Math.floor(Math.random() * 1000) })),
    entryPoints,
    dataPaths,
    relationships,
  };
}

// ============================================================================
// Data Fetcher Hook
// ============================================================================

interface UseGalaxyDataResult {
  isLoading: boolean;
  error: string | null;
  data: ReturnType<typeof useGalaxyStore>['galaxyData'];
  refetch: () => Promise<void>;
  useMock: boolean;
  setUseMock: (value: boolean) => void;
  dataSource: 'api' | 'mock';
}

function useGalaxyDataFetcher(): UseGalaxyDataResult {
  const { setGalaxyData, setLoading, setError, isLoading, error, galaxyData } = useGalaxyStore();
  const [useMock, setUseMock] = useState(false);
  const [dataSource, setDataSource] = useState<'api' | 'mock'>('api');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      let rawData: RawGalaxyData;
      let source: 'api' | 'mock' = 'api';

      if (useMock) {
        // Use mock data explicitly
        rawData = generateMockData();
        source = 'mock';
      } else {
        // Try to fetch from API
        try {
          const response = await fetch('/api/galaxy');
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          rawData = await response.json();
          
          // Check if we got meaningful data
          if (!rawData.tables || rawData.tables.length === 0) {
            console.log('No tables found in API response, falling back to mock data');
            rawData = generateMockData();
            source = 'mock';
          }
        } catch (apiError) {
          console.log('API fetch failed, falling back to mock data:', apiError);
          rawData = generateMockData();
          source = 'mock';
        }
      }

      setDataSource(source);

      // Compute layout positions
      const { tables, entryPoints } = computeGalaxyLayout(
        rawData.tables as any,
        rawData.entryPoints as any,
        rawData.dataPaths
      );
      
      // Calculate stats if not provided
      const stats = rawData.stats ?? {
        tableCount: tables.length,
        fieldCount: tables.reduce((acc, t) => acc + t.fields.length, 0),
        entryPointCount: entryPoints.length,
        pathCount: rawData.dataPaths.length,
        sensitiveFields: {
          critical: tables.reduce((acc, t) => acc + t.fields.filter(f => f.sensitivity === 'critical').length, 0),
          high: tables.reduce((acc, t) => acc + t.fields.filter(f => f.sensitivity === 'high').length, 0),
          medium: tables.reduce((acc, t) => acc + t.fields.filter(f => f.sensitivity === 'medium').length, 0),
          low: tables.reduce((acc, t) => acc + t.fields.filter(f => f.sensitivity === 'low').length, 0),
          public: tables.reduce((acc, t) => acc + t.fields.filter(f => f.sensitivity === 'public').length, 0),
        },
        untestedPaths: rawData.dataPaths.filter(p => !p.isTested).length,
        deadCodeCount: 0,
        healthScore: rawData.stats?.healthScore ?? 72,
      };
      
      setGalaxyData({
        tables,
        entryPoints,
        dataPaths: rawData.dataPaths as any,
        relationships: (rawData.relationships ?? []) as any,
        stats,
        lastUpdated: rawData.lastUpdated ?? new Date().toISOString(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load galaxy data');
    }
  }, [useMock, setGalaxyData, setLoading, setError]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { 
    isLoading, 
    error, 
    data: galaxyData, 
    refetch: fetchData, 
    useMock, 
    setUseMock,
    dataSource,
  };
}

// ============================================================================
// Toolbar Component
// ============================================================================

function GalaxyToolbar() {
  const { viewMode, setViewMode, togglePanel, activePanel } = useGalaxyStore();
  
  return (
    <div className="absolute right-4 top-4 flex items-center gap-2 z-10">
      {/* View mode buttons */}
      <div className="flex bg-slate-800/80 rounded-lg overflow-hidden">
        {[
          { mode: 'overview' as const, icon: '🌌', label: 'Overview' },
          { mode: 'security' as const, icon: '🔒', label: 'Security' },
          { mode: 'coverage' as const, icon: '📊', label: 'Coverage' },
        ].map(({ mode, icon, label }) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`px-3 py-2 text-sm transition-colors ${
              viewMode === mode
                ? 'bg-blue-500/30 text-blue-400'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
            title={label}
          >
            {icon}
          </button>
        ))}
      </div>
      
      {/* Panel toggles */}
      <div className="flex bg-slate-800/80 rounded-lg overflow-hidden">
        <button
          onClick={() => togglePanel('security')}
          className={`px-3 py-2 text-sm transition-colors ${
            activePanel === 'security' ? 'bg-red-500/30 text-red-400' : 'text-slate-400 hover:text-white'
          }`}
          title="Security Panel"
        >
          🛡️
        </button>
        <button
          onClick={() => togglePanel('settings')}
          className={`px-3 py-2 text-sm transition-colors ${
            activePanel === 'settings' ? 'bg-purple-500/30 text-purple-400' : 'text-slate-400 hover:text-white'
          }`}
          title="Settings"
        >
          ⚙️
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Data Source Indicator
// ============================================================================

interface DataSourceIndicatorProps {
  dataSource: 'api' | 'mock';
  useMock: boolean;
  setUseMock: (value: boolean) => void;
  tableCount: number;
  entryPointCount: number;
}

function DataSourceIndicator({ 
  dataSource, 
  useMock, 
  setUseMock,
  tableCount,
  entryPointCount,
}: DataSourceIndicatorProps) {
  return (
    <div className="absolute left-4 top-4 z-10 flex flex-col gap-2">
      {/* Data source toggle */}
      <label className="flex items-center gap-2 text-sm text-slate-400 bg-slate-800/80 px-3 py-2 rounded-lg cursor-pointer">
        <input
          type="checkbox"
          checked={useMock}
          onChange={(e) => setUseMock(e.target.checked)}
          className="rounded"
        />
        Use Mock Data
      </label>
      
      {/* Data source indicator */}
      <div className={`text-xs px-3 py-1.5 rounded-lg ${
        dataSource === 'api' 
          ? 'bg-green-500/20 text-green-400' 
          : 'bg-yellow-500/20 text-yellow-400'
      }`}>
        {dataSource === 'api' ? '🔗 Live Data' : '🎭 Mock Data'}
        <span className="ml-2 opacity-70">
          {tableCount} tables • {entryPointCount} endpoints
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function GalaxyTab(): React.ReactElement {
  const { 
    isLoading, 
    error, 
    data, 
    refetch, 
    useMock, 
    setUseMock,
    dataSource,
  } = useGalaxyDataFetcher();
  
  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] text-center">
        <div className="text-6xl mb-4">🌑</div>
        <h2 className="text-xl font-semibold text-white mb-2">Galaxy Unavailable</h2>
        <p className="text-slate-400 mb-4">{error}</p>
        <div className="flex gap-3">
          <button
            onClick={refetch}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            Retry
          </button>
          <button
            onClick={() => setUseMock(true)}
            className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors"
          >
            Use Mock Data
          </button>
        </div>
      </div>
    );
  }
  
  if (isLoading && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)]">
        <div className="text-6xl mb-4 animate-pulse">🌌</div>
        <p className="text-slate-400">Loading galaxy...</p>
        <p className="text-slate-500 text-sm mt-2">Scanning boundaries and call graph...</p>
      </div>
    );
  }
  
  return (
    <div className="relative h-[calc(100vh-200px)] bg-slate-950 rounded-lg overflow-hidden">
      {/* Data source indicator */}
      <DataSourceIndicator
        dataSource={dataSource}
        useMock={useMock}
        setUseMock={setUseMock}
        tableCount={data?.tables.length ?? 0}
        entryPointCount={data?.entryPoints.length ?? 0}
      />
      
      {/* Toolbar */}
      <GalaxyToolbar />
      
      {/* 3D Canvas */}
      <GalaxyCanvas className="w-full h-full" />
      
      {/* UI Overlays */}
      <SearchOverlay />
      <StatsOverlay />
      <DetailsPanel />
      <SecurityPanel />
      <ControlsPanel />
    </div>
  );
}
