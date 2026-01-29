/**
 * Pattern Store Adapter
 *
 * Adapts driftdetect-core PatternStore and VariantManager for use in LSP commands.
 * Provides approve, ignore, and variant operations that persist to disk.
 *
 * @requirements 28.1 - drift.approvePattern
 * @requirements 28.2 - drift.ignorePattern
 * @requirements 28.3 - drift.ignoreOnce
 * @requirements 28.4 - drift.createVariant
 */

import {
  PatternStore,
  VariantManager,
  type PatternStoreConfig,
  type VariantManagerConfig,
  type PatternLocation,
  type VariantScope,
} from 'driftdetect-core';

import { DEFAULT_CORE_INTEGRATION_CONFIG, patternToInfo } from './types.js';

import type {
  ApproveResult,
  IgnoreResult,
  CreateVariantResult,
  CreateVariantInput,
  CoreIntegrationConfig,
} from './types.js';
import type { ViolationInfo, PatternInfo } from '../types/lsp-types.js';

/**
 * Logger interface
 */
interface Logger {
  error(message: string): void;
  warn(message: string): void;
  info(message: string): void;
  debug(message: string): void;
}

/**
 * Pattern Store Adapter
 *
 * Provides a simplified interface for LSP commands to interact with
 * the driftdetect-core PatternStore and VariantManager.
 */
export class PatternStoreAdapter {
  private config: CoreIntegrationConfig;
  private logger: Logger;
  private patternStore: PatternStore | null = null;
  private variantManager: VariantManager | null = null;
  private initialized: boolean = false;

  constructor(config: Partial<CoreIntegrationConfig> = {}, logger: Logger) {
    this.config = { ...DEFAULT_CORE_INTEGRATION_CONFIG, ...config };
    this.logger = logger;
  }

  /**
   * Initialize the adapter
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.logger.info('Initializing pattern store adapter...');

    try {
      // Initialize pattern store
      const storeConfig: Partial<PatternStoreConfig> = {
        rootDir: this.config.rootDir,
        validateSchema: this.config.validateSchema,
        trackHistory: this.config.trackHistory,
        autoSave: this.config.autoSave,
      };
      this.patternStore = new PatternStore(storeConfig);
      await this.patternStore.initialize();
      this.logger.info('Pattern store initialized');

      // Initialize variant manager
      const variantConfig: Partial<VariantManagerConfig> = {
        rootDir: this.config.rootDir,
        autoSave: this.config.autoSave,
      };
      this.variantManager = new VariantManager(variantConfig);
      await this.variantManager.initialize();
      this.logger.info('Variant manager initialized');

      this.initialized = true;
      this.logger.info('Pattern store adapter initialization complete');
    } catch (error) {
      this.logger.error(`Failed to initialize pattern store adapter: ${error}`);
      throw error;
    }
  }

  /**
   * Check if the adapter is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the pattern store instance
   */
  getPatternStore(): PatternStore | null {
    return this.patternStore;
  }

  /**
   * Get the variant manager instance
   */
  getVariantManager(): VariantManager | null {
    return this.variantManager;
  }

