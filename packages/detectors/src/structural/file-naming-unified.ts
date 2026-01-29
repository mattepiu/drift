/**
 * Unified File Naming Detector
 *
 * Consolidates file-naming.ts, file-naming-learning.ts, and file-naming-semantic.ts
 * into a single detector with multiple detection strategies.
 *
 * Strategies:
 * - structural: Analyzes file/directory structure patterns
 * - learning: Learns conventions from the codebase
 * - semantic: Keyword-based semantic matching
 *
 * @requirements 7.1 - THE Structural_Detector SHALL detect file naming conventions
 * @requirements DRIFT-CORE - Learn patterns from user's code
 */

import {
  UnifiedDetector,
  type DetectionStrategy,
  type StrategyResult,
  type DetectionContext,
  ValueDistribution,
} from '../base/index.js';

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

export interface LearnedConventions {
  componentNaming: NamingConvention | null;
  utilityNaming: NamingConvention | null;
  hookNaming: NamingConvention | null;
  serviceNaming: NamingConvention | null;
  testSuffix: '.test' | '.spec' | null;
  usesIndexFiles: boolean;
}

// ============================================================================
// Constants
// ============================================================================

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

const SPECIAL_FILES = [
  'index', 'main', 'app', 'readme', 'license', 'changelog', 'dockerfile',
  'makefile', 'package', 'tsconfig', 'eslint', 'prettier', 'jest', 'vitest',
  'vite', 'webpack', 'rollup', 'babel', 'postcss', 'tailwind', 'next',
];

const SEMANTIC_KEYWORDS = [
  'file', 'name', 'naming', 'convention', 'case',
  'camel', 'pascal', 'kebab', 'snake',
];

// ============================================================================
// Utility Functions
// ============================================================================

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

export function splitIntoWords(name: string): string[] {
  let n = name.replace(/[-_]/g, ' ');
  n = n.replace(/([a-z])([A-Z])/g, '$1 $2');
  n = n.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  return n.split(/\s+/).filter((w) => w.length > 0);
}

export function convertToConvention(name: string, target: NamingConvention): string {
  const words = splitIntoWords(name);
  if (words.length === 0) {return name;}
  switch (target) {
    case 'PascalCase':
      return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
    case 'camelCase':
      return words.map((w, i) =>
        i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
      ).join('');
    case 'kebab-case':
      return words.map((w) => w.toLowerCase()).join('-');
    case 'snake_case':
      return words.map((w) => w.toLowerCase()).join('_');
    case 'SCREAMING_SNAKE_CASE':
      return words.map((w) => w.toUpperCase()).join('_');
    default:
      return name;
  }
}

