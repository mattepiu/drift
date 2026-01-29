/**
 * GalaxyCanvas Component
 * 
 * Main Three.js canvas orchestrator for the galaxy visualization.
 * Renders all nodes, connections, and effects.
 */

import { Canvas } from '@react-three/fiber';
import { Suspense, useMemo, useCallback } from 'react';
import * as THREE from 'three';

import { GalaxyCamera } from './GalaxyCamera.js';
import { GalaxyLighting } from './GalaxyLighting.js';
import { CAMERA_CONFIG } from '../../constants/index.js';
import { useGalaxyStore, useFilteredTables, useFilteredPaths, useFilteredEntryPoints } from '../../store/index.js';
import { DataPathLane } from '../connections/DataPathLane.js';
import { TableRelationship } from '../connections/TableRelationship.js';
import { GalaxyBloom } from '../effects/GalaxyBloom.js';
import { StarField } from '../effects/StarField.js';
import { EntryPointStation } from '../nodes/EntryPointStation.js';
import { FieldMoon } from '../nodes/FieldMoon.js';
import { TablePlanet } from '../nodes/TablePlanet.js';

import type { Vector3D } from '../../types/index.js';

// ============================================================================
// Types
// ============================================================================

export interface GalaxyCanvasProps {
  /** Custom class name */
  className?: string;
  /** Enable controls */
  enableControls?: boolean;
  /** Enable auto-rotation */
  autoRotate?: boolean;
}

// ============================================================================
// Loading Fallback
// ============================================================================

function LoadingFallback() {
  return (
    <mesh>
      <sphereGeometry args={[1, 16, 16]} />
      <meshBasicMaterial color="#4a5568" wireframe />
    </mesh>
  );
}

// ============================================================================
// Galaxy Scene
// ============================================================================

function GalaxyScene() {
  const {
    galaxyData,
    selection,
    display,
    selectTable,
    selectEntryPoint,
    selectPath,
    setHovered,
  } = useGalaxyStore();
  
  const filteredTables = useFilteredTables();
  const filteredPaths = useFilteredPaths();
  const filteredEntryPoints = useFilteredEntryPoints();
  
  // Create position lookup map
  const positionMap = useMemo(() => {
    const map = new Map<string, Vector3D>();
    
    if (galaxyData) {
      for (const table of galaxyData.tables) {
        if (table.position) {
          map.set(table.id, table.position);
        }
      }
      for (const ep of galaxyData.entryPoints) {
        if (ep.position) {
          map.set(ep.id, ep.position);
        }
      }
    }
    
    return map;
  }, [galaxyData]);
  
  // Handlers
  const handleTableClick = useCallback((id: string) => {
    selectTable(id);
  }, [selectTable]);
  
  const handleEntryPointClick = useCallback((id: string) => {
    selectEntryPoint(id);
  }, [selectEntryPoint]);
  
  const handlePathClick = useCallback((id: string) => {
    selectPath(id);
  }, [selectPath]);
  
  const handleHover = useCallback((id: string | null, type: 'table' | 'field' | 'entryPoint' | 'path' | null) => {
    setHovered(id, type);
  }, [setHovered]);
  
  if (!galaxyData) {
    return <LoadingFallback />;
  }
  
  return (
    <>
      {/* Background stars */}
      <StarField />
      
      {/* Lighting */}
      <GalaxyLighting />
      
      {/* Camera controls */}
      <GalaxyCamera />
      
      {/* Post-processing */}
      <GalaxyBloom />
      
      {/* Table relationships (render first, behind everything) */}
      {display.showRelationships && galaxyData.relationships.map((rel) => {
        const sourcePos = positionMap.get(rel.sourceTableId);
        const targetPos = positionMap.get(rel.targetTableId);
        
        if (!sourcePos || !targetPos) {return null;}
        
        const isHighlighted = 
          selection.selectedTable === rel.sourceTableId ||
          selection.selectedTable === rel.targetTableId;
        
        return (
          <TableRelationship
            key={rel.id}
            relationship={rel}
            sourcePosition={sourcePos}
            targetPosition={targetPos}
            isHighlighted={isHighlighted}
          />
        );
      })}
      
      {/* Data paths (hyperspace lanes) */}
      {filteredPaths.map((path) => {
        const sourcePos = positionMap.get(path.sourceId);
        const targetPos = positionMap.get(path.targetTableId);
        
        if (!sourcePos || !targetPos) {return null;}
        
        return (
          <DataPathLane
            key={path.id}
            path={path}
            sourcePosition={sourcePos}
            targetPosition={targetPos}
            isSelected={selection.selectedPath === path.id}
            isHovered={selection.hoveredNode === path.id}
            onClick={() => { handlePathClick(path.id); }}
            onPointerOver={() => { handleHover(path.id, 'path'); }}
            onPointerOut={() => { handleHover(null, null); }}
          />
        );
      })}
      
      {/* Tables (planets) */}
      {filteredTables.map((table) => (
        <group key={table.id}>
          <TablePlanet
            table={table}
            isSelected={selection.selectedTable === table.id}
            isHovered={selection.hoveredNode === table.id}
            onClick={() => { handleTableClick(table.id); }}
            onPointerOver={() => { handleHover(table.id, 'table'); }}
            onPointerOut={() => { handleHover(null, null); }}
          />
          
          {/* Field moons */}
          {display.showFields && table.position && table.fields.map((field, idx) => (
            <FieldMoon
              key={field.id}
              field={field}
              parentPosition={table.position!}
              parentRadius={1} // Will be calculated properly
              orbitIndex={idx}
              totalFields={table.fields.length}
              isSelected={selection.selectedField === field.id}
              isHovered={selection.hoveredNode === field.id}
              onClick={() => { selectTable(table.id); }}
              onPointerOver={() => { handleHover(field.id, 'field'); }}
              onPointerOut={() => { handleHover(null, null); }}
            />
          ))}
        </group>
      ))}
      
      {/* Entry points (space stations) */}
      {filteredEntryPoints.map((ep) => (
        <EntryPointStation
          key={ep.id}
          entryPoint={ep}
          isSelected={selection.selectedEntryPoint === ep.id}
          isHovered={selection.hoveredNode === ep.id}
          onClick={() => { handleEntryPointClick(ep.id); }}
          onPointerOver={() => { handleHover(ep.id, 'entryPoint'); }}
          onPointerOut={() => { handleHover(null, null); }}
        />
      ))}
    </>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function GalaxyCanvas({
  className = '',
  enableControls = true,
  autoRotate = false,
}: GalaxyCanvasProps) {
  return (
    <div className={`w-full h-full ${className}`}>
      <Canvas
        camera={{
          position: [
            CAMERA_CONFIG.DEFAULT_POSITION.x,
            CAMERA_CONFIG.DEFAULT_POSITION.y,
            CAMERA_CONFIG.DEFAULT_POSITION.z,
          ],
          fov: CAMERA_CONFIG.FOV,
          near: CAMERA_CONFIG.NEAR,
          far: CAMERA_CONFIG.FAR,
        }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1,
        }}
        dpr={[1, 2]}
      >
        <color attach="background" args={['#0f172a']} />
        <fog attach="fog" args={['#0f172a', 50, 200]} />
        
        <Suspense fallback={<LoadingFallback />}>
          <GalaxyScene />
        </Suspense>
      </Canvas>
    </div>
  );
}
