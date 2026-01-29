/**
 * Module Boundaries Detector - Layer violation detection
 *
 * Detects layer violations and unauthorized imports in architectural patterns.
 * Supports common architectural patterns like Clean Architecture, Hexagonal Architecture,
 * MVC, and custom layer configurations.
 *
 * @requirements 7.6 - THE Structural_Detector SHALL detect module boundary violations
 */

import { StructuralDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language, Range } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

/**
 * Supported architectural patterns
 */
export type ArchitecturalPattern =
  | 'clean-architecture'
  | 'hexagonal'
  | 'mvc'
  | 'mvvm'
  | 'layered'
  | 'custom'
  | 'unknown';

/**
 * Layer definition for architectural patterns
 */
export interface LayerDefinition {
  /** Layer name */
  name: string;
  /** Directory patterns that belong to this layer (glob patterns) */
  patterns: string[];
  /** Layers this layer is allowed to import from */
  allowedDependencies: string[];
  /** Layers this layer is NOT allowed to import from (takes precedence) */
  forbiddenDependencies?: string[];
  /** Layer level (lower = more foundational, higher = more application-specific) */
  level: number;
}

/**
 * Predefined layer configurations for common architectural patterns
 */
export const ARCHITECTURAL_PATTERNS: Record<string, LayerDefinition[]> = {
  'clean-architecture': [
    {
      name: 'entities',
      patterns: ['**/entities/**', '**/domain/entities/**', '**/core/entities/**'],
      allowedDependencies: [],
      level: 0,
    },
    {
      name: 'use-cases',
      patterns: ['**/use-cases/**', '**/usecases/**', '**/application/**', '**/domain/use-cases/**'],
      allowedDependencies: ['entities'],
      level: 1,
    },
    {
      name: 'interface-adapters',
      patterns: ['**/adapters/**', '**/controllers/**', '**/presenters/**', '**/gateways/**'],
      allowedDependencies: ['entities', 'use-cases'],
      level: 2,
    },
    {
      name: 'frameworks',
      patterns: ['**/frameworks/**', '**/infrastructure/**', '**/drivers/**', '**/external/**'],
      allowedDependencies: ['entities', 'use-cases', 'interface-adapters'],
      level: 3,
    },
  ],
  'hexagonal': [
    {
      name: 'domain',
      patterns: ['**/domain/**', '**/core/**'],
      allowedDependencies: [],
      level: 0,
    },
    {
      name: 'ports',
      patterns: ['**/ports/**', '**/interfaces/**'],
      allowedDependencies: ['domain'],
      level: 1,
    },
    {
      name: 'adapters',
      patterns: ['**/adapters/**', '**/infrastructure/**'],
      allowedDependencies: ['domain', 'ports'],
      level: 2,
    },
    {
      name: 'application',
      patterns: ['**/application/**', '**/app/**'],
      allowedDependencies: ['domain', 'ports', 'adapters'],
      level: 3,
    },
  ],
  'mvc': [
    {
      name: 'models',
      patterns: ['**/models/**', '**/model/**'],
      allowedDependencies: [],
      level: 0,
    },
    {
      name: 'views',
      patterns: ['**/views/**', '**/view/**', '**/templates/**'],
      allowedDependencies: ['models'],
      forbiddenDependencies: ['controllers'],
      level: 1,
    },
    {
      name: 'controllers',
      patterns: ['**/controllers/**', '**/controller/**'],
      allowedDependencies: ['models', 'views'],
      level: 2,
    },
  ],
  'mvvm': [
    {
      name: 'models',
      patterns: ['**/models/**', '**/model/**'],
      allowedDependencies: [],
      level: 0,
    },
    {
      name: 'view-models',
      patterns: ['**/view-models/**', '**/viewmodels/**', '**/viewModels/**'],
      allowedDependencies: ['models'],
      level: 1,
    },
    {
      name: 'views',
      patterns: ['**/views/**', '**/view/**', '**/components/**'],
      allowedDependencies: ['view-models'],
      forbiddenDependencies: ['models'],
      level: 2,
    },
  ],
  'layered': [
    {
      name: 'data',
      patterns: ['**/data/**', '**/dal/**', '**/repositories/**', '**/database/**'],
      allowedDependencies: [],
      level: 0,
    },
    {
      name: 'business',
      patterns: ['**/business/**', '**/services/**', '**/bll/**', '**/logic/**'],
      allowedDependencies: ['data'],
      level: 1,
    },
    {
      name: 'presentation',
      patterns: ['**/presentation/**', '**/ui/**', '**/web/**', '**/api/**', '**/controllers/**'],
      allowedDependencies: ['business'],
      forbiddenDependencies: ['data'],
      level: 2,
    },
  ],
};

