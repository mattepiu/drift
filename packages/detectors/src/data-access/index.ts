/**
 * Data access detectors module exports
 *
 * Detects data access patterns including:
 * - Query patterns (query builders vs raw SQL)
 * - Repository patterns
 * - Transaction patterns
 * - Validation patterns
 * - DTO patterns
 * - N+1 query detection
 * - Connection pooling
 *
 * @requirements 13.1-13.7 - Data access patterns
 */

// Query Patterns Detector
export {
  type QueryPatternType,
  type QueryViolationType,
  type QueryPatternInfo,
  type QueryViolationInfo,
  type QueryAnalysis,
  PRISMA_PATTERNS,
  DRIZZLE_PATTERNS,
  KNEX_PATTERNS,
  TYPEORM_PATTERNS,
  SEQUELIZE_PATTERNS,
  RAW_SQL_PATTERNS,
  PARAMETERIZED_PATTERNS,
  STRING_CONCAT_PATTERNS,
  shouldExcludeFile as shouldExcludeQueryFile,
  detectPrismaQueries,
  detectDrizzleQueries,
  detectKnexQueries,
  detectTypeORMQueries,
  detectRawSQLQueries,
  detectStringConcatViolations,
  analyzeQueryPatterns,
  QueryPatternsDetector,
  createQueryPatternsDetector,
} from './query-patterns.js';

// Repository Pattern Detector
export {
  type RepositoryPatternType,
  type RepositoryViolationType,
  type RepositoryPatternInfo,
  type RepositoryViolationInfo,
  type RepositoryAnalysis,
  REPOSITORY_CLASS_PATTERNS,
  REPOSITORY_INTERFACE_PATTERNS,
  REPOSITORY_INJECTION_PATTERNS,
  GENERIC_REPOSITORY_PATTERNS,
  BASE_REPOSITORY_PATTERNS,
  DIRECT_DB_ACCESS_PATTERNS,
  shouldExcludeFile as shouldExcludeRepositoryFile,
  detectRepositoryClasses,
  detectRepositoryInterfaces,
  detectRepositoryInjection,
  detectGenericRepositories,
  detectBaseRepositories,
  detectDirectDBAccessViolations,
  analyzeRepositoryPattern,
  RepositoryPatternDetector,
  createRepositoryPatternDetector,
} from './repository-pattern.js';

// Transaction Patterns Detector
export {
  type TransactionPatternType,
  type TransactionViolationType,
  type TransactionPatternInfo,
  type TransactionViolationInfo,
  type TransactionAnalysis,
  TRANSACTION_BLOCK_PATTERNS,
  TRANSACTION_DECORATOR_PATTERNS,
  COMMIT_PATTERNS,
  ROLLBACK_PATTERNS,
  SAVEPOINT_PATTERNS,
  ISOLATION_LEVEL_PATTERNS,
  shouldExcludeFile as shouldExcludeTransactionFile,
  detectTransactionBlocks,
  detectTransactionDecorators,
  detectCommitPatterns,
  detectRollbackPatterns,
  detectSavepoints,
  detectIsolationLevels,
  analyzeTransactionPatterns,
  TransactionPatternsDetector,
  createTransactionPatternsDetector,
} from './transaction-patterns.js';

// Validation Patterns Detector
export {
  type ValidationPatternType,
  type ValidationViolationType,
  type ValidationPatternInfo,
  type ValidationViolationInfo,
  type ValidationAnalysis,
  ZOD_PATTERNS,
  YUP_PATTERNS,
  JOI_PATTERNS,
  CLASS_VALIDATOR_PATTERNS,
  MANUAL_VALIDATION_PATTERNS,
  VALIDATION_MIDDLEWARE_PATTERNS,
  shouldExcludeFile as shouldExcludeValidationFile,
  detectZodSchemas,
  detectYupSchemas,
  detectJoiSchemas,
  detectClassValidators,
  detectManualValidation,
  detectValidationMiddleware,
  analyzeValidationPatterns,
  ValidationPatternsDetector,
  createValidationPatternsDetector,
} from './validation-patterns.js';

