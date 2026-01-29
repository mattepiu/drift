/**
 * TableRelationship Component
 * 
 * Renders a foreign key relationship between tables as a subtle
 * gravitational link line.
 */

import { Line } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';

import { useGalaxyStore } from '../../store/index.js';
import { toThreeVector, midpoint } from '../../utils/geometry-utils.js';

import type { TableRelationship as TableRelationshipType, Vector3D } from '../../types/index.js';

// ============================================================================
// Types
// ============================================================================

export interface TableRelationshipProps {
  /** Relationship data */
  relationship: TableRelationshipType;
  /** Source table position */
  sourcePosition: Vector3D;
  /** Target table position */
  targetPosition: Vector3D;
  /** Whether either table is selected */
  isHighlighted?: boolean;
}

// ============================================================================
// Relationship Type Colors
// ============================================================================

const RELATIONSHIP_COLORS: Record<string, string> = {
  'one-to-one': '#60a5fa',   // Blue
  'one-to-many': '#34d399',  // Green
  'many-to-many': '#a78bfa', // Purple
};

// ============================================================================
// Component
// ============================================================================

export function TableRelationship({
  relationship,
  sourcePosition,
  targetPosition,
  isHighlighted = false,
}: TableRelationshipProps) {
  const { display } = useGalaxyStore();
  
  // Calculate curve points (slight arc)
  const points = useMemo(() => {
    const start = toThreeVector(sourcePosition);
    const end = toThreeVector(targetPosition);
    const mid = toThreeVector(midpoint(sourcePosition, targetPosition));
    
    // Add slight vertical offset to midpoint for arc effect
    mid.y += 1;
    
    // Create quadratic bezier curve
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    return curve.getPoints(20);
  }, [sourcePosition, targetPosition]);
  
  // Get color based on relationship type
  const color = useMemo(() => {
    return RELATIONSHIP_COLORS[relationship.type] || '#6b7280';
  }, [relationship.type]);
  
  // Don't render if relationships are hidden
  if (!display.showRelationships) {return null;}
  
  return (
    <group>
      {/* Main relationship line */}
      <Line
        points={points}
        color={color}
        lineWidth={isHighlighted ? 2 : 1}
        transparent
        opacity={isHighlighted ? 0.8 : 0.3}
        dashed={!isHighlighted}
        dashSize={0.3}
        gapSize={0.2}
      />
      
      {/* Cardinality indicators at endpoints */}
      {isHighlighted && (
        <>
          {/* Source indicator */}
          <mesh position={toThreeVector(sourcePosition)}>
            <sphereGeometry args={[0.15, 8, 8]} />
            <meshBasicMaterial color={color} transparent opacity={0.8} />
          </mesh>
          
          {/* Target indicator - different shape for "many" */}
          <mesh position={toThreeVector(targetPosition)}>
            {relationship.type.endsWith('many') ? (
              <coneGeometry args={[0.2, 0.3, 8]} />
            ) : (
              <sphereGeometry args={[0.15, 8, 8]} />
            )}
            <meshBasicMaterial color={color} transparent opacity={0.8} />
          </mesh>
        </>
      )}
    </group>
  );
}
