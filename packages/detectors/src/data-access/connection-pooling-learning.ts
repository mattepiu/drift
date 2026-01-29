/**
 * Connection Pooling Detector - LEARNING VERSION
 *
 * Learns connection pooling patterns from the user's codebase:
 * - Pool configuration
 * - Connection management
 * - Timeout settings
 *
 * @requirements DRIFT-CORE - Learn patterns from user's code, not enforce arbitrary rules
 */

import {
  LearningDetector,
  ValueDistribution,
  type DetectionContext,
  type DetectionResult,
  type LearningResult,
} from '../base/index.js';

import type { PatternMatch, Violation, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type PoolLibrary = 'pg-pool' | 'mysql2' | 'generic-pool' | 'prisma' | 'typeorm';

export interface ConnectionPoolingConventions {
  [key: string]: unknown;
  poolLibrary: PoolLibrary;
  defaultPoolSize: number | null;
  usesConnectionTimeout: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

const POOL_PATTERNS: Array<{ pattern: RegExp; library: PoolLibrary }> = [
  { pattern: /import.*from\s+['"]pg['"]/i, library: 'pg-pool' },
  { pattern: /import.*from\s+['"]mysql2['"]/i, library: 'mysql2' },
  { pattern: /import.*from\s+['"]generic-pool['"]/i, library: 'generic-pool' },
  { pattern: /PrismaClient|@prisma\/client/i, library: 'prisma' },
  { pattern: /createConnection|DataSource.*typeorm/i, library: 'typeorm' },
];

function detectPoolLibrary(content: string): PoolLibrary | null {
  for (const { pattern, library } of POOL_PATTERNS) {
    if (pattern.test(content)) {return library;}
  }
  return null;
}

function extractPoolSize(content: string): number | null {
  const match = content.match(/(?:pool|max|connectionLimit):\s*(\d+)/i);
  return match ? parseInt(match[1]!, 10) : null;
}

// ============================================================================
// Learning Connection Pooling Detector
// ============================================================================

export class ConnectionPoolingLearningDetector extends LearningDetector<ConnectionPoolingConventions> {
  readonly id = 'data-access/connection-pooling';
  readonly category = 'data-access' as const;
  readonly subcategory = 'connection-pooling';
  readonly name = 'Connection Pooling Detector (Learning)';
  readonly description = 'Learns connection pooling patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof ConnectionPoolingConventions> {
    return ['poolLibrary', 'defaultPoolSize', 'usesConnectionTimeout'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof ConnectionPoolingConventions, ValueDistribution>
  ): void {
    const library = detectPoolLibrary(context.content);
    const poolSize = extractPoolSize(context.content);
    
    const libraryDist = distributions.get('poolLibrary')!;
    const sizeDist = distributions.get('defaultPoolSize')!;
    const timeoutDist = distributions.get('usesConnectionTimeout')!;
    
    if (library) {libraryDist.add(library, context.file);}
    if (poolSize) {sizeDist.add(poolSize, context.file);}
    
    const hasTimeout = /connectionTimeout|acquireTimeout|idleTimeout/i.test(context.content);
    timeoutDist.add(hasTimeout, context.file);
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<ConnectionPoolingConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    const currentLibrary = detectPoolLibrary(context.content);
    const learnedLibrary = conventions.conventions.poolLibrary?.value;
    
    if (currentLibrary && learnedLibrary && currentLibrary !== learnedLibrary) {
      violations.push(this.createConventionViolation(
        context.file, 1, 1,
        'pool library', currentLibrary, learnedLibrary,
        `Using '${currentLibrary}' but your project uses '${learnedLibrary}'`
      ));
    }
    
    if (currentLibrary) {
      patterns.push({
        patternId: `${this.id}/${currentLibrary}`,
        location: { file: context.file, line: 1, column: 1 },
        confidence: 1.0, isOutlier: false,
      });
    }
    
    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }
}

export function createConnectionPoolingLearningDetector(): ConnectionPoolingLearningDetector {
  return new ConnectionPoolingLearningDetector();
}