// DTO Patterns Detector
export {
  type DTOPatternType,
  type DTOViolationType,
  type DTOPatternInfo,
  type DTOViolationInfo,
  type DTOAnalysis,
  DTO_CLASS_PATTERNS,
  DTO_INTERFACE_PATTERNS,
  DTO_TYPE_PATTERNS,
  MAPPER_FUNCTION_PATTERNS,
  TRANSFORMER_CLASS_PATTERNS,
  SERIALIZER_PATTERNS,
  ENTITY_EXPOSURE_PATTERNS,
  shouldExcludeFile as shouldExcludeDTOFile,
  detectDTOClasses,
  detectDTOInterfaces,
  detectDTOTypes,
  detectMapperFunctions,
  detectTransformerClasses,
  detectSerializers,
  detectEntityExposureViolations,
  analyzeDTOPatterns,
  DTOPatternsDetector,
  createDTOPatternsDetector,
} from './dto-patterns.js';

// N+1 Query Detector
export {
  type NPlusOnePatternType,
  type NPlusOneViolationType,
  type NPlusOnePatternInfo,
  type NPlusOneViolationInfo,
  type NPlusOneAnalysis,
  EAGER_LOADING_PATTERNS,
  BATCH_QUERY_PATTERNS,
  JOIN_QUERY_PATTERNS,
  PRELOAD_PATTERNS,
  QUERY_IN_LOOP_PATTERNS,
  SEQUENTIAL_QUERY_PATTERNS,
  shouldExcludeFile as shouldExcludeNPlusOneFile,
  detectEagerLoading,
  detectBatchQueries,
  detectJoinQueries,
  detectPreloads,
  detectQueryInLoopViolations,
  detectSequentialQueryViolations,
  analyzeNPlusOne,
  NPlusOneDetector,
  createNPlusOneDetector,
} from './n-plus-one.js';

// Connection Pooling Detector
export {
  type ConnectionPoolPatternType,
  type ConnectionPoolViolationType,
  type ConnectionPoolPatternInfo,
  type ConnectionPoolViolationInfo,
  type ConnectionPoolAnalysis,
  POOL_CONFIG_PATTERNS,
  POOL_SIZE_PATTERNS,
  CONNECTION_TIMEOUT_PATTERNS,
  IDLE_TIMEOUT_PATTERNS,
  CONNECTION_ACQUIRE_PATTERNS,
  CONNECTION_RELEASE_PATTERNS,
  CONNECTION_LEAK_PATTERNS,
  shouldExcludeFile as shouldExcludeConnectionPoolFile,
  detectPoolConfig,
  detectPoolSize,
  detectConnectionTimeout,
  detectIdleTimeout,
  detectConnectionAcquire,
  detectConnectionRelease,
  analyzeConnectionPooling,
  ConnectionPoolingDetector,
  createConnectionPoolingDetector,
} from './connection-pooling.js';

// Import factory functions for createAllDataAccessDetectors
import { createORMModelSemanticDetector } from './boundaries/orm-model-detector.js';
import { createQueryAccessSemanticDetector } from './boundaries/query-access-detector.js';
import { createSensitiveFieldSemanticDetector } from './boundaries/sensitive-field-detector.js';
import { createConnectionPoolingDetector } from './connection-pooling.js';
import { createDTOPatternsDetector } from './dto-patterns.js';
import { createNPlusOneDetector } from './n-plus-one.js';
import { createQueryPatternsDetector } from './query-patterns.js';
import { createRepositoryPatternDetector } from './repository-pattern.js';
import { createTransactionPatternsDetector } from './transaction-patterns.js';
import { createValidationPatternsDetector } from './validation-patterns.js';

// Convenience factory for all data access detectors
export function createAllDataAccessDetectors() {
  return {
    queryPatterns: createQueryPatternsDetector(),
    repositoryPattern: createRepositoryPatternDetector(),
    transactionPatterns: createTransactionPatternsDetector(),
    validationPatterns: createValidationPatternsDetector(),
    dtoPatterns: createDTOPatternsDetector(),
    nPlusOne: createNPlusOneDetector(),
    connectionPooling: createConnectionPoolingDetector(),
  };
}

// ============================================================================
// Learning-Based Detectors
// ============================================================================

// Repository Pattern Learning Detector
export {
  RepositoryPatternLearningDetector,
  createRepositoryPatternLearningDetector,
  type RepositoryPatternConventions,
  type RepositoryNamingSuffix,
} from './repository-pattern-learning.js';

// Query Patterns Learning Detector
export {
  QueryPatternsLearningDetector,
  createQueryPatternsLearningDetector,
  type QueryPatternsConventions,
  type QueryLibrary,
} from './query-patterns-learning.js';

