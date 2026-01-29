/**
 * Circular Dependencies Detector - Circular dependency detection
 *
 * Detects circular dependency patterns including:
 * - Direct circular imports (A → B → A)
 * - Indirect circular imports (A → B → C → A)
 * - Self-imports
 *
 * Integrates with the core dependency graph module for cycle detection.
 *
 * @requirements 7.7 - THE Structural_Detector SHALL detect circular dependencies
 */

import { StructuralDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language, Range } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

/**
 * Type of circular dependency
 */
export type CircularDependencyType =
  | 'self-import'      // File imports itself
  | 'direct'           // A → B → A (cycle length 2)
  | 'indirect';        // A → B → C → ... → A (cycle length > 2)

/**
 * Severity level based on cycle characteristics
 */
export type CycleSeverity = 'error' | 'warning' | 'info';

/**
 * Information about a detected circular dependency
 */
export interface CircularDependencyInfo {
  /** Type of circular dependency */
  type: CircularDependencyType;
  /** Files involved in the cycle (in order) */
  cycle: string[];
  /** Length of the cycle */
  length: number;
  /** Calculated severity based on cycle characteristics */
  severity: CycleSeverity;
  /** Human-readable description of the cycle */
  description: string;
  /** Suggested ways to break the cycle */
  suggestions: string[];
}

/**
 * Analysis result for circular dependencies in a file
 */
export interface CircularDependencyAnalysis {
  /** Whether the file is involved in any circular dependencies */
  hasCircularDependencies: boolean;
  /** All circular dependencies involving this file */
  circularDependencies: CircularDependencyInfo[];
  /** Total number of imports in the file */
  totalImports: number;
  /** Number of imports involved in cycles */
  importsInCycles: number;
  /** Self-imports detected */
  selfImports: string[];
}

/**
 * Import information for cycle detection
 */
interface ImportForCycleDetection {
  source: string;
  resolvedPath?: string | undefined;
  line: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize a file path for consistent comparison
 */
function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase();
}

/**
 * Get the file name from a path for display
 */
function getFileName(path: string): string {
  // Don't normalize case for display purposes
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1] || path;
}

/**
 * Determine the type of circular dependency based on cycle length
 */
export function getCycleType(cycle: string[], currentFile: string): CircularDependencyType {
  const normalizedCurrent = normalizePath(currentFile);
  const normalizedCycle = cycle.map(normalizePath);

  // Check for self-import (cycle of length 1 or file appears twice consecutively)
  if (normalizedCycle.length === 1 && normalizedCycle[0] === normalizedCurrent) {
    return 'self-import';
  }

  // Check for direct cycle (A → B → A)
  if (normalizedCycle.length <= 3) {
    return 'direct';
  }

  // Indirect cycle (longer chain)
  return 'indirect';
}

/**
 * Calculate severity based on cycle characteristics
 *
 * Severity is determined by:
 * - Self-imports: error (always problematic)
 * - Direct cycles (length 2): warning (common but should be fixed)
 * - Short indirect cycles (length 3-4): warning
 * - Long indirect cycles (length > 4): info (may be architectural)
 */
export function calculateCycleSeverity(
  type: CircularDependencyType,
  cycleLength: number
): CycleSeverity {
  if (type === 'self-import') {
    return 'error';
  }

  if (type === 'direct') {
    return 'warning';
  }

  // Indirect cycles
  if (cycleLength <= 4) {
    return 'warning';
  }

  return 'info';
}

/**
 * Generate suggestions for breaking a circular dependency
 */
export function generateBreakCycleSuggestions(
  _cycle: string[],
  type: CircularDependencyType
): string[] {
  const suggestions: string[] = [];

  if (type === 'self-import') {
    suggestions.push('Remove the self-import statement');
    suggestions.push('Check if the import is a typo or copy-paste error');
    return suggestions;
  }

  if (type === 'direct') {
    suggestions.push('Extract shared code into a separate module that both files can import');
    suggestions.push('Use dependency injection to break the direct coupling');
    suggestions.push('Consider if one of the imports can be removed or made dynamic');
  }

  if (type === 'indirect') {
    suggestions.push('Identify the core abstraction and extract it to a shared module');
    suggestions.push('Use an interface/type-only import to break the runtime dependency');
    suggestions.push('Consider restructuring the module hierarchy');
    suggestions.push('Use lazy loading or dynamic imports for non-critical dependencies');
  }

  // Common suggestions
  suggestions.push('Review the module responsibilities - circular deps often indicate unclear boundaries');

  return suggestions;
}

/**
 * Format a cycle as a human-readable string
 */
export function formatCycle(cycle: string[]): string {
  const fileNames = cycle.map(getFileName);
  return fileNames.join(' → ');
}

/**
 * Detect self-imports in a file
 */
export function detectSelfImports(
  currentFile: string,
  imports: ImportForCycleDetection[]
): string[] {
  const normalizedCurrent = normalizePath(currentFile);
  const selfImports: string[] = [];

  for (const imp of imports) {
    const resolvedPath = imp.resolvedPath || imp.source;
    if (normalizePath(resolvedPath) === normalizedCurrent) {
      selfImports.push(imp.source);
    }
  }

  return selfImports;
}

