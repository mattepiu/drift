/**
 * GalaxyCamera Component
 * 
 * Camera controls for the galaxy visualization.
 * Handles orbit controls, zoom, and animated transitions.
 */

import { OrbitControls } from '@react-three/drei';
import { useThree, useFrame } from '@react-three/fiber';
import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

import { CAMERA_CONFIG } from '../../constants/index.js';
import { useGalaxyStore } from '../../store/index.js';
import { toThreeVector } from '../../utils/geometry-utils.js';

// ============================================================================
// Types
// ============================================================================

export interface GalaxyCameraProps {
  /** Enable orbit controls (unused - controls always enabled) */
  enableControls?: boolean;
  /** Enable auto-rotation */
  autoRotate?: boolean;
  /** Auto-rotation speed */
  autoRotateSpeed?: number;
}

// ============================================================================
// Component
// ============================================================================

export function GalaxyCamera({
  enableControls: _enableControls = true,
  autoRotate = false,
  autoRotateSpeed = 0.5,
}: GalaxyCameraProps): React.JSX.Element {
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();
  
  const { camera: cameraState, setCameraPosition, setCameraTarget } = useGalaxyStore();
  
  // Sync camera position from store
  useEffect(() => {
    if (cameraState.position) {
      const pos = toThreeVector(cameraState.position);
      camera.position.copy(pos);
    }
  }, [cameraState.position, camera]);
  
  // Sync target from store
  useEffect(() => {
    if (controlsRef.current && cameraState.target) {
      const target = toThreeVector(cameraState.target);
      controlsRef.current.target.copy(target);
      controlsRef.current.update();
    }
  }, [cameraState.target]);
  
  // Apply zoom
  useEffect(() => {
    camera.zoom = cameraState.zoom;
    camera.updateProjectionMatrix();
  }, [cameraState.zoom, camera]);
  
  // Smooth camera transitions
  useFrame(() => {
    if (!controlsRef.current) {return;}
    
    // Update store with current camera position (for persistence)
    const pos = camera.position;
    const target = controlsRef.current.target;
    
    // Only update if significantly changed (avoid infinite loops)
    const posDiff = Math.abs(pos.x - cameraState.position.x) +
                    Math.abs(pos.y - cameraState.position.y) +
                    Math.abs(pos.z - cameraState.position.z);
    
    if (posDiff > 0.1) {
      setCameraPosition({ x: pos.x, y: pos.y, z: pos.z });
    }
    
    const targetDiff = Math.abs(target.x - cameraState.target.x) +
                       Math.abs(target.y - cameraState.target.y) +
                       Math.abs(target.z - cameraState.target.z);
    
    if (targetDiff > 0.1) {
      setCameraTarget({ x: target.x, y: target.y, z: target.z });
    }
  });
  
  // OrbitControls props vary by version, use spread with type assertion
  const controlsProps = {
    autoRotate,
    autoRotateSpeed,
    minDistance: CAMERA_CONFIG.MIN_ZOOM * 20,
    maxDistance: CAMERA_CONFIG.MAX_ZOOM * 100,
    maxPolarAngle: Math.PI * 0.85,
    minPolarAngle: Math.PI * 0.15,
  };
  
  return (
    <OrbitControls
      ref={controlsRef}
      {...(controlsProps as any)}
    />
  );
}
