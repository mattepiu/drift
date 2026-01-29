/**
 * Performance Detectors - Performance pattern detection
 *
 * Exports all performance-related detectors for detecting optimization patterns.
 *
 * @requirements 19.1-19.6 - Performance pattern detection
 */

// Code Splitting Detector
export {
  CodeSplittingDetector,
  createCodeSplittingDetector,
  analyzeCodeSplitting,
  shouldExcludeFile as shouldExcludeCodeSplitting,
  detectDynamicImports,
  detectReactLazy,
  detectNextDynamic,
  detectRouteSplitting,
  detectComponentSplitting,
  detectVendorChunk,
  detectWebpackMagicComment,
  detectSuspenseBoundary,
  detectLoadableComponent,
  detectPrefetchHint,
  detectMissingSuspenseViolations,
  detectEagerImportViolations,
  DYNAMIC_IMPORT_PATTERNS,
  REACT_LAZY_PATTERNS,
  NEXT_DYNAMIC_PATTERNS,
  SUSPENSE_BOUNDARY_PATTERNS,
  WEBPACK_MAGIC_COMMENT_PATTERNS,
} from './code-splitting.js';
export type {
  CodeSplittingPatternType,
  CodeSplittingViolationType,
  CodeSplittingPatternInfo,
  CodeSplittingViolationInfo,
  CodeSplittingAnalysis,
} from './code-splitting.js';

// Lazy Loading Detector
export {
  LazyLoadingDetector,
  createLazyLoadingDetector,
  analyzeLazyLoading,
  shouldExcludeFile as shouldExcludeLazyLoading,
  detectImageLazy,
  detectNativeLazy,
  detectIntersectionObserver,
  detectVirtualScroll,
  detectInfiniteScroll,
  detectLazyComponent,
  detectPlaceholderLoading,
  detectSkeletonLoading,
  detectMissingLazyImageViolations,
  IMAGE_LAZY_PATTERNS,
  NATIVE_LAZY_PATTERNS,
  INTERSECTION_OBSERVER_PATTERNS,
  VIRTUAL_SCROLL_PATTERNS,
  INFINITE_SCROLL_PATTERNS,
} from './lazy-loading.js';
export type {
  LazyLoadingPatternType,
  LazyLoadingViolationType,
  LazyLoadingPatternInfo,
  LazyLoadingViolationInfo,
  LazyLoadingAnalysis,
} from './lazy-loading.js';

// Memoization Detector
export {
  MemoizationDetector,
  createMemoizationDetector,
  analyzeMemoization,
  shouldExcludeFile as shouldExcludeMemoization,
  detectReactMemo,
  detectUseMemo,
  detectUseCallback,
  detectReselect,
  detectCustomMemoize,
  detectLodashMemoize,
  detectMemoOne,
  detectEmptyDepsViolations,
  detectInlineObjectDepsViolations,
  REACT_MEMO_PATTERNS,
  USE_MEMO_PATTERNS,
  USE_CALLBACK_PATTERNS,
  RESELECT_PATTERNS,
} from './memoization.js';
export type {
  MemoizationPatternType,
  MemoizationViolationType,
  MemoizationPatternInfo,
  MemoizationViolationInfo,
  MemoizationAnalysis,
} from './memoization.js';

// Caching Patterns Detector
export {
  CachingPatternsDetector,
  createCachingPatternsDetector,
  analyzeCachingPatterns,
  shouldExcludeFile as shouldExcludeCachingPatterns,
  detectHttpCacheControl,
  detectEtag,
  detectServiceWorker,
  detectReactQuery,
  detectSWR,
  detectRedisCache,
  detectMemoryCache,
  detectLocalStorage,
  detectSessionStorage,
  detectIndexedDB,
  HTTP_CACHE_CONTROL_PATTERNS,
  REACT_QUERY_PATTERNS,
  SWR_PATTERNS,
  SERVICE_WORKER_PATTERNS,
} from './caching-patterns.js';
export type {
  CachingPatternType,
  CachingViolationType,
  CachingPatternInfo,
  CachingViolationInfo,
  CachingPatternsAnalysis,
} from './caching-patterns.js';

// Debounce Throttle Detector
export {
  DebounceThrottleDetector,
  createDebounceThrottleDetector,
  analyzeDebounceThrottle,
  shouldExcludeFile as shouldExcludeDebounceThrottle,
  detectLodashDebounce,
  detectLodashThrottle,
  detectCustomDebounce,
  detectCustomThrottle,
  detectUseDebounce,
  detectUseThrottle,
  detectRequestAnimationFrame,
  detectSetTimeoutDebounce,
  detectMissingDebounceViolations,
  LODASH_DEBOUNCE_PATTERNS,
  LODASH_THROTTLE_PATTERNS,
  USE_DEBOUNCE_PATTERNS,
  USE_THROTTLE_PATTERNS,
  REQUEST_ANIMATION_FRAME_PATTERNS,
} from './debounce-throttle.js';
export type {
  DebounceThrottlePatternType,
  DebounceThrottleViolationType,
  DebounceThrottlePatternInfo,
  DebounceThrottleViolationInfo,
  DebounceThrottleAnalysis,
} from './debounce-throttle.js';

