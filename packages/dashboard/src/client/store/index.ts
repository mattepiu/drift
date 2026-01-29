/**
 * Drift Dashboard Store
 *
 * Zustand store for global state management.
 * Manages connection status, active tab, filters, and UI state.
 */

import { create } from 'zustand';

import type {
  ConnectionStatus,
  TabId,
  PatternFilters,
  ViolationFilters,
  Violation,
} from '../types';

export interface DashboardStore {
  // Connection state
  connectionStatus: ConnectionStatus;
  setConnectionStatus: (status: ConnectionStatus) => void;

  // Active tab
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;

  // Realtime violations
  realtimeViolations: Violation[];
  addRealtimeViolation: (violation: Violation) => void;
  clearRealtimeViolations: () => void;

  // UI state
  expandedViolations: Set<string>;
  toggleViolationExpanded: (id: string) => void;

  selectedPattern: string | null;
  setSelectedPattern: (id: string | null) => void;

  expandedFolders: Set<string>;
  toggleFolderExpanded: (path: string) => void;

  // Filters
  patternFilters: PatternFilters;
  setPatternFilters: (filters: PatternFilters) => void;

  violationFilters: ViolationFilters;
  setViolationFilters: (filters: ViolationFilters) => void;
}

/**
 * Create the dashboard store
 */
export const useDashboardStore = create<DashboardStore>((set) => ({
  // Connection state
  connectionStatus: 'disconnected',
  setConnectionStatus: (status) => set({ connectionStatus: status }),

  // Active tab
  activeTab: 'overview',
  setActiveTab: (tab) => set({ activeTab: tab }),

  // Realtime violations
  realtimeViolations: [],
  addRealtimeViolation: (violation) =>
    set((state) => ({
      realtimeViolations: [violation, ...state.realtimeViolations].slice(0, 100),
    })),
  clearRealtimeViolations: () => set({ realtimeViolations: [] }),

  // UI state
  expandedViolations: new Set(),
  toggleViolationExpanded: (id) =>
    set((state) => {
      const newSet = new Set(state.expandedViolations);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return { expandedViolations: newSet };
    }),

  selectedPattern: null,
  setSelectedPattern: (id) => set({ selectedPattern: id }),

  expandedFolders: new Set(),
  toggleFolderExpanded: (path) =>
    set((state) => {
      const newSet = new Set(state.expandedFolders);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return { expandedFolders: newSet };
    }),

  // Filters
  patternFilters: {},
  setPatternFilters: (filters) => set({ patternFilters: filters }),

  violationFilters: {},
  setViolationFilters: (filters) => set({ violationFilters: filters }),
}));