/**
 * Common layer directory patterns for auto-detection
 */
export const COMMON_LAYER_PATTERNS = {
  // Presentation layer indicators
  presentation: [
    'ui', 'views', 'pages', 'screens', 'components', 'presentation',
    'web', 'api', 'controllers', 'routes', 'handlers',
  ],
  // Business logic layer indicators
  business: [
    'services', 'business', 'logic', 'use-cases', 'usecases',
    'application', 'domain', 'core',
  ],
  // Data layer indicators
  data: [
    'data', 'dal', 'repositories', 'database', 'db', 'persistence',
    'infrastructure', 'adapters', 'external',
  ],
} as const;

/**
 * Information about an import and its source/target layers
 */
export interface ImportLayerInfo {
  /** The import source path */
  importSource: string;
  /** Resolved import path (if available) */
  resolvedPath?: string;
  /** Layer of the importing file */
  sourceLayer: string | null;
  /** Layer of the imported module */
  targetLayer: string | null;
  /** Line number of the import */
  line: number;
  /** Whether this import violates layer boundaries */
  isViolation: boolean;
  /** Reason for violation (if any) */
  violationReason?: string;
}

/**
 * Analysis result for module boundaries
 */
export interface ModuleBoundaryAnalysis {
  /** Detected architectural pattern */
  detectedPattern: ArchitecturalPattern;
  /** Confidence in the pattern detection */
  confidence: number;
  /** Layer definitions being used */
  layers: LayerDefinition[];
  /** Layer of the current file */
  currentFileLayer: string | null;
  /** Import analysis results */
  imports: ImportLayerInfo[];
  /** Layer violations found */
  violations: ImportLayerInfo[];
  /** Total imports analyzed */
  totalImports: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize a file path for consistent matching
 */
function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase();
}

/**
 * Check if a path matches a glob-like pattern
 * Supports ** for any path and * for any segment
 */