/**
 * Build a local dependency graph from imports
 */
export function buildLocalDependencyGraph(
  imports: ImportForCycleDetection[]
): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();

  for (const imp of imports) {
    const resolvedPath = imp.resolvedPath;
    if (resolvedPath) {
      const normalized = normalizePath(resolvedPath);
      if (!graph.has(normalized)) {
        graph.set(normalized, new Set());
      }
    }
  }

  return graph;
}

/**
 * Detect cycles using DFS from a starting node
 */
export function detectCyclesFromNode(
  startNode: string,
  getDependencies: (node: string) => string[],
  maxDepth: number = 10
): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string, depth: number): void {
    if (depth > maxDepth) {
      return;
    }

    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    const dependencies = getDependencies(node);
    for (const dep of dependencies) {
      const normalizedDep = normalizePath(dep);

      if (!visited.has(normalizedDep)) {
        dfs(normalizedDep, depth + 1);
      } else if (recursionStack.has(normalizedDep)) {
        // Found a cycle
        const cycleStart = path.indexOf(normalizedDep);
        if (cycleStart !== -1) {
          const cycle = [...path.slice(cycleStart), normalizedDep];
          // Only add if this cycle includes the start node
          if (cycle.some(n => normalizePath(n) === normalizePath(startNode))) {
            cycles.push(cycle);
          }
        }
      }
    }

    path.pop();
    recursionStack.delete(node);
  }

  dfs(normalizePath(startNode), 0);
  return cycles;
}

/**
 * Analyze circular dependencies for a file
 */
export function analyzeCircularDependencies(
  file: string,
  imports: ImportForCycleDetection[],
  getDependencies?: (file: string) => string[]
): CircularDependencyAnalysis {
  const normalizedFile = normalizePath(file);
  const circularDependencies: CircularDependencyInfo[] = [];

  // Detect self-imports
  const selfImports = detectSelfImports(file, imports);
  for (const selfImport of selfImports) {
    circularDependencies.push({
      type: 'self-import',
      cycle: [file],
      length: 1,
      severity: 'error',
      description: `File imports itself via '${selfImport}'`,
      suggestions: generateBreakCycleSuggestions([file], 'self-import'),
    });
  }

  // If we have a dependency graph, use it to detect cycles
  if (getDependencies) {
    const cycles = detectCyclesFromNode(normalizedFile, getDependencies);

    for (const cycle of cycles) {
      // Skip if this is a self-import (already handled)
      if (cycle.length <= 2 && cycle[0] === cycle[cycle.length - 1]) {
        continue;
      }

      const type = getCycleType(cycle, file);
      const severity = calculateCycleSeverity(type, cycle.length - 1); // -1 because cycle includes start node twice

      circularDependencies.push({
        type,
        cycle,
        length: cycle.length - 1,
        severity,
        description: `Circular dependency: ${formatCycle(cycle)}`,
        suggestions: generateBreakCycleSuggestions(cycle, type),
      });
    }
  }

  // Count imports involved in cycles
  const importsInCycles = new Set<string>();
  for (const dep of circularDependencies) {
    for (const cycleFile of dep.cycle) {
      importsInCycles.add(normalizePath(cycleFile));
    }
  }

  return {
    hasCircularDependencies: circularDependencies.length > 0,
    circularDependencies,
    totalImports: imports.length,
    importsInCycles: importsInCycles.size,
    selfImports,
  };
}

/**
 * Get the line number of an import that causes a cycle
 */
function getImportLineForCycle(
  imports: ImportForCycleDetection[],
  targetFile: string
): number {
  const normalizedTarget = normalizePath(targetFile);

  for (const imp of imports) {
    const resolvedPath = imp.resolvedPath || imp.source;
    if (normalizePath(resolvedPath) === normalizedTarget) {
      return imp.line;
    }
  }

  return 1; // Default to first line if not found
}

// ============================================================================
// Circular Dependencies Detector Class
// ============================================================================

/**
 * Detector for circular dependency patterns
 *
 * Identifies circular dependencies in the codebase:
 * - Self-imports (file imports itself)
 * - Direct circular imports (A → B → A)
 * - Indirect circular imports (A → B → C → A)
 *
 * @requirements 7.7 - THE Structural_Detector SHALL detect circular dependencies
 */
export class CircularDependenciesDetector extends StructuralDetector {
  readonly id = 'structural/circular-deps';
  readonly category = 'structural' as const;
  readonly subcategory = 'circular-dependencies';
  readonly name = 'Circular Dependencies Detector';
  readonly description = 'Detects circular dependency patterns including direct, indirect, and self-imports';
  readonly supportedLanguages: Language[] = [
    'typescript',
    'javascript',
  ];

  /**
   * Detect circular dependencies in the project
   */
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    // Extract imports from context
    const imports = this.extractImports(context);