  /**
   * Approve a pattern
   *
   * Moves the pattern from discovered to approved status and persists the change.
   *
   * @requirements 28.1 - drift.approvePattern
   */
  async approve(patternId: string, approvedBy?: string): Promise<ApproveResult> {
    if (!this.initialized || !this.patternStore) {
      return {
        success: false,
        patternId,
        removedViolations: 0,
        error: 'Pattern store not initialized',
      };
    }

    try {
      this.logger.info(`Approving pattern: ${patternId}`);

      // Check if pattern exists
      const pattern = this.patternStore.get(patternId);
      if (!pattern) {
        return {
          success: false,
          patternId,
          removedViolations: 0,
          error: `Pattern not found: ${patternId}`,
        };
      }

      // Approve the pattern
      this.patternStore.approve(patternId, approvedBy);

      // Save changes
      await this.patternStore.saveAll();

      this.logger.info(`Pattern approved: ${patternId}`);

      return {
        success: true,
        patternId,
        removedViolations: pattern.outliers.length,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to approve pattern ${patternId}: ${errorMessage}`);
      return {
        success: false,
        patternId,
        removedViolations: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Ignore a pattern
   *
   * Moves the pattern to ignored status and persists the change.
   *
   * @requirements 28.2 - drift.ignorePattern
   */
  async ignore(patternId: string): Promise<IgnoreResult> {
    if (!this.initialized || !this.patternStore) {
      return {
        success: false,
        patternId,
        suppressedViolations: 0,
        error: 'Pattern store not initialized',
      };
    }

    try {
      this.logger.info(`Ignoring pattern: ${patternId}`);

      // Check if pattern exists
      const pattern = this.patternStore.get(patternId);
      if (!pattern) {
        return {
          success: false,
          patternId,
          suppressedViolations: 0,
          error: `Pattern not found: ${patternId}`,
        };
      }

      // Ignore the pattern
      this.patternStore.ignore(patternId);

      // Save changes
      await this.patternStore.saveAll();

      this.logger.info(`Pattern ignored: ${patternId}`);

      return {
        success: true,
        patternId,
        suppressedViolations: pattern.outliers.length,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to ignore pattern ${patternId}: ${errorMessage}`);
      return {
        success: false,
        patternId,
        suppressedViolations: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Create a variant for a pattern
   *
   * Creates an intentional deviation from a pattern and persists it.
   *
   * @requirements 28.4 - drift.createVariant
   */
  async createVariant(input: CreateVariantInput): Promise<CreateVariantResult> {
    if (!this.initialized || !this.variantManager) {
      return {
        success: false,
        patternId: input.patternId,
        suppressedViolations: 0,
        error: 'Variant manager not initialized',
      };
    }

    try {
      this.logger.info(`Creating variant for pattern: ${input.patternId}`);

      // Create the location
      const location: PatternLocation = {
        file: input.file,
        line: input.line,
        column: input.column,
      };

      // Build the variant input, conditionally including scopeValue
      const variantInput: import('driftdetect-core').CreateVariantInput = {
        patternId: input.patternId,
        name: input.name,
        reason: input.reason,
        scope: input.scope as VariantScope,
        locations: [location],
      };

      // Only add scopeValue if provided
      if (input.scopeValue) {
        variantInput.scopeValue = input.scopeValue;
      }

      // Create the variant
      const variant = this.variantManager.create(variantInput);

      // Save changes
      await this.variantManager.saveAll();

      this.logger.info(`Variant created: ${variant.id}`);

      return {
        success: true,
        variantId: variant.id,
        patternId: input.patternId,
        suppressedViolations: 1,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to create variant for ${input.patternId}: ${errorMessage}`);
      return {
        success: false,
        patternId: input.patternId,
        suppressedViolations: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Check if a location is covered by a variant
   *
   * Used to filter out violations that are covered by variants.
   */
  isLocationCovered(patternId: string, file: string, line: number, column: number): boolean {
    if (!this.initialized || !this.variantManager) {
      return false;
    }

    const location: PatternLocation = { file, line, column };
    return this.variantManager.isLocationCovered(patternId, location);
  }

  /**
   * Get all patterns
   */
  getAllPatterns(): PatternInfo[] {
    if (!this.initialized || !this.patternStore) {
      return [];
    }

    return this.patternStore.getAll().map(patternToInfo);
  }

  /**
   * Get approved patterns
   */
  getApprovedPatterns(): PatternInfo[] {
    if (!this.initialized || !this.patternStore) {
      return [];
    }

    return this.patternStore.getApproved().map(patternToInfo);
  }

  /**
   * Get discovered patterns
   */
  getDiscoveredPatterns(): PatternInfo[] {
    if (!this.initialized || !this.patternStore) {
      return [];
    }

    return this.patternStore.getDiscovered().map(patternToInfo);
  }

  /**
   * Get ignored patterns
   */
  getIgnoredPatterns(): PatternInfo[] {
    if (!this.initialized || !this.patternStore) {
      return [];
    }

    return this.patternStore.getIgnored().map(patternToInfo);
  }

  /**
   * Get a pattern by ID
   */
  getPattern(patternId: string): PatternInfo | undefined {
    if (!this.initialized || !this.patternStore) {
      return undefined;
    }

    const pattern = this.patternStore.get(patternId);
    return pattern ? patternToInfo(pattern) : undefined;
  }

  /**
   * Filter violations by removing those covered by variants
   */
  filterViolationsByVariants(violations: ViolationInfo[]): ViolationInfo[] {
    if (!this.initialized || !this.variantManager) {
      return violations;
    }

    return violations.filter((violation) => {
      const location: PatternLocation = {
        file: violation.file,
        line: violation.range.start.line + 1, // Convert to 1-indexed
        column: violation.range.start.character + 1,
      };
      return !this.variantManager!.isLocationCovered(violation.patternId, location);
    });
  }

  /**
   * Shutdown the adapter
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down pattern store adapter...');

    // Save pattern store
    if (this.patternStore && this.config.autoSave) {
      try {
        await this.patternStore.saveAll();
      } catch (error) {
        this.logger.error(`Error saving pattern store: ${error}`);
      }
    }

    // Save variant manager
    if (this.variantManager && this.config.autoSave) {
      try {
        await this.variantManager.saveAll();
      } catch (error) {
        this.logger.error(`Error saving variant manager: ${error}`);
      }
    }

    this.initialized = false;
    this.logger.info('Pattern store adapter shutdown complete');
  }
}

/**
 * Create a pattern store adapter instance
 */
export function createPatternStoreAdapter(
  config: Partial<CoreIntegrationConfig> = {},
  logger: Logger
): PatternStoreAdapter {
  return new PatternStoreAdapter(config, logger);
}
