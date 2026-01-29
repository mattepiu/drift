/**
 * Detector Registry - Detector registration and management
 *
 * Registers detectors by ID, validates interface compliance,
 * and prevents duplicate registration.
 *
 * @requirements 6.2 - THE Detector_System SHALL provide a registry for detector discovery and management
 */

import { BaseDetector, isBaseDetector, type DetectorFactory } from '../base/base-detector.js';

import type {
  DetectorInfo,
  DetectorQuery,
  DetectorQueryResult,
  DetectorRegistrationOptions,
  RegisteredDetector,
} from './types.js';


// ============================================================================
// Error Types
// ============================================================================

/**
 * Error thrown when detector registration fails
 */
export class DetectorRegistrationError extends Error {
  public readonly detectorId: string;
  public readonly errorCause: Error | undefined;

  constructor(message: string, detectorId: string, cause?: Error) {
    super(message);
    this.name = 'DetectorRegistrationError';
    this.detectorId = detectorId;
    this.errorCause = cause;
  }
}

/**
 * Error thrown when a detector is not found
 */
export class DetectorNotFoundError extends Error {
  constructor(public readonly detectorId: string) {
    super(`Detector not found: ${detectorId}`);
    this.name = 'DetectorNotFoundError';
  }
}

// ============================================================================
// Registry Events
// ============================================================================

/**
 * Event types emitted by the registry
 */
export type RegistryEventType = 'registered' | 'unregistered' | 'enabled' | 'disabled';

/**
 * Event data for registry events
 */
export interface RegistryEvent {
  type: RegistryEventType;
  detectorId: string;
  detector?: RegisteredDetector;
}

/**
 * Event listener callback type
 */
export type RegistryEventListener = (event: RegistryEvent) => void;

// ============================================================================
// Detector Registry Class
// ============================================================================

/**
 * Registry for managing detectors
 *
 * Provides methods for registering, querying, and managing detectors.
 * Ensures detector IDs are unique and validates interface compliance.
 *
 * @requirements 6.2 - THE Detector_System SHALL provide a registry for detector discovery and management
 *
 * @example
 * ```typescript
 * const registry = new DetectorRegistry();
 *
 * // Register a detector
 * registry.register(new FileNamingDetector());
 *
 * // Query detectors
 * const structuralDetectors = registry.query({ category: 'structural' });
 *
 * // Get a specific detector
 * const detector = registry.get('structural/file-naming');
 * ```
 */
export class DetectorRegistry {
  /** Map of detector ID to registered detector */
  private readonly detectors: Map<string, RegisteredDetector> = new Map();

  /** Map of detector ID to detector instance */
  private readonly instances: Map<string, BaseDetector> = new Map();

  /** Map of detector ID to factory function (for lazy loading) */
  private readonly factories: Map<string, DetectorFactory> = new Map();

  /** Event listeners */
  private readonly listeners: Set<RegistryEventListener> = new Set();

  // ============================================================================
  // Registration Methods
  // ============================================================================

  /**
   * Register a detector instance
   *
   * @param detector - Detector instance to register
   * @param options - Registration options
   * @throws DetectorRegistrationError if registration fails
   *
   * @requirements 6.2 - Registry for detector discovery and management
   */
  register(detector: BaseDetector, options: DetectorRegistrationOptions = {}): void {
    // Validate the detector
    this.validateDetector(detector);

    const id = detector.id;

    // Check for duplicate registration
    if (this.detectors.has(id) && !options.override) {
      throw new DetectorRegistrationError(
        `Detector with ID '${id}' is already registered. Use override option to replace.`,
        id
      );
    }

    // Create registered detector entry
    const registered: RegisteredDetector = {
      info: detector.getInfo(),
      priority: options.priority ?? 0,
      enabled: options.enabled ?? true,
      registeredAt: new Date(),
    };

    // Store the detector
    this.detectors.set(id, registered);
    this.instances.set(id, detector);

    // Remove any factory for this ID (instance takes precedence)
    this.factories.delete(id);

    // Call onRegister lifecycle hook if defined
    if (detector.onRegister) {
      try {
        detector.onRegister();
      } catch (error) {
        // Log but don't fail registration
        console.warn(`onRegister hook failed for detector '${id}':`, error);
      }
    }

    // Emit event
    this.emit({ type: 'registered', detectorId: id, detector: registered });
  }

  /**
   * Register a detector factory for lazy loading
   *
   * The factory will be called when the detector is first accessed.
   *
   * @param id - Detector ID
   * @param factory - Factory function that creates the detector
   * @param info - Detector info (required for querying before instantiation)
   * @param options - Registration options
   * @throws DetectorRegistrationError if registration fails
   */
  registerFactory(
    id: string,
    factory: DetectorFactory,
    info: DetectorInfo,
    options: DetectorRegistrationOptions = {}
  ): void {
    // Validate ID format
    this.validateDetectorId(id);

    // Check for duplicate registration
    if (this.detectors.has(id) && !options.override) {
      throw new DetectorRegistrationError(
        `Detector with ID '${id}' is already registered. Use override option to replace.`,
        id
      );
    }

    // Create registered detector entry
    const registered: RegisteredDetector = {
      info,
      priority: options.priority ?? 0,
      enabled: options.enabled ?? true,
      registeredAt: new Date(),
    };

    // Store the factory and info
    this.detectors.set(id, registered);
    this.factories.set(id, factory);

    // Remove any existing instance (factory takes precedence until accessed)
    this.instances.delete(id);

    // Emit event
    this.emit({ type: 'registered', detectorId: id, detector: registered });
  }

