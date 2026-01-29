/**
 * StarField Component
 * 
 * Renders a background of twinkling stars using instanced points.
 * Creates the space atmosphere for the galaxy visualization.
 */

import { Points, PointMaterial } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef, useMemo } from 'react';
import * as THREE from 'three';

import { PARTICLE_CONFIG, GALAXY_LAYOUT } from '../../constants/index.js';

// ============================================================================
// Types
// ============================================================================

export interface StarFieldProps {
  /** Number of stars */
  count?: number;
  /** Radius of star field */
  radius?: number;
  /** Base star size */
  size?: number;
  /** Enable twinkling animation */
  twinkle?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function StarField({
  count = PARTICLE_CONFIG.STAR_COUNT,
  radius = GALAXY_LAYOUT.RADIUS * 3,
  size = PARTICLE_CONFIG.STAR_SIZE,
  twinkle = true,
}: StarFieldProps) {
  const pointsRef = useRef<THREE.Points>(null);
  
  // Generate random star positions
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    
    for (let i = 0; i < count; i++) {
      // Spherical distribution
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = radius * (0.5 + Math.random() * 0.5);
      
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    
    return pos;
  }, [count, radius]);
  
  // Generate random sizes for variation
  const sizes = useMemo(() => {
    const s = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      s[i] = size * (0.5 + Math.random() * 1.5);
    }
    return s;
  }, [count, size]);
  
  // Generate random colors (slight color variation)
  const colors = useMemo(() => {
    const c = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Mostly white with slight blue/yellow tint
      const tint = Math.random();
      if (tint < 0.1) {
        // Blue star
        c[i * 3] = 0.7;
        c[i * 3 + 1] = 0.8;
        c[i * 3 + 2] = 1;
      } else if (tint < 0.2) {
        // Yellow star
        c[i * 3] = 1;
        c[i * 3 + 1] = 0.95;
        c[i * 3 + 2] = 0.8;
      } else {
        // White star
        c[i * 3] = 1;
        c[i * 3 + 1] = 1;
        c[i * 3 + 2] = 1;
      }
    }
    return c;
  }, [count]);
  
  // Twinkling animation
  useFrame((state) => {
    if (!twinkle || !pointsRef.current) {return;}
    
    const geometry = pointsRef.current.geometry;
    const sizeAttr = geometry.getAttribute('size') as THREE.BufferAttribute;
    
    if (sizeAttr) {
      const time = state.clock.elapsedTime;
      for (let i = 0; i < count; i++) {
        // Each star twinkles at different rate
        const twinkleSpeed = 0.5 + (i % 10) * 0.1;
        const twinkleAmount = Math.sin(time * twinkleSpeed + i) * 0.3 + 0.7;
        sizeAttr.array[i] = sizes[i] * twinkleAmount;
      }
      sizeAttr.needsUpdate = true;
    }
  });
  
  return (
    <Points ref={pointsRef} limit={count}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={count}
          array={colors}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-size"
          count={count}
          array={sizes}
          itemSize={1}
        />
      </bufferGeometry>
      <PointMaterial
        transparent
        vertexColors
        size={size}
        sizeAttenuation
        depthWrite={false}
        opacity={0.8}
      />
    </Points>
  );
}
