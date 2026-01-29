/**
 * DTO Patterns Detector - Data Transfer Object pattern detection
 *
 * Detects DTO patterns including:
 * - DTO class definitions
 * - DTO interfaces
 * - Mapper functions
 * - Transformation patterns
 *
 * @requirements 13.5 - DTO pattern detection
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type DTOPatternType =
  | 'dto-class'
  | 'dto-interface'
  | 'dto-type'
  | 'mapper-function'
  | 'transformer-class'
  | 'serializer';

export type DTOViolationType =
  | 'missing-dto'
  | 'entity-exposure'
  | 'inconsistent-naming';

export interface DTOPatternInfo {
  type: DTOPatternType;
  line: number;
  column: number;
  match: string;
  name?: string | undefined;
}

export interface DTOViolationInfo {
  type: DTOViolationType;
  line: number;
  column: number;
  match: string;
  message: string;
}

export interface DTOAnalysis {
  patterns: DTOPatternInfo[];
  violations: DTOViolationInfo[];
  hasDTOs: boolean;
  dtoCount: number;
}

// ============================================================================
// Patterns
// ============================================================================

export const DTO_CLASS_PATTERNS = [
  // JavaScript/TypeScript
  /class\s+(\w+(?:DTO|Dto|Request|Response|Input|Output))\s*(?:extends|implements|\{)/gi,
  /export\s+class\s+(\w+(?:DTO|Dto))/gi,
  // Python
  /class\s+(\w+(?:DTO|Dto|Request|Response|Input|Output))\s*\(/gi,
  /class\s+(\w+(?:Schema|Model))\s*\(\s*(?:BaseModel|Schema)\s*\)/gi, // Pydantic
  /@dataclass/gi,
];

export const DTO_INTERFACE_PATTERNS = [
  /interface\s+(\w+(?:DTO|Dto|Request|Response|Input|Output))/gi,
  /export\s+interface\s+(\w+(?:DTO|Dto))/gi,
];

export const DTO_TYPE_PATTERNS = [
  /type\s+(\w+(?:DTO|Dto|Request|Response|Input|Output))\s*=/gi,
  /export\s+type\s+(\w+(?:DTO|Dto))\s*=/gi,
];

export const MAPPER_FUNCTION_PATTERNS = [
  // JavaScript/TypeScript
  /function\s+(to\w+|from\w+|map\w+|transform\w+)\s*\(/gi,
  /const\s+(to\w+|from\w+|map\w+|transform\w+)\s*=\s*(?:\([^)]*\)|[^=])\s*=>/gi,
  /(\w+)\.toDTO\s*\(/gi,
  /(\w+)\.fromDTO\s*\(/gi,
  // Python
  /def\s+(to_\w+|from_\w+|map_\w+|transform_\w+)\s*\(/gi,
  /def\s+(to_dict|from_dict|to_model|from_model)\s*\(/gi,
  /\.model_dump\s*\(/gi, // Pydantic v2
  /\.dict\s*\(/gi, // Pydantic v1
  /\.model_validate\s*\(/gi, // Pydantic v2
  /\.parse_obj\s*\(/gi, // Pydantic v1
];

export const TRANSFORMER_CLASS_PATTERNS = [
  /class\s+(\w+(?:Transformer|Mapper|Converter))/gi,
  /@Transform\s*\(/gi,
  /class-transformer/gi,
];

export const SERIALIZER_PATTERNS = [
  // JavaScript/TypeScript
  /class\s+(\w+Serializer)/gi,
  /\.serialize\s*\(/gi,
  /\.deserialize\s*\(/gi,
  /JSON\.stringify\s*\(/gi,
  /JSON\.parse\s*\(/gi,
  // Python
  /class\s+(\w+Serializer)\s*\(/gi,
  /json\.dumps\s*\(/gi,
  /json\.loads\s*\(/gi,
  /\.json\s*\(\s*\)/gi, // Pydantic .json()
  /jsonable_encoder\s*\(/gi, // FastAPI
];

export const ENTITY_EXPOSURE_PATTERNS = [
  /return\s+(?:await\s+)?(?:this\.)?(?:prisma|db)\.\w+\.(find|create|update)/gi,
  /res\.(?:json|send)\s*\(\s*(?:await\s+)?(?:this\.)?(?:prisma|db)\./gi,
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

export function detectDTOClasses(content: string): DTOPatternInfo[] {
  const results: DTOPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of DTO_CLASS_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'dto-class',
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

export function detectDTOInterfaces(content: string): DTOPatternInfo[] {
  const results: DTOPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of DTO_INTERFACE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'dto-interface',
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

export function detectDTOTypes(content: string): DTOPatternInfo[] {
  const results: DTOPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of DTO_TYPE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'dto-type',
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

export function detectMapperFunctions(content: string): DTOPatternInfo[] {
  const results: DTOPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of MAPPER_FUNCTION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'mapper-function',
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

export function detectTransformerClasses(content: string): DTOPatternInfo[] {
  const results: DTOPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of TRANSFORMER_CLASS_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'transformer-class',
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

export function detectSerializers(content: string): DTOPatternInfo[] {
  const results: DTOPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of SERIALIZER_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'serializer',
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

export function detectEntityExposureViolations(content: string): DTOViolationInfo[] {
  const results: DTOViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of ENTITY_EXPOSURE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'entity-exposure',
          line: i + 1,
          column: match.index + 1,
          match: match[0],
          message: 'Direct entity exposure detected - consider using DTOs',
        });
      }
    }
  }

  return results;
}

export function analyzeDTOPatterns(content: string, filePath: string): DTOAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      violations: [],
      hasDTOs: false,
      dtoCount: 0,
    };
  }

  const patterns: DTOPatternInfo[] = [
    ...detectDTOClasses(content),
    ...detectDTOInterfaces(content),
    ...detectDTOTypes(content),
    ...detectMapperFunctions(content),
    ...detectTransformerClasses(content),
    ...detectSerializers(content),
  ];

  const violations = detectEntityExposureViolations(content);

  const dtoDefinitions = patterns.filter(
    (p) => p.type === 'dto-class' || p.type === 'dto-interface' || p.type === 'dto-type'
  );

  return {
    patterns,
    violations,
    hasDTOs: dtoDefinitions.length > 0,
    dtoCount: dtoDefinitions.length,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class DTOPatternsDetector extends RegexDetector {
  readonly id = 'data-access/dto-patterns';
  readonly name = 'DTO Patterns Detector';
  readonly description = 'Detects Data Transfer Object patterns and identifies entity exposure';
  readonly category: PatternCategory = 'data-access';
  readonly subcategory = 'dto-patterns';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeDTOPatterns(context.content, context.file);

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

    const confidence = analysis.hasDTOs ? 0.9 : 0.7;
    return this.createResult([], violations, confidence, {
      custom: {
        patterns: analysis.patterns,
        hasDTOs: analysis.hasDTOs,
        dtoCount: analysis.dtoCount,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createDTOPatternsDetector(): DTOPatternsDetector {
  return new DTOPatternsDetector();
}