  /**
   * Unregister a detector
   *
   * @param id - Detector ID to unregister
   * @returns true if the detector was unregistered, false if not found
   */
  unregister(id: string): boolean {
    const registered = this.detectors.get(id);
    if (!registered) {
      return false;
    }

    // Call onUnload lifecycle hook if defined
    const instance = this.instances.get(id);
    if (instance?.onUnload) {
      try {
        instance.onUnload();
      } catch (error) {
        console.warn(`onUnload hook failed for detector '${id}':`, error);
      }
    }

    // Remove from all maps
    this.detectors.delete(id);
    this.instances.delete(id);
    this.factories.delete(id);

    // Emit event
    this.emit({ type: 'unregistered', detectorId: id });

    return true;
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  /**
   * Get a detector by ID
   *
   * If the detector was registered with a factory, the factory will be
   * called to create the instance on first access.
   *
   * @param id - Detector ID
   * @returns Detector instance or undefined if not found
   */
  async get(id: string): Promise<BaseDetector | undefined> {
    // Check if we have an instance
    let instance = this.instances.get(id);
    if (instance) {
      return instance;
    }

    // Check if we have a factory
    const factory = this.factories.get(id);
    if (factory) {
      try {
        instance = await factory();
        this.validateDetector(instance);
        this.instances.set(id, instance);
        this.factories.delete(id);

        // Call onRegister lifecycle hook
        if (instance.onRegister) {
          instance.onRegister();
        }

        return instance;
      } catch (error) {
        throw new DetectorRegistrationError(
          `Failed to instantiate detector '${id}' from factory`,
          id,
          error instanceof Error ? error : new Error(String(error))
        );
      }
    }

    return undefined;
  }

  /**
   * Get a detector by ID synchronously
   *
   * Only returns detectors that have already been instantiated.
   * Use get() for lazy-loaded detectors.
   *
   * @param id - Detector ID
   * @returns Detector instance or undefined if not found or not instantiated
   */
  getSync(id: string): BaseDetector | undefined {
    return this.instances.get(id);
  }

  /**
   * Get detector info by ID
   *
   * @param id - Detector ID
   * @returns Registered detector info or undefined if not found
   */
  getInfo(id: string): RegisteredDetector | undefined {
    return this.detectors.get(id);
  }

  /**
   * Check if a detector is registered
   *
   * @param id - Detector ID
   * @returns true if the detector is registered
   */
  has(id: string): boolean {
    return this.detectors.has(id);
  }

  /**
   * Query detectors by criteria
   *
   * @param query - Query criteria
   * @returns Query result with matching detectors
   */
  query(query: DetectorQuery = {}): DetectorQueryResult {
    const results: RegisteredDetector[] = [];

    for (const registered of this.detectors.values()) {
      if (this.matchesQuery(registered, query)) {
        results.push(registered);
      }
    }

    // Sort by priority (higher first)
    results.sort((a, b) => b.priority - a.priority);

    return {
      detectors: results,
      count: results.length,
    };
  }

  /**
   * Get all registered detector IDs
   *
   * @returns Array of detector IDs
   */
  getIds(): string[] {
    return Array.from(this.detectors.keys());
  }

  /**
   * Get all registered detectors
   *
   * @returns Array of registered detector entries
   */
  getAll(): RegisteredDetector[] {
    return Array.from(this.detectors.values());
  }

  /**
   * Get the count of registered detectors
   *
   * @returns Number of registered detectors
   */
  get size(): number {
    return this.detectors.size;
  }

  // ============================================================================
  // Enable/Disable Methods
  // ============================================================================

  /**
   * Enable a detector
   *
   * @param id - Detector ID
   * @returns true if the detector was enabled, false if not found
   */
  enable(id: string): boolean {
    const registered = this.detectors.get(id);
    if (!registered) {
      return false;
    }

    if (!registered.enabled) {
      registered.enabled = true;
      this.emit({ type: 'enabled', detectorId: id, detector: registered });
    }

    return true;
  }

  /**
   * Disable a detector
   *
   * @param id - Detector ID
   * @returns true if the detector was disabled, false if not found
   */
  disable(id: string): boolean {
    const registered = this.detectors.get(id);
    if (!registered) {
      return false;
    }

    if (registered.enabled) {
      registered.enabled = false;
      this.emit({ type: 'disabled', detectorId: id, detector: registered });
    }

    return true;
  }

  /**
   * Check if a detector is enabled
   *
   * @param id - Detector ID
   * @returns true if enabled, false if disabled or not found
   */
  isEnabled(id: string): boolean {
    return this.detectors.get(id)?.enabled ?? false;
  }

  // ============================================================================
  // Event Methods
  // ============================================================================

  /**
   * Add an event listener
   *
   * @param listener - Event listener callback
   */
  addEventListener(listener: RegistryEventListener): void {
    this.listeners.add(listener);
  }

  /**
   * Remove an event listener
   *
   * @param listener - Event listener callback
   */
  removeEventListener(listener: RegistryEventListener): void {
    this.listeners.delete(listener);
  }

  /**
   * Clear all event listeners
   */
  clearEventListeners(): void {
    this.listeners.clear();
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Clear all registered detectors
   *
   * Calls onUnload for all instantiated detectors.
   */
  clear(): void {
    // Call onUnload for all instances
    for (const [id, instance] of this.instances) {
      if (instance.onUnload) {
        try {
          instance.onUnload();
        } catch (error) {
          console.warn(`onUnload hook failed for detector '${id}':`, error);
        }
      }
    }

    this.detectors.clear();
    this.instances.clear();
    this.factories.clear();
  }

  /**
   * Notify all detectors of a file change
   *
   * @param file - Path to the changed file
   */
  notifyFileChange(file: string): void {
    for (const instance of this.instances.values()) {
      if (instance.onFileChange) {
        try {
          instance.onFileChange(file);
        } catch (error) {
          console.warn(`onFileChange hook failed for detector '${instance.id}':`, error);
        }
      }
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Validate a detector instance
   *
   * @param detector - Detector to validate
   * @throws DetectorRegistrationError if validation fails
   */
  private validateDetector(detector: unknown): asserts detector is BaseDetector {
    if (!isBaseDetector(detector)) {
      throw new DetectorRegistrationError(
        'Invalid detector: must implement BaseDetector interface',
        (detector as { id?: string })?.id ?? 'unknown'
      );
    }

    this.validateDetectorId((detector).id);
  }

  /**
   * Validate a detector ID format
   *
   * @param id - Detector ID to validate
   * @throws DetectorRegistrationError if ID is invalid
   */
  private validateDetectorId(id: string): void {
    if (!id || typeof id !== 'string') {
      throw new DetectorRegistrationError('Detector ID must be a non-empty string', id ?? 'unknown');
    }

    // ID should follow format: category/name or category/subcategory/name
    const idPattern = /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*(\/[a-z][a-z0-9-]*)?$/;
    if (!idPattern.test(id)) {
      throw new DetectorRegistrationError(
        `Invalid detector ID format: '${id}'. Expected format: category/name (e.g., 'structural/file-naming')`,
        id
      );
    }
  }

  /**
   * Check if a registered detector matches a query
   *
   * @param registered - Registered detector to check
   * @param query - Query criteria
   * @returns true if the detector matches all criteria
   */
  private matchesQuery(registered: RegisteredDetector, query: DetectorQuery): boolean {
    const { info } = registered;

    // Filter by category
    if (query.category !== undefined && info.category !== query.category) {
      return false;
    }

    // Filter by subcategory
    if (query.subcategory !== undefined && info.subcategory !== query.subcategory) {
      return false;
    }

    // Filter by language
    if (query.language !== undefined && !info.supportedLanguages.includes(query.language)) {
      return false;
    }

    // Filter by detection method
    if (query.detectionMethod !== undefined && info.detectionMethod !== query.detectionMethod) {
      return false;
    }

    // Filter by enabled status
    if (query.enabled !== undefined && registered.enabled !== query.enabled) {
      return false;
    }

    // Filter by ID pattern
    if (query.idPattern !== undefined) {
      const pattern =
        typeof query.idPattern === 'string' ? new RegExp(query.idPattern) : query.idPattern;
      if (!pattern.test(info.id)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Emit an event to all listeners
   *
   * @param event - Event to emit
   */
  private emit(event: RegistryEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.warn('Registry event listener error:', error);
      }
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Default global detector registry instance
 *
 * Use this for application-wide detector registration.
 */
export const defaultRegistry = new DetectorRegistry();

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Register a detector with the default registry
 *
 * @param detector - Detector to register
 * @param options - Registration options
 */
export function registerDetector(
  detector: BaseDetector,
  options?: DetectorRegistrationOptions
): void {
  defaultRegistry.register(detector, options);
}

/**
 * Get a detector from the default registry
 *
 * @param id - Detector ID
 * @returns Detector instance or undefined
 */
export async function getDetector(id: string): Promise<BaseDetector | undefined> {
  return defaultRegistry.get(id);
}

/**
 * Query detectors from the default registry
 *
 * @param query - Query criteria
 * @returns Query result
 */
export function queryDetectors(query?: DetectorQuery): DetectorQueryResult {
  return defaultRegistry.query(query);
}
