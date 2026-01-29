/**
 * Import Ordering Detector - Import organization detection
 *
 * Detects import grouping patterns and import sorting patterns.
 * Identifies how imports are organized (external packages first, then internal modules,
 * then relative imports), whether they are sorted alphabetically within groups,
 * and whether blank lines separate groups.
 *
 * @requirements 7.5 - THE Structural_Detector SHALL detect import ordering and grouping patterns
 */

import { StructuralDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language, Range } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

/**
 * Types of import grouping patterns
 */
export type ImportGroupingPattern = 'grouped' | 'ungrouped' | 'mixed' | 'unknown';

/**
 * Types of import sorting patterns
 */
export type ImportSortingPattern = 'alphabetical' | 'unsorted' | 'mixed' | 'unknown';

/**
 * Types of imports based on their source
 */
export type ImportType =
  | 'builtin'        // Node.js built-in modules (fs, path, etc.)
  | 'external'       // External packages from node_modules
  | 'internal'       // Internal aliases (@/, ~/, etc.)
  | 'parent'         // Parent directory imports (../)
  | 'sibling'        // Sibling imports (./)
  | 'index';         // Index imports (.)

/**
 * Common Node.js built-in modules
 */
export const BUILTIN_MODULES = [
  'assert', 'buffer', 'child_process', 'cluster', 'console', 'constants',
  'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http', 'https',
  'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'punycode',
  'querystring', 'readline', 'repl', 'stream', 'string_decoder', 'sys',
  'timers', 'tls', 'tty', 'url', 'util', 'v8', 'vm', 'worker_threads', 'zlib',
  // Node.js prefixed modules
  'node:assert', 'node:buffer', 'node:child_process', 'node:cluster',
  'node:console', 'node:constants', 'node:crypto', 'node:dgram', 'node:dns',
  'node:domain', 'node:events', 'node:fs', 'node:http', 'node:https',
  'node:module', 'node:net', 'node:os', 'node:path', 'node:perf_hooks',
  'node:process', 'node:punycode', 'node:querystring', 'node:readline',
  'node:repl', 'node:stream', 'node:string_decoder', 'node:sys', 'node:timers',
  'node:tls', 'node:tty', 'node:url', 'node:util', 'node:v8', 'node:vm',
  'node:worker_threads', 'node:zlib',
] as const;

/**
 * Common internal alias patterns
 * Note: @types/ is excluded as it's an external package namespace
 */
export const INTERNAL_ALIAS_PATTERNS = [
  /^@\//,                    // @/components
  /^~\//,                    // ~/utils
  /^@(?!types\/)[a-z]+\//,   // @app/, @lib/, @drift/ (but not @types/)
  /^#/,                      // #utils (Node.js subpath imports)
] as const;

/**
 * Information about a single import statement
 */
export interface ImportInfo {
  /** The import source/specifier */
  source: string;
  /** The type of import */
  type: ImportType;
  /** Line number where the import appears */
  line: number;
  /** The full import statement text */
  statement: string;
  /** Whether this is a type-only import */
  isTypeOnly: boolean;
  /** Whether this is a side-effect import (no specifiers) */
  isSideEffect: boolean;
}

/**
 * Information about a group of imports
 */
export interface ImportGroup {
  /** The type of imports in this group */
  type: ImportType;
  /** Imports in this group */
  imports: ImportInfo[];
  /** Starting line of the group */
  startLine: number;
  /** Ending line of the group */
  endLine: number;
  /** Whether imports in this group are sorted alphabetically */
  isSorted: boolean;
}

/**
 * Analysis of import ordering patterns in a file
 */
export interface FileImportAnalysis {
  /** All imports found in the file */
  imports: ImportInfo[];
  /** Import groups detected */
  groups: ImportGroup[];
  /** Whether imports are grouped by type */
  isGrouped: boolean;
  /** Whether blank lines separate groups */
  hasBlankLineSeparators: boolean;
  /** Whether imports are sorted within groups */
  isSortedWithinGroups: boolean;
  /** The detected group order (e.g., ['builtin', 'external', 'internal', 'parent', 'sibling']) */
  groupOrder: ImportType[];
}

/**
 * Analysis of import ordering patterns across a project
 */
