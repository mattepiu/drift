/**
 * Galaxy Store
 * 
 * Zustand store for galaxy visualization state management.
 * Handles selection, camera, filters, and display settings.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import { CAMERA_CONFIG } from '../constants/index.js';

import type {
  GalaxyData,
  SelectionState,
  CameraState,
  FilterState,
  DisplaySettings,
  ViewMode,
  Vector3D,
  SensitivityLevel,
  DataOperation,
  GalaxyEvent,
} from '../types/index.js';

// ============================================================================
// Store State Interface
// ============================================================================

export interface GalaxyStoreState {
  // Data
  galaxyData: GalaxyData | null;
  isLoading: boolean;
  error: string | null;

  // Selection
  selection: SelectionState;

  // Camera
  camera: CameraState;

  // View
  viewMode: ViewMode;
  filters: FilterState;
  display: DisplaySettings;

  // Events
  recentEvents: GalaxyEvent[];
  isLiveMode: boolean;

  // UI
  isPanelOpen: boolean;
  activePanel: 'details' | 'security' | 'coverage' | 'settings' | null;
  searchQuery: string;
  searchResults: string[];
}

// ============================================================================
// Store Actions Interface
// ============================================================================

export interface GalaxyStoreActions {
  // Data actions
  setGalaxyData: (data: GalaxyData) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Selection actions
  selectTable: (id: string | null) => void;
  selectField: (id: string | null) => void;
  selectEntryPoint: (id: string | null) => void;
  selectPath: (id: string | null) => void;
  setHovered: (id: string | null, type: SelectionState['hoveredType']) => void;
  clearSelection: () => void;

  // Camera actions
  setCameraPosition: (position: Vector3D) => void;
  setCameraTarget: (target: Vector3D) => void;
  setZoom: (zoom: number) => void;
  resetCamera: () => void;
  focusOnNode: (id: string) => void;

  // View actions
  setViewMode: (mode: ViewMode) => void;
  setFilters: (filters: Partial<FilterState>) => void;
  setDisplay: (settings: Partial<DisplaySettings>) => void;
  resetFilters: () => void;

  // Event actions
  addEvent: (event: GalaxyEvent) => void;
  clearEvents: () => void;
  setLiveMode: (enabled: boolean) => void;

  // UI actions
  togglePanel: (panel: GalaxyStoreState['activePanel']) => void;
  closePanel: () => void;
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: string[]) => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialSelection: SelectionState = {
  selectedTable: null,
  selectedField: null,
  selectedEntryPoint: null,
  selectedPath: null,
  hoveredNode: null,
  hoveredType: null,
};

const initialCamera: CameraState = {
  position: CAMERA_CONFIG.DEFAULT_POSITION,
  target: CAMERA_CONFIG.DEFAULT_TARGET,
  zoom: 1,
};

const initialFilters: FilterState = {
  minSensitivity: null,
  operationType: null,
  untestedOnly: false,
  publicOnly: false,
  searchQuery: '',
  clusters: [],
};

const initialDisplay: DisplaySettings = {
  showFields: true,
  showPaths: true,
  showRelationships: true,
  showLabels: true,
  enableBloom: true,
  animationSpeed: 1,
  pathOpacity: 0.6,
};

// ============================================================================
// Store Implementation
// ============================================================================

export type GalaxyStore = GalaxyStoreState & GalaxyStoreActions;

export const useGalaxyStore = create<GalaxyStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    galaxyData: null,
    isLoading: false,
    error: null,
    selection: initialSelection,
    camera: initialCamera,
    viewMode: 'overview',
    filters: initialFilters,
    display: initialDisplay,
    recentEvents: [],
    isLiveMode: false,
    isPanelOpen: false,
    activePanel: null,
    searchQuery: '',
    searchResults: [],

    // Data actions
    setGalaxyData: (data) => { set({ galaxyData: data, isLoading: false, error: null }); },
    setLoading: (loading) => { set({ isLoading: loading }); },
    setError: (error) => { set({ error, isLoading: false }); },

    // Selection actions
    selectTable: (id) => { set((state) => ({
      selection: {
        ...state.selection,
        selectedTable: id,
        selectedField: null, // Clear field when table changes
      },
      isPanelOpen: id !== null,
      activePanel: id !== null ? 'details' : state.activePanel,
    })); },

    selectField: (id) => { set((state) => ({
      selection: { ...state.selection, selectedField: id },
    })); },

    selectEntryPoint: (id) => { set((state) => ({
      selection: {
        ...state.selection,
        selectedEntryPoint: id,
        selectedTable: null,
        selectedField: null,
      },
      isPanelOpen: id !== null,
      activePanel: id !== null ? 'details' : state.activePanel,
    })); },

    selectPath: (id) => { set((state) => ({
      selection: { ...state.selection, selectedPath: id },
    })); },

    setHovered: (id, type) => { set((state) => ({
      selection: { ...state.selection, hoveredNode: id, hoveredType: type },
    })); },

    clearSelection: () => { set({
      selection: initialSelection,
      isPanelOpen: false,
      activePanel: null,
    }); },

    // Camera actions
    setCameraPosition: (position) => { set((state) => ({
      camera: { ...state.camera, position },
    })); },

    setCameraTarget: (target) => { set((state) => ({
      camera: { ...state.camera, target },
    })); },

    setZoom: (zoom) => { set((state) => ({
      camera: {
        ...state.camera,
        zoom: Math.max(CAMERA_CONFIG.MIN_ZOOM, Math.min(CAMERA_CONFIG.MAX_ZOOM, zoom)),
      },
    })); },

    resetCamera: () => { set({ camera: initialCamera }); },

    focusOnNode: (id) => {
      const { galaxyData } = get();
      if (!galaxyData) {return;}

      // Find the node position
      const table = galaxyData.tables.find((t) => t.id === id);
      const entryPoint = galaxyData.entryPoints.find((e) => e.id === id);
      
      const position = table?.position || entryPoint?.position;
      if (position) {
        set((state) => ({
          camera: {
            ...state.camera,
            target: position,
            position: {
              x: position.x,
              y: position.y + 20,
              z: position.z + 30,
            },
          },
        }));
      }
    },

    // View actions
    setViewMode: (mode) => { set({ viewMode: mode }); },

    setFilters: (filters) => { set((state) => ({
      filters: { ...state.filters, ...filters },
    })); },

    setDisplay: (settings) => { set((state) => ({
      display: { ...state.display, ...settings },
    })); },

    resetFilters: () => { set({ filters: initialFilters }); },

    // Event actions
    addEvent: (event) => { set((state) => ({
      recentEvents: [event, ...state.recentEvents].slice(0, 100), // Keep last 100
    })); },

    clearEvents: () => { set({ recentEvents: [] }); },

    setLiveMode: (enabled) => { set({ isLiveMode: enabled }); },

    // UI actions
    togglePanel: (panel) => { set((state) => ({
      isPanelOpen: state.activePanel === panel ? !state.isPanelOpen : true,
      activePanel: panel,
    })); },

    closePanel: () => { set({ isPanelOpen: false, activePanel: null }); },

    setSearchQuery: (query) => { set({ searchQuery: query }); },

    setSearchResults: (results) => { set({ searchResults: results }); },
  }))
);

// ============================================================================
// Selectors
// ============================================================================

/**
 * Get selected table data
 */
