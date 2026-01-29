/**
 * File Naming Detector - File naming convention detection
 *
 * Detects PascalCase, kebab-case, snake_case patterns
 * and suffix patterns (.service.ts, .test.ts).
 *
 * @requirements 7.1 - THE Structural_Detector SHALL detect file naming conventions
 */

import { StructuralDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language, Range } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type NamingConvention =
  | 'PascalCase'
  | 'camelCase'
  | 'kebab-case'
  | 'snake_case'
  | 'SCREAMING_SNAKE_CASE'
  | 'unknown';

export interface SuffixPattern {
  suffix: string;
  description: string;
  expectedConvention?: NamingConvention;
}

export interface NamingPattern {
  convention: NamingConvention;
  extension: string;
  suffix: string | undefined;
  count: number;
  examples: string[];
}

export interface FileNamingAnalysis {
  fileName: string;
  baseName: string;
  convention: NamingConvention;
  extension: string;
  suffix: string | undefined;
  followsPattern: boolean;
  suggestedName: string | undefined;
}

export const COMMON_SUFFIXES: SuffixPattern[] = [
  { suffix: '.service', description: 'Service file', expectedConvention: 'kebab-case' },
  { suffix: '.controller', description: 'Controller file', expectedConvention: 'kebab-case' },
  { suffix: '.model', description: 'Model file', expectedConvention: 'PascalCase' },
  { suffix: '.test', description: 'Test file' },
  { suffix: '.spec', description: 'Spec file' },
  { suffix: '.stories', description: 'Storybook file', expectedConvention: 'PascalCase' },
  { suffix: '.hook', description: 'Hook file', expectedConvention: 'camelCase' },
  { suffix: '.utils', description: 'Utilities file', expectedConvention: 'kebab-case' },
  { suffix: '.types', description: 'Types file', expectedConvention: 'kebab-case' },
  { suffix: '.schema', description: 'Schema file', expectedConvention: 'kebab-case' },
  { suffix: '.context', description: 'Context file', expectedConvention: 'PascalCase' },
  { suffix: '.reducer', description: 'Reducer file', expectedConvention: 'camelCase' },
  { suffix: '.page', description: 'Page file', expectedConvention: 'PascalCase' },
  { suffix: '.layout', description: 'Layout file', expectedConvention: 'PascalCase' },
  { suffix: '.component', description: 'Component file', expectedConvention: 'PascalCase' },
  { suffix: '.styles', description: 'Styles file', expectedConvention: 'kebab-case' },
];

export function detectNamingConvention(name: string): NamingConvention {
  if (!name || name.length === 0) {return 'unknown';}
  if (/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/.test(name)) {return 'SCREAMING_SNAKE_CASE';}
  if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) {return 'PascalCase';}
  if (/^[a-z][a-zA-Z0-9]*$/.test(name) && /[A-Z]/.test(name)) {return 'camelCase';}
  if (/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {return 'kebab-case';}
  if (/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(name)) {return 'snake_case';}
  if (/^[a-z][a-z0-9]*$/.test(name)) {return 'kebab-case';}
  return 'unknown';
}

export function convertToConvention(name: string, target: NamingConvention): string {
  const words = splitIntoWords(name);
  if (words.length === 0) {return name;}
  switch (target) {
    case 'PascalCase': return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
    case 'camelCase': return words.map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
    case 'kebab-case': return words.map((w) => w.toLowerCase()).join('-');
    case 'snake_case': return words.map((w) => w.toLowerCase()).join('_');
    case 'SCREAMING_SNAKE_CASE': return words.map((w) => w.toUpperCase()).join('_');
    default: return name;
  }
}

export function splitIntoWords(name: string): string[] {
  let n = name.replace(/[-_]/g, ' ');
  n = n.replace(/([a-z])([A-Z])/g, '$1 $2');
  n = n.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  return n.split(/\s+/).filter((w) => w.length > 0);
}

