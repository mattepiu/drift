/**
 * TablePlanet Component
 * 
 * Renders a database table as a 3D planet/sphere in the galaxy.
 * Size reflects importance, color reflects sensitivity level.
 */

import { Sphere, Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef, useMemo, useState, useCallback } from 'react';
import * as THREE from 'three';

import { useGalaxySound } from '../../audio/index.js';
import { TABLE_SIZE, ANIMATION_CONFIG, LABEL_CONFIG } from '../../constants/index.js';
import { useGalaxyStore } from '../../store/index.js';
import {
  getSensitivityThreeColor,
  getSensitivityEmissive,
  getClusterThreeColor,
} from '../../utils/color-utils.js';
import { calculateTableSize, toThreeVector } from '../../utils/geometry-utils.js';

import type { TableNode } from '../../types/index.js';

// ============================================================================
// Types
// ============================================================================

export interface TablePlanetProps {
  /** Table data */
  table: TableNode;
  /** Whether this table is selected */
  isSelected?: boolean;
  /** Whether this table is hovered */
  isHovered?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Hover handlers */
  onPointerOver?: () => void;
  onPointerOut?: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function TablePlanet({
  table,
  isSelected = false,
  isHovered = false,
  onClick,
  onPointerOver,
  onPointerOut,
}: TablePlanetProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const [localHover, setLocalHover] = useState(false);
  
  const { display, viewMode } = useGalaxyStore();
  const { play, playVaried } = useGalaxySound({ debounceMs: 100 });
  
  // Sound handlers
  const handlePointerOver = useCallback((e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    setLocalHover(true);
    // Play hover sound with pitch based on sensitivity
    const pitchVariation = table.sensitivity === 'critical' ? 0.3 : 0.1;
    playVaried('hover', pitchVariation);
    onPointerOver?.();
  }, [table.sensitivity, playVaried, onPointerOver]);
  
  const handlePointerOut = useCallback((e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    setLocalHover(false);
    onPointerOut?.();
  }, [onPointerOut]);
  
  const handleClick = useCallback(() => {
    play('select');
    onClick?.();
  }, [play, onClick]);
  
  // Calculate size based on metrics
  const baseSize = useMemo(() => {
    return calculateTableSize(
      table.rowCount,
      table.accessCount,
      TABLE_SIZE.MIN_RADIUS,
      TABLE_SIZE.MAX_RADIUS
    );
  }, [table.rowCount, table.accessCount]);
  
  // Get colors based on sensitivity
  const colors = useMemo(() => {
    const mainColor = getSensitivityThreeColor(table.sensitivity);
    const emissiveIntensity = getSensitivityEmissive(table.sensitivity);
    const clusterColor = getClusterThreeColor(table.cluster || 'other');
    
    return {
      main: mainColor,
      emissive: mainColor,
      emissiveIntensity,
      cluster: clusterColor,
    };
  }, [table.sensitivity, table.cluster]);
  
  // Position
  const position = useMemo(() => {
    return table.position ? toThreeVector(table.position) : new THREE.Vector3(0, 0, 0);
  }, [table.position]);
  
  // Animation
  useFrame((state, delta) => {
    if (!meshRef.current) {return;}
    
    // Idle rotation
    meshRef.current.rotation.y += ANIMATION_CONFIG.IDLE_ROTATION * display.animationSpeed;
    
    // Scale animation for hover/selection
    const targetScale = isSelected
      ? ANIMATION_CONFIG.SELECTION_SCALE
      : isHovered || localHover
      ? ANIMATION_CONFIG.HOVER_SCALE
      : 1;
    
    meshRef.current.scale.lerp(
      new THREE.Vector3(targetScale, targetScale, targetScale),
      0.1
    );
    
    // Glow pulse for sensitive data
    if (glowRef.current && table.sensitivity !== 'public') {
      const pulse = Math.sin(state.clock.elapsedTime * ANIMATION_CONFIG.PULSE_FREQUENCY) * 0.5 + 0.5;
      const material = glowRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = 0.1 + pulse * 0.2 * colors.emissiveIntensity;
    }
  });
  
  // Determine if we should show enhanced visuals in security mode
  const isHighlighted = viewMode === 'security' && 
    (table.sensitivity === 'critical' || table.sensitivity === 'high');
  
  return (
    <group position={position}>
      {/* Main planet sphere */}
      <Sphere
        ref={meshRef}
        args={[baseSize, 32, 32]}
        onClick={handleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        <meshStandardMaterial
          color={colors.main}
          emissive={colors.emissive}
          emissiveIntensity={isHighlighted ? colors.emissiveIntensity * 2 : colors.emissiveIntensity}
          roughness={0.7}
          metalness={0.3}
        />
      </Sphere>
      
      {/* Outer glow for sensitive tables */}
      {table.sensitivity !== 'public' && display.enableBloom && (
        <Sphere
          ref={glowRef}
          args={[baseSize * 1.3, 16, 16]}
        >
          <meshBasicMaterial
            color={colors.main}
            transparent
            opacity={0.15}
            side={THREE.BackSide}
          />
        </Sphere>
      )}
      
      {/* Selection ring */}
      {isSelected && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[baseSize * 1.5, baseSize * 1.7, 32]} />
          <meshBasicMaterial
            color="#ffffff"
            transparent
            opacity={0.8}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      
      {/* Label */}
      {display.showLabels && (isHovered || localHover || isSelected) && (
        <Html
          position={[0, baseSize + LABEL_CONFIG.OFFSET, 0]}
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
              border: `1px solid ${colors.main.getStyle()}`,
            }}
          >
            <div style={{ fontWeight: 600 }}>{table.name}</div>
            <div style={{ fontSize: '10px', opacity: 0.7 }}>
              {table.fields.length} fields • {table.accessCount} accesses
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}
