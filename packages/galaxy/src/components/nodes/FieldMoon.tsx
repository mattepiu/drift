/**
 * FieldMoon Component
 * 
 * Renders a database field as a small moon orbiting its parent table.
 * Sensitive fields glow brighter and are larger.
 */

import { Sphere, Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef, useMemo } from 'react';
import * as THREE from 'three';

import { FIELD_SIZE, ANIMATION_CONFIG, LABEL_CONFIG } from '../../constants/index.js';
import { useGalaxyStore } from '../../store/index.js';
import {
  getSensitivityThreeColor,
  getSensitivityEmissive,
} from '../../utils/color-utils.js';
import { calculateFieldSize, getOrbitPosition } from '../../utils/geometry-utils.js';

import type { FieldNode, Vector3D } from '../../types/index.js';

// ============================================================================
// Types
// ============================================================================

export interface FieldMoonProps {
  /** Field data */
  field: FieldNode;
  /** Parent table center position */
  parentPosition: Vector3D;
  /** Parent table radius */
  parentRadius: number;
  /** Index for orbit positioning */
  orbitIndex: number;
  /** Total fields for orbit spacing */
  totalFields: number;
  /** Whether this field is selected */
  isSelected?: boolean;
  /** Whether this field is hovered */
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

export function FieldMoon({
  field,
  parentPosition,
  parentRadius,
  orbitIndex,
  totalFields,
  isSelected = false,
  isHovered = false,
  onClick,
  onPointerOver,
  onPointerOut,
}: FieldMoonProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const orbitAngleRef = useRef(
    (orbitIndex / totalFields) * Math.PI * 2 + Math.random() * 0.5
  );
  
  const { display, viewMode } = useGalaxyStore();
  
  // Calculate size based on sensitivity and access
  const size = useMemo(() => {
    const isSensitive = field.sensitivity !== 'public' && field.sensitivity !== 'low';
    return calculateFieldSize(field.accessCount, isSensitive, FIELD_SIZE.RADIUS);
  }, [field.accessCount, field.sensitivity]);
  
  // Get colors
  const colors = useMemo(() => {
    const mainColor = getSensitivityThreeColor(field.sensitivity);
    const emissiveIntensity = getSensitivityEmissive(field.sensitivity);
    
    return {
      main: mainColor,
      emissive: mainColor,
      emissiveIntensity,
    };
  }, [field.sensitivity]);
  
  // Calculate orbit radius based on parent size
  const orbitRadius = parentRadius + FIELD_SIZE.ORBIT_RADIUS;
  
  // Orbit tilt based on index (creates 3D distribution)
  const orbitTilt = useMemo(() => {
    return ((orbitIndex % 3) - 1) * 0.3;
  }, [orbitIndex]);
  
  // Animation - orbit around parent
  useFrame((state, delta) => {
    if (!meshRef.current) {return;}
    
    // Update orbit angle
    orbitAngleRef.current += FIELD_SIZE.ORBIT_SPEED * delta * display.animationSpeed;
    
    // Calculate position on orbit
    const pos = getOrbitPosition(
      parentPosition,
      orbitRadius,
      orbitAngleRef.current,
      orbitTilt
    );
    
    meshRef.current.position.set(pos.x, pos.y, pos.z);
    
    // Self rotation
    meshRef.current.rotation.y += 0.02 * display.animationSpeed;
    
    // Scale for hover/selection
    const targetScale = isSelected
      ? ANIMATION_CONFIG.SELECTION_SCALE
      : isHovered
      ? ANIMATION_CONFIG.HOVER_SCALE
      : 1;
    
    meshRef.current.scale.lerp(
      new THREE.Vector3(targetScale, targetScale, targetScale),
      0.1
    );
  });
  
  // Determine if highlighted in security mode
  const isHighlighted = viewMode === 'security' && 
    (field.sensitivity === 'critical' || field.sensitivity === 'high');
  
  // Don't render if fields are hidden
  if (!display.showFields) {return null;}
  
  return (
    <group>
      <Sphere
        ref={meshRef}
        args={[size, 16, 16]}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onPointerOver?.();
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onPointerOut?.();
        }}
      >
        <meshStandardMaterial
          color={colors.main}
          emissive={colors.emissive}
          emissiveIntensity={isHighlighted ? colors.emissiveIntensity * 3 : colors.emissiveIntensity}
          roughness={0.5}
          metalness={0.5}
        />
      </Sphere>
      
      {/* Label on hover */}
      {display.showLabels && isHovered && meshRef.current && (
        <Html
          position={meshRef.current.position.clone().add(new THREE.Vector3(0, size + 0.3, 0))}
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
              fontSize: '10px',
              fontFamily: LABEL_CONFIG.FONT_FAMILY,
              whiteSpace: 'nowrap',
              border: `1px solid ${colors.main.getStyle()}`,
            }}
          >
            <div style={{ fontWeight: 600 }}>{field.name}</div>
            <div style={{ opacity: 0.7 }}>
              {field.dataType} • {field.sensitivity}
            </div>
            {field.isPrimaryKey && <div style={{ color: '#fbbf24' }}>🔑 Primary Key</div>}
            {field.isForeignKey && <div style={{ color: '#60a5fa' }}>🔗 Foreign Key</div>}
            {!field.isTested && <div style={{ color: '#ef4444' }}>⚠️ Untested</div>}
          </div>
        </Html>
      )}
    </group>
  );
}
