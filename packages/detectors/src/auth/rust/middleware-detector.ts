/**
 * Rust Auth Middleware Detector
 *
 * Detects authentication and authorization patterns in Rust web frameworks:
 * - Actix-web middleware and guards
 * - Axum extractors and layers
 * - Rocket request guards and fairings
 * - Warp filters
 * - JWT handling
 * - Session management
 *
 * @license Apache-2.0
 */

import type { PatternCategory } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export interface RustAuthPattern {
  id: string;
  name: string;
  category: PatternCategory;
  file: string;
  line: number;
  column: number;
  context: string;
  confidence: number;
  framework: string;
  authType: RustAuthType;
}

export type RustAuthType =
  | 'middleware'        // Generic middleware
  | 'guard'             // Request guard
  | 'extractor'         // Auth extractor
  | 'jwt'               // JWT handling
  | 'session'           // Session management
  | 'bearer'            // Bearer token
  | 'basic'             // Basic auth
  | 'api-key'           // API key auth
  | 'oauth'             // OAuth
  | 'rbac'              // Role-based access
  | 'permission';       // Permission check

export interface RustAuthDetectorOptions {
  includeJwt?: boolean;
  includeSessions?: boolean;
  includeRbac?: boolean;
}

export interface RustAuthDetectionResult {
  patterns: RustAuthPattern[];
  middlewares: RustMiddleware[];
  guards: RustGuard[];
  issues: RustAuthIssue[];
}

export interface RustMiddleware {
  name: string;
  framework: string;
  file: string;
  line: number;
  type: 'auth' | 'logging' | 'cors' | 'rate-limit' | 'other';
}

export interface RustGuard {
  name: string;
  framework: string;
  file: string;
  line: number;
  protects: string[];
}

export interface RustAuthIssue {
  type: 'missing-auth' | 'weak-auth' | 'hardcoded-secret' | 'insecure-session';
  message: string;
  file: string;
  line: number;
  suggestion: string;
}

// ============================================================================
// Regex Patterns
// ============================================================================

