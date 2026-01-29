/**
 * Directory Structure Detector - LEARNING VERSION
 *
 * Learns directory structure patterns from the user's codebase:
 * - Folder naming conventions
 * - Module organization patterns
 * - Feature vs layer organization
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

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type DirectoryNamingStyle = 'kebab-case' | 'camelCase' | 'PascalCase' | 'snake_case';
export type OrganizationStyle = 'feature-based' | 'layer-based' | 'hybrid';

export interface DirectoryStructureConventions {
  [key: string]: unknown;
  namingStyle: DirectoryNamingStyle;
  organizationStyle: OrganizationStyle;
  usesIndexFiles: boolean;
}

interface DirectoryInfo {
  name: string;
  namingStyle: DirectoryNamingStyle;
  depth: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function detectNamingStyle(name: string): DirectoryNamingStyle {
  if (name.includes('-')) {return 'kebab-case';}
  if (name.includes('_')) {return 'snake_case';}
  if (/^[A-Z]/.test(name)) {return 'PascalCase';}
  return 'camelCase';
}

function extractDirectoryInfo(file: string): DirectoryInfo[] {
  const results: DirectoryInfo[] = [];
  const parts = file.split('/');
  
  // Skip the filename, analyze directories
  for (let i = 0; i < parts.length - 1; i++) {
    const dirName = parts[i];
    if (!dirName || dirName === '.' || dirName === '..') {continue;}
    
    results.push({
      name: dirName,
      namingStyle: detectNamingStyle(dirName),
      depth: i,
      file,
    });
  }

  return results;
}

// ============================================================================
// Learning Directory Structure Detector
// ============================================================================

export class DirectoryStructureLearningDetector extends LearningDetector<DirectoryStructureConventions> {
  readonly id = 'structural/directory-structure';
  readonly category = 'structural' as const;
  readonly subcategory = 'directory-structure';
  readonly name = 'Directory Structure Detector (Learning)';
  readonly description = 'Learns directory structure patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof DirectoryStructureConventions> {
    return ['namingStyle', 'organizationStyle', 'usesIndexFiles'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof DirectoryStructureConventions, ValueDistribution>
  ): void {
    const dirs = extractDirectoryInfo(context.file);
    if (dirs.length === 0) {return;}

    const namingDist = distributions.get('namingStyle')!;
    const indexDist = distributions.get('usesIndexFiles')!;

    for (const dir of dirs) {
      namingDist.add(dir.namingStyle, context.file);
    }

    // Check if this is an index file
    const isIndex = /index\.[jt]sx?$/.test(context.file);
    indexDist.add(isIndex, context.file);
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<DirectoryStructureConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const dirs = extractDirectoryInfo(context.file);
    if (dirs.length === 0) {
      return this.createEmptyResult();
    }

    const learnedNaming = conventions.conventions.namingStyle?.value;

    // Check naming style consistency
    if (learnedNaming) {
      for (const dir of dirs) {
        if (dir.namingStyle !== learnedNaming) {
          violations.push(this.createConventionViolation(
            context.file, 1, 1,
            'directory naming', dir.namingStyle, learnedNaming,
            `Directory '${dir.name}' uses ${dir.namingStyle} but project uses ${learnedNaming}`
          ));
        }
      }
    }

    if (dirs.length > 0) {
      patterns.push({
        patternId: `${this.id}/directory`,
        location: { file: context.file, line: 1, column: 1 },
        confidence: 1.0,
        isOutlier: violations.length > 0,
      });
    }

    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }

  override generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createDirectoryStructureLearningDetector(): DirectoryStructureLearningDetector {
  return new DirectoryStructureLearningDetector();
}