export interface ImportOrderingAnalysis {
  /** Detected grouping pattern */
  groupingPattern: ImportGroupingPattern;
  /** Detected sorting pattern */
  sortingPattern: ImportSortingPattern;
  /** Confidence in the detection (0-1) */
  confidence: number;
  /** Files analyzed */
  filesAnalyzed: number;
  /** Files with grouped imports */
  filesWithGroupedImports: number;
  /** Files with sorted imports */
  filesWithSortedImports: number;
  /** Files with blank line separators */
  filesWithBlankLineSeparators: number;
  /** Most common group order */
  dominantGroupOrder: ImportType[];
  /** Percentage of files following the dominant pattern */
  patternConsistency: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Python standard library modules (subset of most common)
 */
export const PYTHON_STDLIB_MODULES = [
  'abc', 'argparse', 'asyncio', 'base64', 'collections', 'contextlib',
  'copy', 'csv', 'dataclasses', 'datetime', 'decimal', 'enum', 'functools',
  'hashlib', 'http', 'importlib', 'inspect', 'io', 'itertools', 'json',
  'logging', 'math', 'multiprocessing', 'os', 'pathlib', 'pickle', 'random',
  're', 'shutil', 'socket', 'sqlite3', 'ssl', 'string', 'subprocess', 'sys',
  'tempfile', 'threading', 'time', 'traceback', 'typing', 'unittest', 'urllib',
  'uuid', 'warnings', 'xml', 'zipfile',
] as const;

/**
 * Determine the type of a Python import based on its source
 */
export function getPythonImportType(source: string): ImportType {
  // Check for standard library modules
  const baseModule = source.split('.')[0] || source;
  if (PYTHON_STDLIB_MODULES.includes(baseModule as typeof PYTHON_STDLIB_MODULES[number])) {
    return 'builtin';
  }

  // Check for relative imports
  if (source.startsWith('.')) {
    if (source === '.') {
      return 'index';
    }
    if (source.startsWith('..')) {
      return 'parent';
    }
    return 'sibling';
  }

  // Everything else is external (third-party)
  return 'external';
}

/**
 * Parse Python import statements from file content
 */
export function parsePythonImports(content: string): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const lines = content.split('\n');

  // Python import patterns
  const importPatterns = [
    // import module
    /^import\s+(\S+)/,
    // from module import ...
    /^from\s+(\S+)\s+import/,
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmedLine = line.trim();
    const lineNumber = i + 1;

    // Skip empty lines and comments
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    // Skip if we're past the import section (Python convention: imports at top)
    if (!trimmedLine.startsWith('import') && !trimmedLine.startsWith('from') && 
        imports.length > 0 && !trimmedLine.startsWith('(') && !trimmedLine.endsWith(',')) {
      // Check if this looks like code (not a continuation)
      if (/^(def|class|async|@|\w+\s*=)/.test(trimmedLine)) {
        break;
      }
    }

    // Try to match import patterns
    for (const pattern of importPatterns) {
      const match = trimmedLine.match(pattern);
      if (match?.[1]) {
        const source = match[1];
        imports.push({
          source,
          type: getPythonImportType(source),
          line: lineNumber,
          statement: trimmedLine,
          isTypeOnly: trimmedLine.includes('TYPE_CHECKING') || trimmedLine.includes('typing'),
          isSideEffect: false,
        });
        break;
      }
    }
  }

  return imports;
}

/**
 * Determine the type of an import based on its source
 */
export function getImportType(source: string): ImportType {
  // Check for built-in modules
  const baseModule = source.split('/')[0] || source;
  if (BUILTIN_MODULES.includes(baseModule as typeof BUILTIN_MODULES[number])) {
    return 'builtin';
  }

  // Check for internal aliases
  for (const pattern of INTERNAL_ALIAS_PATTERNS) {
    if (pattern.test(source)) {
      return 'internal';
    }
  }

  // Check for relative imports
  if (source === '.' || source === './') {
    return 'index';
  }
  if (source.startsWith('./')) {
    return 'sibling';
  }
  if (source.startsWith('../')) {
    return 'parent';
  }

  // Everything else is external (from node_modules)
  return 'external';
}

/**
 * Parse import statements from file content
 */
