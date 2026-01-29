/**
 * Detector Loader - Lazy loading of detectors
 *
 * Loads detectors on demand to minimize startup time.
 * Supports dynamic import of detector modules and batch loading.
 *
 * @requirements 6.7 - THE Detector_System SHALL support lazy loading of detectors
 */

import { DetectorRegistry, DetectorRegistrationError } from './detector-registry.js';

import type { DetectorInfo, DetectorRegistrationOptions } from './types.js';
import type { BaseDetector } from '../base/base-detector.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Detector module definition for lazy loading
 */
export interface DetectorModule {
  /** Unique detector ID */
  id: string;

  /** Detector metadata for querying before instantiation */
  info: DetectorInfo;

  /** Module path for dynamic import */
  modulePath: string;

  /** Export name within the module (default: 'default') */
  exportName?: string;

  /** Registration options */
  options?: DetectorRegistrationOptions;
}

/**
 * Detector loader configuration
 */
export interface DetectorLoaderConfig {
  /** Base path for resolving module paths */
  basePath?: string;

  /** Whether to preload all detectors on initialization */
  preload?: boolean;

  /** Timeout for loading a detector in milliseconds */
  loadTimeout?: number;

  /** Whether to continue loading if one detector fails */
  continueOnError?: boolean;
}

/**
 * Result of loading detectors
 */
export interface LoadResult {
  /** Successfully loaded detector IDs */
  loaded: string[];

  /** Failed detector IDs with error messages */
  failed: Array<{ id: string; error: string }>;

  /** Total time taken in milliseconds */
  duration: number;
}

/**
 * Detector load status
 */
export type LoadStatus = 'pending' | 'loading' | 'loaded' | 'failed';

/**
 * Internal tracking of detector load state
 */
interface DetectorLoadState {
  module: DetectorModule;
  status: LoadStatus;
  error: Error | undefined;
  loadPromise: Promise<BaseDetector> | undefined;
}

// ============================================================================
// Detector Loader Class
// ============================================================================

/**
 * Lazy loader for detectors
 *
 * Manages lazy loading of detectors to minimize startup time.
 * Detectors are only instantiated when first accessed.
 *
 * @requirements 6.7 - THE Detector_System SHALL support lazy loading of detectors
 *
 * @example
 * ```typescript
 * const loader = new DetectorLoader(registry);
 *
 * // Register detector modules for lazy loading
 * loader.registerModule({
 *   id: 'structural/file-naming',
 *   info: { ... },
 *   modulePath: './structural/file-naming.js',
 * });
 *
 * // Load a specific detector
 * const detector = await loader.load('structural/file-naming');
 *
 * // Load all registered detectors
 * const result = await loader.loadAll();
 * ```
 */
export class DetectorLoader {
  /** Registry to register loaded detectors with */
  private readonly registry: DetectorRegistry;

  /** Configuration */
  private readonly config: Required<DetectorLoaderConfig>;

  /** Registered detector modules */
  private readonly modules: Map<string, DetectorLoadState> = new Map();

  /**
   * Create a new detector loader
   *
   * @param registry - Registry to register loaded detectors with
   * @param config - Loader configuration
   */
  constructor(registry: DetectorRegistry, config: DetectorLoaderConfig = {}) {
    this.registry = registry;
    this.config = {
      basePath: config.basePath ?? '',
      preload: config.preload ?? false,
      loadTimeout: config.loadTimeout ?? 30000,
      continueOnError: config.continueOnError ?? true,
    };
  }

  // ============================================================================
  // Module Registration
  // ============================================================================

  /**
   * Register a detector module for lazy loading
   *
   * @param module - Detector module definition
   */
  registerModule(module: DetectorModule): void {
    if (this.modules.has(module.id)) {
      throw new DetectorRegistrationError(
        `Detector module '${module.id}' is already registered`,
        module.id
      );
    }

    this.modules.set(module.id, {
      module,
      status: 'pending',
      error: undefined,
      loadPromise: undefined,
    });

    // Register factory with registry for lazy loading
    this.registry.registerFactory(
      module.id,
      () => this.loadDetector(module),
      module.info,
      module.options
    );
  }

