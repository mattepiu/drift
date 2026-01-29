/**
 * Error detectors module exports
 *
 * Detects error handling patterns including:
 * - Exception hierarchy patterns
 * - Error code patterns
 * - Try/catch placement patterns
 * - Error propagation patterns
 * - Async error handling patterns
 * - Circuit breaker patterns
 * - Error logging patterns
 *
 * @requirements 12.1-12.8 - Error handling patterns
 */

// Exception Hierarchy Detector
export {
  type ExceptionPatternType,
  type ExceptionViolationType,
  type ExceptionPatternInfo,
  type ExceptionViolationInfo,
  type ExceptionAnalysis,
  APP_ERROR_PATTERNS,
  CUSTOM_ERROR_PATTERNS,
  ERROR_INHERITANCE_PATTERNS,
  ERROR_FACTORY_PATTERNS,
  RAW_ERROR_PATTERNS,
  shouldExcludeFile as shouldExcludeExceptionFile,
  detectAppErrorClasses,
  detectCustomErrorClasses,
  detectErrorInheritance,
  detectErrorFactories,
  detectRawErrorViolations,
  analyzeExceptionHierarchy,
  ExceptionHierarchyDetector,
  createExceptionHierarchyDetector,
} from './exception-hierarchy.js';

// Error Codes Detector
export {
  type ErrorCodePatternType,
  type ErrorCodeViolationType,
  type ErrorCodePatternInfo,
  type ErrorCodeViolationInfo,
  type ErrorCodeAnalysis,
  ERROR_CODE_ENUM_PATTERNS,
  ERROR_CODE_CONST_PATTERNS,
  ERROR_CODE_USAGE_PATTERNS,
  ERROR_CODE_TYPE_PATTERNS,
  MAGIC_STRING_CODE_PATTERNS,
  shouldExcludeFile as shouldExcludeErrorCodeFile,
  detectErrorCodeEnums,
  detectErrorCodeConstants,
  detectErrorCodeUsage,
  detectMagicStringViolations,
  analyzeErrorCodes,
  ErrorCodesDetector,
  createErrorCodesDetector,
} from './error-codes.js';

// Try-Catch Placement Detector
export {
  type TryCatchPatternType,
  type TryCatchViolationType,
  type TryCatchPatternInfo,
  type TryCatchViolationInfo,
  type TryCatchAnalysis,
  TRY_CATCH_PATTERNS,
  TRY_CATCH_FINALLY_PATTERNS,
  TYPED_CATCH_PATTERNS,
  EMPTY_CATCH_PATTERNS,
  shouldExcludeFile as shouldExcludeTryCatchFile,
  detectTryCatchBlocks,
  detectTryCatchFinally,
  detectTypedCatch,
  detectEmptyCatchViolations,
  analyzeTryCatchPlacement,
  TryCatchPlacementDetector,
  createTryCatchPlacementDetector,
} from './try-catch-placement.js';

// Error Propagation Detector
export {
  type PropagationPatternType,
  type PropagationViolationType,
  type PropagationPatternInfo,
  type PropagationViolationInfo,
  type PropagationAnalysis,
  RETHROW_PATTERNS,
  WRAP_RETHROW_PATTERNS,
  TRANSFORM_PATTERNS,
  CHAIN_PRESERVE_PATTERNS,
  LOST_CONTEXT_PATTERNS,
  shouldExcludeFile as shouldExcludePropagationFile,
  detectRethrowPatterns,
  detectWrapRethrowPatterns,
  detectTransformPatterns,
  detectChainPreservePatterns,
  detectLostContextViolations,
  analyzeErrorPropagation,
  ErrorPropagationDetector,
  createErrorPropagationDetector,
} from './error-propagation.js';

// Async Errors Detector
export {
  type AsyncErrorPatternType,
  type AsyncErrorViolationType,
  type AsyncErrorPatternInfo,
  type AsyncErrorViolationInfo,
  type AsyncErrorAnalysis,
  ASYNC_TRY_CATCH_PATTERNS,
  PROMISE_CATCH_PATTERNS,
  PROMISE_FINALLY_PATTERNS,
  ERROR_BOUNDARY_PATTERNS,
  shouldExcludeFile as shouldExcludeAsyncErrorFile,
  detectAsyncTryCatch,
  detectPromiseCatch,
  detectPromiseFinally,
  detectErrorBoundaries,
  analyzeAsyncErrors,
  AsyncErrorsDetector,
  createAsyncErrorsDetector,
} from './async-errors.js';

// Circuit Breaker Detector
export {
  type CircuitBreakerPatternType,
  type CircuitBreakerPatternInfo,
  type CircuitBreakerAnalysis,
  CIRCUIT_BREAKER_CLASS_PATTERNS,
  CIRCUIT_BREAKER_LIB_PATTERNS,
  STATE_MANAGEMENT_PATTERNS,
  FAILURE_THRESHOLD_PATTERNS,
  RESET_TIMEOUT_PATTERNS,
  shouldExcludeFile as shouldExcludeCircuitBreakerFile,
  detectCircuitBreakerClasses,
  detectCircuitBreakerLibs,
  detectStateManagement,
  detectFailureThreshold,
  detectResetTimeout,
  analyzeCircuitBreaker,
  CircuitBreakerDetector,
  createCircuitBreakerDetector,
} from './circuit-breaker.js';

