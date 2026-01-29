/**
 * Spring Boot Detectors
 * 
 * This module exports all Spring Boot detectors:
 * - Semantic detectors: Find patterns by looking for semantic concepts (keywords)
 * - Learning detectors: Learn conventions from the codebase and flag outliers
 * 
 * NO HARDCODED RULES - all detectors learn what's "normal" from frequency.
 * 
 * Categories:
 * - structural: @Component, @Service, @Repository, @Controller
 * - api: @GetMapping, @PostMapping, @RequestBody, etc.
 * - auth: @PreAuthorize, @Secured, hasRole, etc.
 * - data: @Repository, @Query, @Entity, etc.
 * - di: @Autowired, @Bean, @Qualifier, etc.
 * - config: @Value, @ConfigurationProperties, etc.
 * - validation: @Valid, @NotNull, @Size, etc.
 * - errors: @ExceptionHandler, @ControllerAdvice, etc.
 * - logging: Logger, LoggerFactory, MDC, etc.
 * - testing: @SpringBootTest, @MockBean, MockMvc, etc.
 * - transaction: @Transactional, Propagation, Isolation, etc.
 * - async: @Async, @Scheduled, CompletableFuture, etc.
 */

// Keywords
export {
  SPRING_KEYWORD_GROUPS,
  type SpringKeywordGroup,
  getSpringKeywords,
  getAllSpringKeywords,
  getSpringKeywordCategory,
} from './keywords.js';

// Semantic Detectors
export {
  SpringStructuralSemanticDetector,
  createSpringStructuralSemanticDetector,
} from './structural-semantic.js';

export {
  SpringAPISemanticDetector,
  createSpringAPISemanticDetector,
} from './api-semantic.js';

export {
  SpringAuthSemanticDetector,
  createSpringAuthSemanticDetector,
} from './auth-semantic.js';

export {
  SpringDataSemanticDetector,
  createSpringDataSemanticDetector,
} from './data-semantic.js';

export {
  SpringDISemanticDetector,
  createSpringDISemanticDetector,
} from './di-semantic.js';

export {
  SpringConfigSemanticDetector,
  createSpringConfigSemanticDetector,
} from './config-semantic.js';

export {
  SpringValidationSemanticDetector,
  createSpringValidationSemanticDetector,
} from './validation-semantic.js';

export {
  SpringErrorsSemanticDetector,
  createSpringErrorsSemanticDetector,
} from './errors-semantic.js';

export {
  SpringLoggingSemanticDetector,
  createSpringLoggingSemanticDetector,
} from './logging-semantic.js';

export {
  SpringTestingSemanticDetector,
  createSpringTestingSemanticDetector,
} from './testing-semantic.js';

export {
  SpringTransactionSemanticDetector,
  createSpringTransactionSemanticDetector,
} from './transaction-semantic.js';

export {
  SpringAsyncSemanticDetector,
  createSpringAsyncSemanticDetector,
} from './async-semantic.js';

// Learning Detectors
export {
  SpringStructuralLearningDetector,
  createSpringStructuralLearningDetector,
  type SpringStructuralConventions,
  type StereotypeType,
} from './structural-learning.js';

export {
  SpringAPILearningDetector,
  createSpringAPILearningDetector,
  type SpringAPIConventions,
  type MappingStyle,
  type ResponseStyle,
} from './api-learning.js';

export {
  SpringAuthLearningDetector,
  createSpringAuthLearningDetector,
  type SpringAuthConventions,
  type SecurityAnnotationType,
  type RoleNamingStyle,
} from './auth-learning.js';

export {
  SpringDataLearningDetector,
  createSpringDataLearningDetector,
  type SpringDataConventions,
  type RepositoryType,
  type QueryStyle,
  type FetchStrategy,
} from './data-learning.js';

export {
  SpringDILearningDetector,
  createSpringDILearningDetector,
  type SpringDIConventions,
  type InjectionStyle,
  type BeanScope,
} from './di-learning.js';

export {
  SpringConfigLearningDetector,
  createSpringConfigLearningDetector,
  type SpringConfigConventions,
  type PropertyBindingStyle,
  type DefaultValueStyle,
} from './config-learning.js';

export {
  SpringValidationLearningDetector,
  createSpringValidationLearningDetector,
  type SpringValidationConventions,
  type ValidationStyle,
  type NullCheckStyle,
} from './validation-learning.js';

export {
  SpringErrorsLearningDetector,
  createSpringErrorsLearningDetector,
  type SpringErrorsConventions,
  type ErrorHandlerStyle,
  type ErrorResponseStyle,
} from './errors-learning.js';

export {
  SpringLoggingLearningDetector,
  createSpringLoggingLearningDetector,
  type SpringLoggingConventions,
  type LoggerStyle,
  type LoggerNaming,
} from './logging-learning.js';

export {
  SpringTestingLearningDetector,
  createSpringTestingLearningDetector,
  type SpringTestingConventions,
  type TestSliceStyle,
  type MockStyle,
  type AssertionStyle,
} from './testing-learning.js';

export {
  SpringTransactionLearningDetector,
  createSpringTransactionLearningDetector,
  type SpringTransactionConventions,
  type TransactionalPlacement,
  type PropagationType,
  type IsolationType,
} from './transaction-learning.js';

export {
  SpringAsyncLearningDetector,
  createSpringAsyncLearningDetector,
  type SpringAsyncConventions,
  type AsyncReturnStyle,
  type ScheduleStyle,
} from './async-learning.js';

