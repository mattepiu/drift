/**
 * Color Utilities
 * 
 * Color manipulation and mapping functions for galaxy visualization.
 */

import * as THREE from 'three';

import {
  SENSITIVITY_COLORS,
  SENSITIVITY_EMISSIVE,
  SECURITY_TIER_COLORS,
  AUTH_LEVEL_COLORS,
  OPERATION_COLORS,
  CLUSTER_COLORS,
} from '../constants/index.js';

import type { SensitivityLevel, SecurityTier, AuthLevel, DataOperation } from '../types/index.js';

// ============================================================================
// Color Conversion
// ============================================================================

/**
 * Convert hex color to THREE.Color
 */
export function hexToThreeColor(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

/**
 * Convert hex to RGB object
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result?.[1] || !result[2] || !result[3]) {
    return { r: 0, g: 0, b: 0 };
  }
  return {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255,
  };
}

/**
 * Interpolate between two colors
 */
export function lerpColor(color1: string, color2: string, t: number): string {
  const c1 = hexToRgb(color1);
  const c2 = hexToRgb(color2);
  
  const r = Math.round((c1.r + (c2.r - c1.r) * t) * 255);
  const g = Math.round((c1.g + (c2.g - c1.g) * t) * 255);
  const b = Math.round((c1.b + (c2.b - c1.b) * t) * 255);
  
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Brighten a color
 */
export function brightenColor(hex: string, factor: number): string {
  const rgb = hexToRgb(hex);
  const r = Math.min(255, Math.round(rgb.r * 255 * (1 + factor)));
  const g = Math.min(255, Math.round(rgb.g * 255 * (1 + factor)));
  const b = Math.min(255, Math.round(rgb.b * 255 * (1 + factor)));
  
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Darken a color
 */
export function darkenColor(hex: string, factor: number): string {
  const rgb = hexToRgb(hex);
  const r = Math.max(0, Math.round(rgb.r * 255 * (1 - factor)));
  const g = Math.max(0, Math.round(rgb.g * 255 * (1 - factor)));
  const b = Math.max(0, Math.round(rgb.b * 255 * (1 - factor)));
  
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ============================================================================
// Sensitivity Colors
// ============================================================================

/**
 * Get color for sensitivity level
 */
export function getSensitivityColor(level: SensitivityLevel): string {
  return SENSITIVITY_COLORS[level];
}

/**
 * Get THREE.Color for sensitivity level
 */
export function getSensitivityThreeColor(level: SensitivityLevel): THREE.Color {
  return hexToThreeColor(SENSITIVITY_COLORS[level]);
}

/**
 * Get emissive intensity for sensitivity level
 */
export function getSensitivityEmissive(level: SensitivityLevel): number {
  return SENSITIVITY_EMISSIVE[level];
}

/**
 * Get sensitivity level from numeric score (0-100)
 */
export function scoreToSensitivity(score: number): SensitivityLevel {
  if (score >= 90) {return 'critical';}
  if (score >= 70) {return 'high';}
  if (score >= 50) {return 'medium';}
  if (score >= 20) {return 'low';}
  return 'public';
}

// ============================================================================
// Security Colors
// ============================================================================

/**
 * Get color for security tier
 */
export function getSecurityTierColor(tier: SecurityTier): string {
  return SECURITY_TIER_COLORS[tier];
}

/**
 * Get THREE.Color for security tier
 */
export function getSecurityTierThreeColor(tier: SecurityTier): THREE.Color {
  return hexToThreeColor(SECURITY_TIER_COLORS[tier]);
}

// ============================================================================
// Auth Level Colors
// ============================================================================

/**
 * Get color for auth level
 */
export function getAuthLevelColor(level: AuthLevel): string {
  return AUTH_LEVEL_COLORS[level];
}

/**
 * Get THREE.Color for auth level
 */
export function getAuthLevelThreeColor(level: AuthLevel): THREE.Color {
  return hexToThreeColor(AUTH_LEVEL_COLORS[level]);
}

// ============================================================================
// Operation Colors
// ============================================================================

/**
 * Get color for data operation
 */
export function getOperationColor(operation: DataOperation): string {
  return OPERATION_COLORS[operation];
}

/**
 * Get THREE.Color for data operation
 */
export function getOperationThreeColor(operation: DataOperation): THREE.Color {
  return hexToThreeColor(OPERATION_COLORS[operation]);
}

// ============================================================================
// Cluster Colors
// ============================================================================

/**
 * Get color for cluster
 */
export function getClusterColor(cluster: string): string {
  return CLUSTER_COLORS[cluster] ?? CLUSTER_COLORS['other'] ?? '#7f8c8d';
}

/**
 * Get THREE.Color for cluster
 */
export function getClusterThreeColor(cluster: string): THREE.Color {
  return hexToThreeColor(getClusterColor(cluster));
}

// ============================================================================
// Gradient Generation
// ============================================================================

/**
 * Generate a gradient texture for paths
 */
export function createGradientTexture(
  color1: string,
  color2: string,
  width: number = 256
): THREE.DataTexture {
  const data = new Uint8Array(width * 4);
  const c1 = hexToRgb(color1);
  const c2 = hexToRgb(color2);
  
  for (let i = 0; i < width; i++) {
    const t = i / (width - 1);
    const idx = i * 4;
    
    data[idx] = Math.round((c1.r + (c2.r - c1.r) * t) * 255);
    data[idx + 1] = Math.round((c1.g + (c2.g - c1.g) * t) * 255);
    data[idx + 2] = Math.round((c1.b + (c2.b - c1.b) * t) * 255);
    data[idx + 3] = 255;
  }
  
  const texture = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

// ============================================================================
// Pulse Effect Colors
// ============================================================================

/**
 * Calculate pulse color based on time
 */
export function getPulseColor(
  baseColor: string,
  time: number,
  frequency: number = 2,
  intensity: number = 0.3
): string {
  const pulse = (Math.sin(time * frequency * Math.PI * 2) + 1) / 2;
  return brightenColor(baseColor, pulse * intensity);
}

/**
 * Calculate pulse opacity based on time
 */
export function getPulseOpacity(
  baseOpacity: number,
  time: number,
  frequency: number = 2,
  range: number = 0.3
): number {
  const pulse = (Math.sin(time * frequency * Math.PI * 2) + 1) / 2;
  return baseOpacity + pulse * range;
}

// ============================================================================
// Health Score Colors
// ============================================================================

/**
 * Get color for health score (0-100)
 */
export function getHealthScoreColor(score: number): string {
  if (score >= 80) {return '#22c55e';} // Green
  if (score >= 60) {return '#eab308';} // Yellow
  if (score >= 40) {return '#f97316';} // Orange
  return '#ef4444'; // Red
}

/**
 * Get THREE.Color for health score
 */
export function getHealthScoreThreeColor(score: number): THREE.Color {
  return hexToThreeColor(getHealthScoreColor(score));
}
