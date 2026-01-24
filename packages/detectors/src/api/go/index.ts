/**
 * Go API Framework Detectors
 *
 * Exports all Go HTTP framework detectors:
 * - Gin
 * - Echo
 * - Fiber
 * - Chi
 * - net/http (standard library)
 *
 * @requirements Go Language Support - Phase 8
 */

export { GinDetector, createGinDetector } from './gin-detector.js';
export { EchoDetector, createEchoDetector } from './echo-detector.js';
export { FiberDetector, createFiberDetector } from './fiber-detector.js';
export { ChiDetector, createChiDetector } from './chi-detector.js';
export { NetHttpDetector, createNetHttpDetector } from './net-http-detector.js';

// Re-export types
export type { GinRouteInfo, GinGroupInfo } from './gin-detector.js';
export type { EchoRouteInfo, EchoGroupInfo } from './echo-detector.js';
export type { FiberRouteInfo, FiberGroupInfo } from './fiber-detector.js';
export type { ChiRouteInfo, ChiGroupInfo } from './chi-detector.js';
export type { NetHttpRouteInfo, HandlerImplementation } from './net-http-detector.js';