export function extractBaseName(fileName: string, suffixes: SuffixPattern[] = COMMON_SUFFIXES): { baseName: string; suffix: string | undefined; extension: string } {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot === -1) {return { baseName: fileName, suffix: undefined, extension: '' };}
  const ext = fileName.slice(lastDot);
  const nameNoExt = fileName.slice(0, lastDot);
  for (const { suffix } of suffixes) {
    if (nameNoExt.toLowerCase().endsWith(suffix.toLowerCase())) {
      const base = nameNoExt.slice(0, -suffix.length);
      if (base.length > 0) {return { baseName: base, suffix, extension: ext };}
    }
  }
  return { baseName: nameNoExt, suffix: undefined, extension: ext };
}

export function analyzeFileName(filePath: string, dominant?: NamingConvention): FileNamingAnalysis {
  const fileName = filePath.split(/[/\\]/).pop() ?? filePath;
  const { baseName, suffix, extension } = extractBaseName(fileName);
  const convention = detectNamingConvention(baseName);
  const followsPattern = dominant === undefined || convention === dominant;
  let suggestedName: string | undefined;
  if (!followsPattern && dominant && dominant !== 'unknown') {
    const converted = convertToConvention(baseName, dominant);
    suggestedName = suffix ? `${converted}${suffix}${extension}` : `${converted}${extension}`;
  }
  return { fileName, baseName, convention, extension, suffix, followsPattern, suggestedName };
}


export class FileNamingDetector extends StructuralDetector {
  readonly id = 'structural/file-naming';
  readonly category = 'structural' as const;
  readonly subcategory = 'naming-conventions';
  readonly name = 'File Naming Convention Detector';
  readonly description = 'Detects file naming patterns including PascalCase, kebab-case, snake_case conventions';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python', 'css', 'scss', 'json', 'yaml', 'markdown'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    const analysis = analyzeFileName(context.file);
    const projectAnalysis = this.analyzeProjectFiles(context.projectContext.files);

    if (analysis.convention !== 'unknown') {
      patterns.push(this.createPatternMatch(context.file, analysis, projectAnalysis));
    }

    const dominant = this.getDominantConvention(projectAnalysis);
    if (dominant && analysis.convention !== dominant) {
      const v = this.createViolation(context.file, analysis, dominant);
      if (v) {violations.push(v);}
    }

    const suffixV = this.checkSuffixPattern(context.file, analysis);
    if (suffixV) {violations.push(suffixV);}

