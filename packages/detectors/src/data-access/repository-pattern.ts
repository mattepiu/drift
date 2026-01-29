/**
 * Repository Pattern Detector - Repository usage detection
 *
 * Detects repository pattern implementations including:
 * - Repository class definitions
 * - Repository interface usage
 * - Data access layer separation
 * - Direct database access violations
 *
 * @requirements 13.2 - Repository pattern detection
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type RepositoryPatternType =
  | 'repository-class'
  | 'repository-interface'
  | 'repository-injection'
  | 'generic-repository'
  | 'base-repository';

export type RepositoryViolationType =
  | 'direct-db-access'
  | 'missing-interface'
  | 'god-repository';

export interface RepositoryPatternInfo {
  type: RepositoryPatternType;
  line: number;
  column: number;
  match: string;
  name?: string | undefined;
}

export interface RepositoryViolationInfo {
  type: RepositoryViolationType;
  line: number;
  column: number;
  match: string;
  message: string;
}

export interface RepositoryAnalysis {
  patterns: RepositoryPatternInfo[];
  violations: RepositoryViolationInfo[];
  hasRepositoryPattern: boolean;
  repositoryCount: number;
}

// ============================================================================
// Patterns
// ============================================================================

export const REPOSITORY_CLASS_PATTERNS = [
  // JavaScript/TypeScript
  /class\s+(\w+Repository)\s+(?:extends|implements)/gi,
  /class\s+(\w+Repository)\s*\{/gi,
  /export\s+class\s+(\w+Repository)/gi,
  // Python
  /class\s+(\w+Repository)\s*\(/gi,
  /class\s+(\w+Repository)\s*:/gi,
  /class\s+(\w+Repo)\s*\(/gi,
];

export const REPOSITORY_INTERFACE_PATTERNS = [
  /interface\s+I?(\w+Repository)/gi,
  /type\s+(\w+Repository)\s*=/gi,
];

export const REPOSITORY_INJECTION_PATTERNS = [
  /constructor\s*\([^)]*(\w+Repository)[^)]*\)/gi,
  /private\s+(?:readonly\s+)?(\w+Repository)/gi,
  /@Inject\s*\([^)]*Repository/gi,
];

export const GENERIC_REPOSITORY_PATTERNS = [
  /class\s+\w+Repository<\s*\w+\s*>/gi,
  /BaseRepository<\s*\w+\s*>/gi,
  /GenericRepository<\s*\w+\s*>/gi,
];

export const BASE_REPOSITORY_PATTERNS = [
  /class\s+BaseRepository/gi,
  /abstract\s+class\s+\w*Repository/gi,
  /extends\s+BaseRepository/gi,
];

export const DIRECT_DB_ACCESS_PATTERNS = [
  // JavaScript/TypeScript
  /(?:prisma|db|database)\.\w+\.(find|create|update|delete)/gi,
  /getRepository\s*\(\s*\w+\s*\)\.(find|save|delete)/gi,
  // Python
  /session\.query\s*\(/gi,
  /session\.execute\s*\(/gi,
  /\.objects\.(get|filter|create|update|delete)/gi, // Django ORM
  /supabase\.table\s*\(/gi,
  /cursor\.execute\s*\(/gi,
];

// ============================================================================
// Analysis Functions
// ============================================================================

export function shouldExcludeFile(filePath: string): boolean {
  const excludePatterns = [
    /\.test\.[jt]sx?$/,
    /\.spec\.[jt]sx?$/,
    /__tests__\//,
    /\.d\.ts$/,
    /node_modules\//,
  ];
  return excludePatterns.some((p) => p.test(filePath));
}

export function detectRepositoryClasses(content: string): RepositoryPatternInfo[] {
  const results: RepositoryPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of REPOSITORY_CLASS_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'repository-class',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
          name: match[1],
        });
      }
    }
  }

  return results;
}

export function detectRepositoryInterfaces(content: string): RepositoryPatternInfo[] {
  const results: RepositoryPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of REPOSITORY_INTERFACE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'repository-interface',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
          name: match[1],
        });
      }
    }
  }

  return results;
}

export function detectRepositoryInjection(content: string): RepositoryPatternInfo[] {
  const results: RepositoryPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of REPOSITORY_INJECTION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'repository-injection',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
          name: match[1],
        });
      }
    }
  }

  return results;
}

export function detectGenericRepositories(content: string): RepositoryPatternInfo[] {
  const results: RepositoryPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of GENERIC_REPOSITORY_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'generic-repository',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function detectBaseRepositories(content: string): RepositoryPatternInfo[] {
  const results: RepositoryPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of BASE_REPOSITORY_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'base-repository',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  }

  return results;
}

export function detectDirectDBAccessViolations(
  content: string,
  filePath: string
): RepositoryViolationInfo[] {
  // Only flag direct DB access in non-repository files
  if (/repository/i.test(filePath)) {
    return [];
  }

  const results: RepositoryViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of DIRECT_DB_ACCESS_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'direct-db-access',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
          message: 'Direct database access outside repository - consider using repository pattern',
        });
      }
    }
  }

  return results;
}

export function analyzeRepositoryPattern(content: string, filePath: string): RepositoryAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      violations: [],
      hasRepositoryPattern: false,
      repositoryCount: 0,
    };
  }

  const patterns: RepositoryPatternInfo[] = [
    ...detectRepositoryClasses(content),
    ...detectRepositoryInterfaces(content),
    ...detectRepositoryInjection(content),
    ...detectGenericRepositories(content),
    ...detectBaseRepositories(content),
  ];

  const violations = detectDirectDBAccessViolations(content, filePath);

  const repositoryClasses = patterns.filter((p) => p.type === 'repository-class');

  return {
    patterns,
    violations,
    hasRepositoryPattern: patterns.length > 0,
    repositoryCount: repositoryClasses.length,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class RepositoryPatternDetector extends RegexDetector {
  readonly id = 'data-access/repository-pattern';
  readonly name = 'Repository Pattern Detector';
  readonly description = 'Detects repository pattern usage and identifies direct database access violations';
  readonly category: PatternCategory = 'data-access';
  readonly subcategory = 'repository-pattern';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeRepositoryPattern(context.content, context.file);

    if (analysis.patterns.length === 0 && analysis.violations.length === 0) {
      return this.createEmptyResult();
    }

    // Convert internal violations to standard Violation format
    const violations = analysis.violations.map(v => this.convertViolationInfo({
      file: context.file,
      line: v.line,
      column: v.column,
      type: v.type,
      value: v.match,
      issue: v.message,
      severity: 'warning',
    }));

    const confidence = analysis.hasRepositoryPattern ? 0.9 : 0.7;
    return this.createResult([], violations, confidence, {
      custom: {
        patterns: analysis.patterns,
        hasRepositoryPattern: analysis.hasRepositoryPattern,
        repositoryCount: analysis.repositoryCount,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createRepositoryPatternDetector(): RepositoryPatternDetector {
  return new RepositoryPatternDetector();
}
