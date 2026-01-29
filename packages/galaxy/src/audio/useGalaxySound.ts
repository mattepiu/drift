/**
 * useGalaxySound Hook
 *
 * React hook for playing Galaxy sound effects.
 * Provides easy integration with components and respects user preferences.
 */

import { useCallback, useEffect, useRef } from 'react';

import { getGalaxySoundEngine, type SoundType, type SoundConfig } from './sound-effects.js';

// ============================================================================
// Types
// ============================================================================

export interface UseGalaxySoundOptions {
  /** Enable sounds (default: true) */
  enabled?: boolean;
  /** Master volume 0-1 (default: 0.5) */
  volume?: number;
  /** Debounce time in ms for rapid sounds (default: 50) */
  debounceMs?: number;
}

export interface UseGalaxySoundReturn {
  /** Play a sound effect */
  play: (type: SoundType) => void;
  /** Play with pitch variation */
  playVaried: (type: SoundType, variation?: number) => void;
  /** Play alert by severity */
  playAlert: (severity: 'low' | 'medium' | 'high' | 'critical') => void;
  /** Toggle mute state */
  toggleMute: () => boolean;
  /** Set volume (0-1) */
  setVolume: (volume: number) => void;
  /** Get current config */
  getConfig: () => SoundConfig;
  /** Update config */
  setConfig: (config: Partial<SoundConfig>) => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for playing Galaxy sound effects
 *
 * @example
 * ```tsx
 * function TablePlanet({ table }) {
 *   const { play } = useGalaxySound();
 *
 *   return (
 *     <mesh
 *       onPointerEnter={() => play('hover')}
 *       onClick={() => play('select')}
 *     >
 *       ...
 *     </mesh>
 *   );
 * }
 * ```
 */
export function useGalaxySound(options: UseGalaxySoundOptions = {}): UseGalaxySoundReturn {
  const { enabled = true, volume = 0.5, debounceMs = 50 } = options;
  
  const engine = getGalaxySoundEngine();
  const lastPlayTime = useRef<Map<SoundType, number>>(new Map());

  // Update engine config when options change
  useEffect(() => {
    engine.setConfig({ enabled, volume });
  }, [enabled, volume, engine]);

  // Debounced play function
  const play = useCallback((type: SoundType) => {
    const now = Date.now();
    const lastTime = lastPlayTime.current.get(type) ?? 0;
    
    if (now - lastTime < debounceMs) {
      return; // Skip if too soon
    }
    
    lastPlayTime.current.set(type, now);
    engine.play(type);
  }, [engine, debounceMs]);

  // Play with variation
  const playVaried = useCallback((type: SoundType, variation = 0.1) => {
    const now = Date.now();
    const lastTime = lastPlayTime.current.get(type) ?? 0;
    
    if (now - lastTime < debounceMs) {
      return;
    }
    
    lastPlayTime.current.set(type, now);
    engine.playWithVariation(type, variation);
  }, [engine, debounceMs]);

  // Play alert
  const playAlert = useCallback((severity: 'low' | 'medium' | 'high' | 'critical') => {
    void engine.playAlert(severity);
  }, [engine]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    return engine.toggleMute();
  }, [engine]);

  // Set volume
  const setVolume = useCallback((vol: number) => {
    engine.setVolume(vol);
  }, [engine]);

  // Get config
  const getConfig = useCallback(() => {
    return engine.getConfig();
  }, [engine]);

  // Set config
  const setConfig = useCallback((config: Partial<SoundConfig>) => {
    engine.setConfig(config);
  }, [engine]);

  return {
    play,
    playVaried,
    playAlert,
    toggleMute,
    setVolume,
    getConfig,
    setConfig,
  };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Hook for hover sound effects
 */
export function useHoverSound(): () => void {
  const { play } = useGalaxySound({ debounceMs: 100 });
  
  return useCallback((): void => {
    play('hover');
  }, [play]);
}

/**
 * Hook for selection sound effects
 */
export function useSelectionSound(): { onSelect: () => void; onDeselect: () => void } {
  const { play } = useGalaxySound();
  
  const onSelect = useCallback((): void => {
    play('select');
  }, [play]);
  
  const onDeselect = useCallback((): void => {
    play('deselect');
  }, [play]);
  
  return { onSelect, onDeselect };
}

/**
 * Hook for path activation sounds
 */
export function usePathSound(): { onActivate: () => void; onDataFlow: () => void } {
  const { play, playVaried } = useGalaxySound({ debounceMs: 100 });
  
  const onActivate = useCallback((): void => {
    play('pathActivate');
  }, [play]);
  
  const onDataFlow = useCallback((): void => {
    playVaried('dataFlow', 0.2);
  }, [playVaried]);
  
  return { onActivate, onDataFlow };
}