export function parseImports(content: string, filePath?: string): ImportInfo[] {
  // Use Python parser for .py files
  if (filePath?.endsWith('.py')) {
    return parsePythonImports(content);
  }
  
  const imports: ImportInfo[] = [];
  const lines = content.split('\n');

  // Regex patterns for different import styles
  const importPatterns = [
    // Standard import: import { foo } from 'bar'
    /^import\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+(?:\s*,\s*\{[^}]*\})?)\s+from\s+['"]([^'"]+)['"]/,
    // Side-effect import: import 'bar'
    /^import\s+['"]([^'"]+)['"]/,
    // Dynamic import at top level (less common but valid)
    /^(?:const|let|var)\s+\w+\s*=\s*(?:await\s+)?import\s*\(\s*['"]([^'"]+)['"]\s*\)/,
  ];

  let inMultilineImport = false;
  let multilineStart = 0;
  let multilineContent = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmedLine = line.trim();
    const lineNumber = i + 1;

    // Skip empty lines and comments
    if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('/*')) {
      continue;
    }

    // Handle multiline imports
    if (inMultilineImport) {
      multilineContent += ' ' + trimmedLine;
      if (trimmedLine.includes('from')) {
        inMultilineImport = false;
        const fullStatement = multilineContent;
        for (const pattern of importPatterns) {
          const match = fullStatement.match(pattern);
          if (match?.[1]) {
            const source = match[1];
            imports.push({
              source,
              type: getImportType(source),
              line: multilineStart,
              statement: fullStatement,
              isTypeOnly: fullStatement.includes('import type'),
              isSideEffect: !fullStatement.includes('from'),
            });
            break;
          }
        }
        multilineContent = '';
      }
      continue;
    }

    // Check if this is the start of a multiline import
    if (trimmedLine.startsWith('import') && !trimmedLine.includes('from') && !trimmedLine.match(/^import\s+['"]/)) {
      inMultilineImport = true;
      multilineStart = lineNumber;
      multilineContent = trimmedLine;
      continue;
    }

    // Try to match single-line imports
    for (const pattern of importPatterns) {
      const match = trimmedLine.match(pattern);
      if (match?.[1]) {
        const source = match[1];
        imports.push({
          source,
          type: getImportType(source),
          line: lineNumber,
          statement: trimmedLine,
          isTypeOnly: trimmedLine.includes('import type'),
          isSideEffect: !trimmedLine.includes('from'),
        });
        break;
      }
    }
  }

  return imports;
}

/**
 * Check if imports are sorted alphabetically
 */
export function areImportsSorted(imports: ImportInfo[]): boolean {
  if (imports.length <= 1) {
    return true;
  }

  for (let i = 1; i < imports.length; i++) {
    const prev = imports[i - 1]!.source.toLowerCase();
    const curr = imports[i]!.source.toLowerCase();
    if (prev > curr) {
      return false;
    }
  }

  return true;
}

/**
 * Detect import groups based on blank lines and import types
 */
export function detectImportGroups(imports: ImportInfo[], content: string): ImportGroup[] {
  if (imports.length === 0) {
    return [];
  }

  const lines = content.split('\n');
  const groups: ImportGroup[] = [];
  let currentGroup: ImportInfo[] = [];
  let currentType: ImportType | null = null;

  for (let i = 0; i < imports.length; i++) {
    const imp = imports[i]!;
    const prevImp = imports[i - 1];

    // Check if there's a blank line between this import and the previous one
    let hasBlankLineBefore = false;
    if (prevImp) {
      for (let lineNum = prevImp.line; lineNum < imp.line - 1; lineNum++) {
        const line = lines[lineNum];
        if (line?.trim() === '') {
          hasBlankLineBefore = true;
          break;
        }
      }
    }

    // Start a new group if:
    // 1. This is the first import
    // 2. There's a blank line before this import
    // 3. The import type changed (and we're detecting type-based grouping)
    const _typeChanged = currentType !== null && imp.type !== currentType;
    void _typeChanged; // Suppress unused variable warning - kept for future type-based grouping detection
    const shouldStartNewGroup = currentGroup.length === 0 || hasBlankLineBefore;

    if (shouldStartNewGroup && currentGroup.length > 0) {
      groups.push({
        type: currentType!,
        imports: currentGroup,
        startLine: currentGroup[0]!.line,
        endLine: currentGroup[currentGroup.length - 1]!.line,
        isSorted: areImportsSorted(currentGroup),
      });
      currentGroup = [];
    }

    currentGroup.push(imp);
    currentType = imp.type;
  }

  // Add the last group
  if (currentGroup.length > 0) {
    groups.push({
      type: currentType!,
      imports: currentGroup,
      startLine: currentGroup[0]!.line,
      endLine: currentGroup[currentGroup.length - 1]!.line,
      isSorted: areImportsSorted(currentGroup),
    });
  }

  return groups;
}