  /**
   * Register multiple detector modules
   *
   * @param modules - Array of detector module definitions
   */
  registerModules(modules: DetectorModule[]): void {
    for (const module of modules) {
      this.registerModule(module);
    }
  }

  /**
   * Unregister a detector module
   *
   * @param id - Detector ID to unregister
   * @returns true if the module was unregistered
   */
  unregisterModule(id: string): boolean {
    const state = this.modules.get(id);
    if (!state) {
      return false;
    }

    this.modules.delete(id);
    this.registry.unregister(id);
    return true;
  }

  // ============================================================================
  // Loading Methods
  // ============================================================================

  /**
   * Load a specific detector by ID
   *
   * @param id - Detector ID to load
   * @returns Loaded detector instance
   * @throws DetectorRegistrationError if loading fails
   */
  async load(id: string): Promise<BaseDetector> {
    const state = this.modules.get(id);
    if (!state) {
      throw new DetectorRegistrationError(`Detector module '${id}' is not registered`, id);
    }

    // If already loading, wait for the existing promise
    if (state.status === 'loading' && state.loadPromise) {
      return state.loadPromise;
    }

    // If already loaded, get from registry
    if (state.status === 'loaded') {
      const detector = await this.registry.get(id);
      if (detector) {
        return detector;
      }
    }

    // If previously failed, try again
    if (state.status === 'failed') {
      state.status = 'pending';
      state.error = undefined;
    }

    // Start loading
    state.status = 'loading';
    state.loadPromise = this.loadDetector(state.module);

    try {
      const detector = await state.loadPromise;
      state.status = 'loaded';
      return detector;
    } catch (error) {
      state.status = 'failed';
      state.error = error instanceof Error ? error : new Error(String(error));
      throw error;
    } finally {
      state.loadPromise = undefined;
    }
  }