// Actix-web patterns
const ACTIX_MIDDLEWARE_PATTERN = /\.wrap\s*\(\s*(\w+)/g;
const ACTIX_GUARD_PATTERN = /\.guard\s*\(\s*(\w+)/g;
const ACTIX_IDENTITY_PATTERN = /Identity::login|Identity::logout|identity\.id\(\)/g;

// Axum patterns
const AXUM_LAYER_PATTERN = /\.layer\s*\(\s*(\w+)/g;
const AXUM_EXTRACTOR_PATTERN = /impl\s*<[^>]*>\s*FromRequestParts\s*<[^>]*>\s*for\s+(\w+)/g;

// Rocket patterns
const ROCKET_GUARD_PATTERN = /impl\s*<'r>\s*FromRequest<'r>\s*for\s+(\w+)/g;
const ROCKET_FAIRING_PATTERN = /impl\s+Fairing\s+for\s+(\w+)/g;

// Warp patterns
const WARP_FILTER_PATTERN = /warp::header\s*::<[^>]+>\s*\(\s*"(authorization|x-api-key|cookie)"/gi;
const WARP_WITH_PATTERN = /\.with\s*\(\s*(\w+)/g;

// JWT patterns
const JWT_DECODE_PATTERN = /jsonwebtoken::decode|jwt::decode|decode_header/g;
const JWT_ENCODE_PATTERN = /jsonwebtoken::encode|jwt::encode/g;
const JWT_CLAIMS_PATTERN = /Claims\s*\{|#\[derive\([^)]*Serialize[^)]*Deserialize[^)]*\)\]\s*(?:pub\s+)?struct\s+(\w*Claims\w*)/g;

// Session patterns
const SESSION_STORE_PATTERN = /SessionStore|RedisSessionStore|MemoryStore|CookieStore/g;

// RBAC patterns
const ROLE_CHECK_PATTERN = /has_role|check_role|require_role|is_admin|is_user/g;
const PERMISSION_CHECK_PATTERN = /has_permission|check_permission|require_permission|can_access/g;

// Security issues
const HARDCODED_SECRET_PATTERN = /(?:secret|key|password|token)\s*[:=]\s*["'][^"']{8,}["']/gi;
const INSECURE_COOKIE_PATTERN = /secure\s*:\s*false|http_only\s*:\s*false/gi;

// ============================================================================
// Detector Implementation
// ============================================================================

/**
 * Detect Rust authentication and authorization patterns
 */
export function detectRustAuthPatterns(
  source: string,
  filePath: string,
  options: RustAuthDetectorOptions = {}
): RustAuthDetectionResult {
  const patterns: RustAuthPattern[] = [];
  const middlewares: RustMiddleware[] = [];
  const guards: RustGuard[] = [];
  const issues: RustAuthIssue[] = [];

  // Detect framework
  const framework = detectAuthFramework(source);

  // Actix-web patterns
  if (framework.includes('actix-web')) {
    detectActixAuthPatterns(source, filePath, patterns, middlewares, guards);
  }

  // Axum patterns
  if (framework.includes('axum')) {
    detectAxumAuthPatterns(source, filePath, patterns, middlewares, guards);
  }

  // Rocket patterns
  if (framework.includes('rocket')) {
    detectRocketAuthPatterns(source, filePath, patterns, middlewares, guards);
  }

  // Warp patterns
  if (framework.includes('warp')) {
    detectWarpAuthPatterns(source, filePath, patterns, middlewares);
  }

  // JWT patterns
  if (options.includeJwt !== false) {
    detectJwtPatterns(source, filePath, patterns);
  }

  // Session patterns
  if (options.includeSessions !== false) {
    detectSessionPatterns(source, filePath, patterns);
  }

  // RBAC patterns
  if (options.includeRbac !== false) {
    detectRbacPatterns(source, filePath, patterns);
  }

  // Security issues
  detectSecurityIssues(source, filePath, issues);

  return {
    patterns,
    middlewares,
    guards,
    issues,
  };
}

// ============================================================================
// Framework-Specific Detection
// ============================================================================

function detectActixAuthPatterns(
  source: string,
  filePath: string,
  patterns: RustAuthPattern[],
  middlewares: RustMiddleware[],
  guards: RustGuard[]
): void {
  let match;

  // Middleware
  while ((match = ACTIX_MIDDLEWARE_PATTERN.exec(source)) !== null) {
    const name = match[1] ?? 'unknown';
    const line = getLineNumber(source, match.index);
    const isAuth = isAuthMiddleware(name);

    middlewares.push({
      name,
      framework: 'actix-web',
      file: filePath,
      line,
      type: isAuth ? 'auth' : 'other',
    });

    if (isAuth) {
      patterns.push({
        id: `actix-auth-middleware-${filePath}:${line}`,
        name: 'actix-auth-middleware',
        category: 'auth' as PatternCategory,
        file: filePath,
        line,
        column: 0,
        context: `.wrap(${name})`,
        confidence: 0.9,
        framework: 'actix-web',
        authType: 'middleware',
      });
    }
  }

  // Guards
  ACTIX_GUARD_PATTERN.lastIndex = 0;
  while ((match = ACTIX_GUARD_PATTERN.exec(source)) !== null) {
    const name = match[1] ?? 'unknown';
    const line = getLineNumber(source, match.index);

    guards.push({
      name,
      framework: 'actix-web',
      file: filePath,
      line,
      protects: [],
    });

    patterns.push({
      id: `actix-guard-${filePath}:${line}`,
      name: 'actix-guard',
      category: 'auth' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: `.guard(${name})`,
      confidence: 0.85,
      framework: 'actix-web',
      authType: 'guard',
    });
  }

  // Identity
  ACTIX_IDENTITY_PATTERN.lastIndex = 0;
  while ((match = ACTIX_IDENTITY_PATTERN.exec(source)) !== null) {
    const line = getLineNumber(source, match.index);

    patterns.push({
      id: `actix-identity-${filePath}:${line}`,
      name: 'actix-identity',
      category: 'auth' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: match[0],
      confidence: 0.95,
      framework: 'actix-web',
      authType: 'session',
    });
  }
}

function detectAxumAuthPatterns(
  source: string,
  filePath: string,
  patterns: RustAuthPattern[],
  middlewares: RustMiddleware[],
  guards: RustGuard[]
): void {
  let match;

  // Layers
  while ((match = AXUM_LAYER_PATTERN.exec(source)) !== null) {
    const name = match[1] ?? 'unknown';
    const line = getLineNumber(source, match.index);
    const isAuth = isAuthMiddleware(name);

    middlewares.push({
      name,
      framework: 'axum',
      file: filePath,
      line,
      type: isAuth ? 'auth' : 'other',
    });

    if (isAuth) {
      patterns.push({
        id: `axum-auth-layer-${filePath}:${line}`,
        name: 'axum-auth-layer',
        category: 'auth' as PatternCategory,
        file: filePath,
        line,
        column: 0,
        context: `.layer(${name})`,
        confidence: 0.9,
        framework: 'axum',
        authType: 'middleware',
      });
    }
  }

  // Custom extractors
  AXUM_EXTRACTOR_PATTERN.lastIndex = 0;
  while ((match = AXUM_EXTRACTOR_PATTERN.exec(source)) !== null) {
    const name = match[1] ?? 'unknown';
    const line = getLineNumber(source, match.index);

    if (isAuthRelated(name)) {
      guards.push({
        name,
        framework: 'axum',
        file: filePath,
        line,
        protects: [],
      });

      patterns.push({
        id: `axum-auth-extractor-${filePath}:${line}`,
        name: 'axum-auth-extractor',
        category: 'auth' as PatternCategory,
        file: filePath,
        line,
        column: 0,
        context: `impl FromRequestParts for ${name}`,
        confidence: 0.9,
        framework: 'axum',
        authType: 'extractor',
      });
    }
  }
}

function detectRocketAuthPatterns(
  source: string,
  filePath: string,
  patterns: RustAuthPattern[],
  middlewares: RustMiddleware[],
  guards: RustGuard[]
): void {
  let match;

  // Request guards
  while ((match = ROCKET_GUARD_PATTERN.exec(source)) !== null) {
    const name = match[1] ?? 'unknown';
    const line = getLineNumber(source, match.index);

    guards.push({
      name,
      framework: 'rocket',
      file: filePath,
      line,
      protects: [],
    });

    if (isAuthRelated(name)) {
      patterns.push({
        id: `rocket-auth-guard-${filePath}:${line}`,
        name: 'rocket-auth-guard',
        category: 'auth' as PatternCategory,
        file: filePath,
        line,
        column: 0,
        context: `impl FromRequest for ${name}`,
        confidence: 0.9,
        framework: 'rocket',
        authType: 'guard',
      });
    }
  }

  // Fairings
  ROCKET_FAIRING_PATTERN.lastIndex = 0;
  while ((match = ROCKET_FAIRING_PATTERN.exec(source)) !== null) {
    const name = match[1] ?? 'unknown';
    const line = getLineNumber(source, match.index);

    middlewares.push({
      name,
      framework: 'rocket',
      file: filePath,
      line,
      type: isAuthMiddleware(name) ? 'auth' : 'other',
    });
  }
}

function detectWarpAuthPatterns(
  source: string,
  filePath: string,
  patterns: RustAuthPattern[],
  middlewares: RustMiddleware[]
): void {
  let match;

  // Header filters for auth
  while ((match = WARP_FILTER_PATTERN.exec(source)) !== null) {
    const header = match[1]?.toLowerCase() ?? '';
    const line = getLineNumber(source, match.index);

    let authType: RustAuthType = 'middleware';
    if (header === 'authorization') {authType = 'bearer';}
    else if (header === 'x-api-key') {authType = 'api-key';}
    else if (header === 'cookie') {authType = 'session';}

    patterns.push({
      id: `warp-auth-header-${filePath}:${line}`,
      name: 'warp-auth-header',
      category: 'auth' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: `warp::header("${header}")`,
      confidence: 0.85,
      framework: 'warp',
      authType,
    });
  }

  // With filters
  WARP_WITH_PATTERN.lastIndex = 0;
  while ((match = WARP_WITH_PATTERN.exec(source)) !== null) {
    const name = match[1] ?? 'unknown';
    const line = getLineNumber(source, match.index);

    if (isAuthMiddleware(name)) {
      middlewares.push({
        name,
        framework: 'warp',
        file: filePath,
        line,
        type: 'auth',
      });

      patterns.push({
        id: `warp-auth-filter-${filePath}:${line}`,
        name: 'warp-auth-filter',
        category: 'auth' as PatternCategory,
        file: filePath,
        line,
        column: 0,
        context: `.with(${name})`,
        confidence: 0.85,
        framework: 'warp',
        authType: 'middleware',
      });
    }
  }
}

// ============================================================================
// Cross-Framework Detection
// ============================================================================

function detectJwtPatterns(
  source: string,
  filePath: string,
  patterns: RustAuthPattern[]
): void {
  let match;

  // JWT decode
  while ((match = JWT_DECODE_PATTERN.exec(source)) !== null) {
    const line = getLineNumber(source, match.index);

    patterns.push({
      id: `rust-jwt-decode-${filePath}:${line}`,
      name: 'rust-jwt-decode',
      category: 'auth' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: match[0],
      confidence: 0.95,
      framework: 'jsonwebtoken',
      authType: 'jwt',
    });
  }

  // JWT encode
  JWT_ENCODE_PATTERN.lastIndex = 0;
  while ((match = JWT_ENCODE_PATTERN.exec(source)) !== null) {
    const line = getLineNumber(source, match.index);

    patterns.push({
      id: `rust-jwt-encode-${filePath}:${line}`,
      name: 'rust-jwt-encode',
      category: 'auth' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: match[0],
      confidence: 0.95,
      framework: 'jsonwebtoken',
      authType: 'jwt',
    });
  }

  // JWT Claims struct
  JWT_CLAIMS_PATTERN.lastIndex = 0;
  while ((match = JWT_CLAIMS_PATTERN.exec(source)) !== null) {
    const line = getLineNumber(source, match.index);

    patterns.push({
      id: `rust-jwt-claims-${filePath}:${line}`,
      name: 'rust-jwt-claims',
      category: 'auth' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: match[1] ? `struct ${match[1]}` : 'Claims struct',
      confidence: 0.9,
      framework: 'jsonwebtoken',
      authType: 'jwt',
    });
  }
}

function detectSessionPatterns(
  source: string,
  filePath: string,
  patterns: RustAuthPattern[]
): void {
  let match;

  // Session stores
  while ((match = SESSION_STORE_PATTERN.exec(source)) !== null) {
    const line = getLineNumber(source, match.index);

    patterns.push({
      id: `rust-session-store-${filePath}:${line}`,
      name: 'rust-session-store',
      category: 'auth' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: match[0],
      confidence: 0.9,
      framework: 'session',
      authType: 'session',
    });
  }
}

function detectRbacPatterns(
  source: string,
  filePath: string,
  patterns: RustAuthPattern[]
): void {
  let match;

  // Role checks
  while ((match = ROLE_CHECK_PATTERN.exec(source)) !== null) {
    const line = getLineNumber(source, match.index);

    patterns.push({
      id: `rust-role-check-${filePath}:${line}`,
      name: 'rust-role-check',
      category: 'auth' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: match[0],
      confidence: 0.85,
      framework: 'rbac',
      authType: 'rbac',
    });
  }

  // Permission checks
  PERMISSION_CHECK_PATTERN.lastIndex = 0;
  while ((match = PERMISSION_CHECK_PATTERN.exec(source)) !== null) {
    const line = getLineNumber(source, match.index);

    patterns.push({
      id: `rust-permission-check-${filePath}:${line}`,
      name: 'rust-permission-check',
      category: 'auth' as PatternCategory,
      file: filePath,
      line,
      column: 0,
      context: match[0],
      confidence: 0.85,
      framework: 'rbac',
      authType: 'permission',
    });
  }
}

function detectSecurityIssues(
  source: string,
  filePath: string,
  issues: RustAuthIssue[]
): void {
  let match;

  // Hardcoded secrets
  while ((match = HARDCODED_SECRET_PATTERN.exec(source)) !== null) {
    const line = getLineNumber(source, match.index);

    issues.push({
      type: 'hardcoded-secret',
      message: 'Potential hardcoded secret detected',
      file: filePath,
      line,
      suggestion: 'Use environment variables or a secrets manager',
    });
  }

  // Insecure cookie settings
  INSECURE_COOKIE_PATTERN.lastIndex = 0;
  while ((match = INSECURE_COOKIE_PATTERN.exec(source)) !== null) {
    const line = getLineNumber(source, match.index);

    issues.push({
      type: 'insecure-session',
      message: 'Insecure cookie configuration detected',
      file: filePath,
      line,
      suggestion: 'Set secure: true and http_only: true for session cookies',
    });
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function getLineNumber(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

function isAuthMiddleware(name: string): boolean {
  const authKeywords = [
    'auth', 'jwt', 'bearer', 'token', 'session', 'identity',
    'login', 'logout', 'permission', 'role', 'guard', 'protect',
  ];
  const lowerName = name.toLowerCase();
  return authKeywords.some(kw => lowerName.includes(kw));
}

function isAuthRelated(name: string): boolean {
  const authKeywords = [
    'auth', 'user', 'claims', 'token', 'session', 'identity',
    'principal', 'credential', 'permission', 'role',
  ];
  const lowerName = name.toLowerCase();
  return authKeywords.some(kw => lowerName.includes(kw));
}

function detectAuthFramework(source: string): string[] {
  const frameworks: string[] = [];

  if (source.includes('actix_web') || source.includes('actix-web')) {
    frameworks.push('actix-web');
  }
  if (source.includes('axum::') || source.includes('use axum')) {
    frameworks.push('axum');
  }
  if (source.includes('rocket::') || source.includes('use rocket')) {
    frameworks.push('rocket');
  }
  if (source.includes('warp::') || source.includes('use warp')) {
    frameworks.push('warp');
  }

  return frameworks;
}

/**
 * Check if source has authentication patterns
 */
export function hasRustAuthPatterns(source: string): boolean {
  return JWT_DECODE_PATTERN.test(source) ||
         SESSION_STORE_PATTERN.test(source) ||
         ROLE_CHECK_PATTERN.test(source) ||
         source.includes('Authorization') ||
         source.includes('Bearer');
}