/**
 * Check if groups are separated by blank lines
 */
export function hasBlankLineSeparators(groups: ImportGroup[], content: string): boolean {
  if (groups.length <= 1) {
    return true; // No separators needed for single group
  }

  const lines = content.split('\n');

  for (let i = 1; i < groups.length; i++) {
    const prevGroup = groups[i - 1]!;
    const currGroup = groups[i]!;

    // Check for blank line between groups
    let hasBlankLine = false;
    for (let lineNum = prevGroup.endLine; lineNum < currGroup.startLine - 1; lineNum++) {
      const line = lines[lineNum];
      if (line?.trim() === '') {
        hasBlankLine = true;
        break;
      }
    }

    if (!hasBlankLine) {
      return false;
    }
  }

  return true;
}

/**
 * Check if imports are grouped by type
 */
export function areImportsGroupedByType(groups: ImportGroup[]): boolean {
  if (groups.length === 0) {
    return true;
  }

  // Check if each group contains only one type of import
  for (const group of groups) {
    const types = new Set(group.imports.map(imp => imp.type));
    if (types.size > 1) {
      return false;
    }
  }

  return true;
}

/**
 * Get the order of import types from groups
 */
export function getGroupOrder(groups: ImportGroup[]): ImportType[] {
  const order: ImportType[] = [];
  const seen = new Set<ImportType>();

  for (const group of groups) {
    for (const imp of group.imports) {
      if (!seen.has(imp.type)) {
        seen.add(imp.type);
        order.push(imp.type);
      }
    }
  }

  return order;
}

/**
 * Analyze import ordering in a single file
 */
export function analyzeFileImports(content: string, filePath?: string): FileImportAnalysis {
  const imports = parseImports(content, filePath);
  const groups = detectImportGroups(imports, content);
  const isGrouped = areImportsGroupedByType(groups);
  const hasSeparators = hasBlankLineSeparators(groups, content);
  const isSortedWithinGroups = groups.every(g => g.isSorted);
  const groupOrder = getGroupOrder(groups);

  return {
    imports,
    groups,
    isGrouped,
    hasBlankLineSeparators: hasSeparators,
    isSortedWithinGroups,
    groupOrder,
  };
}

/**
 * Analyze import ordering patterns across multiple files
 */
export function analyzeImportOrdering(
  fileContents: Map<string, string>
): ImportOrderingAnalysis {
  let filesAnalyzed = 0;
  let filesWithGroupedImports = 0;
  let filesWithSortedImports = 0;
  let filesWithBlankLineSeparators = 0;
  const groupOrders: ImportType[][] = [];

  for (const [filePath, content] of fileContents) {
    const analysis = analyzeFileImports(content, filePath);

    // Skip files with no imports or only one import
    if (analysis.imports.length <= 1) {
      continue;
    }

    filesAnalyzed++;

    if (analysis.isGrouped) {
      filesWithGroupedImports++;
    }

    if (analysis.isSortedWithinGroups) {
      filesWithSortedImports++;
    }

    if (analysis.hasBlankLineSeparators) {
      filesWithBlankLineSeparators++;
    }

    if (analysis.groupOrder.length > 0) {
      groupOrders.push(analysis.groupOrder);
    }
  }

  // Calculate patterns
  let groupingPattern: ImportGroupingPattern;
  let sortingPattern: ImportSortingPattern;
  let confidence: number;

  if (filesAnalyzed === 0) {
    return {
      groupingPattern: 'unknown',
      sortingPattern: 'unknown',
      confidence: 0,
      filesAnalyzed: 0,
      filesWithGroupedImports: 0,
      filesWithSortedImports: 0,
      filesWithBlankLineSeparators: 0,
      dominantGroupOrder: [],
      patternConsistency: 0,
    };
  }

  const groupedRatio = filesWithGroupedImports / filesAnalyzed;
  const sortedRatio = filesWithSortedImports / filesAnalyzed;

  // Determine grouping pattern
  if (groupedRatio >= 0.8) {
    groupingPattern = 'grouped';
  } else if (groupedRatio <= 0.2) {
    groupingPattern = 'ungrouped';
  } else {
    groupingPattern = 'mixed';
  }

  // Determine sorting pattern
  if (sortedRatio >= 0.8) {
    sortingPattern = 'alphabetical';
  } else if (sortedRatio <= 0.2) {
    sortingPattern = 'unsorted';
  } else {
    sortingPattern = 'mixed';
  }

  // Find dominant group order
  const dominantGroupOrder = findDominantGroupOrder(groupOrders);

  // Calculate pattern consistency
  const patternConsistency = calculatePatternConsistency(groupOrders, dominantGroupOrder);

  // Calculate overall confidence
  confidence = (groupedRatio + sortedRatio + patternConsistency) / 3;

  return {
    groupingPattern,
    sortingPattern,
    confidence,
    filesAnalyzed,
    filesWithGroupedImports,
    filesWithSortedImports,
    filesWithBlankLineSeparators,
    dominantGroupOrder,
    patternConsistency,
  };
}

