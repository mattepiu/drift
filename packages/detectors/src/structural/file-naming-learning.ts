/**
 * File Naming Detector - LEARNING VERSION
 *
 * Learns file naming conventions from the user's codebase:
 * - Component file naming (PascalCase, kebab-case, etc.)
 * - Utility file naming
 * - Test file naming
 * - Index file patterns
 *
 * @requirements DRIFT-CORE - Learn patterns from user's code
 */

import {
  LearningDetector,
  ValueDistribution,
  type DetectionContext,
  type DetectionResult,
  type LearningResult,
} from '../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type NamingConvention = 'PascalCase' | 'camelCase' | 'kebab-case' | 'snake_case' | 'SCREAMING_SNAKE_CASE';

export interface FileNamingConventions {
  [key: string]: unknown;
  /** Component file naming convention */
  componentNaming: NamingConvention;
  /** Utility/helper file naming convention */
  utilityNaming: NamingConvention;
  /** Hook file naming convention */
  hookNaming: NamingConvention;
  /** Service file naming convention */
  serviceNaming: NamingConvention;
  /** Test file suffix (.test vs .spec) */
  testSuffix: '.test' | '.spec';
  /** Uses index files for barrel exports */
  usesIndexFiles: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

function detectNamingConvention(filename: string): NamingConvention {
  // Remove extension
  const name = filename.replace(/\.[^.]+$/, '');
  
  if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) {return 'PascalCase';}
  if (/^[a-z][a-zA-Z0-9]*$/.test(name)) {return 'camelCase';}
  if (/^[a-z][a-z0-9-]*$/.test(name)) {return 'kebab-case';}
  if (/^[a-z][a-z0-9_]*$/.test(name)) {return 'snake_case';}
  if (/^[A-Z][A-Z0-9_]*$/.test(name)) {return 'SCREAMING_SNAKE_CASE';}
  
  // Default based on first character
  if (/^[A-Z]/.test(name)) {return 'PascalCase';}
  if (name.includes('-')) {return 'kebab-case';}
  if (name.includes('_')) {return 'snake_case';}
  return 'camelCase';
}

function getFileType(filePath: string): 'component' | 'utility' | 'hook' | 'service' | 'test' | 'index' | 'other' {
  const filename = filePath.split('/').pop() || '';
  const lowerPath = filePath.toLowerCase();
  
  if (filename === 'index.ts' || filename === 'index.tsx' || filename === 'index.js') {return 'index';}
  if (/\.test\.[jt]sx?$/.test(filename) || /\.spec\.[jt]sx?$/.test(filename)) {return 'test';}
  if (/^use[A-Z]/.test(filename) || lowerPath.includes('/hooks/')) {return 'hook';}
  if (lowerPath.includes('/services/') || /Service\.[jt]sx?$/.test(filename)) {return 'service';}
  if (lowerPath.includes('/components/') || /\.[jt]sx$/.test(filename)) {return 'component';}
  if (lowerPath.includes('/utils/') || lowerPath.includes('/helpers/') || lowerPath.includes('/lib/')) {return 'utility';}
  
  return 'other';
}

function toConvention(name: string, convention: NamingConvention): string {
  // Normalize to words
  const words = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .toLowerCase()
    .split(' ')
    .filter(Boolean);
  
  switch (convention) {
    case 'PascalCase':
      return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
    case 'camelCase':
      return words.map((w, i) => i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)).join('');
    case 'kebab-case':
      return words.join('-');
    case 'snake_case':
      return words.join('_');
    case 'SCREAMING_SNAKE_CASE':
      return words.map(w => w.toUpperCase()).join('_');
  }
}

// ============================================================================
// Learning Detector
// ============================================================================

