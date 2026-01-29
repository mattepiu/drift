/**
 * Auth detectors module exports
 *
 * Detects authentication and authorization patterns including:
 * - Middleware usage patterns
 * - Token handling patterns
 * - Permission check patterns
 * - RBAC patterns
 * - Resource ownership patterns
 * - Audit logging patterns
 *
 * @requirements 11.1 - Auth middleware patterns
 * @requirements 11.2 - Token handling patterns
 * @requirements 11.3 - Permission check patterns
 * @requirements 11.4 - RBAC patterns
 * @requirements 11.5 - Resource ownership patterns
 * @requirements 11.6 - Audit logging patterns
 */

// Middleware Usage Detector
export {
  type AuthMiddlewareType,
  type AuthMiddlewareViolationType,
  type AuthMiddlewarePatternInfo,
  type AuthMiddlewareViolationInfo,
  type AuthMiddlewareAnalysis,
  AUTH_MIDDLEWARE_PATTERNS,
  NEXTJS_MIDDLEWARE_PATTERNS,
  JWT_PATTERNS,
  ROUTE_PATTERNS,
  SENSITIVE_ROUTE_PATTERNS,
  EXCLUDED_FILE_PATTERNS as MIDDLEWARE_EXCLUDED_FILE_PATTERNS,
  shouldExcludeFile as shouldExcludeMiddlewareFile,
  detectAuthMiddleware,
  detectUnprotectedRoutes,
  analyzeAuthMiddleware,
  AuthMiddlewareDetector,
  createAuthMiddlewareDetector,
} from './middleware-usage.js';

// Token Handling Detector
export {
  type TokenPatternType,
  type TokenViolationType,
  type TokenPatternInfo,
  type TokenViolationInfo,
  type TokenAnalysis,
  TOKEN_STORAGE_PATTERNS,
  SECURE_COOKIE_PATTERNS,
  REFRESH_TOKEN_PATTERNS,
  TOKEN_VALIDATION_PATTERNS,
  TOKEN_EXTRACTION_PATTERNS,
  INSECURE_STORAGE_PATTERNS,
  TOKEN_IN_URL_PATTERNS,
  TOKEN_LOGGED_PATTERNS,
  shouldExcludeFile as shouldExcludeTokenFile,
  analyzeTokenHandling,
  TokenHandlingDetector,
  createTokenHandlingDetector,
} from './token-handling.js';

// Permission Checks Detector
export {
  type PermissionPatternType,
  type PermissionViolationType,
  type PermissionPatternInfo,
  type PermissionViolationInfo,
  type PermissionAnalysis,
  PERMISSION_CHECK_PATTERNS,
  AUTHORIZATION_PATTERNS,
  GUARD_PATTERNS,
  POLICY_PATTERNS,
  shouldExcludeFile as shouldExcludePermissionFile,
  detectPermissionChecks,
  detectAuthorizationPatterns,
  detectGuardPatterns,
  detectPolicyPatterns,
  analyzePermissions,
  PermissionChecksDetector,
  createPermissionChecksDetector,
} from './permission-checks.js';

// RBAC Patterns Detector
export {
  type RbacPatternType,
  type RbacViolationType,
  type RbacPatternInfo,
  type RbacViolationInfo,
  type RbacAnalysis,
  type RBACPatternType,
  type RBACPatternInfo,
  type RBACAnalysis,
  ROLE_DEFINITION_PATTERNS,
  ROLE_ASSIGNMENT_PATTERNS,
  ROLE_CHECK_PATTERNS,
  ROLE_HIERARCHY_PATTERNS,
  shouldExcludeFile as shouldExcludeRbacFile,
  detectRoleDefinitions,
  detectRoleChecks,
  detectRoleAssignments,
  detectRoleHierarchy,
  analyzeRbac,
  analyzeRBACPatterns,
  RbacPatternsDetector,
  RBACPatternsDetector,
  createRbacPatternsDetector,
  createRBACPatternsDetector,
} from './rbac-patterns.js';

// Resource Ownership Detector
export {
  type OwnershipPatternType,
  type OwnershipViolationType,
  type OwnershipPatternInfo,
  type OwnershipViolationInfo,
  type OwnershipAnalysis,
  USER_ID_CHECK_PATTERNS,
  OWNER_FIELD_PATTERNS,
  TENANT_SCOPE_PATTERNS,
  CREATED_BY_PATTERNS,
  OWNERSHIP_QUERY_PATTERNS,
  OWNERSHIP_TRANSFER_PATTERNS,
  shouldExcludeFile as shouldExcludeOwnershipFile,
  detectUserIdChecks,
  detectOwnerFields,
  detectTenantScoping,
  detectCreatedByPatterns,
  detectOwnershipQueries,
  detectMissingOwnershipViolations,
  analyzeOwnership,
  ResourceOwnershipDetector,
  createResourceOwnershipDetector,
} from './resource-ownership.js';