/**
 * Find the most common group order
 */
function findDominantGroupOrder(groupOrders: ImportType[][]): ImportType[] {
  if (groupOrders.length === 0) {
    return [];
  }

  // Convert orders to strings for comparison
  const orderCounts = new Map<string, { order: ImportType[]; count: number }>();

  for (const order of groupOrders) {
    const key = order.join(',');
    if (!orderCounts.has(key)) {
      orderCounts.set(key, { order, count: 0 });
    }
    orderCounts.get(key)!.count++;
  }

  // Find the most common order
  let maxCount = 0;
  let dominantOrder: ImportType[] = [];

  for (const { order, count } of orderCounts.values()) {
    if (count > maxCount) {
      maxCount = count;
      dominantOrder = order;
    }
  }

  return dominantOrder;
}

/**
 * Calculate how consistently files follow the dominant pattern
 */
function calculatePatternConsistency(
  groupOrders: ImportType[][],
  dominantOrder: ImportType[]
): number {
  if (groupOrders.length === 0 || dominantOrder.length === 0) {
    return 0;
  }

  const dominantKey = dominantOrder.join(',');
  let matchingFiles = 0;

  for (const order of groupOrders) {
    if (order.join(',') === dominantKey) {
      matchingFiles++;
    }
  }

  return matchingFiles / groupOrders.length;
}

/**
 * Get the expected group order description
 */
export function getGroupOrderDescription(order: ImportType[]): string {
  if (order.length === 0) {
    return 'no specific order';
  }

  const typeNames: Record<ImportType, string> = {
    builtin: 'Node.js built-ins',
    external: 'external packages',
    internal: 'internal aliases',
    parent: 'parent imports',
    sibling: 'sibling imports',
    index: 'index imports',
  };

  return order.map(t => typeNames[t]).join(' → ');
}

// ============================================================================
// Import Ordering Detector Class
// ============================================================================

/**
 * Detector for import ordering and grouping patterns
 *
 * Identifies how imports are organized in a project:
 * - Grouping by type (external, internal, relative)
 * - Alphabetical sorting within groups
 * - Blank line separators between groups
 *
 * @requirements 7.5 - THE Structural_Detector SHALL detect import ordering and grouping patterns
 */
export class ImportOrderingDetector extends StructuralDetector {
  readonly id = 'structural/import-ordering';
  readonly category = 'structural' as const;
  readonly subcategory = 'import-ordering';
  readonly name = 'Import Ordering Detector';
  readonly description = 'Detects import grouping and sorting patterns';
  readonly supportedLanguages: Language[] = [
    'typescript',
    'javascript',
    'python',
  ];

  /**
   * Detect import ordering patterns in the project
   */
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    // Analyze the current file's imports
    const fileAnalysis = analyzeFileImports(context.content, context.file);

    // Skip files with no imports or only one import
    if (fileAnalysis.imports.length <= 1) {
      return this.createResult(patterns, violations, 0);
    }

