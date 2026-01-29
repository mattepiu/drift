/**
 * AccessPulse Component
 * 
 * Renders an animated pulse effect when data is accessed.
 * Shows a particle traveling from entry point to table.
 */

import { useFrame } from '@react-three/fiber';
import { useRef, useState, useEffect } from 'react';
import * as THREE from 'three';

import { PARTICLE_CONFIG } from '../../constants/index.js';
import { getOperationThreeColor } from '../../utils/color-utils.js';
import { generateCurvedPath, toThreeVector } from '../../utils/geometry-utils.js';

import type { Vector3D, DataOperation } from '../../types/index.js';

// ============================================================================
// Types
// ============================================================================

export interface AccessPulseProps {
  /** Unique ID for this pulse */
  id: string;
  /** Source position (entry point) */
  sourcePosition: Vector3D;
  /** Target position (table) */
  targetPosition: Vector3D;
  /** Operation type */
  operation: DataOperation;
  /** Duration in milliseconds */
  duration?: number;
  /** Callback when animation completes */
  onComplete?: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function AccessPulse({
  id,
  sourcePosition,
  targetPosition,
  operation,
  duration = PARTICLE_CONFIG.PULSE_DURATION,
  onComplete,
}: AccessPulseProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const trailRef = useRef<THREE.Points>(null);
  const progressRef = useRef(0);
  const [isComplete, setIsComplete] = useState(false);
  
  // Generate path curve
  const curve = generateCurvedPath(sourcePosition, targetPosition);
  
  // Get color based on operation
  const color = getOperationThreeColor(operation);
  
  // Trail positions buffer
  const trailPositions = useRef(new Float32Array(PARTICLE_CONFIG.TRAIL_LENGTH * 3));
  const trailIndex = useRef(0);
  
  // Animation
  useFrame((_, delta) => {
    if (isComplete || !meshRef.current) {return;}
    
    // Update progress
    const speed = 1000 / duration;
    progressRef.current += delta * speed;
    
    if (progressRef.current >= 1) {
      setIsComplete(true);
      onComplete?.();
      return;
    }
    
    // Get position on curve
    const point = curve.getPoint(progressRef.current);
    meshRef.current.position.copy(point);
    
    // Update trail
    if (trailRef.current) {
      const positions = trailPositions.current;
      const idx = (trailIndex.current % PARTICLE_CONFIG.TRAIL_LENGTH) * 3;
      positions[idx] = point.x;
      positions[idx + 1] = point.y;
      positions[idx + 2] = point.z;
      trailIndex.current++;
      
      const geometry = trailRef.current.geometry;
      const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
      if (posAttr) {
        posAttr.needsUpdate = true;
      }
    }
    
    // Scale pulse based on progress (grow then shrink)
    const scale = Math.sin(progressRef.current * Math.PI) * 0.5 + 0.5;
    meshRef.current.scale.setScalar(scale);
  });
  
  // Cleanup effect
  useEffect(() => {
    return () => {
      // Cleanup if unmounted before completion
    };
  }, []);
  
  if (isComplete) {return null;}
  
  return (
    <group>
      {/* Main pulse particle */}
      <mesh ref={meshRef} position={toThreeVector(sourcePosition)}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.9}
        />
      </mesh>
      
      {/* Glow effect */}
      <mesh ref={meshRef} position={toThreeVector(sourcePosition)}>
        <sphereGeometry args={[0.5, 8, 8]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.3}
          side={THREE.BackSide}
        />
      </mesh>
      
      {/* Trail particles */}
      <points ref={trailRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={PARTICLE_CONFIG.TRAIL_LENGTH}
            array={trailPositions.current}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          color={color}
          size={0.1}
          transparent
          opacity={0.5}
          sizeAttenuation
        />
      </points>
    </group>
  );
}