export function extractBaseName(
  fileName: string,
  suffixes: SuffixPattern[] = COMMON_SUFFIXES
): { baseName: string; suffix: string | undefined; extension: string } {
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

function isSpecialFile(fileName: string): boolean {
  const lower = fileName.toLowerCase().replace(/\.[^.]+$/, '');
  return SPECIAL_FILES.some((s) => lower === s || lower.startsWith(`${s}.`));
}

function isReactComponentFile(file: string): boolean {
  return /\.(tsx|jsx)$/.test(file);
}

function isReactHookFile(fileName: string): boolean {
  const baseName = fileName.replace(/\.[^.]+$/, '');
  return /^use[A-Z]/.test(baseName);
}

// ============================================================================
// Unified File Naming Detector
// ============================================================================

export class FileNamingUnifiedDetector extends UnifiedDetector {
  readonly id = 'structural/file-naming';
  readonly category = 'structural' as const;
  readonly subcategory = 'naming-conventions';
  readonly name = 'File Naming Convention Detector';
  readonly description = 'Detects file naming patterns using structural analysis, learning, and semantic matching';
  readonly supportedLanguages: Language[] = [
    'typescript', 'javascript', 'python', 'css', 'scss', 'json', 'yaml', 'markdown'
  ];
  readonly strategies: DetectionStrategy[] = ['structural', 'learning', 'semantic'];

  // Learned conventions cache (populated by learning strategy)
  private learnedConventions: LearnedConventions | null = null;

  // ============================================================================
  // Strategy Dispatch
  // ============================================================================

  protected async detectWithStrategy(
    strategy: DetectionStrategy,
    context: DetectionContext
  ): Promise<StrategyResult> {
    switch (strategy) {
      case 'structural':
        return this.detectStructural(context);
      case 'learning':
        return this.detectLearning(context);
      case 'semantic':
        return this.detectSemantic(context);
      default:
        return this.createSkippedResult(strategy, `Strategy '${strategy}' not implemented`);
    }
  }

  // ============================================================================
  // Structural Detection (from file-naming.ts)
  // ============================================================================

  private async detectStructural(context: DetectionContext): Promise<StrategyResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    const analysis = analyzeFileName(context.file);
    const projectAnalysis = this.analyzeProjectFiles(context.projectContext.files);
    const dominant = this.getDominantConvention(projectAnalysis);

    // Create pattern match if convention detected
    if (analysis.convention !== 'unknown') {
      patterns.push(this.createStructuralPatternMatch(context.file, analysis, projectAnalysis));
    }

    // Check for convention violations
    if (dominant && analysis.convention !== dominant) {
      const v = this.createConventionViolation(context.file, analysis, dominant);
      if (v) {violations.push(v);}
    }

    // Check suffix pattern violations
    const suffixV = this.checkSuffixPattern(context.file, analysis);
    if (suffixV) {violations.push(suffixV);}

    const confidence = this.calculateStructuralConfidence(projectAnalysis);
    return this.createStrategyResult('structural', patterns, violations, confidence);
  }

  private analyzeProjectFiles(files: string[]): Map<NamingConvention, NamingPattern> {
    const patterns = new Map<NamingConvention, NamingPattern>();
    for (const file of files) {
      const a = analyzeFileName(file);
      if (a.convention === 'unknown') {continue;}
      const existing = patterns.get(a.convention);
      if (existing) {
        existing.count++;
        if (existing.examples.length < 5) {existing.examples.push(file);}
      } else {
        patterns.set(a.convention, {
          convention: a.convention,
          extension: a.extension,
          suffix: a.suffix,
          count: 1,
          examples: [file],
        });
      }
    }
    return patterns;
  }

  private getDominantConvention(patterns: Map<NamingConvention, NamingPattern>): NamingConvention | undefined {
    let maxCount = 0;
    let dominant: NamingConvention | undefined;
    for (const [conv, p] of patterns) {
      if (p.count > maxCount) {
        maxCount = p.count;
        dominant = conv;
      }
    }
    const total = Array.from(patterns.values()).reduce((s, p) => s + p.count, 0);
    return dominant && maxCount / total > 0.5 ? dominant : undefined;
  }

  private createStructuralPatternMatch(
    file: string,
    analysis: FileNamingAnalysis,
    projectAnalysis: Map<NamingConvention, NamingPattern>
  ): PatternMatch {
    const p = projectAnalysis.get(analysis.convention);
    const total = Array.from(projectAnalysis.values()).reduce((s, x) => s + x.count, 0);
    const freq = p ? p.count / total : 0;
    return {
      patternId: `file-naming-${analysis.convention}`,
      location: { file, line: 1, column: 1 },
      confidence: freq,
      isOutlier: freq < 0.5,
    };
  }

  private createConventionViolation(
    file: string,
    analysis: FileNamingAnalysis,
    dominant: NamingConvention
  ): Violation | null {
    const fileName = file.split(/[/\\]/).pop() ?? '';
    if (isSpecialFile(fileName)) {return null;}

    // PascalCase is standard for React components
    if (analysis.convention === 'PascalCase' && isReactComponentFile(file)) {return null;}

    // camelCase is standard for React hooks
    if (analysis.convention === 'camelCase' && isReactHookFile(fileName)) {return null;}

    const suggested = analysis.suggestedName ??
      convertToConvention(analysis.baseName, dominant) + (analysis.suffix ?? '') + analysis.extension;

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

  private checkSuffixPattern(file: string, analysis: FileNamingAnalysis): Violation | null {
    if (!analysis.suffix) {return null;}
    const sp = COMMON_SUFFIXES.find((s) => s.suffix.toLowerCase() === analysis.suffix?.toLowerCase());
    if (!sp?.expectedConvention || analysis.convention === sp.expectedConvention || analysis.convention === 'unknown') {
      return null;
    }
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

  private calculateStructuralConfidence(patterns: Map<NamingConvention, NamingPattern>): number {
    const total = Array.from(patterns.values()).reduce((s, p) => s + p.count, 0);
    if (total === 0) {return 0.5;}
    let max = 0;
    for (const p of patterns.values()) {if (p.count > max) {max = p.count;}}
    return Math.min(max / total + 0.2, 1.0);
  }

  // ============================================================================
  // Learning Detection (from file-naming-learning.ts)
  // ============================================================================

  private async detectLearning(context: DetectionContext): Promise<StrategyResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    // Learn conventions from project files if not cached
    if (!this.learnedConventions) {
      this.learnedConventions = this.learnConventions(context.projectContext.files);
    }

    const filename = context.file.split('/').pop() || '';
    const fileType = getFileType(context.file);

    if (fileType === 'other' || fileType === 'index') {
      return this.createEmptyStrategyResult('learning', 1.0);
    }

    const actualConvention = detectNamingConvention(filename.replace(/\.[^.]+$/, ''));
    let expectedConvention: NamingConvention | null = null;
    let conventionKey = '';

    switch (fileType) {
      case 'component':
        expectedConvention = this.learnedConventions.componentNaming;
        conventionKey = 'component file naming';
        break;
      case 'utility':
        expectedConvention = this.learnedConventions.utilityNaming;
        conventionKey = 'utility file naming';
        break;
      case 'hook':
        expectedConvention = this.learnedConventions.hookNaming;
        conventionKey = 'hook file naming';
        break;
      case 'service':
        expectedConvention = this.learnedConventions.serviceNaming;
        conventionKey = 'service file naming';
        break;
      case 'test':
        const expectedSuffix = this.learnedConventions.testSuffix;
        if (expectedSuffix) {
          const actualSuffix = /\.spec\.[jt]sx?$/.test(filename) ? '.spec' : '.test';
          if (actualSuffix !== expectedSuffix) {
            const baseName = filename.replace(/\.(test|spec)\.[jt]sx?$/, '');
            const ext = filename.match(/\.[jt]sx?$/)?.[0] || '.ts';
            violations.push(this.createLearningViolation(
              context.file,
              'test file suffix',
              actualSuffix,
              expectedSuffix,
              `Test file uses '${actualSuffix}' but project uses '${expectedSuffix}'. Rename to '${baseName}${expectedSuffix}${ext}'`
            ));
          }
        }
        return this.createStrategyResult('learning', patterns, violations, violations.length === 0 ? 1.0 : 0.8);
    }

    if (expectedConvention && actualConvention !== expectedConvention && actualConvention !== 'unknown') {
      const baseName = filename.replace(/\.[^.]+$/, '');
      const ext = filename.match(/\.[^.]+$/)?.[0] || '';
      const suggestedName = convertToConvention(baseName, expectedConvention) + ext;

      violations.push(this.createLearningViolation(
        context.file,
        conventionKey,
        actualConvention,
        expectedConvention,
        `File '${filename}' uses ${actualConvention} but project uses ${expectedConvention}. Rename to '${suggestedName}'`
      ));
    }

    return this.createStrategyResult('learning', patterns, violations, violations.length === 0 ? 1.0 : 0.8);
  }

  private learnConventions(files: string[]): LearnedConventions {
    const distributions = {
      componentNaming: new ValueDistribution<NamingConvention>(),
      utilityNaming: new ValueDistribution<NamingConvention>(),
      hookNaming: new ValueDistribution<NamingConvention>(),
      serviceNaming: new ValueDistribution<NamingConvention>(),
      testSuffix: new ValueDistribution<'.test' | '.spec'>(),
      usesIndexFiles: new ValueDistribution<boolean>(),
    };

    for (const file of files) {
      const filename = file.split('/').pop() || '';
      const fileType = getFileType(file);

      if (fileType === 'index') {
        distributions.usesIndexFiles.add(true, file);
        continue;
      }

      if (fileType === 'test') {
        const suffix = /\.spec\.[jt]sx?$/.test(filename) ? '.spec' as const : '.test' as const;
        distributions.testSuffix.add(suffix, file);
        continue;
      }

      const convention = detectNamingConvention(filename.replace(/\.[^.]+$/, ''));
      if (convention === 'unknown') {continue;}

      switch (fileType) {
        case 'component':
          distributions.componentNaming.add(convention, file);
          break;
        case 'utility':
          distributions.utilityNaming.add(convention, file);
          break;
        case 'hook':
          distributions.hookNaming.add(convention, file);
          break;
        case 'service':
          distributions.serviceNaming.add(convention, file);
          break;
      }
    }

    // Learning config for determining dominant conventions
    const learningConfig = {
      minOccurrences: 2,
      dominanceThreshold: 0.3,
      minFiles: 1,
    };

    return {
      componentNaming: distributions.componentNaming.getDominant(learningConfig)?.value ?? null,
      utilityNaming: distributions.utilityNaming.getDominant(learningConfig)?.value ?? null,
      hookNaming: distributions.hookNaming.getDominant(learningConfig)?.value ?? null,
      serviceNaming: distributions.serviceNaming.getDominant(learningConfig)?.value ?? null,
      testSuffix: distributions.testSuffix.getDominant(learningConfig)?.value ?? null,
      usesIndexFiles: distributions.usesIndexFiles.getTotal() > 0,
    };
  }

  private createLearningViolation(
    file: string,
    conventionKey: string,
    actual: string,
    expected: string,
    message: string
  ): Violation {
    const range: Range = { start: { line: 1, character: 1 }, end: { line: 1, character: 1 } };
    return {
      id: `file-naming-learning-${file.replace(/[^a-zA-Z0-9]/g, '-')}`,
      patternId: 'structural/file-naming',
      severity: 'warning',
      file,
      range,
      message,
      expected: `${expected} for ${conventionKey}`,
      actual: `${actual}`,
      aiExplainAvailable: true,
      aiFixAvailable: false,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }

  // ============================================================================
  // Semantic Detection (from file-naming-semantic.ts)
  // ============================================================================

  private async detectSemantic(context: DetectionContext): Promise<StrategyResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    // Semantic detection looks for naming-related keywords in code
    // This is a simplified version - the full semantic detector does more
    const content = context.content;
    if (!content) {
      return this.createSkippedResult('semantic', 'No content available');
    }

    // Check if file content mentions naming conventions
    const hasNamingKeywords = SEMANTIC_KEYWORDS.some((kw) =>
      content.toLowerCase().includes(kw)
    );

    if (hasNamingKeywords) {
      // File discusses naming conventions - create a pattern match
      patterns.push({
        patternId: 'file-naming-semantic',
        location: { file: context.file, line: 1, column: 1 },
        confidence: 0.7,
        isOutlier: false,
      });
    }

    return this.createStrategyResult('semantic', patterns, violations, 0.7);
  }

  // ============================================================================
  // Quick Fix Generation
  // ============================================================================

  override generateQuickFix(violation: Violation): QuickFix | null {
    const match = violation.message.match(/renamed to '([^']+)'/);
    if (!match?.[1]) {return null;}

    const suggested = match[1];
    const newPath = violation.file.replace(/[^/\\]+$/, suggested);

    return {
      title: `Rename to ${suggested}`,
      kind: 'quickfix',
      edit: {
        changes: {},
        documentChanges: [
          { uri: violation.file, edits: [] },
          { uri: newPath, edits: [] },
        ],
      },
      isPreferred: true,
      confidence: 0.9,
      preview: `Rename file from '${violation.file.split(/[/\\]/).pop()}' to '${suggested}'`,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createFileNamingUnifiedDetector(): FileNamingUnifiedDetector {
  return new FileNamingUnifiedDetector();
}

// Re-export for backward compatibility
export { FileNamingUnifiedDetector as FileNamingDetector };