export function matchesPattern(path: string, pattern: string): boolean {
  const normalizedPath = normalizePath(path);
  const normalizedPattern = normalizePath(pattern);

  // Convert glob pattern to regex
  const regexPattern = normalizedPattern
    .replace(/\*\*/g, '<<<GLOBSTAR>>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<<GLOBSTAR>>>/g, '.*')
    .replace(/\//g, '\\/');

  const regex = new RegExp(`(^|/)${regexPattern}($|/)`, 'i');
  return regex.test(normalizedPath);
}

/**
 * Determine which layer a file belongs to
 */
export function getFileLayer(
  filePath: string,
  layers: LayerDefinition[]
): string | null {
  const normalizedPath = normalizePath(filePath);

  for (const layer of layers) {
    for (const pattern of layer.patterns) {
      if (matchesPattern(normalizedPath, pattern)) {
        return layer.name;
      }
    }
  }

  return null;
}

/**
 * Check if an import from sourceLayer to targetLayer is allowed
 */
export function isImportAllowed(
  sourceLayer: string,
  targetLayer: string,
  layers: LayerDefinition[]
): { allowed: boolean; reason?: string } {
  // Same layer imports are always allowed
  if (sourceLayer === targetLayer) {
    return { allowed: true };
  }

  const sourceLayerDef = layers.find(l => l.name === sourceLayer);
  if (!sourceLayerDef) {
    return { allowed: true }; // Unknown source layer, allow by default
  }

  // Check forbidden dependencies first (takes precedence)
  if (sourceLayerDef.forbiddenDependencies?.includes(targetLayer)) {
    return {
      allowed: false,
      reason: `Layer '${sourceLayer}' is explicitly forbidden from importing '${targetLayer}'`,
    };
  }

  // Check if target is in allowed dependencies
  if (sourceLayerDef.allowedDependencies.length > 0) {
    if (!sourceLayerDef.allowedDependencies.includes(targetLayer)) {
      return {
        allowed: false,
        reason: `Layer '${sourceLayer}' can only import from: ${sourceLayerDef.allowedDependencies.join(', ')}`,
      };
    }
  }

  // Check layer levels (higher layers should not be imported by lower layers)
  const targetLayerDef = layers.find(l => l.name === targetLayer);
  if (targetLayerDef && sourceLayerDef.level < targetLayerDef.level) {
    return {
      allowed: false,
      reason: `Lower-level layer '${sourceLayer}' (level ${sourceLayerDef.level}) cannot import from higher-level layer '${targetLayer}' (level ${targetLayerDef.level})`,
    };
  }

  return { allowed: true };
}


/**
 * Detect the architectural pattern used in a project based on directory structure
 */
export function detectArchitecturalPattern(
  files: string[]
): { pattern: ArchitecturalPattern; confidence: number; layers: LayerDefinition[] } {
  const normalizedFiles = files.map(normalizePath);

  // Score each pattern based on how many files match its layer patterns
  const patternScores: Record<string, number> = {};

  for (const [patternName, layers] of Object.entries(ARCHITECTURAL_PATTERNS)) {
    let matchCount = 0;
    let totalPatterns = 0;

    for (const layer of layers) {
      for (const pattern of layer.patterns) {
        totalPatterns++;
        const hasMatch = normalizedFiles.some(file => matchesPattern(file, pattern));
        if (hasMatch) {
          matchCount++;
        }
      }
    }

    patternScores[patternName] = totalPatterns > 0 ? matchCount / totalPatterns : 0;
  }

  // Find the best matching pattern
  let bestPattern: ArchitecturalPattern = 'unknown';
  let bestScore = 0;

  for (const [pattern, score] of Object.entries(patternScores)) {
    if (score > bestScore && score >= 0.3) { // Require at least 30% match
      bestScore = score;
      bestPattern = pattern as ArchitecturalPattern;
    }
  }

  // If no pattern matches well, try to detect a generic layered structure
  if (bestPattern === 'unknown') {
    const genericLayers = detectGenericLayers(normalizedFiles);
    if (genericLayers.length > 0) {
      return {
        pattern: 'layered',
        confidence: 0.5,
        layers: genericLayers,
      };
    }
  }

  return {
    pattern: bestPattern,
    confidence: bestScore,
    layers: bestPattern !== 'unknown' ? ARCHITECTURAL_PATTERNS[bestPattern]! : [],
  };
}

/**
 * Detect generic layer structure when no specific pattern matches
 */
function detectGenericLayers(files: string[]): LayerDefinition[] {
  const layers: LayerDefinition[] = [];

  // Check for presentation layer
  const hasPresentationLayer = files.some(file =>
    COMMON_LAYER_PATTERNS.presentation.some(pattern =>
      file.includes(`/${pattern}/`) || file.includes(`/${pattern}.`)
    )
  );

  // Check for business layer
  const hasBusinessLayer = files.some(file =>
    COMMON_LAYER_PATTERNS.business.some(pattern =>
      file.includes(`/${pattern}/`) || file.includes(`/${pattern}.`)
    )
  );

  // Check for data layer
  const hasDataLayer = files.some(file =>
    COMMON_LAYER_PATTERNS.data.some(pattern =>
      file.includes(`/${pattern}/`) || file.includes(`/${pattern}.`)
    )
  );

  if (hasDataLayer) {
    layers.push({
      name: 'data',
      patterns: COMMON_LAYER_PATTERNS.data.map(p => `**/${p}/**`),
      allowedDependencies: [],
      level: 0,
    });
  }

  if (hasBusinessLayer) {
    layers.push({
      name: 'business',
      patterns: COMMON_LAYER_PATTERNS.business.map(p => `**/${p}/**`),
      allowedDependencies: hasDataLayer ? ['data'] : [],
      level: 1,
    });
  }

  if (hasPresentationLayer) {
    const allowedDeps: string[] = [];
    if (hasBusinessLayer) {allowedDeps.push('business');}
    
    const presentationLayer: LayerDefinition = {
      name: 'presentation',
      patterns: COMMON_LAYER_PATTERNS.presentation.map(p => `**/${p}/**`),
      allowedDependencies: allowedDeps,
      level: 2,
    };
    if (hasDataLayer) {
      presentationLayer.forbiddenDependencies = ['data'];
    }
    layers.push(presentationLayer);
  }

  return layers;
}

/**
 * Resolve an import path to determine which layer it belongs to
 */
export function resolveImportLayer(
  importSource: string,
  currentFile: string,
  projectFiles: string[],
  layers: LayerDefinition[]
): string | null {
  // Skip external packages (node_modules)
  if (!importSource.startsWith('.') && !importSource.startsWith('/') && !importSource.startsWith('@/')) {
    // Check if it's an internal alias like @/
    if (!importSource.startsWith('@') || importSource.startsWith('@types/')) {
      return null; // External package
    }
  }

  // Resolve relative imports
  let resolvedPath = importSource;
  
  if (importSource.startsWith('.')) {
    const currentDir = currentFile.split('/').slice(0, -1).join('/');
    const segments = importSource.split('/');
    const pathSegments = currentDir.split('/');

    for (const segment of segments) {
      if (segment === '.') {
        continue;
      } else if (segment === '..') {
        pathSegments.pop();
      } else {
        pathSegments.push(segment);
      }
    }

    resolvedPath = pathSegments.join('/');
  }

  // Handle alias imports (e.g., @/components)
  if (importSource.startsWith('@/')) {
    resolvedPath = importSource.replace('@/', 'src/');
  }

  // Try to find the actual file
  const possibleExtensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
  let matchedFile: string | null = null;

  for (const file of projectFiles) {
    const normalizedFile = normalizePath(file);
    const normalizedResolved = normalizePath(resolvedPath);

    if (normalizedFile === normalizedResolved) {
      matchedFile = file;
      break;
    }

    for (const ext of possibleExtensions) {
      if (normalizedFile === normalizedResolved + ext.toLowerCase()) {
        matchedFile = file;
        break;
      }
    }

    if (matchedFile) {break;}
  }

  if (matchedFile) {
    return getFileLayer(matchedFile, layers);
  }

  // If we can't find the exact file, try to determine layer from the import path itself
  return getFileLayer(resolvedPath, layers);
}

/**
 * Analyze module boundaries for a file
 */
export function analyzeModuleBoundaries(
  file: string,
  imports: Array<{ source: string; line: number }>,
  projectFiles: string[],
  customLayers?: LayerDefinition[]
): ModuleBoundaryAnalysis {
  // Detect or use provided architectural pattern
  const { pattern, confidence, layers } = customLayers
    ? { pattern: 'custom' as ArchitecturalPattern, confidence: 1.0, layers: customLayers }
    : detectArchitecturalPattern(projectFiles);

  if (layers.length === 0) {
    return {
      detectedPattern: 'unknown',
      confidence: 0,
      layers: [],
      currentFileLayer: null,
      imports: [],
      violations: [],
      totalImports: imports.length,
    };
  }

  const currentFileLayer = getFileLayer(file, layers);
  const importAnalysis: ImportLayerInfo[] = [];
  const violations: ImportLayerInfo[] = [];

  for (const imp of imports) {
    const targetLayer = resolveImportLayer(imp.source, file, projectFiles, layers);

    const importInfo: ImportLayerInfo = {
      importSource: imp.source,
      sourceLayer: currentFileLayer,
      targetLayer,
      line: imp.line,
      isViolation: false,
    };

    // Check for violations only if both layers are known
    if (currentFileLayer && targetLayer && currentFileLayer !== targetLayer) {
      const { allowed, reason } = isImportAllowed(currentFileLayer, targetLayer, layers);
      
      if (!allowed) {
        importInfo.isViolation = true;
        if (reason) {
          importInfo.violationReason = reason;
        }
        violations.push(importInfo);
      }
    }

    importAnalysis.push(importInfo);
  }

  return {
    detectedPattern: pattern,
    confidence,
    layers,
    currentFileLayer,
    imports: importAnalysis,
    violations,
    totalImports: imports.length,
  };
}


// ============================================================================
// Module Boundaries Detector Class
// ============================================================================

/**
 * Detector for module boundary violations
 *
 * Identifies layer violations and unauthorized imports based on
 * architectural patterns like Clean Architecture, Hexagonal, MVC, etc.
 *
 * @requirements 7.6 - THE Structural_Detector SHALL detect module boundary violations
 */
export class ModuleBoundariesDetector extends StructuralDetector {
  readonly id = 'structural/module-boundaries';
  readonly category = 'structural' as const;
  readonly subcategory = 'module-boundaries';
  readonly name = 'Module Boundaries Detector';
  readonly description = 'Detects layer violations and unauthorized imports in architectural patterns';
  readonly supportedLanguages: Language[] = [
    'typescript',
    'javascript',
  ];

  /**
   * Detect module boundary violations in the project
   */
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    // Extract imports from context
    const imports = this.extractImports(context);

    if (imports.length === 0) {
      return this.createResult(patterns, violations, 0);
    }

    // Analyze module boundaries
    const analysis = analyzeModuleBoundaries(
      context.file,
      imports,
      context.projectContext.files
    );

    // If no architectural pattern detected, return early
    if (analysis.detectedPattern === 'unknown') {
      return this.createResult(patterns, violations, 0);
    }

    // Create pattern match for detected architecture
    patterns.push(this.createArchitecturePattern(context.file, analysis));

    // Create pattern match for current file's layer
    if (analysis.currentFileLayer) {
      patterns.push(this.createLayerPattern(context.file, analysis));
    }

    // Generate violations for boundary crossings
    for (const violation of analysis.violations) {
      const v = this.createBoundaryViolation(context.file, violation, analysis);
      if (v) {
        violations.push(v);
      }
    }

    return this.createResult(patterns, violations, analysis.confidence);
  }

  /**
   * Generate a quick fix for module boundary violations
   */
  generateQuickFix(violation: Violation): QuickFix | null {
    // Module boundary violations typically require architectural refactoring
    // We can suggest the fix but not automatically apply it
    if (violation.patternId === 'structural/module-boundary-violation') {
      return {
        title: 'Review architectural boundaries',
        kind: 'refactor',
        edit: {
          changes: {},
          documentChanges: [],
        },
        isPreferred: false,
        confidence: 0.3,
        preview: `Consider moving the import to an appropriate layer or introducing an abstraction. ${violation.explanation || ''}`,
      };
    }

    return null;
  }

  /**
   * Extract imports from the detection context
   */
  private extractImports(context: DetectionContext): Array<{ source: string; line: number }> {
    const imports: Array<{ source: string; line: number }> = [];

    // Use imports from context if available
    if (context.imports && context.imports.length > 0) {
      for (const imp of context.imports) {
        // Handle both 'source' and 'module' property names
        const source = (imp as { source?: string; module?: string }).source || 
                       (imp as { source?: string; module?: string }).module;
        if (source) {
          imports.push({
            source,
            line: (imp as { line?: number }).line || 1,
          });
        }
      }
      return imports;
    }

    // Fall back to parsing content for imports
    const importRegex = /^import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+(?:\s*,\s*\{[^}]*\})?)\s+from\s+)?['"]([^'"]+)['"]/gm;
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
   * Create a pattern match for the detected architecture
   */
  private createArchitecturePattern(
    file: string,
    analysis: ModuleBoundaryAnalysis
  ): PatternMatch {
    return {
      patternId: `module-boundaries-architecture-${analysis.detectedPattern}`,
      location: { file, line: 1, column: 1 },
      confidence: analysis.confidence,
      isOutlier: false,
    };
  }

  /**
   * Create a pattern match for the file's layer
   */
  private createLayerPattern(
    file: string,
    analysis: ModuleBoundaryAnalysis
  ): PatternMatch {
    return {
      patternId: `module-boundaries-layer-${analysis.currentFileLayer}`,
      location: { file, line: 1, column: 1 },
      confidence: analysis.confidence,
      isOutlier: false,
    };
  }

  /**
   * Create a violation for a boundary crossing
   */
  private createBoundaryViolation(
    file: string,
    importViolation: ImportLayerInfo,
    analysis: ModuleBoundaryAnalysis
  ): Violation | null {
    const range: Range = {
      start: { line: importViolation.line - 1, character: 0 },
      end: { line: importViolation.line - 1, character: 100 },
    };

    const sourceLayer = importViolation.sourceLayer || 'unknown';
    const targetLayer = importViolation.targetLayer || 'unknown';

    const violation: Violation = {
      id: `module-boundary-${file.replace(/[^a-zA-Z0-9]/g, '-')}-${importViolation.line}`,
      patternId: 'structural/module-boundary-violation',
      severity: 'warning',
      file,
      range,
      message: `Layer violation: '${sourceLayer}' layer imports from '${targetLayer}' layer`,
      expected: `Import from allowed layers: ${this.getAllowedLayers(sourceLayer, analysis.layers)}`,
      actual: `Import from '${targetLayer}' layer via '${importViolation.importSource}'`,
      aiExplainAvailable: true,
      aiFixAvailable: false,
      firstSeen: new Date(),
      occurrences: 1,
    };

    if (importViolation.violationReason) {
      violation.explanation = importViolation.violationReason;
    }

    return violation;
  }

  /**
   * Get the list of allowed layers for a given source layer
   */
  private getAllowedLayers(sourceLayer: string, layers: LayerDefinition[]): string {
    const layerDef = layers.find(l => l.name === sourceLayer);
    if (!layerDef) {
      return 'unknown';
    }

    if (layerDef.allowedDependencies.length === 0) {
      return 'none (foundational layer)';
    }

    return layerDef.allowedDependencies.join(', ');
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new ModuleBoundariesDetector instance
 */
export function createModuleBoundariesDetector(): ModuleBoundariesDetector {
  return new ModuleBoundariesDetector();
}