export const useSelectedTable = () => {
  return useGalaxyStore((state) => {
    if (!state.selection.selectedTable || !state.galaxyData) {return null;}
    return state.galaxyData.tables.find((t) => t.id === state.selection.selectedTable) || null;
  });
};

/**
 * Get selected entry point data
 */
export const useSelectedEntryPoint = () => {
  return useGalaxyStore((state) => {
    if (!state.selection.selectedEntryPoint || !state.galaxyData) {return null;}
    return state.galaxyData.entryPoints.find((e) => e.id === state.selection.selectedEntryPoint) || null;
  });
};

/**
 * Get paths for selected table
 */
export const useSelectedTablePaths = () => {
  return useGalaxyStore((state) => {
    if (!state.selection.selectedTable || !state.galaxyData) {return [];}
    return state.galaxyData.dataPaths.filter(
      (p) => p.targetTableId === state.selection.selectedTable
    );
  });
};

/**
 * Get filtered tables based on current filters
 */
export const useFilteredTables = () => {
  return useGalaxyStore((state) => {
    if (!state.galaxyData) {return [];}
    
    let tables = state.galaxyData.tables;
    const { filters } = state;

    // Filter by sensitivity
    if (filters.minSensitivity) {
      const levels: SensitivityLevel[] = ['public', 'low', 'medium', 'high', 'critical'];
      const minIndex = levels.indexOf(filters.minSensitivity);
      tables = tables.filter((t) => levels.indexOf(t.sensitivity) >= minIndex);
    }

    // Filter by cluster
    if (filters.clusters.length > 0) {
      tables = tables.filter((t) => t.cluster && filters.clusters.includes(t.cluster));
    }

    // Filter by search
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      tables = tables.filter((t) => 
        t.name.toLowerCase().includes(query) ||
        t.fields.some((f) => f.name.toLowerCase().includes(query))
      );
    }

    return tables;
  });
};

/**
 * Get filtered paths based on current filters
 */
export const useFilteredPaths = () => {
  return useGalaxyStore((state) => {
    if (!state.galaxyData) {return [];}
    
    let paths = state.galaxyData.dataPaths;
    const { filters } = state;

    // Filter by operation
    if (filters.operationType) {
      paths = paths.filter((p) => p.operation === filters.operationType);
    }

    // Filter by untested
    if (filters.untestedOnly) {
      paths = paths.filter((p) => !p.isTested);
    }

    return paths;
  });
};

/**
 * Get filtered entry points
 */
export const useFilteredEntryPoints = () => {
  return useGalaxyStore((state) => {
    if (!state.galaxyData) {return [];}
    
    let entryPoints = state.galaxyData.entryPoints;
    const { filters } = state;

    // Filter by public only
    if (filters.publicOnly) {
      entryPoints = entryPoints.filter((e) => e.authLevel === 'public');
    }

    return entryPoints;
  });
};