// Bundle Size Detector
export {
  BundleSizeDetector,
  createBundleSizeDetector,
  analyzeBundleSize,
  shouldExcludeFile as shouldExcludeBundleSize,
  detectTreeShakeableImport,
  detectNamespaceImport,
  detectSideEffectImport,
  detectDynamicImport,
  detectExternalConfig,
  detectBundleAnalyzer,
  detectSourceMapConfig,
  detectFullLodashImportViolations,
  detectMomentImportViolations,
  detectBarrelImportViolations,
  TREE_SHAKEABLE_IMPORT_PATTERNS,
  NAMESPACE_IMPORT_PATTERNS,
  DYNAMIC_IMPORT_PATTERNS as BUNDLE_DYNAMIC_IMPORT_PATTERNS,
  FULL_LODASH_IMPORT_PATTERNS,
  MOMENT_IMPORT_PATTERNS,
} from './bundle-size.js';
export type {
  BundleSizePatternType,
  BundleSizeViolationType,
  BundleSizePatternInfo,
  BundleSizeViolationInfo,
  BundleSizeAnalysis,
} from './bundle-size.js';

// ============================================================================
// Factory Function
// ============================================================================

import { BundleSizeDetector } from './bundle-size.js';
import { CachingPatternsDetector } from './caching-patterns.js';
import { CodeSplittingDetector } from './code-splitting.js';
import { DebounceThrottleDetector } from './debounce-throttle.js';
import { LazyLoadingDetector } from './lazy-loading.js';
import { MemoizationDetector } from './memoization.js';

export type PerformanceDetector =
  | CodeSplittingDetector
  | LazyLoadingDetector
  | MemoizationDetector
  | CachingPatternsDetector
  | DebounceThrottleDetector
  | BundleSizeDetector;

export function createPerformanceDetectors(): PerformanceDetector[] {
  return [
    new CodeSplittingDetector(),
    new LazyLoadingDetector(),
    new MemoizationDetector(),
    new CachingPatternsDetector(),
    new DebounceThrottleDetector(),
    new BundleSizeDetector(),
  ];
}

// ============================================================================
// Learning-Based Detectors
// ============================================================================

// Lazy Loading Learning Detector
export {
  LazyLoadingLearningDetector,
  createLazyLoadingLearningDetector,
  type LazyLoadingConventions,
  type LazyLoadMethod,
} from './lazy-loading-learning.js';

// Code Splitting Learning Detector
export {
  CodeSplittingLearningDetector,
  createCodeSplittingLearningDetector,
  type CodeSplittingConventions,
  type ChunkNamingStyle,
} from './code-splitting-learning.js';

// Debounce/Throttle Learning Detector
export {
  DebounceThrottleLearningDetector,
  createDebounceThrottleLearningDetector,
  type DebounceThrottleConventions,
  type DebounceThrottleMethod,
} from './debounce-throttle-learning.js';

// Memoization Learning Detector
export {
  MemoizationLearningDetector,
  createMemoizationLearningDetector,
  type MemoizationConventions,
  type MemoizationMethod,
} from './memoization-learning.js';

// Caching Patterns Learning Detector
export {
  CachingPatternsLearningDetector,
  createCachingPatternsLearningDetector,
  type CachingPatternsConventions,
  type CacheLibrary,
  type CacheKeyStyle,
} from './caching-patterns-learning.js';

// Bundle Size Learning Detector
export {
  BundleSizeLearningDetector,
  createBundleSizeLearningDetector,
  type BundleSizeConventions,
  type ImportStyle,
} from './bundle-size-learning.js';

// ============================================================================
// Semantic Detectors (Language-Agnostic)
// ============================================================================

export {
  CodeSplittingSemanticDetector,
  createCodeSplittingSemanticDetector,
} from './code-splitting-semantic.js';

export {
  LazyLoadingSemanticDetector,
  createLazyLoadingSemanticDetector,
} from './lazy-loading-semantic.js';

export {
  MemoizationSemanticDetector,
  createMemoizationSemanticDetector,
} from './memoization-semantic.js';

export {
  CachingPatternsSemanticDetector,
  createCachingPatternsSemanticDetector,
} from './caching-patterns-semantic.js';

export {
  DebounceThrottleSemanticDetector,
  createDebounceThrottleSemanticDetector,
} from './debounce-throttle-semantic.js';

export {
  BundleSizeSemanticDetector,
  createBundleSizeSemanticDetector,
} from './bundle-size-semantic.js';

// ============================================================================
// C# Performance Detectors
// ============================================================================

export * from './aspnet/index.js';
