/**
 * GalaxyLighting Component
 * 
 * Scene lighting setup for the galaxy visualization.
 * Creates ambient space lighting with accent lights for depth.
 */

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';

import { useGalaxyStore } from '../../store/index.js';

// ============================================================================
// Component
// ============================================================================

export function GalaxyLighting() {
  const pointLight1Ref = useRef<THREE.PointLight>(null);
  const pointLight2Ref = useRef<THREE.PointLight>(null);
  
  const { viewMode } = useGalaxyStore();
  
  // Subtle light movement for atmosphere
  useFrame((state) => {
    const time = state.clock.elapsedTime;
    
    if (pointLight1Ref.current) {
      pointLight1Ref.current.position.x = Math.sin(time * 0.1) * 30;
      pointLight1Ref.current.position.z = Math.cos(time * 0.1) * 30;
    }
    
    if (pointLight2Ref.current) {
      pointLight2Ref.current.position.x = Math.cos(time * 0.08) * 25;
      pointLight2Ref.current.position.z = Math.sin(time * 0.08) * 25;
    }
  });
  
  // Adjust lighting based on view mode
  const ambientIntensity = viewMode === 'security' ? 0.2 : 0.3;
  const pointIntensity = viewMode === 'security' ? 0.8 : 0.6;
  
  return (
    <>
      {/* Ambient light - base illumination */}
      <ambientLight intensity={ambientIntensity} color="#4a5568" />
      
      {/* Main directional light - sun-like */}
      <directionalLight
        position={[50, 50, 25]}
        intensity={0.5}
        color="#ffffff"
        castShadow={false}
      />
      
      {/* Accent point lights - create depth */}
      <pointLight
        ref={pointLight1Ref}
        position={[30, 20, 30]}
        intensity={pointIntensity}
        color="#60a5fa"
        distance={100}
        decay={2}
      />
      
      <pointLight
        ref={pointLight2Ref}
        position={[-25, -10, -25]}
        intensity={pointIntensity * 0.7}
        color="#f472b6"
        distance={80}
        decay={2}
      />
      
      {/* Center glow - galaxy core */}
      <pointLight
        position={[0, 0, 0]}
        intensity={0.4}
        color="#a78bfa"
        distance={50}
        decay={2}
      />
      
      {/* Security mode - red warning light */}
      {viewMode === 'security' && (
        <pointLight
          position={[0, 30, 0]}
          intensity={0.3}
          color="#ef4444"
          distance={100}
          decay={2}
        />
      )}
    </>
  );
}