  /**
   * Load all registered detector modules
   *
   * @returns Load result with success/failure information
   */
  async loadAll(): Promise<LoadResult> {
    const startTime = Date.now();
    const loaded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    const loadPromises = Array.from(this.modules.keys()).map(async (id) => {
      try {
        await this.load(id);
        loaded.push(id);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        failed.push({ id, error: errorMessage });

        if (!this.config.continueOnError) {
          throw error;
        }
      }
    });

    await Promise.all(loadPromises);

    return {
      loaded,
      failed,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Load detectors matching a filter
   *
   * @param filter - Filter function to select which detectors to load
   * @returns Load result
   */
  async loadFiltered(filter: (module: DetectorModule) => boolean): Promise<LoadResult> {
    const startTime = Date.now();
    const loaded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    const modulesToLoad = Array.from(this.modules.values())
      .filter((state) => filter(state.module))
      .map((state) => state.module.id);

    const loadPromises = modulesToLoad.map(async (id) => {
      try {
        await this.load(id);
        loaded.push(id);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        failed.push({ id, error: errorMessage });

        if (!this.config.continueOnError) {
          throw error;
        }
      }
    });

    await Promise.all(loadPromises);

    return {
      loaded,
      failed,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Load detectors by category
   *
   * @param category - Category to load
   * @returns Load result
   */
  async loadByCategory(category: string): Promise<LoadResult> {
    return this.loadFiltered((module) => module.info.category === category);
  }

  /**
   * Load detectors by language
   *
   * @param language - Language to load detectors for
   * @returns Load result
   */
  async loadByLanguage(language: string): Promise<LoadResult> {
    return this.loadFiltered((module) =>
      module.info.supportedLanguages.includes(language as never)
    );
  }

  // ============================================================================
  // Status Methods
  // ============================================================================

  /**
   * Get the load status of a detector
   *
   * @param id - Detector ID
   * @returns Load status or undefined if not registered
   */
  getStatus(id: string): LoadStatus | undefined {
    return this.modules.get(id)?.status;
  }

  /**
   * Get all registered module IDs
   *
   * @returns Array of detector IDs
   */
  getModuleIds(): string[] {
    return Array.from(this.modules.keys());
  }

  /**
   * Get all registered modules
   *
   * @returns Array of detector modules
   */
  getModules(): DetectorModule[] {
    return Array.from(this.modules.values()).map((state) => state.module);
  }

  /**
   * Check if a module is registered
   *
   * @param id - Detector ID
   * @returns true if the module is registered
   */
  hasModule(id: string): boolean {
    return this.modules.has(id);
  }

  /**
   * Get the count of registered modules
   */
  get size(): number {
    return this.modules.size;
  }

  /**
   * Get statistics about loaded detectors
   */
  getStats(): { pending: number; loading: number; loaded: number; failed: number } {
    let pending = 0;
    let loading = 0;
    let loaded = 0;
    let failed = 0;

    for (const state of this.modules.values()) {
      switch (state.status) {
        case 'pending':
          pending++;
          break;
        case 'loading':
          loading++;
          break;
        case 'loaded':
          loaded++;
          break;
        case 'failed':
          failed++;
          break;
      }
    }

    return { pending, loading, loaded, failed };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Load a detector from its module definition
   *
   * @param module - Detector module definition
   * @returns Loaded detector instance
   */
  private async loadDetector(module: DetectorModule): Promise<BaseDetector> {
    const modulePath = this.resolvePath(module.modulePath);
    const exportName = module.exportName ?? 'default';

    try {
      // Create a timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Timeout loading detector '${module.id}' after ${this.config.loadTimeout}ms`));
        }, this.config.loadTimeout);
      });

      // Race between import and timeout
      const importedModule = await Promise.race([
        import(modulePath),
        timeoutPromise,
      ]);

      // Get the detector class/factory from the module
      const DetectorClass = importedModule[exportName];

      if (!DetectorClass) {
        throw new Error(
          `Export '${exportName}' not found in module '${modulePath}'`
        );
      }

      // Instantiate the detector
      let detector: BaseDetector;

      if (typeof DetectorClass === 'function') {
        // Check if it's a class (has prototype) or a factory function
        if (DetectorClass.prototype && DetectorClass.prototype.constructor === DetectorClass) {
          // It's a class, instantiate it
          detector = new DetectorClass();
        } else {
          // It's a factory function, call it
          const result = DetectorClass();
          detector = result instanceof Promise ? await result : result;
        }
      } else if (typeof DetectorClass === 'object' && DetectorClass !== null) {
        // It's already an instance
        detector = DetectorClass as BaseDetector;
      } else {
        throw new Error(
          `Invalid export '${exportName}' in module '${modulePath}': expected class, factory, or instance`
        );
      }

      return detector;
    } catch (error) {
      throw new DetectorRegistrationError(
        `Failed to load detector '${module.id}' from '${modulePath}': ${
          error instanceof Error ? error.message : String(error)
        }`,
        module.id,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Resolve a module path relative to the base path
   *
   * @param modulePath - Module path to resolve
   * @returns Resolved path
   */
  private resolvePath(modulePath: string): string {
    if (this.config.basePath && !modulePath.startsWith('/') && !modulePath.startsWith('.')) {
      return `${this.config.basePath}/${modulePath}`;
    }
    return modulePath;
  }

  /**
   * Clear all registered modules
   */
  clear(): void {
    for (const id of this.modules.keys()) {
      this.registry.unregister(id);
    }
    this.modules.clear();
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a detector module definition
 *
 * Helper function for creating detector module definitions.
 *
 * @param id - Detector ID
 * @param info - Detector info
 * @param modulePath - Module path
 * @param options - Additional options
 * @returns Detector module definition
 */
export function createDetectorModule(
  id: string,
  info: Omit<DetectorInfo, 'id'>,
  modulePath: string,
  options?: { exportName?: string; registrationOptions?: DetectorRegistrationOptions }
): DetectorModule {
  const result: DetectorModule = {
    id,
    info: { ...info, id },
    modulePath,
  };

  if (options?.exportName !== undefined) {
    result.exportName = options.exportName;
  }

  if (options?.registrationOptions !== undefined) {
    result.options = options.registrationOptions;
  }

  return result;
}

/**
 * Create a detector loader with default registry
 *
 * @param config - Loader configuration
 * @returns Detector loader instance
 */
export function createLoader(
  registry: DetectorRegistry,
  config?: DetectorLoaderConfig
): DetectorLoader {
  return new DetectorLoader(registry, config);
}