    // Build file contents map for project-wide analysis
    const fileContents = new Map<string, string>();
    fileContents.set(context.file, context.content);

    // Analyze project-wide patterns (using available context)
    const projectAnalysis = analyzeImportOrdering(fileContents);

    // Create pattern matches
    if (projectAnalysis.groupingPattern !== 'unknown') {
      patterns.push(this.createGroupingPattern(context.file, projectAnalysis));
    }

    if (projectAnalysis.sortingPattern !== 'unknown') {
      patterns.push(this.createSortingPattern(context.file, projectAnalysis));
    }

    if (projectAnalysis.dominantGroupOrder.length > 0) {
      patterns.push(this.createGroupOrderPattern(context.file, projectAnalysis));
    }

    // Check for violations in the current file
    const groupingViolation = this.checkGroupingConsistency(
      context.file,
      fileAnalysis,
      projectAnalysis
    );
    if (groupingViolation) {
      violations.push(groupingViolation);
    }

    const sortingViolation = this.checkSortingConsistency(
      context.file,
      fileAnalysis,
      projectAnalysis
    );
    if (sortingViolation) {
      violations.push(sortingViolation);
    }

    const separatorViolation = this.checkBlankLineSeparators(
      context.file,
      fileAnalysis,
      projectAnalysis
    );
    if (separatorViolation) {
      violations.push(separatorViolation);
    }

