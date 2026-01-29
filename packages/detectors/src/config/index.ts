/**
 * Config detectors module exports
 *
 * Detects configuration patterns including:
 * - Environment variable naming
 * - Required vs optional config
 * - Default values
 * - Feature flags
 * - Config validation
 * - Environment detection
 *
 * @requirements 17 - Configuration pattern detection
 */

import { createConfigValidationDetector } from './config-validation.js';
import { createDefaultValuesDetector } from './default-values.js';
import { createEnvNamingDetector } from './env-naming.js';
import { createEnvironmentDetectionDetector } from './environment-detection.js';
import { createFeatureFlagsDetector } from './feature-flags.js';
import { createRequiredOptionalDetector } from './required-optional.js';

// Env Naming
export {
  EnvNamingDetector,
  createEnvNamingDetector,
  analyzeEnvNaming,
  shouldExcludeFile as shouldExcludeEnvNamingFile,
} from './env-naming.js';
export type {
  EnvNamingPatternType,
  EnvNamingViolationType,
  EnvNamingPatternInfo,
  EnvNamingViolationInfo,
  EnvNamingAnalysis,
} from './env-naming.js';

// Required Optional
export {
  RequiredOptionalDetector,
  createRequiredOptionalDetector,
  analyzeRequiredOptional,
  shouldExcludeFile as shouldExcludeRequiredOptionalFile,
} from './required-optional.js';
export type {
  RequiredOptionalPatternType,
  RequiredOptionalViolationType,
  RequiredOptionalPatternInfo,
  RequiredOptionalViolationInfo,
  RequiredOptionalAnalysis,
} from './required-optional.js';

// Default Values
export {
  DefaultValuesDetector,
  createDefaultValuesDetector,
  analyzeDefaultValues,
  shouldExcludeFile as shouldExcludeDefaultValuesFile,
} from './default-values.js';
export type {
  DefaultValuePatternType,
  DefaultValueViolationType,
  DefaultValuePatternInfo,
  DefaultValueViolationInfo,
  DefaultValueAnalysis,
} from './default-values.js';

// Feature Flags
export {
  FeatureFlagsDetector,
  createFeatureFlagsDetector,
  analyzeFeatureFlags,
  shouldExcludeFile as shouldExcludeFeatureFlagsFile,
} from './feature-flags.js';
export type {
  FeatureFlagPatternType,
  FeatureFlagViolationType,
  FeatureFlagPatternInfo,
  FeatureFlagViolationInfo,
  FeatureFlagAnalysis,
} from './feature-flags.js';

// Config Validation
export {
  ConfigValidationDetector,
  createConfigValidationDetector,
  analyzeConfigValidation,
  shouldExcludeFile as shouldExcludeConfigValidationFile,
} from './config-validation.js';
export type {
  ConfigValidationPatternType,
  ConfigValidationViolationType,
  ConfigValidationPatternInfo,
  ConfigValidationViolationInfo,
  ConfigValidationAnalysis,
} from './config-validation.js';

// Environment Detection
export {
  EnvironmentDetectionDetector,
  createEnvironmentDetectionDetector,
  analyzeEnvironmentDetection,
  shouldExcludeFile as shouldExcludeEnvironmentDetectionFile,
} from './environment-detection.js';
export type {
  EnvironmentDetectionPatternType,
  EnvironmentDetectionViolationType,
  EnvironmentDetectionPatternInfo,
  EnvironmentDetectionViolationInfo,
  EnvironmentDetectionAnalysis,
} from './environment-detection.js';

// Factory function to create all config detectors
export function createConfigDetectors() {
  return [
    createEnvNamingDetector(),
    createRequiredOptionalDetector(),
    createDefaultValuesDetector(),
    createFeatureFlagsDetector(),
    createConfigValidationDetector(),
    createEnvironmentDetectionDetector(),
  ];
}

// ============================================================================
// Learning-Based Detectors
// ============================================================================

// Feature Flags Learning Detector
export {
  FeatureFlagsLearningDetector,
  createFeatureFlagsLearningDetector,
  type FeatureFlagConventions,
} from './feature-flags-learning.js';

// Env Naming Learning Detector
export {
  EnvNamingLearningDetector,
  createEnvNamingLearningDetector,
  type EnvNamingConventions,
} from './env-naming-learning.js';

// Config Validation Learning Detector
export {
  ConfigValidationLearningDetector,
  createConfigValidationLearningDetector,
  type ConfigValidationConventions,
  type ValidationLibrary,
} from './config-validation-learning.js';

// Default Values Learning Detector
export {
  DefaultValuesLearningDetector,
  createDefaultValuesLearningDetector,
  type DefaultValuesConventions,
  type DefaultValueStyle,
} from './default-values-learning.js';

// Environment Detection Learning Detector
export {
  EnvironmentDetectionLearningDetector,
  createEnvironmentDetectionLearningDetector,
  type EnvironmentDetectionConventions,
  type EnvAccessMethod,
  type EnvCheckStyle,
} from './environment-detection-learning.js';

// Required/Optional Learning Detector
export {
  RequiredOptionalLearningDetector,
  createRequiredOptionalLearningDetector,
  type RequiredOptionalConventions,
  type RequiredMarking,
} from './required-optional-learning.js';

// ============================================================================
// Semantic Detectors (Language-Agnostic)
// ============================================================================

export {
  EnvConfigSemanticDetector,
  createEnvConfigSemanticDetector,
} from './env-config-semantic.js';

export {
  FeatureFlagsSemanticDetector,
  createFeatureFlagsSemanticDetector,
} from './feature-flags-semantic.js';

export {
  RequiredOptionalSemanticDetector,
  createRequiredOptionalSemanticDetector,
} from './required-optional-semantic.js';

export {
  DefaultValuesSemanticDetector,
  createDefaultValuesSemanticDetector,
} from './default-values-semantic.js';

export {
  ConfigValidationSemanticDetector,
  createConfigValidationSemanticDetector,
} from './config-validation-semantic.js';

export {
  EnvironmentDetectionSemanticDetector,
  createEnvironmentDetectionSemanticDetector,
} from './environment-detection-semantic.js';

// ============================================================================
// ASP.NET Core Detectors (C#)
// ============================================================================

export * from './aspnet/index.js';

// ============================================================================
// Constants Pattern Detector
// ============================================================================

export {
  ConstantsDetector,
  createConstantsDetector,
} from './constants-detector.js';