// DTO Patterns Learning Detector
export {
  DTOPatternsLearningDetector,
  createDTOPatternsLearningDetector,
  type DTOPatternsConventions,
  type DTONamingSuffix,
} from './dto-patterns-learning.js';

// Transaction Patterns Learning Detector
export {
  TransactionPatternsLearningDetector,
  createTransactionPatternsLearningDetector,
  type TransactionPatternsConventions,
  type TransactionStyle,
} from './transaction-patterns-learning.js';

// Connection Pooling Learning Detector
export {
  ConnectionPoolingLearningDetector,
  createConnectionPoolingLearningDetector,
  type ConnectionPoolingConventions,
  type PoolLibrary,
} from './connection-pooling-learning.js';

// Validation Patterns Learning Detector
export {
  ValidationPatternsLearningDetector,
  createValidationPatternsLearningDetector,
  type ValidationPatternsConventions,
  type ValidationLibrary,
} from './validation-patterns-learning.js';

// N+1 Query Learning Detector
export {
  NPlusOneLearningDetector,
  createNPlusOneLearningDetector,
  type NPlusOneConventions,
  type NPlusOnePreventionMethod,
} from './n-plus-one-learning.js';

// ============================================================================
// Semantic Detectors (Language-Agnostic)
// ============================================================================

export {
  QueryPatternsSemanticDetector,
  createQueryPatternsSemanticDetector,
} from './query-patterns-semantic.js';

export {
  RepositoryPatternSemanticDetector,
  createRepositoryPatternSemanticDetector,
} from './repository-pattern-semantic.js';

export {
  TransactionSemanticDetector,
  createTransactionSemanticDetector,
} from './transaction-semantic.js';

export {
  ValidationSemanticDetector,
  createValidationSemanticDetector,
} from './validation-semantic.js';

export {
  DTOPatternsSemanticDetector,
  createDTOPatternsSemanticDetector,
} from './dto-patterns-semantic.js';

export {
  NPlusOneSemanticDetector,
  createNPlusOneSemanticDetector,
} from './n-plus-one-semantic.js';

export {
  ConnectionPoolingSemanticDetector,
  createConnectionPoolingSemanticDetector,
} from './connection-pooling-semantic.js';

// ============================================================================
// ASP.NET Core Detectors (C#)
// ============================================================================

export {
  EfCorePatternsDetector,
  createEfCorePatternsDetector,
  type EfCorePatternInfo,
  type EfCoreAnalysis,
} from './aspnet/efcore-patterns-detector.js';

export {
  RepositoryPatternDetector as AspNetRepositoryPatternDetector,
  createRepositoryPatternDetector as createAspNetRepositoryPatternDetector,
  type RepositoryPatternInfo as AspNetRepositoryPatternInfo,
  type RepositoryAnalysis as AspNetRepositoryAnalysis,
} from './aspnet/repository-pattern-detector.js';

// ============================================================================
// ASP.NET Core Semantic Detectors (Language-Agnostic Learning)
// ============================================================================

export {
  EfCorePatternsSemanticDetector,
  createEfCorePatternsSemanticDetector,
} from './aspnet/efcore-patterns-semantic.js';

export {
  RepositoryPatternSemanticDetector as AspNetRepositoryPatternSemanticDetector,
  createRepositoryPatternSemanticDetector as createAspNetRepositoryPatternSemanticDetector,
} from './aspnet/repository-pattern-semantic.js';

// ============================================================================
// Data Boundaries Detectors (Semantic Learning)
// ============================================================================

export {
  ORMModelSemanticDetector,
  createORMModelSemanticDetector,
} from './boundaries/orm-model-detector.js';

export {
  QueryAccessSemanticDetector,
  createQueryAccessSemanticDetector,
} from './boundaries/query-access-detector.js';

export {
  SensitiveFieldSemanticDetector,
  createSensitiveFieldSemanticDetector,
} from './boundaries/sensitive-field-detector.js';

// Import factory functions for createAllDataBoundarySemanticDetectors

/**
 * Create all data boundary semantic detectors
 */
export function createAllDataBoundarySemanticDetectors() {
  return [
    createORMModelSemanticDetector(),
    createQueryAccessSemanticDetector(),
    createSensitiveFieldSemanticDetector(),
  ];
}
