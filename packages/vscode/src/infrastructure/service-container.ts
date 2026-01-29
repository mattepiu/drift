/**
 * ServiceContainer - Dependency injection container
 * 
 * Single responsibility: Manage service instances and dependencies.
 */

import type { ServiceContainer as IServiceContainer } from '../types/index.js';

/**
 * Service registration options
 */
interface ServiceOptions {
  singleton?: boolean;
}

/**
 * Service factory function type
 */
type ServiceFactory<T> = (container: ServiceContainer) => T;

/**
 * Simple dependency injection container
 */
export class ServiceContainer implements IServiceContainer {
  private readonly instances = new Map<string, unknown>();
  private readonly factories = new Map<string, ServiceFactory<unknown>>();
  private readonly options = new Map<string, ServiceOptions>();

  /**
   * Register a service instance directly
   */
  register(key: string, instance: unknown): void {
    this.instances.set(key, instance);
  }

  /**
   * Register a service factory for lazy instantiation
   */
  registerFactory(
    key: string,
    factory: ServiceFactory<unknown>,
    options: ServiceOptions = { singleton: true }
  ): void {
    this.factories.set(key, factory);
    this.options.set(key, options);
  }

  /**
   * Get a service instance
   */
  get<T>(key: string): T {
    // Check for existing instance
    if (this.instances.has(key)) {
      return this.instances.get(key) as T;
    }

    // Check for factory
    const factory = this.factories.get(key);
    if (!factory) {
      throw new Error(`Service not registered: ${key}`);
    }

    // Create instance
    const instance = factory(this) as T;

    // Cache if singleton
    const opts = this.options.get(key);
    if (opts?.singleton !== false) {
      this.instances.set(key, instance);
    }

    return instance;
  }

  /**
   * Check if a service is registered
   */
  has(key: string): boolean {
    return this.instances.has(key) || this.factories.has(key);
  }

  /**
   * Try to get a service, returning undefined if not found
   */
  tryGet<T>(key: string): T | undefined {
    if (this.has(key)) {
      return this.get<T>(key);
    }
    return undefined;
  }

  /**
   * Clear all registered services
   */
  clear(): void {
    this.instances.clear();
    this.factories.clear();
    this.options.clear();
  }
}

/**
 * Service keys for type-safe access
 */
export const ServiceKeys = {
  Logger: 'logger',
  StateManager: 'stateManager',
  ConfigManager: 'configManager',
  ConnectionManager: 'connectionManager',
  LanguageClient: 'languageClient',
  CommandRouter: 'commandRouter',
  TelemetryService: 'telemetryService',
  StatusBar: 'statusBar',
  DecorationController: 'decorationController',
} as const;

/**
 * Factory function for creating service containers
 */
export function createServiceContainer(): ServiceContainer {
  return new ServiceContainer();
}