// Error Logging Detector
export {
  type ErrorLoggingPatternType,
  type ErrorLoggingViolationType,
  type ErrorLoggingPatternInfo,
  type ErrorLoggingViolationInfo,
  type ErrorLoggingAnalysis,
  LOGGER_ERROR_PATTERNS,
  STRUCTURED_LOG_PATTERNS,
  CONTEXT_LOG_PATTERNS,
  STACK_TRACE_PATTERNS,
  CONSOLE_ERROR_PATTERNS,
  shouldExcludeFile as shouldExcludeErrorLoggingFile,
  detectLoggerError,
  detectStructuredLogging,
  detectContextLogging,
  detectStackTraceLogging,
  detectConsoleErrorViolations,
  analyzeErrorLogging,
  ErrorLoggingDetector,
  createErrorLoggingDetector,
} from './error-logging.js';

// Import factory functions for createAllErrorDetectors
import { createAsyncErrorsDetector } from './async-errors.js';
import { createCircuitBreakerDetector } from './circuit-breaker.js';
import { createErrorCodesDetector } from './error-codes.js';
import { createErrorLoggingDetector } from './error-logging.js';
import { createErrorPropagationDetector } from './error-propagation.js';
import { createExceptionHierarchyDetector } from './exception-hierarchy.js';
import { createTryCatchPlacementDetector } from './try-catch-placement.js';

// Convenience factory for all error detectors
export function createAllErrorDetectors() {
  return {
    exceptionHierarchy: createExceptionHierarchyDetector(),
    errorCodes: createErrorCodesDetector(),
    tryCatchPlacement: createTryCatchPlacementDetector(),
    errorPropagation: createErrorPropagationDetector(),
    asyncErrors: createAsyncErrorsDetector(),
    circuitBreaker: createCircuitBreakerDetector(),
    errorLogging: createErrorLoggingDetector(),
  };
}

// ============================================================================
// Learning-Based Detectors
// ============================================================================

// Error Codes Learning Detector
export {
  ErrorCodesLearningDetector,
  createErrorCodesLearningDetector,
  type ErrorCodeConventions,
  type ErrorCodeStyle,
  type ErrorCodeNaming,
} from './error-codes-learning.js';

// Exception Hierarchy Learning Detector
export {
  ExceptionHierarchyLearningDetector,
  createExceptionHierarchyLearningDetector,
  type ExceptionHierarchyConventions,
  type ErrorClassSuffix,
} from './exception-hierarchy-learning.js';

// Error Logging Learning Detector
export {
  ErrorLoggingLearningDetector,
  createErrorLoggingLearningDetector,
  type ErrorLoggingConventions,
  type LoggerType,
} from './error-logging-learning.js';

// Try-Catch Learning Detector
export {
  TryCatchLearningDetector,
  createTryCatchLearningDetector,
  type TryCatchConventions,
  type CatchHandlingStyle,
} from './try-catch-learning.js';

// Async Errors Learning Detector
export {
  AsyncErrorsLearningDetector,
  createAsyncErrorsLearningDetector,
  type AsyncErrorsConventions,
  type AsyncErrorStyle,
} from './async-errors-learning.js';

// Circuit Breaker Learning Detector
export {
  CircuitBreakerLearningDetector,
  createCircuitBreakerLearningDetector,
  type CircuitBreakerConventions,
  type CircuitBreakerLibrary,
  type StateManagement,
} from './circuit-breaker-learning.js';

// Error Propagation Learning Detector
export {
  ErrorPropagationLearningDetector,
  createErrorPropagationLearningDetector,
  type ErrorPropagationConventions,
  type PropagationStyle,
  type ChainPreservation,
} from './error-propagation-learning.js';

// ============================================================================
// Semantic Detectors (Language-Agnostic)
// ============================================================================

export {
  ExceptionHierarchySemanticDetector,
  createExceptionHierarchySemanticDetector,
} from './exception-hierarchy-semantic.js';

export {
  ErrorCodesSemanticDetector,
  createErrorCodesSemanticDetector,
} from './error-codes-semantic.js';

export {
  TryCatchSemanticDetector,
  createTryCatchSemanticDetector,
} from './try-catch-semantic.js';

export {
  ErrorPropagationSemanticDetector,
  createErrorPropagationSemanticDetector,
} from './error-propagation-semantic.js';

export {
  AsyncErrorsSemanticDetector,
  createAsyncErrorsSemanticDetector,
} from './async-errors-semantic.js';

export {
  CircuitBreakerSemanticDetector,
  createCircuitBreakerSemanticDetector,
} from './circuit-breaker-semantic.js';

export {
  ErrorLoggingSemanticDetector,
  createErrorLoggingSemanticDetector,
} from './error-logging-semantic.js';

// ============================================================================
// ASP.NET Core Detectors (C#)
// ============================================================================

export {
  ExceptionPatternsDetector as AspNetExceptionPatternsDetector,
  createExceptionPatternsDetector as createAspNetExceptionPatternsDetector,
  type ExceptionPatternInfo as AspNetExceptionPatternInfo,
  type ExceptionAnalysis as AspNetExceptionAnalysis,
} from './aspnet/exception-patterns-detector.js';

export {
  ResultPatternDetector,
  createResultPatternDetector,
  type ResultPatternInfo,
  type ResultPatternAnalysis,
} from './aspnet/result-pattern-detector.js';

// ASP.NET Semantic Detectors
export {
  ExceptionPatternsSemanticDetector,
  createExceptionPatternsSemanticDetector,
} from './aspnet/exception-patterns-semantic.js';

export {
  ResultPatternSemanticDetector,
  createResultPatternSemanticDetector,
} from './aspnet/result-pattern-semantic.js';

// ============================================================================
// C++ Error Handling Detectors
// ============================================================================

export * from './cpp/index.js';