// Audit Logging Detector
export {
  type AuditPatternType,
  type AuditViolationType,
  type AuditPatternInfo,
  type AuditViolationInfo,
  type AuditAnalysis,
  LOGIN_AUDIT_PATTERNS,
  LOGOUT_AUDIT_PATTERNS,
  PERMISSION_AUDIT_PATTERNS,
  ACCESS_AUDIT_PATTERNS,
  SECURITY_AUDIT_PATTERNS,
  ACTION_AUDIT_PATTERNS,
  AUDIT_LIBRARY_PATTERNS,
  shouldExcludeFile as shouldExcludeAuditFile,
  detectLoginAudit,
  detectLogoutAudit,
  detectPermissionAudit,
  detectAccessAudit,
  detectSecurityAudit,
  detectActionAudit,
  detectAuditLibraries,
  detectMissingAuditViolations,
  analyzeAuditLogging,
  AuditLoggingDetector,
  createAuditLoggingDetector,
} from './audit-logging.js';

// Import factory functions for use in createAllAuthDetectors
import { createAuditLoggingDetector } from './audit-logging.js';
import { createAuthMiddlewareDetector } from './middleware-usage.js';
import { createPermissionChecksDetector } from './permission-checks.js';
import { createRbacPatternsDetector } from './rbac-patterns.js';
import { createResourceOwnershipDetector } from './resource-ownership.js';
import { createTokenHandlingDetector } from './token-handling.js';

// Convenience factory for all auth detectors
export function createAllAuthDetectors() {
  return {
    middlewareUsage: createAuthMiddlewareDetector(),
    tokenHandling: createTokenHandlingDetector(),
    permissionChecks: createPermissionChecksDetector(),
    rbacPatterns: createRbacPatternsDetector(),
    resourceOwnership: createResourceOwnershipDetector(),
    auditLogging: createAuditLoggingDetector(),
  };
}

// ============================================================================
// Learning-Based Detectors
// ============================================================================

// Token Handling Learning Detector
export {
  TokenHandlingLearningDetector,
  createTokenHandlingLearningDetector,
  type TokenHandlingConventions,
  type TokenStorageMethod,
  type TokenLibrary,
} from './token-handling-learning.js';

// Auth Middleware Learning Detector
export {
  AuthMiddlewareLearningDetector,
  createAuthMiddlewareLearningDetector,
  type AuthMiddlewareConventions,
  type AuthMiddlewareStyle,
} from './middleware-usage-learning.js';

// Permission Checks Learning Detector
export {
  PermissionChecksLearningDetector,
  createPermissionChecksLearningDetector,
  type PermissionChecksConventions,
  type PermissionStyle,
} from './permission-checks-learning.js';

// RBAC Patterns Learning Detector
export {
  RBACPatternsLearningDetector,
  createRBACPatternsLearningDetector,
  type RBACConventions,
  type RoleDefinitionStyle,
  type PermissionCheckStyle as RBACPermissionCheckStyle,
} from './rbac-patterns-learning.js';

// Resource Ownership Learning Detector
export {
  ResourceOwnershipLearningDetector,
  createResourceOwnershipLearningDetector,
  type ResourceOwnershipConventions,
  type OwnershipField,
  type OwnershipCheckStyle,
} from './resource-ownership-learning.js';

// Audit Logging Learning Detector
export {
  AuditLoggingLearningDetector,
  createAuditLoggingLearningDetector,
  type AuditLoggingConventions,
  type AuditMethod,
  type AuditStorage,
} from './audit-logging-learning.js';

// ============================================================================
// Semantic Detectors (Language-Agnostic)
// ============================================================================

export {
  AuditSemanticDetector,
  createAuditSemanticDetector,
} from './audit-semantic.js';

export {
  AuthMiddlewareSemanticDetector,
  createAuthMiddlewareSemanticDetector,
} from './middleware-semantic.js';

export {
  OwnershipSemanticDetector,
  createOwnershipSemanticDetector,
} from './ownership-semantic.js';

export {
  PermissionChecksSemanticDetector,
  createPermissionChecksSemanticDetector,
} from './permission-checks-semantic.js';

export {
  RBACSemanticDetector,
  createRBACSemanticDetector,
} from './rbac-semantic.js';

export {
  TokenHandlingSemanticDetector,
  createTokenHandlingSemanticDetector,
} from './token-handling-semantic.js';


// ============================================================================
// ASP.NET Core Auth Detectors (C#-specific)
// ============================================================================

export * from './aspnet/index.js';

// ============================================================================
// C++ Auth Detectors
// ============================================================================

export * from './cpp/index.js';
