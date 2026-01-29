/**
 * Repository Pattern Detector for C#
 *
 * Detects repository pattern implementations:
 * - IRepository<T> interfaces
 * - Generic repository implementations
 * - Unit of Work patterns
 * - Specification pattern
 */

import { BaseDetector } from '../../base/base-detector.js';

import type { DetectionContext, DetectionResult } from '../../base/base-detector.js';
import type { PatternMatch, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export interface RepositoryPatternInfo {
  /** Type of repository pattern */
  type: 'repository-interface' | 'repository-impl' | 'unit-of-work' | 'specification' | 'generic-repository';
  /** Name of the repository/interface */
  name: string;
  /** Entity type if generic */
  entityType: string | null;
  /** Methods defined/implemented */
  methods: string[];
  /** Line number */
  line: number;
  /** File path */
  file: string;
}

export interface RepositoryAnalysis {
  /** All repository patterns found */
  patterns: RepositoryPatternInfo[];
  /** Repository interfaces */
  interfaces: string[];
  /** Repository implementations */
  implementations: string[];
  /** Whether using Unit of Work */
  usesUnitOfWork: boolean;
  /** Whether using Specification pattern */
  usesSpecification: boolean;
  /** Confidence score */
  confidence: number;
}

// ============================================================================
// Patterns
// ============================================================================

const REPOSITORY_METHODS = [
  'GetById', 'GetByIdAsync', 'Get', 'GetAsync',
  'GetAll', 'GetAllAsync', 'List', 'ListAsync',
  'Find', 'FindAsync', 'Query',
  'Add', 'AddAsync', 'Insert', 'InsertAsync',
  'Update', 'UpdateAsync',
  'Delete', 'DeleteAsync', 'Remove', 'RemoveAsync',
  'Save', 'SaveAsync', 'SaveChanges', 'SaveChangesAsync',
  'Count', 'CountAsync', 'Any', 'AnyAsync',
];

// ============================================================================
// Detector Implementation
// ============================================================================

export class RepositoryPatternDetector extends BaseDetector {
  readonly id = 'data-access/repository-pattern';
  readonly category = 'data-access' as const;
  readonly subcategory = 'patterns';
  readonly name = 'Repository Pattern Detector';
  readonly description = 'Detects repository pattern implementations in C#';
  readonly supportedLanguages: Language[] = ['csharp'];
  readonly detectionMethod = 'regex' as const;

  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;
    
    if (!this.isRelevantFile(content)) {
      return this.createEmptyResult();
    }

    const analysis = this.analyzeRepositoryPattern(content, file);
    const patterns: PatternMatch[] = [];

    for (const pattern of analysis.patterns) {
      patterns.push({
        patternId: `${this.id}/${pattern.type}`,
        location: {
          file: pattern.file,
          line: pattern.line,
          column: 1,
        },
        confidence: analysis.confidence,
        isOutlier: false,
      });
    }

    return this.createResult(patterns, [], analysis.confidence, {
      custom: {
        repositoryAnalysis: analysis,
      },
    });
  }

  private isRelevantFile(content: string): boolean {
    return (
      content.includes('IRepository') ||
      content.includes('Repository<') ||
      content.includes('IUnitOfWork') ||
      content.includes('UnitOfWork') ||
      content.includes('ISpecification') ||
      (content.includes('interface') && content.includes('GetById'))
    );
  }

  analyzeRepositoryPattern(content: string, file: string): RepositoryAnalysis {
    const patterns: RepositoryPatternInfo[] = [];
    const interfaces: string[] = [];
    const implementations: string[] = [];
    let usesUnitOfWork = false;
    let usesSpecification = false;

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || '';
      const lineNum = i + 1;

      // Detect generic repository interface (e.g., IRepository<T>)
      const genericInterfaceMatch = line.match(/interface\s+(I\w*Repository\w*)<(\w+)>/);
      if (genericInterfaceMatch?.[1]) {
        interfaces.push(genericInterfaceMatch[1]);
        patterns.push({
          type: 'repository-interface',
          name: genericInterfaceMatch[1],
          entityType: genericInterfaceMatch[2] || null,
          methods: this.extractMethods(content, i),
          line: lineNum,
          file,
        });
      }

      // Detect repository interface that extends another (e.g., IUserRepository : IRepository<User>)
      const extendingInterfaceMatch = line.match(/interface\s+(I\w*Repository\w*)\s*:\s*I\w*Repository(?:<(\w+)>)?/);
      if (extendingInterfaceMatch?.[1] && !genericInterfaceMatch) {
        interfaces.push(extendingInterfaceMatch[1]);
        patterns.push({
          type: 'repository-interface',
          name: extendingInterfaceMatch[1],
          entityType: extendingInterfaceMatch[2] || null,
          methods: this.extractMethods(content, i),
          line: lineNum,
          file,
        });
      }

      // Detect non-generic repository interface (e.g., IRepository without generics)
      const simpleInterfaceMatch = line.match(/interface\s+(I\w*Repository)\s*[:{]/);
      if (simpleInterfaceMatch?.[1] && !line.includes('<') && !extendingInterfaceMatch) {
        interfaces.push(simpleInterfaceMatch[1]);
        patterns.push({
          type: 'repository-interface',
          name: simpleInterfaceMatch[1],
          entityType: null,
          methods: this.extractMethods(content, i),
          line: lineNum,
          file,
        });
      }

      // Detect repository implementation
      const implMatch = line.match(/class\s+(\w*Repository\w*)\s*(?:<(\w+)>)?\s*:/);
      if (implMatch?.[1]) {
        implementations.push(implMatch[1]);
        const isGeneric = line.includes('IRepository<') || line.includes('Repository<');
        patterns.push({
          type: isGeneric ? 'generic-repository' : 'repository-impl',
          name: implMatch[1],
          entityType: implMatch[2] || null,
          methods: [],
          line: lineNum,
          file,
        });
      }

      // Detect Unit of Work
      if (line.includes('IUnitOfWork') || line.match(/class\s+\w*UnitOfWork/)) {
        usesUnitOfWork = true;
        const uowMatch = line.match(/(?:interface|class)\s+(\w*UnitOfWork\w*)/);
        if (uowMatch?.[1]) {
          patterns.push({
            type: 'unit-of-work',
            name: uowMatch[1],
            entityType: null,
            methods: [],
            line: lineNum,
            file,
          });
        }
      }

      // Detect Specification pattern
      if (line.includes('ISpecification') || line.match(/class\s+\w+Specification/)) {
        usesSpecification = true;
        const specMatch = line.match(/(?:interface|class)\s+(\w*Specification\w*)/);
        if (specMatch?.[1]) {
          patterns.push({
            type: 'specification',
            name: specMatch[1],
            entityType: null,
            methods: [],
            line: lineNum,
            file,
          });
        }
      }
    }

    return {
      patterns,
      interfaces,
      implementations,
      usesUnitOfWork,
      usesSpecification,
      confidence: patterns.length > 0 ? 0.85 : 0,
    };
  }

  private extractMethods(content: string, startLine: number): string[] {
    const methods: string[] = [];
    const lines = content.split('\n');
    let braceCount = 0;
    let started = false;

    for (let i = startLine; i < lines.length && i < startLine + 50; i++) {
      const line = lines[i] || '';
      
      if (line.includes('{')) {
        braceCount++;
        started = true;
      }
      if (line.includes('}')) {
        braceCount--;
        if (started && braceCount === 0) {break;}
      }

      // Look for method signatures
      for (const method of REPOSITORY_METHODS) {
        if (line.includes(method)) {
          methods.push(method);
        }
      }
    }

    return [...new Set(methods)];
  }

  generateQuickFix(): null {
    return null;
  }
}

export function createRepositoryPatternDetector(): RepositoryPatternDetector {
  return new RepositoryPatternDetector();
}