// Import for use in factory functions
import { createSpringAPILearningDetector , SpringAPILearningDetector } from './api-learning.js';
import { createSpringAPISemanticDetector , SpringAPISemanticDetector } from './api-semantic.js';
import { createSpringAsyncLearningDetector , SpringAsyncLearningDetector } from './async-learning.js';
import { createSpringAsyncSemanticDetector , SpringAsyncSemanticDetector } from './async-semantic.js';
import { createSpringDataSemanticDetector , SpringDataSemanticDetector } from './data-semantic.js';
import { createSpringDISemanticDetector } from './di-semantic.js';
import { createSpringConfigSemanticDetector } from './config-semantic.js';
import { createSpringValidationSemanticDetector } from './validation-semantic.js';
import { createSpringErrorsSemanticDetector } from './errors-semantic.js';
import { createSpringLoggingSemanticDetector } from './logging-semantic.js';
import { createSpringTestingSemanticDetector } from './testing-semantic.js';
import { createSpringTransactionSemanticDetector } from './transaction-semantic.js';

import { SpringStructuralSemanticDetector } from './structural-semantic.js';
import { SpringDISemanticDetector } from './di-semantic.js';
import { SpringConfigSemanticDetector } from './config-semantic.js';
import { SpringValidationSemanticDetector } from './validation-semantic.js';
import { SpringErrorsSemanticDetector } from './errors-semantic.js';
import { SpringLoggingSemanticDetector } from './logging-semantic.js';
import { SpringTestingSemanticDetector } from './testing-semantic.js';
import { SpringTransactionSemanticDetector } from './transaction-semantic.js';

// Learning detector imports
import { createSpringAuthLearningDetector , SpringAuthLearningDetector } from './auth-learning.js';
import { createSpringAuthSemanticDetector , SpringAuthSemanticDetector } from './auth-semantic.js';
import { createSpringDataLearningDetector , SpringDataLearningDetector } from './data-learning.js';
import { createSpringConfigLearningDetector , SpringConfigLearningDetector } from './config-learning.js';
import { createSpringDILearningDetector , SpringDILearningDetector } from './di-learning.js';
import { createSpringValidationLearningDetector , SpringValidationLearningDetector } from './validation-learning.js';
import { createSpringErrorsLearningDetector } from './errors-learning.js';
import { createSpringLoggingLearningDetector } from './logging-learning.js';
import { createSpringTestingLearningDetector } from './testing-learning.js';
import { createSpringTransactionLearningDetector } from './transaction-learning.js';

import { SpringStructuralLearningDetector } from './structural-learning.js';
import { SpringErrorsLearningDetector } from './errors-learning.js';
import { SpringLoggingLearningDetector } from './logging-learning.js';
import { createSpringStructuralLearningDetector } from './structural-learning.js';
import { createSpringStructuralSemanticDetector } from './structural-semantic.js';
import { SpringTestingLearningDetector } from './testing-learning.js';
import { SpringTransactionLearningDetector } from './transaction-learning.js';

/**
 * Create all Spring semantic detectors
 */
export function createAllSpringSemanticDetectors() {
  return [
    createSpringStructuralSemanticDetector(),
    createSpringAPISemanticDetector(),
    createSpringAuthSemanticDetector(),
    createSpringDataSemanticDetector(),
    createSpringDISemanticDetector(),
    createSpringConfigSemanticDetector(),
    createSpringValidationSemanticDetector(),
    createSpringErrorsSemanticDetector(),
    createSpringLoggingSemanticDetector(),
    createSpringTestingSemanticDetector(),
    createSpringTransactionSemanticDetector(),
    createSpringAsyncSemanticDetector(),
  ];
}

/**
 * Get all Spring semantic detector classes
 */
export const SPRING_SEMANTIC_DETECTORS = [
  SpringStructuralSemanticDetector,
  SpringAPISemanticDetector,
  SpringAuthSemanticDetector,
  SpringDataSemanticDetector,
  SpringDISemanticDetector,
  SpringConfigSemanticDetector,
  SpringValidationSemanticDetector,
  SpringErrorsSemanticDetector,
  SpringLoggingSemanticDetector,
  SpringTestingSemanticDetector,
  SpringTransactionSemanticDetector,
  SpringAsyncSemanticDetector,
];

/**
 * Create all Spring learning detectors
 */
export function createAllSpringLearningDetectors() {
  return [
    createSpringStructuralLearningDetector(),
    createSpringAPILearningDetector(),
    createSpringAuthLearningDetector(),
    createSpringDataLearningDetector(),
    createSpringDILearningDetector(),
    createSpringConfigLearningDetector(),
    createSpringValidationLearningDetector(),
    createSpringErrorsLearningDetector(),
    createSpringLoggingLearningDetector(),
    createSpringTestingLearningDetector(),
    createSpringTransactionLearningDetector(),
    createSpringAsyncLearningDetector(),
  ];
}

/**
 * Get all Spring learning detector classes
 */
export const SPRING_LEARNING_DETECTORS = [
  SpringStructuralLearningDetector,
  SpringAPILearningDetector,
  SpringAuthLearningDetector,
  SpringDataLearningDetector,
  SpringDILearningDetector,
  SpringConfigLearningDetector,
  SpringValidationLearningDetector,
  SpringErrorsLearningDetector,
  SpringLoggingLearningDetector,
  SpringTestingLearningDetector,
  SpringTransactionLearningDetector,
  SpringAsyncLearningDetector,
];

/**
 * Create all Spring detectors (semantic + learning)
 */
export function createAllSpringDetectors() {
  return [
    ...createAllSpringSemanticDetectors(),
    ...createAllSpringLearningDetectors(),
  ];
}
