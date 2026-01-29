/**
 * Laravel Semantic Detectors Index
 * 
 * Exports all Laravel-specific semantic detectors for pattern learning.
 * These detectors learn from your Laravel codebase rather than enforcing rules.
 */

// Auth patterns
import {
  LaravelAPISemanticDetector,
  createLaravelAPISemanticDetector,
} from '../api/laravel/api-semantic.js';
import {
  LaravelAsyncSemanticDetector,
  createLaravelAsyncSemanticDetector,
} from '../async/laravel/async-semantic.js';
import {
  LaravelAuthSemanticDetector,
  createLaravelAuthSemanticDetector,
} from '../auth/laravel/auth-semantic.js';

// Data Access patterns (Eloquent)
import {
  LaravelConfigSemanticDetector,
  createLaravelConfigSemanticDetector,
} from '../config/laravel/config-semantic.js';
import {
  LaravelEloquentSemanticDetector,
  createLaravelEloquentSemanticDetector,
} from '../data-access/laravel/eloquent-semantic.js';

// Transaction patterns
import {
  LaravelTransactionSemanticDetector,
  createLaravelTransactionSemanticDetector,
} from '../data-access/laravel/transaction-semantic.js';

// Error handling patterns
import {
  LaravelErrorsSemanticDetector,
  createLaravelErrorsSemanticDetector,
} from '../errors/laravel/errors-semantic.js';

// Logging patterns
import {
  LaravelLoggingSemanticDetector,
  createLaravelLoggingSemanticDetector,
} from '../logging/laravel/logging-semantic.js';

// Testing patterns


// Security patterns
import {
  LaravelPerformanceSemanticDetector,
  createLaravelPerformanceSemanticDetector,
} from '../performance/laravel/performance-semantic.js';
import {
  LaravelSecuritySemanticDetector,
  createLaravelSecuritySemanticDetector,
} from '../security/laravel/security-semantic.js';

// Config patterns

// Performance patterns

// Structural/DI patterns
import {
  LaravelStructuralSemanticDetector,
  createLaravelStructuralSemanticDetector,
} from '../structural/laravel/structural-semantic.js';
import {
  LaravelTestingSemanticDetector,
  createLaravelTestingSemanticDetector,
} from '../testing/laravel/testing-semantic.js';

// API patterns

// Async patterns (Jobs, Events, Queues)

// Validation patterns
import {
  LaravelValidationSemanticDetector,
  createLaravelValidationSemanticDetector,
} from '../validation/laravel/validation-semantic.js';


// Re-export all
export {
  LaravelAuthSemanticDetector,
  createLaravelAuthSemanticDetector,
  LaravelEloquentSemanticDetector,
  createLaravelEloquentSemanticDetector,
  LaravelTransactionSemanticDetector,
  createLaravelTransactionSemanticDetector,
  LaravelErrorsSemanticDetector,
  createLaravelErrorsSemanticDetector,
  LaravelLoggingSemanticDetector,
  createLaravelLoggingSemanticDetector,
  LaravelTestingSemanticDetector,
  createLaravelTestingSemanticDetector,
  LaravelSecuritySemanticDetector,
  createLaravelSecuritySemanticDetector,
  LaravelConfigSemanticDetector,
  createLaravelConfigSemanticDetector,
  LaravelPerformanceSemanticDetector,
  createLaravelPerformanceSemanticDetector,
  LaravelStructuralSemanticDetector,
  createLaravelStructuralSemanticDetector,
  LaravelAPISemanticDetector,
  createLaravelAPISemanticDetector,
  LaravelAsyncSemanticDetector,
  createLaravelAsyncSemanticDetector,
  LaravelValidationSemanticDetector,
  createLaravelValidationSemanticDetector,
};

/**
 * Create all Laravel semantic detectors (13 total)
 */
export function createAllLaravelSemanticDetectors() {
  return [
    createLaravelAuthSemanticDetector(),
    createLaravelEloquentSemanticDetector(),
    createLaravelTransactionSemanticDetector(),
    createLaravelErrorsSemanticDetector(),
    createLaravelLoggingSemanticDetector(),
    createLaravelTestingSemanticDetector(),
    createLaravelSecuritySemanticDetector(),
    createLaravelConfigSemanticDetector(),
    createLaravelPerformanceSemanticDetector(),
    createLaravelStructuralSemanticDetector(),
    createLaravelAPISemanticDetector(),
    createLaravelAsyncSemanticDetector(),
    createLaravelValidationSemanticDetector(),
  ];
}