export class FileNamingLearningDetector extends LearningDetector<FileNamingConventions> {
  readonly id = 'structural/file-naming';
  readonly category = 'structural' as const;
  readonly subcategory = 'naming';
  readonly name = 'File Naming Detector (Learning)';
  readonly description = 'Learns file naming conventions from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof FileNamingConventions> {
    return ['componentNaming', 'utilityNaming', 'hookNaming', 'serviceNaming', 'testSuffix', 'usesIndexFiles'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof FileNamingConventions, ValueDistribution>
  ): void {
    const filename = context.file.split('/').pop() || '';
    const fileType = getFileType(context.file);
    
    if (fileType === 'index') {
      distributions.get('usesIndexFiles')!.add(true, context.file);
      return;
    }
    
    if (fileType === 'test') {
      const suffix = /\.spec\.[jt]sx?$/.test(filename) ? '.spec' : '.test';
      distributions.get('testSuffix')!.add(suffix, context.file);
      return;
    }
    
    const convention = detectNamingConvention(filename);
    
    switch (fileType) {
      case 'component':
        distributions.get('componentNaming')!.add(convention, context.file);
        break;
      case 'utility':
        distributions.get('utilityNaming')!.add(convention, context.file);
        break;
      case 'hook':
        distributions.get('hookNaming')!.add(convention, context.file);
        break;
      case 'service':
        distributions.get('serviceNaming')!.add(convention, context.file);
        break;
    }
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<FileNamingConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    const filename = context.file.split('/').pop() || '';
    const fileType = getFileType(context.file);
    
    if (fileType === 'other' || fileType === 'index') {
      return this.createEmptyResult();
    }
    
    const actualConvention = detectNamingConvention(filename);
    let expectedConvention: NamingConvention | null = null;
    let conventionKey = '';
    
    switch (fileType) {
      case 'component':
        expectedConvention = conventions.conventions.componentNaming?.value ?? null;
        conventionKey = 'component file naming';
        break;
      case 'utility':
        expectedConvention = conventions.conventions.utilityNaming?.value ?? null;
        conventionKey = 'utility file naming';
        break;
      case 'hook':
        expectedConvention = conventions.conventions.hookNaming?.value ?? null;
        conventionKey = 'hook file naming';
        break;
      case 'service':
        expectedConvention = conventions.conventions.serviceNaming?.value ?? null;
        conventionKey = 'service file naming';
        break;
      case 'test':
        const expectedSuffix = conventions.conventions.testSuffix?.value;
        if (expectedSuffix) {
          const actualSuffix = /\.spec\.[jt]sx?$/.test(filename) ? '.spec' : '.test';
          if (actualSuffix !== expectedSuffix) {
            const baseName = filename.replace(/\.(test|spec)\.[jt]sx?$/, '');
            const ext = filename.match(/\.[jt]sx?$/)?.[0] || '.ts';
            violations.push(this.createConventionViolation(
              context.file, 1, 1,
              'test file suffix',
              actualSuffix,
              expectedSuffix,
              `Test file uses '${actualSuffix}' but project uses '${expectedSuffix}'. Rename to '${baseName}${expectedSuffix}${ext}'`
            ));
          }
        }
        return this.createResult(patterns, violations, violations.length === 0 ? 1.0 : 0.8);
    }
    
    if (expectedConvention && actualConvention !== expectedConvention) {
      const baseName = filename.replace(/\.[^.]+$/, '');
      const ext = filename.match(/\.[^.]+$/)?.[0] || '';
      const suggestedName = toConvention(baseName, expectedConvention) + ext;
      
      violations.push(this.createConventionViolation(
        context.file, 1, 1,
        conventionKey,
        actualConvention,
        expectedConvention,
        `File '${filename}' uses ${actualConvention} but project uses ${expectedConvention}. Rename to '${suggestedName}'`
      ));
    }
    
    return this.createResult(patterns, violations, violations.length === 0 ? 1.0 : 0.8);
  }

  override generateQuickFix(_violation: Violation): QuickFix | null {
    return null; // File renames need IDE support
  }
}

export function createFileNamingLearningDetector(): FileNamingLearningDetector {
  return new FileNamingLearningDetector();
}