    if (imports.length === 0) {
      return this.createResult(patterns, violations, 1.0);
    }

    // Get dependency graph from project context if available
    const getDependencies = context.projectContext.dependencyGraph?.getDependencies;

    // Analyze circular dependencies
    const analysis = analyzeCircularDependencies(
      context.file,
      imports,
      getDependencies
    );

    // If no circular dependencies, return early with a pattern indicating clean state
    if (!analysis.hasCircularDependencies) {
      patterns.push({
        patternId: 'circular-deps-clean',
        location: { file: context.file, line: 1, column: 1 },
        confidence: 1.0,
        isOutlier: false,
      });
      return this.createResult(patterns, violations, 1.0);
    }

    // Create violations for each circular dependency
    for (const circDep of analysis.circularDependencies) {
      const violation = this.createCircularDependencyViolation(
        context.file,
        circDep,
        imports
      );
      violations.push(violation);

      // Also create a pattern match for tracking
      patterns.push({
        patternId: `circular-deps-${circDep.type}`,
        location: { file: context.file, line: violation.range.start.line + 1, column: 1 },
        confidence: 0.9,
        isOutlier: true, // Circular dependencies are outliers from good patterns
      });
    }

    // Calculate confidence based on the ratio of clean imports
    const cleanImportRatio = analysis.totalImports > 0
      ? (analysis.totalImports - analysis.importsInCycles) / analysis.totalImports
      : 1.0;

    return this.createResult(patterns, violations, cleanImportRatio);
  }

  /**
   * Generate a quick fix for circular dependency violations
   */
  generateQuickFix(violation: Violation): QuickFix | null {
    // Circular dependencies typically require manual refactoring
    // We provide guidance but can't automatically fix them

    if (violation.patternId === 'structural/circular-deps-self-import') {
      return {
        title: 'Remove self-import',
        kind: 'quickfix',
        edit: {
          changes: {},
          documentChanges: [],
        },
        isPreferred: true,
        confidence: 0.9,
        preview: 'Remove the import statement that imports the current file',
      };
    }

    if (violation.patternId === 'structural/circular-deps-direct' ||
        violation.patternId === 'structural/circular-deps-indirect') {
      return {
        title: 'Break circular dependency',
        kind: 'refactor',
        edit: {
          changes: {},
          documentChanges: [],
        },
        isPreferred: false,
        confidence: 0.5,
        preview: violation.explanation || 'Extract shared code to break the dependency cycle',
      };
    }

    return null;
  }

  /**
   * Extract imports from the detection context
   */
  private extractImports(context: DetectionContext): ImportForCycleDetection[] {
    const imports: ImportForCycleDetection[] = [];

    // Use imports from context if available
    if (context.imports && context.imports.length > 0) {
      for (const imp of context.imports) {
        imports.push({
          source: imp.source,
          resolvedPath: imp.resolvedPath,
          line: imp.line,
        });
      }
      return imports;
    }

    // Fall back to parsing content for imports
    const importRegex = /^import\s+(?:(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+(?:\s*,\s*\{[^}]*\})?)\s+from\s+)?['"]([^'"]+)['"]/gm;
    const lines = context.content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const match = importRegex.exec(line);
      if (match?.[1]) {
        imports.push({
          source: match[1],
          line: i + 1,
        });
      }
      importRegex.lastIndex = 0; // Reset regex state
    }

    return imports;
  }

  /**
   * Create a violation for a circular dependency
   */
  private createCircularDependencyViolation(
    file: string,
    circDep: CircularDependencyInfo,
    imports: ImportForCycleDetection[]
  ): Violation {
    // Find the line number of the import that causes the cycle
    const targetFile = circDep.cycle.length > 1 ? circDep.cycle[1] : circDep.cycle[0];
    const line = targetFile ? getImportLineForCycle(imports, targetFile) : 1;

    const range: Range = {
      start: { line: line - 1, character: 0 },
      end: { line: line - 1, character: 100 },
    };

    const violation: Violation = {
      id: `circular-deps-${file.replace(/[^a-zA-Z0-9]/g, '-')}-${line}`,
      patternId: `structural/circular-deps-${circDep.type}`,
      severity: circDep.severity,
      file,
      range,
      message: circDep.description,
      expected: 'No circular dependencies',
      actual: `Circular dependency of length ${circDep.length}`,
      explanation: circDep.suggestions.join('\n• '),
      aiExplainAvailable: true,
      aiFixAvailable: false,
      firstSeen: new Date(),
      occurrences: 1,
    };

    // Add quick fix for self-imports
    if (circDep.type === 'self-import') {
      violation.quickFix = {
        title: 'Remove self-import',
        kind: 'quickfix',
        edit: {
          changes: {},
          documentChanges: [],
        },
        isPreferred: true,
        confidence: 0.9,
      };
    }

    return violation;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new CircularDependenciesDetector instance
 */
export function createCircularDependenciesDetector(): CircularDependenciesDetector {
  return new CircularDependenciesDetector();
}