    return this.createResult(patterns, violations, projectAnalysis.confidence);
  }

  /**
   * Generate a quick fix for import ordering violations
   */
  generateQuickFix(violation: Violation): QuickFix | null {
    if (violation.patternId === 'structural/import-ordering-grouping') {
      return {
        title: 'Group imports by type',
        kind: 'quickfix',
        edit: {
          changes: {},
          documentChanges: [],
        },
        isPreferred: true,
        confidence: 0.7,
        preview: 'Reorganize imports into groups (external, internal, relative)',
      };
    }

    if (violation.patternId === 'structural/import-ordering-sorting') {
      return {
        title: 'Sort imports alphabetically',
        kind: 'quickfix',
        edit: {
          changes: {},
          documentChanges: [],
        },
        isPreferred: true,
        confidence: 0.8,
        preview: 'Sort imports alphabetically within each group',
      };
    }

    if (violation.patternId === 'structural/import-ordering-separators') {
      return {
        title: 'Add blank lines between import groups',
        kind: 'quickfix',
        edit: {
          changes: {},
          documentChanges: [],
        },
        isPreferred: false,
        confidence: 0.6,
        preview: 'Add blank lines to separate import groups',
      };
    }

    return null;
  }

  /**
   * Create a pattern match for import grouping
   */
  private createGroupingPattern(
    file: string,
    analysis: ImportOrderingAnalysis
  ): PatternMatch {
    return {
      patternId: `import-ordering-grouping-${analysis.groupingPattern}`,
      location: { file, line: 1, column: 1 },
      confidence: analysis.confidence,
      isOutlier: false,
    };
  }

  /**
   * Create a pattern match for import sorting
   */
  private createSortingPattern(
    file: string,
    analysis: ImportOrderingAnalysis
  ): PatternMatch {
    return {
      patternId: `import-ordering-sorting-${analysis.sortingPattern}`,
      location: { file, line: 1, column: 1 },
      confidence: analysis.confidence,
      isOutlier: false,
    };
  }

  /**
   * Create a pattern match for group order
   */
  private createGroupOrderPattern(
    file: string,
    analysis: ImportOrderingAnalysis
  ): PatternMatch {
    const orderKey = analysis.dominantGroupOrder.join('-');
    return {
      patternId: `import-ordering-order-${orderKey}`,
      location: { file, line: 1, column: 1 },
      confidence: analysis.patternConsistency,
      isOutlier: false,
    };
  }

  /**
   * Check if the file's import grouping follows the project pattern
   */
  private checkGroupingConsistency(
    file: string,
    fileAnalysis: FileImportAnalysis,
    projectAnalysis: ImportOrderingAnalysis
  ): Violation | null {
    // Skip if project pattern is unknown or mixed
    if (projectAnalysis.groupingPattern === 'unknown' || projectAnalysis.groupingPattern === 'mixed') {
      return null;
    }

    // Check if file follows the pattern
    const fileIsGrouped = fileAnalysis.isGrouped;
    const projectExpectsGrouped = projectAnalysis.groupingPattern === 'grouped';

    if (fileIsGrouped === projectExpectsGrouped) {
      return null;
    }

    const range: Range = {
      start: { line: 1, character: 1 },
      end: { line: 1, character: 1 },
    };

    let message: string;
    let expected: string;
    let actual: string;

    if (projectExpectsGrouped) {
      message = `Imports are not grouped by type. Project uses grouped imports (${getGroupOrderDescription(projectAnalysis.dominantGroupOrder)}).`;
      expected = 'imports grouped by type';
      actual = 'ungrouped imports';
    } else {
      message = `Imports are grouped but project uses ungrouped imports.`;
      expected = 'ungrouped imports';
      actual = 'grouped imports';
    }

    return {
      id: `import-ordering-grouping-${file.replace(/[^a-zA-Z0-9]/g, '-')}`,
      patternId: 'structural/import-ordering-grouping',
      severity: 'info',
      file,
      range,
      message,
      expected,
      actual,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }

  /**
   * Check if the file's import sorting follows the project pattern
   */
  private checkSortingConsistency(
    file: string,
    fileAnalysis: FileImportAnalysis,
    projectAnalysis: ImportOrderingAnalysis
  ): Violation | null {
    // Skip if project pattern is unknown or mixed
    if (projectAnalysis.sortingPattern === 'unknown' || projectAnalysis.sortingPattern === 'mixed') {
      return null;
    }

    // Check if file follows the pattern
    const fileIsSorted = fileAnalysis.isSortedWithinGroups;
    const projectExpectsSorted = projectAnalysis.sortingPattern === 'alphabetical';

    if (fileIsSorted === projectExpectsSorted) {
      return null;
    }

    // Find the first unsorted group for better error reporting
    const unsortedGroup = fileAnalysis.groups.find(g => !g.isSorted);
    const line = unsortedGroup?.startLine || 1;

    const range: Range = {
      start: { line, character: 1 },
      end: { line, character: 1 },
    };

    let message: string;
    let expected: string;
    let actual: string;

    if (projectExpectsSorted) {
      message = `Imports are not sorted alphabetically. Project uses alphabetically sorted imports.`;
      expected = 'alphabetically sorted imports';
      actual = 'unsorted imports';
    } else {
      message = `Imports are sorted but project does not enforce alphabetical sorting.`;
      expected = 'no specific sorting';
      actual = 'alphabetically sorted imports';
    }

    return {
      id: `import-ordering-sorting-${file.replace(/[^a-zA-Z0-9]/g, '-')}`,
      patternId: 'structural/import-ordering-sorting',
      severity: 'info',
      file,
      range,
      message,
      expected,
      actual,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }

  /**
   * Check if the file uses blank line separators between import groups
   */
  private checkBlankLineSeparators(
    file: string,
    fileAnalysis: FileImportAnalysis,
    projectAnalysis: ImportOrderingAnalysis
  ): Violation | null {
    // Skip if project doesn't use grouped imports
    if (projectAnalysis.groupingPattern !== 'grouped') {
      return null;
    }

    // Skip if file has only one group
    if (fileAnalysis.groups.length <= 1) {
      return null;
    }

    // Check if project uses blank line separators
    const projectUsesSeparators = projectAnalysis.filesWithBlankLineSeparators > projectAnalysis.filesAnalyzed * 0.7;

    if (!projectUsesSeparators) {
      return null;
    }

    // Check if file has blank line separators
    if (fileAnalysis.hasBlankLineSeparators) {
      return null;
    }

    const range: Range = {
      start: { line: 1, character: 1 },
      end: { line: 1, character: 1 },
    };

    return {
      id: `import-ordering-separators-${file.replace(/[^a-zA-Z0-9]/g, '-')}`,
      patternId: 'structural/import-ordering-separators',
      severity: 'info',
      file,
      range,
      message: `Import groups are not separated by blank lines. Project uses blank lines between import groups.`,
      expected: 'blank lines between import groups',
      actual: 'no blank lines between import groups',
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new ImportOrderingDetector instance
 */
export function createImportOrderingDetector(): ImportOrderingDetector {
  return new ImportOrderingDetector();
}
