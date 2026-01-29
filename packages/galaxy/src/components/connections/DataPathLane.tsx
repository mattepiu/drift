/**
 * DataPathLane Component
 * 
 * Renders a data access path as a curved "hyperspace lane" between
 * entry points and tables. Animated particles flow along the path.
 */

import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef, useMemo } from 'react';
import * as THREE from 'three';

import { PATH_CONFIG, ANIMATION_CONFIG } from '../../constants/index.js';
import { useGalaxyStore } from '../../store/index.js';
import { getOperationThreeColor, getSensitivityThreeColor } from '../../utils/color-utils.js';
import { generateCurvedPath, calculatePathWidth, toThreeVector } from '../../utils/geometry-utils.js';

import type { DataPath, Vector3D } from '../../types/index.js';

// ============================================================================
// Types
// ============================================================================

export interface DataPathLaneProps {
  /** Path data */
  path: DataPath;
  /** Source position */
  sourcePosition: Vector3D;
  /** Target position */
  targetPosition: Vector3D;
  /** Whether this path is selected */
  isSelected?: boolean;
  /** Whether this path is hovered */
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

export function DataPathLane({
  path,
  sourcePosition,
  targetPosition,
  isSelected = false,
  isHovered = false,
  onClick,
  onPointerOver,
  onPointerOut,
}: DataPathLaneProps) {
  const lineRef = useRef<THREE.Line>(null);
  const dashOffsetRef = useRef(0);
  
  const { display, viewMode } = useGalaxyStore();
  
  // Generate curved path
  const curve = useMemo(() => {
    return generateCurvedPath(sourcePosition, targetPosition, PATH_CONFIG.CURVE_SEGMENTS);
  }, [sourcePosition, targetPosition]);
  
  // Get points along curve
  const points = useMemo(() => {
    return curve.getPoints(PATH_CONFIG.CURVE_SEGMENTS);
  }, [curve]);
  
  // Calculate width based on frequency
  const lineWidth = useMemo(() => {
    return calculatePathWidth(path.frequency, PATH_CONFIG.BASE_WIDTH, PATH_CONFIG.MAX_WIDTH);
  }, [path.frequency]);
  
  // Get color based on operation or sensitivity
  const color = useMemo(() => {
    if (viewMode === 'security') {
      return getSensitivityThreeColor(path.sensitivity);
    }
    return getOperationThreeColor(path.operation);
  }, [path.operation, path.sensitivity, viewMode]);
  
  // Determine opacity
  const opacity = useMemo(() => {
    let base = display.pathOpacity;
    
    // Highlight untested paths in coverage mode
    if (viewMode === 'coverage' && !path.isTested) {
      base = Math.min(1, base * 1.5);
    }
    
    // Dim if not selected/hovered and something else is
    if (isSelected) {return 1;}
    if (isHovered) {return Math.min(1, base * 1.3);}
    
    return base;
  }, [display.pathOpacity, viewMode, path.isTested, isSelected, isHovered]);
  
  // Animation - flowing dashes
  useFrame((_, delta) => {
    if (!lineRef.current) {return;}
    
    dashOffsetRef.current -= PATH_CONFIG.FLOW_SPEED * delta * display.animationSpeed;
    
    const material = lineRef.current.material as THREE.Material & { dashOffset?: number };
    if (material && 'dashOffset' in material) {
      material.dashOffset = dashOffsetRef.current;
    }
  });
  
  // Don't render if paths are hidden
  if (!display.showPaths) {return null;}
  
  return (
    <group
      onClick={onClick}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
    >
      {/* Main path line */}
      <Line
        ref={lineRef}
        points={points}
        color={color}
        lineWidth={isSelected ? lineWidth * 2 : lineWidth}
        transparent
        opacity={opacity}
        dashed
        dashSize={PATH_CONFIG.DASH_SIZE}
        gapSize={PATH_CONFIG.GAP_SIZE}
      />
      
      {/* Glow effect for selected/hovered */}
      {(isSelected || isHovered) && (
        <Line
          points={points}
          color={color}
          lineWidth={lineWidth * 3}
          transparent
          opacity={opacity * 0.3}
        />
      )}
      
      {/* Untested indicator */}
      {!path.isTested && viewMode === 'coverage' && (
        <Line
          points={points}
          color="#ef4444"
          lineWidth={lineWidth * 0.5}
          transparent
          opacity={0.5}
          dashed
          dashSize={0.2}
          gapSize={0.8}
        />
      )}
    </group>
  );
}
