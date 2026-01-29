/**
 * EntryPointStation Component
 * 
 * Renders an API entry point as a space station at the galaxy edge.
 * Color indicates authentication level (red = public, green = protected).
 */

import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef, useMemo, useState, useCallback } from 'react';
import * as THREE from 'three';

import { useGalaxySound } from '../../audio/index.js';
import { ENTRY_POINT_SIZE, ANIMATION_CONFIG, LABEL_CONFIG } from '../../constants/index.js';
import { useGalaxyStore } from '../../store/index.js';
import {
  getAuthLevelThreeColor,
  getSecurityTierThreeColor,
} from '../../utils/color-utils.js';
import { toThreeVector } from '../../utils/geometry-utils.js';

import type { EntryPointNode } from '../../types/index.js';

// ============================================================================
// Types
// ============================================================================

export interface EntryPointStationProps {
  /** Entry point data */
  entryPoint: EntryPointNode;
  /** Whether this entry point is selected */
  isSelected?: boolean;
  /** Whether this entry point is hovered */
  isHovered?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Hover handlers */
  onPointerOver?: () => void;
  onPointerOut?: () => void;
}

// ============================================================================
// HTTP Method Colors
// ============================================================================

const METHOD_COLORS: Record<string, string> = {
  GET: '#22c55e',    // Green
  POST: '#3b82f6',   // Blue
  PUT: '#f59e0b',    // Amber
  PATCH: '#8b5cf6',  // Purple
  DELETE: '#ef4444', // Red
  ALL: '#6b7280',    // Gray
};

// ============================================================================
// Component
// ============================================================================

export function EntryPointStation({
  entryPoint,
  isSelected = false,
  isHovered = false,
  onClick,
  onPointerOver,
  onPointerOut,
}: EntryPointStationProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [localHover, setLocalHover] = useState(false);
  
  const { display, viewMode } = useGalaxyStore();
  const { play, playAlert } = useGalaxySound({ debounceMs: 100 });
  
  // Sound handlers
  const handlePointerOver = useCallback((e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    setLocalHover(true);
    // Play alert sound for public endpoints, regular hover otherwise
    if (entryPoint.authLevel === 'public') {
      playAlert('medium');
    } else {
      play('hover');
    }
    onPointerOver?.();
  }, [entryPoint.authLevel, play, playAlert, onPointerOver]);
  
  const handlePointerOut = useCallback((e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    setLocalHover(false);
    onPointerOut?.();
  }, [onPointerOut]);
  
  const handleClick = useCallback(() => {
    // Play different sounds based on security tier
    if (entryPoint.securityTier === 'P0') {
      playAlert('critical');
    } else if (entryPoint.securityTier === 'P1') {
      playAlert('high');
    } else {
      play('select');
    }
    onClick?.();
  }, [entryPoint.securityTier, play, playAlert, onClick]);
  
  // Get colors
  const colors = useMemo(() => {
    const authColor = getAuthLevelThreeColor(entryPoint.authLevel);
    const tierColor = getSecurityTierThreeColor(entryPoint.securityTier);
    const methodColor = new THREE.Color(METHOD_COLORS[entryPoint.method] ?? METHOD_COLORS['ALL'] ?? '#6b7280');
    
    return {
      auth: authColor,
      tier: tierColor,
      method: methodColor,
    };
  }, [entryPoint.authLevel, entryPoint.securityTier, entryPoint.method]);
  
  // Position
  const position = useMemo(() => {
    return entryPoint.position ? toThreeVector(entryPoint.position) : new THREE.Vector3(0, 0, 0);
  }, [entryPoint.position]);
  
  // Animation
  useFrame((state, delta) => {
    if (!groupRef.current) {return;}
    
    // Slow rotation
    groupRef.current.rotation.y += 0.005 * display.animationSpeed;
    
    // Scale for hover/selection
    const targetScale = isSelected
      ? ANIMATION_CONFIG.SELECTION_SCALE
      : isHovered || localHover
      ? ANIMATION_CONFIG.HOVER_SCALE
      : 1;
    
    groupRef.current.scale.lerp(
      new THREE.Vector3(targetScale, targetScale, targetScale),
      0.1
    );
  });
  
  // Highlight public endpoints in security mode
  const isHighlighted = viewMode === 'security' && entryPoint.authLevel === 'public';
  
  const scale = ENTRY_POINT_SIZE.SCALE;
  
  return (
    <group
      ref={groupRef}
      position={position}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      {/* Main station body - octahedron shape */}
      <mesh>
        <octahedronGeometry args={[scale, 0]} />
        <meshStandardMaterial
          color={colors.auth}
          emissive={colors.auth}
          emissiveIntensity={isHighlighted ? 0.8 : 0.3}
          roughness={0.3}
          metalness={0.7}
        />
      </mesh>
      
      {/* Inner core - shows method color */}
      <mesh>
        <octahedronGeometry args={[scale * 0.5, 0]} />
        <meshStandardMaterial
          color={colors.method}
          emissive={colors.method}
          emissiveIntensity={0.5}
          roughness={0.2}
          metalness={0.8}
        />
      </mesh>
      
      {/* Rotating ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[scale * 1.5, scale * 0.1, 8, 32]} />
        <meshStandardMaterial
          color={colors.tier}
          emissive={colors.tier}
          emissiveIntensity={0.4}
          roughness={0.4}
          metalness={0.6}
        />
      </mesh>
      
      {/* Selection indicator */}
      {isSelected && (
        <mesh rotation={[0, 0, Math.PI / 4]}>
          <torusGeometry args={[scale * 2, scale * 0.05, 8, 32]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
        </mesh>
      )}
      
      {/* Danger pulse for public endpoints */}
      {entryPoint.authLevel === 'public' && display.enableBloom && (
        <mesh>
          <sphereGeometry args={[scale * 2, 16, 16]} />
          <meshBasicMaterial
            color="#ff3333"
            transparent
            opacity={0.1}
            side={THREE.BackSide}
          />
        </mesh>
      )}
      
      {/* Label */}
      {display.showLabels && (isHovered || localHover || isSelected) && (
        <Html
          position={[0, scale * 2, 0]}
          center
          style={{
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          <div
            style={{
              background: `rgba(15, 23, 42, ${LABEL_CONFIG.BG_OPACITY})`,
              color: '#f8fafc',
              padding: `${LABEL_CONFIG.PADDING}px ${LABEL_CONFIG.PADDING * 2}px`,
              borderRadius: '4px',
              fontSize: `${LABEL_CONFIG.FONT_SIZE}px`,
              fontFamily: LABEL_CONFIG.FONT_FAMILY,
              whiteSpace: 'nowrap',
              border: `1px solid ${colors.auth.getStyle()}`,
              maxWidth: '250px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  background: METHOD_COLORS[entryPoint.method],
                  padding: '2px 6px',
                  borderRadius: '3px',
                  fontSize: '10px',
                  fontWeight: 700,
                }}
              >
                {entryPoint.method}
              </span>
              <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {entryPoint.path}
              </span>
            </div>
            <div style={{ fontSize: '10px', opacity: 0.7, marginTop: '4px' }}>
              {entryPoint.framework} • {entryPoint.authLevel}
              {entryPoint.authLevel === 'public' && (
                <span style={{ color: '#ef4444', marginLeft: '4px' }}>⚠️ PUBLIC</span>
              )}
            </div>
            <div style={{ fontSize: '10px', opacity: 0.7 }}>
              Reaches {entryPoint.reachableTables.length} tables
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}