    return this.createResult(patterns, violations, this.calcConfidence(projectAnalysis));
  }

  generateQuickFix(violation: Violation): QuickFix | null {
    const match = violation.message.match(/renamed to '([^']+)'/);
    if (!match?.[1]) {return null;}
    const suggested = match[1];
    const newPath = violation.file.replace(/[^/\\]+$/, suggested);
    return {
      title: `Rename to ${suggested}`,
      kind: 'quickfix',
      edit: {
        changes: {},
        documentChanges: [{ uri: violation.file, edits: [] }, { uri: newPath, edits: [] }],
      },
      isPreferred: true,
      confidence: 0.9,
      preview: `Rename file from '${violation.file.split(/[/\\]/).pop()}' to '${suggested}'`,
    };
  }

  private analyzeProjectFiles(files: string[]): Map<NamingConvention, NamingPattern> {
    const patterns = new Map<NamingConvention, NamingPattern>();
    for (const file of files) {
      const a = analyzeFileName(file);
      if (a.convention === 'unknown') {continue;}
      const existing = patterns.get(a.convention);
      if (existing) { existing.count++; if (existing.examples.length < 5) {existing.examples.push(file);} }
      else {patterns.set(a.convention, { convention: a.convention, extension: a.extension, suffix: a.suffix, count: 1, examples: [file] });}
    }
    return patterns;
  }

  private getDominantConvention(patterns: Map<NamingConvention, NamingPattern>): NamingConvention | undefined {
    let maxCount = 0, dominant: NamingConvention | undefined;
    for (const [conv, p] of patterns) { if (p.count > maxCount) { maxCount = p.count; dominant = conv; } }
    const total = Array.from(patterns.values()).reduce((s, p) => s + p.count, 0);
    return dominant && maxCount / total > 0.5 ? dominant : undefined;
  }

  private createPatternMatch(file: string, analysis: FileNamingAnalysis, projectAnalysis: Map<NamingConvention, NamingPattern>): PatternMatch {
    const p = projectAnalysis.get(analysis.convention);
    const total = Array.from(projectAnalysis.values()).reduce((s, x) => s + x.count, 0);
    const freq = p ? p.count / total : 0;
    return { patternId: `file-naming-${analysis.convention}`, location: { file, line: 1, column: 1 }, confidence: freq, isOutlier: freq < 0.5 };
  }

  private createViolation(file: string, analysis: FileNamingAnalysis, dominant: NamingConvention): Violation | null {
    const fileName = file.split(/[/\\]/).pop() ?? '';
    if (this.isSpecialFile(fileName)) {return null;}
    
    // PascalCase is the standard convention for React components (.tsx/.jsx files)
    // Don't flag PascalCase as a violation for these file types
    if (analysis.convention === 'PascalCase' && this.isReactComponentFile(file)) {
      return null;
    }
    
    // camelCase is standard for React hooks (useXxx pattern)
    if (analysis.convention === 'camelCase' && this.isReactHookFile(fileName)) {
      return null;
    }
    const suggested = analysis.suggestedName ?? convertToConvention(analysis.baseName, dominant) + (analysis.suffix ?? '') + analysis.extension;
    const range: Range = { start: { line: 1, character: 1 }, end: { line: 1, character: 1 } };
    return {
      id: `file-naming-${file.replace(/[^a-zA-Z0-9]/g, '-')}`,
      patternId: 'structural/file-naming',
      severity: 'warning',
      file,
      range,
      message: `File '${fileName}' uses ${analysis.convention} but project uses ${dominant}. It should be renamed to '${suggested}'`,
      expected: `${dominant} naming convention`,
      actual: `${analysis.convention} naming convention`,
      aiExplainAvailable: false,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }
  
  private isReactComponentFile(file: string): boolean {
    // React components are typically .tsx or .jsx files
    return /\.(tsx|jsx)$/.test(file);
  }
  
  private isReactHookFile(fileName: string): boolean {
    // React hooks follow the useXxx naming convention
    const baseName = fileName.replace(/\.[^.]+$/, '');
    return /^use[A-Z]/.test(baseName);
  }

  private checkSuffixPattern(file: string, analysis: FileNamingAnalysis): Violation | null {
    if (!analysis.suffix) {return null;}
    const sp = COMMON_SUFFIXES.find((s) => s.suffix.toLowerCase() === analysis.suffix?.toLowerCase());
    if (!sp?.expectedConvention || analysis.convention === sp.expectedConvention || analysis.convention === 'unknown') {return null;}
    const suggestedBase = convertToConvention(analysis.baseName, sp.expectedConvention);
    const suggested = `${suggestedBase}${analysis.suffix}${analysis.extension}`;
    const range: Range = { start: { line: 1, character: 1 }, end: { line: 1, character: 1 } };
    return {
      id: `file-naming-suffix-${file.replace(/[^a-zA-Z0-9]/g, '-')}`,
      patternId: 'structural/file-naming-suffix',
      severity: 'info',
      file,
      range,
      message: `${sp.description} '${analysis.fileName}' should use ${sp.expectedConvention} naming. It should be renamed to '${suggested}'`,
      expected: `${sp.expectedConvention} naming for ${sp.description.toLowerCase()}`,
      actual: `${analysis.convention} naming`,
      aiExplainAvailable: false,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }

  private isSpecialFile(fileName: string): boolean {
    const special = ['index', 'main', 'app', 'readme', 'license', 'changelog', 'dockerfile', 'makefile', 'package', 'tsconfig', 'eslint', 'prettier', 'jest', 'vitest', 'vite', 'webpack', 'rollup', 'babel', 'postcss', 'tailwind', 'next'];
    const lower = fileName.toLowerCase().replace(/\.[^.]+$/, '');
    return special.some((s) => lower === s || lower.startsWith(`${s}.`));
  }

  private calcConfidence(patterns: Map<NamingConvention, NamingPattern>): number {
    const total = Array.from(patterns.values()).reduce((s, p) => s + p.count, 0);
    if (total === 0) {return 0.5;}
    let max = 0;
    for (const p of patterns.values()) {if (p.count > max) {max = p.count;}}
    return Math.min(max / total + 0.2, 1.0);
  }
}

export function createFileNamingDetector(): FileNamingDetector { return new FileNamingDetector(); }
