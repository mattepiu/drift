/**
 * Geometry Utilities
 * 
 * 3D geometry calculations for galaxy visualization.
 */

import * as THREE from 'three';

import type { Vector3D } from '../types/index.js';

// ============================================================================
// Vector Operations
// ============================================================================

/**
 * Convert Vector3D to THREE.Vector3
 */
export function toThreeVector(v: Vector3D): THREE.Vector3 {
  return new THREE.Vector3(v.x, v.y, v.z);
}

/**
 * Convert THREE.Vector3 to Vector3D
 */
export function fromThreeVector(v: THREE.Vector3): Vector3D {
  return { x: v.x, y: v.y, z: v.z };
}

/**
 * Calculate distance between two points
 */
export function distance(a: Vector3D, b: Vector3D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calculate midpoint between two points
 */
export function midpoint(a: Vector3D, b: Vector3D): Vector3D {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
  };
}

/**
 * Normalize a vector
 */
export function normalize(v: Vector3D): Vector3D {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len === 0) {return { x: 0, y: 0, z: 0 };}
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/**
 * Scale a vector
 */
export function scale(v: Vector3D, s: number): Vector3D {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

/**
 * Add two vectors
 */
export function add(a: Vector3D, b: Vector3D): Vector3D {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/**
 * Subtract two vectors
 */
export function subtract(a: Vector3D, b: Vector3D): Vector3D {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/**
 * Linear interpolation between two vectors
 */
export function lerp(a: Vector3D, b: Vector3D, t: number): Vector3D {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

// ============================================================================
// Curve Generation
// ============================================================================

/**
 * Generate a curved path between two points (for hyperspace lanes)
 */
export function generateCurvedPath(
  start: Vector3D,
  end: Vector3D,
  _segments: number = 50,
  curvature: number = 0.3
): THREE.CatmullRomCurve3 {
  const mid = midpoint(start, end);
  const dist = distance(start, end);
  
  // Calculate perpendicular offset for curve
  const direction = normalize(subtract(end, start));
  const perpendicular = normalize({
    x: -direction.z,
    y: direction.y + curvature * dist,
    z: direction.x,
  });
  
  const controlPoint: Vector3D = {
    x: mid.x + perpendicular.x * dist * curvature,
    y: mid.y + perpendicular.y * dist * curvature,
    z: mid.z + perpendicular.z * dist * curvature,
  };
  
  return new THREE.CatmullRomCurve3([
    toThreeVector(start),
    toThreeVector(controlPoint),
    toThreeVector(end),
  ]);
}

/**
 * Generate points along a curve
 */
export function getCurvePoints(
  curve: THREE.CatmullRomCurve3,
  segments: number
): THREE.Vector3[] {
  return curve.getPoints(segments);
}

// ============================================================================
// Orbit Calculations
// ============================================================================

/**
 * Calculate position on orbit
 */
export function getOrbitPosition(
  center: Vector3D,
  radius: number,
  angle: number,
  tilt: number = 0
): Vector3D {
  const x = center.x + Math.cos(angle) * radius;
  const y = center.y + Math.sin(tilt) * Math.sin(angle) * radius * 0.3;
  const z = center.z + Math.sin(angle) * radius;
  return { x, y, z };
}

/**
 * Generate orbit path points
 */
export function generateOrbitPath(
  center: Vector3D,
  radius: number,
  segments: number = 64,
  tilt: number = 0
): Vector3D[] {
  const points: Vector3D[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(getOrbitPosition(center, radius, angle, tilt));
  }
  return points;
}

// ============================================================================
// Bounding & Frustum
// ============================================================================

/**
 * Calculate bounding sphere for a set of points
 */
export function calculateBoundingSphere(points: Vector3D[]): { center: Vector3D; radius: number } {
  if (points.length === 0) {
    return { center: { x: 0, y: 0, z: 0 }, radius: 0 };
  }
  
  // Calculate center
  let cx = 0, cy = 0, cz = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
    cz += p.z;
  }
  const center: Vector3D = {
    x: cx / points.length,
    y: cy / points.length,
    z: cz / points.length,
  };
  
  // Calculate radius
  let maxDist = 0;
  for (const p of points) {
    const dist = distance(center, p);
    if (dist > maxDist) {maxDist = dist;}
  }
  
  return { center, radius: maxDist };
}

/**
 * Check if a point is within camera frustum
 */
export function isInFrustum(
  point: Vector3D,
  camera: THREE.Camera,
  margin: number = 1
): boolean {
  const frustum = new THREE.Frustum();
  const matrix = new THREE.Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse
  );
  frustum.setFromProjectionMatrix(matrix);
  
  const sphere = new THREE.Sphere(toThreeVector(point), margin);
  return frustum.intersectsSphere(sphere);
}

// ============================================================================
// Size Calculations
// ============================================================================

/**
 * Calculate table size based on metrics
 */
export function calculateTableSize(
  rowCount: number,
  accessCount: number,
  minSize: number = 0.5,
  maxSize: number = 3
): number {
  // Logarithmic scaling for row count
  const rowFactor = Math.log10(rowCount + 1) / 6; // Normalize to ~0-1 for up to 1M rows
  
  // Logarithmic scaling for access count
  const accessFactor = Math.log10(accessCount + 1) / 4; // Normalize to ~0-1 for up to 10K accesses
  
  // Combine factors (row count weighted more)
  const combined = rowFactor * 0.6 + accessFactor * 0.4;
  
  // Scale to size range
  return minSize + combined * (maxSize - minSize);
}

/**
 * Calculate field size based on access count
 */
export function calculateFieldSize(
  accessCount: number,
  isSensitive: boolean,
  baseSize: number = 0.15
): number {
  const accessFactor = Math.log10(accessCount + 1) / 3;
  const sensitiveMultiplier = isSensitive ? 1.5 : 1;
  return baseSize * (1 + accessFactor * 0.5) * sensitiveMultiplier;
}

/**
 * Calculate path width based on frequency
 */
export function calculatePathWidth(
  frequency: number,
  minWidth: number = 0.05,
  maxWidth: number = 0.3
): number {
  const factor = Math.log10(frequency + 1) / 3;
  return minWidth + factor * (maxWidth - minWidth);
}

// ============================================================================
// Camera Utilities
// ============================================================================

/**
 * Calculate camera position to frame a set of points
 */
export function calculateFramingPosition(
  points: Vector3D[],
  fov: number,
  _aspectRatio: number
): { position: Vector3D; target: Vector3D } {
  const { center, radius } = calculateBoundingSphere(points);
  
  // Calculate distance needed to frame the sphere
  const fovRad = (fov * Math.PI) / 180;
  const distance = radius / Math.sin(fovRad / 2);
  
  // Position camera above and in front
  const position: Vector3D = {
    x: center.x,
    y: center.y + distance * 0.5,
    z: center.z + distance,
  };
  
  return { position, target: center };
}

/**
 * Smooth camera transition parameters
 */
export function calculateCameraTransition(
  currentPos: Vector3D,
  targetPos: Vector3D,
  currentTarget: Vector3D,
  newTarget: Vector3D,
  progress: number // 0-1
): { position: Vector3D; target: Vector3D } {
  // Use easing function for smooth transition
  const eased = easeInOutCubic(progress);
  
  return {
    position: lerp(currentPos, targetPos, eased),
    target: lerp(currentTarget, newTarget, eased),
  };
}

/**
 * Cubic ease in/out
 */
function easeInOutCubic(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
