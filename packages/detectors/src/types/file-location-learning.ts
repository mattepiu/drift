/**
 * Type File Location Detector - LEARNING VERSION
 *
 * Learns type file organization patterns from the user's codebase:
 * - Type file placement
 * - Naming conventions
 * - Export patterns
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

export type TypeFileLocation = 'colocated' | 'types-folder' | 'root-types' | 'declaration-files';

export interface TypeFileLocationConventions {
  [key: string]: unknown;
  typeFileLocation: TypeFileLocation;
  usesDeclarationFiles: boolean;
  typeFileNaming: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function detectTypeFileLocation(filePath: string): TypeFileLocation | null {
  if (/\.d\.ts$/.test(filePath)) {return 'declaration-files';}
  if (/\/types\/|\/interfaces\//.test(filePath)) {return 'types-folder';}
  if (/\.types\.[tj]s$/.test(filePath)) {return 'colocated';}
  if (/^types\/|^src\/types\//.test(filePath)) {return 'root-types';}
  return null;
}

// ============================================================================
// Learning Type File Location Detector
// ============================================================================

export class TypeFileLocationLearningDetector extends LearningDetector<TypeFileLocationConventions> {
  readonly id = 'types/file-location';
  readonly category = 'types' as const;
  readonly subcategory = 'file-location';
  readonly name = 'Type File Location Detector (Learning)';
  readonly description = 'Learns type file organization patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript'];

  protected getConventionKeys(): Array<keyof TypeFileLocationConventions> {
    return ['typeFileLocation', 'usesDeclarationFiles', 'typeFileNaming'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof TypeFileLocationConventions, ValueDistribution>
  ): void {
    const location = detectTypeFileLocation(context.file);
    const locationDist = distributions.get('typeFileLocation')!;
    const declDist = distributions.get('usesDeclarationFiles')!;
    
    if (location) {locationDist.add(location, context.file);}
    declDist.add(/\.d\.ts$/.test(context.file), context.file);
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<TypeFileLocationConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    const currentLocation = detectTypeFileLocation(context.file);
    const learnedLocation = conventions.conventions.typeFileLocation?.value;
    
    if (currentLocation && learnedLocation && currentLocation !== learnedLocation) {
      violations.push(this.createConventionViolation(
        context.file, 1, 1,
        'type file location', currentLocation, learnedLocation,
        `Type file uses '${currentLocation}' but your project uses '${learnedLocation}'`
      ));
    }
    
    if (currentLocation) {
      patterns.push({
        patternId: `${this.id}/${currentLocation}`,
        location: { file: context.file, line: 1, column: 1 },
        confidence: 1.0, isOutlier: false,
      });
    }
    
    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }
}

export function createTypeFileLocationLearningDetector(): TypeFileLocationLearningDetector {
  return new TypeFileLocationLearningDetector();
}
