/**
 * Component Structure Detector - Component file structure detection
 *
 * Detects single file vs split patterns for UI components.
 * Identifies component folder patterns and reports violations when
 * components don't follow the dominant pattern.
 *
 * @requirements 8.1 - THE Component_Detector SHALL detect component file structure patterns (single file vs split)
 */

import { StructuralDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language, Range } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

/**
 * Types of component structure patterns
 */
export type ComponentStructureType =
  | 'single-file'      // Component, styles, and logic in one file
  | 'split-file'       // component.tsx, component.styles.ts, component.hooks.ts
  | 'folder-index'     // Button/index.tsx pattern
  | 'folder-named'     // Button/Button.tsx pattern
  | 'unknown';

/**
 * Information about a component file
 */
export interface ComponentFileInfo {
  /** Full file path */
  path: string;
  /** Component name (derived from file/folder) */
  componentName: string;
  /** File type within the component */
  fileType: ComponentFileType;
  /** Parent folder name (if in a component folder) */
  folderName: string | undefined;
  /** Whether this is the main component file */
  isMainFile: boolean;
}

/**
 * Types of files within a component
 */
export type ComponentFileType =
  | 'component'    // Main component file (.tsx, .jsx)
  | 'styles'       // Styles file (.styles.ts, .css, .scss, .module.css)
  | 'hooks'        // Hooks file (.hooks.ts)
  | 'types'        // Types file (.types.ts)
  | 'test'         // Test file (.test.tsx, .spec.tsx)
  | 'stories'      // Storybook file (.stories.tsx)
  | 'utils'        // Utils file (.utils.ts)
  | 'constants'    // Constants file (.constants.ts)
  | 'index'        // Index/barrel file (index.ts)
  | 'other';       // Other related files

/**
 * A detected component with its files
 */
export interface DetectedComponent {
  /** Component name */
  name: string;
  /** Structure type */
  structureType: ComponentStructureType;
  /** All files belonging to this component */
  files: ComponentFileInfo[];
  /** Main component file path */
  mainFile: string;
  /** Folder path (if folder-based) */
  folderPath: string | undefined;
}

/**
 * Analysis of component structure patterns in a project
 */
export interface ComponentStructureAnalysis {
  /** All detected components */
  components: DetectedComponent[];
  /** Dominant structure type */
  dominantType: ComponentStructureType;
  /** Confidence in the dominant type */
  confidence: number;
  /** Count by structure type */
  typeCounts: Record<ComponentStructureType, number>;
  /** Components that don't follow the dominant pattern */
  inconsistentComponents: DetectedComponent[];
}

// ============================================================================
// Constants
// ============================================================================

/**
 * File extensions that indicate a component file
 */
export const COMPONENT_EXTENSIONS = ['.tsx', '.jsx'] as const;

/**
 * Patterns for identifying component-related files
 * Order matters - more specific patterns should be checked first
 */
export const COMPONENT_FILE_PATTERNS: Record<ComponentFileType, RegExp[]> = {
  // More specific patterns first
  test: [/\.(test|spec)\.(ts|tsx|js|jsx)$/],
  stories: [/\.stories\.(ts|tsx|js|jsx|mdx)$/],
  styles: [
    /\.styles?\.(ts|js|tsx|jsx)$/,
    /\.module\.(css|scss|sass|less)$/,
    /\.styled\.(ts|js|tsx|jsx)$/,
    /\.(css|scss|sass|less)$/,
  ],
  hooks: [/\.hooks?\.(ts|tsx)$/, /^use[A-Z].*\.(ts|tsx)$/],
  types: [/\.types?\.(ts|tsx)$/, /\.d\.ts$/],
  utils: [/\.utils?\.(ts|tsx|js|jsx)$/],
  constants: [/\.constants?\.(ts|tsx|js|jsx)$/],
  index: [/^index\.(ts|tsx|js|jsx)$/],
  // Generic component pattern last
  component: [/\.(tsx|jsx)$/],
  other: [],
};

/**
 * Common component folder patterns
 */
export const COMPONENT_FOLDER_INDICATORS = [
  'components',
  'ui',
  'common',
  'shared',
  'atoms',
  'molecules',
  'organisms',
  'templates',
  'pages',
  'views',
  'screens',
  'widgets',
  'features',
] as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Determine the file type of a component-related file
 * Checks more specific patterns first before generic component pattern
 */
export function getComponentFileType(fileName: string): ComponentFileType {
  const lowerFileName = fileName.toLowerCase();
  
  // Check patterns in order of specificity (most specific first)
  // This order is important to avoid generic patterns matching before specific ones
  const checkOrder: ComponentFileType[] = [
    'test',
    'stories',
    'styles',
    'hooks',
    'types',
    'utils',
    'constants',
    'index',
    'component', // Generic component pattern last
  ];
  
  for (const type of checkOrder) {
    const patterns = COMPONENT_FILE_PATTERNS[type];
    if (!patterns) {continue;}
    
    for (const pattern of patterns) {
      if (pattern.test(lowerFileName) || pattern.test(fileName)) {
        return type;
      }
    }
  }
  
  return 'other';
}

/**
 * Extract component name from a file path
 */
export function extractComponentName(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const segments = normalizedPath.split('/').filter(s => s.length > 0);
  const fileName = segments[segments.length - 1] || '';
  
  // Remove extension and suffixes
  let baseName = fileName
    .replace(/\.(tsx|jsx|ts|js)$/, '')
    .replace(/\.(test|spec|stories|styles|hooks|types|utils|constants|module)$/, '')
    .replace(/\.(css|scss|sass|less)$/, '');
  
  // If it's an index file, use the parent folder name
  if (baseName.toLowerCase() === 'index' && segments.length > 1) {
    baseName = segments[segments.length - 2] || baseName;
  }
  
  return baseName;
}

/**
 * Check if a file is likely a component file
 */
export function isComponentFile(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
  
  // Must have a component extension
  if (!COMPONENT_EXTENSIONS.some(ext => normalizedPath.endsWith(ext))) {
    return false;
  }
  
  // Exclude test files
  if (/\.(test|spec)\.(tsx|jsx)$/.test(normalizedPath)) {
    return false;
  }
  
  // Exclude stories files
  if (/\.stories\.(tsx|jsx)$/.test(normalizedPath)) {
    return false;
  }
  
  return true;
}

/**
 * Check if a directory is likely a component folder
 */
export function isComponentFolder(folderPath: string, files: string[]): boolean {
  const normalizedPath = folderPath.replace(/\\/g, '/');
  const folderName = normalizedPath.split('/').pop() || '';
  
  // Check if folder name starts with uppercase (PascalCase component)
  if (/^[A-Z]/.test(folderName)) {
    // Check if it contains component files
    const folderFiles = files.filter(f => 
      f.replace(/\\/g, '/').startsWith(normalizedPath + '/')
    );
    return folderFiles.some(f => isComponentFile(f));
  }
  
  return false;
}

/**
 * Get all files in a component folder
 */
export function getComponentFolderFiles(folderPath: string, allFiles: string[]): string[] {
  const normalizedFolder = folderPath.replace(/\\/g, '/');
  return allFiles.filter(f => {
    const normalizedFile = f.replace(/\\/g, '/');
    // Direct children only (not nested folders)
    const relativePath = normalizedFile.slice(normalizedFolder.length + 1);
    return normalizedFile.startsWith(normalizedFolder + '/') && !relativePath.includes('/');
  });
}

/**
 * Determine the structure type of a component
 */
export function determineStructureType(
  mainFile: string,
  relatedFiles: string[]
): ComponentStructureType {
  const normalizedMain = mainFile.replace(/\\/g, '/');
  const segments = normalizedMain.split('/');
  const fileName = segments[segments.length - 1] || '';
  const folderName = segments.length > 1 ? segments[segments.length - 2] : undefined;
  
  // Check for folder-based patterns
  if (folderName && /^[A-Z]/.test(folderName)) {
    const baseFileName = fileName.replace(/\.(tsx|jsx)$/, '');
    
    // Button/index.tsx pattern
    if (baseFileName.toLowerCase() === 'index') {
      return 'folder-index';
    }
    
    // Button/Button.tsx pattern
    if (baseFileName === folderName) {
      return 'folder-named';
    }
  }
  
  // Check for split-file pattern (has related files like .styles.ts, .hooks.ts)
  const hasRelatedFiles = relatedFiles.some(f => {
    const type = getComponentFileType(f.split('/').pop() || '');
    return ['styles', 'hooks', 'types', 'utils', 'constants'].includes(type);
  });
  
  if (hasRelatedFiles) {
    return 'split-file';
  }
  
  // Default to single-file
  return 'single-file';
}

/**
 * Find related files for a component
 */
export function findRelatedFiles(
  componentName: string,
  componentPath: string,
  allFiles: string[]
): string[] {
  const normalizedPath = componentPath.replace(/\\/g, '/');
  const directory = normalizedPath.split('/').slice(0, -1).join('/');
  
  return allFiles.filter(f => {
    const normalizedFile = f.replace(/\\/g, '/');
    if (normalizedFile === normalizedPath) {return false;}
    
    // Same directory
    const fileDir = normalizedFile.split('/').slice(0, -1).join('/');
    if (fileDir !== directory) {return false;}
    
    // Check if file name contains the component name
    const fileName = normalizedFile.split('/').pop() || '';
    const fileBaseName = extractComponentName(normalizedFile);
    
    return fileBaseName.toLowerCase() === componentName.toLowerCase() ||
           fileName.toLowerCase().startsWith(componentName.toLowerCase() + '.');
  });
}

/**
 * Detect all components in a project
 */
export function detectComponents(files: string[]): DetectedComponent[] {
  const components: DetectedComponent[] = [];
  const processedFiles = new Set<string>();
  
  // First, find all component folders
  const folders = new Set<string>();
  for (const file of files) {
    const normalizedFile = file.replace(/\\/g, '/');
    const segments = normalizedFile.split('/');
    
    for (let i = 0; i < segments.length - 1; i++) {
      const folderPath = segments.slice(0, i + 1).join('/');
      const folderName = segments[i];
      
      // Check if this is a PascalCase folder (potential component folder)
      if (folderName && /^[A-Z]/.test(folderName)) {
        folders.add(folderPath);
      }
    }
  }
  
  // Process component folders
  for (const folder of folders) {
    const folderFiles = getComponentFolderFiles(folder, files);
    const componentFiles = folderFiles.filter(f => isComponentFile(f));
    
    if (componentFiles.length === 0) {continue;}
    
    const folderName = folder.split('/').pop() || '';
    
    // Find the main component file
    let mainFile = componentFiles.find(f => {
      const fileName = f.split('/').pop()?.replace(/\.(tsx|jsx)$/, '') || '';
      return fileName === folderName || fileName.toLowerCase() === 'index';
    });
    
    if (!mainFile) {
      mainFile = componentFiles[0];
    }
    
    if (!mainFile) {continue;}
    
    const componentFileInfos: ComponentFileInfo[] = folderFiles.map(f => ({
      path: f,
      componentName: folderName,
      fileType: getComponentFileType(f.split('/').pop() || ''),
      folderName,
      isMainFile: f === mainFile,
    }));
    
    const structureType = determineStructureType(mainFile, folderFiles);
    
    components.push({
      name: folderName,
      structureType,
      files: componentFileInfos,
      mainFile,
      folderPath: folder,
    });
    
    // Mark files as processed
    folderFiles.forEach(f => processedFiles.add(f.replace(/\\/g, '/')));
  }
  
  // Process standalone component files
  for (const file of files) {
    const normalizedFile = file.replace(/\\/g, '/');
    if (processedFiles.has(normalizedFile)) {continue;}
    if (!isComponentFile(file)) {continue;}
    
    const componentName = extractComponentName(file);
    if (!componentName || !/^[A-Z]/.test(componentName)) {continue;}
    
    const relatedFiles = findRelatedFiles(componentName, file, files);
    const structureType = determineStructureType(file, relatedFiles);
    
    const allComponentFiles = [file, ...relatedFiles];
    const componentFileInfos: ComponentFileInfo[] = allComponentFiles.map(f => ({
      path: f,
      componentName,
      fileType: getComponentFileType(f.split('/').pop() || ''),
      folderName: undefined,
      isMainFile: f === file,
    }));
    
    components.push({
      name: componentName,
      structureType,
      files: componentFileInfos,
      mainFile: file,
      folderPath: undefined,
    });
    
    // Mark files as processed
    allComponentFiles.forEach(f => processedFiles.add(f.replace(/\\/g, '/')));
  }
  
  return components;
}

/**
 * Analyze component structure patterns in a project
 */
export function analyzeComponentStructure(files: string[]): ComponentStructureAnalysis {
  const components = detectComponents(files);
  
  // Count by structure type
  const typeCounts: Record<ComponentStructureType, number> = {
    'single-file': 0,
    'split-file': 0,
    'folder-index': 0,
    'folder-named': 0,
    'unknown': 0,
  };
  
  for (const component of components) {
    typeCounts[component.structureType]++;
  }
  
  // Determine dominant type
  let dominantType: ComponentStructureType = 'unknown';
  let maxCount = 0;
  
  for (const [type, count] of Object.entries(typeCounts)) {
    if (count > maxCount && type !== 'unknown') {
      maxCount = count;
      dominantType = type as ComponentStructureType;
    }
  }
  
  // Calculate confidence
  const totalComponents = components.filter(c => c.structureType !== 'unknown').length;
  const confidence = totalComponents > 0 ? maxCount / totalComponents : 0;
  
  // Find inconsistent components
  const inconsistentComponents = components.filter(
    c => c.structureType !== dominantType && c.structureType !== 'unknown'
  );
  
  return {
    components,
    dominantType,
    confidence,
    typeCounts,
    inconsistentComponents,
  };
}

/**
 * Generate a suggested restructure for a component
 */
export function suggestRestructure(
  component: DetectedComponent,
  targetType: ComponentStructureType
): string {
  const { name, structureType, mainFile } = component;
  
  if (structureType === targetType) {
    return mainFile;
  }
  
  const directory = mainFile.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
  
  switch (targetType) {
    case 'folder-index':
      return `${directory}/${name}/index.tsx`;
    case 'folder-named':
      return `${directory}/${name}/${name}.tsx`;
    case 'single-file':
      return `${directory}/${name}.tsx`;
    case 'split-file':
      return mainFile; // Keep main file, suggest adding related files
    default:
      return mainFile;
  }
}

// ============================================================================
// Component Structure Detector Class
// ============================================================================

/**
 * Detector for component structure patterns
 *
 * Identifies whether components use single-file, split-file, or folder-based
 * organization and detects inconsistencies.
 *
 * @requirements 8.1 - THE Component_Detector SHALL detect component file structure patterns
 */
export class ComponentStructureDetector extends StructuralDetector {
  readonly id = 'components/component-structure';
  readonly category = 'components' as const;
  readonly subcategory = 'file-structure';
  readonly name = 'Component Structure Detector';
  readonly description = 'Detects component file structure patterns (single file vs split) and identifies inconsistencies';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript'];

  /**
   * Detect component structure patterns in the project
   */
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    // Analyze the entire project's component structure
    const analysis = analyzeComponentStructure(context.projectContext.files);

    // Create pattern match for the detected dominant structure
    if (analysis.dominantType !== 'unknown' && analysis.confidence > 0.3) {
      patterns.push(this.createStructurePattern(context.file, analysis));
    }

    // Create patterns for each structure type found
    for (const [type, count] of Object.entries(analysis.typeCounts)) {
      if (count > 0 && type !== 'unknown') {
        patterns.push(this.createTypePattern(context.file, type as ComponentStructureType, count, analysis));
      }
    }

    // Generate violations for inconsistent components
    for (const inconsistent of analysis.inconsistentComponents) {
      // Only report if the current file is part of this component
      if (this.isFileInComponent(context.file, inconsistent)) {
        const violation = this.createInconsistencyViolation(
          context.file,
          inconsistent,
          analysis.dominantType
        );
        if (violation) {
          violations.push(violation);
        }
      }
    }

    return this.createResult(patterns, violations, analysis.confidence);
  }

  /**
   * Generate a quick fix for component structure violations
   */
  generateQuickFix(violation: Violation): QuickFix | null {
    // Extract target structure from the violation message
    const match = violation.message.match(/restructure to '([^']+)'/);
    if (!match?.[1]) {
      return null;
    }

    const suggestedPath = match[1];

    return {
      title: `Move to ${suggestedPath}`,
      kind: 'refactor',
      edit: {
        changes: {},
        documentChanges: [
          { uri: violation.file, edits: [] },
          { uri: suggestedPath, edits: [] },
        ],
      },
      isPreferred: true,
      confidence: 0.7,
      preview: `Restructure component to follow ${violation.expected} pattern`,
    };
  }

  /**
   * Check if a file is part of a component
   */
  private isFileInComponent(file: string, component: DetectedComponent): boolean {
    const normalizedFile = file.replace(/\\/g, '/');
    return component.files.some(f => f.path.replace(/\\/g, '/') === normalizedFile);
  }

  /**
   * Create a pattern match for the dominant structure type
   */
  private createStructurePattern(
    file: string,
    analysis: ComponentStructureAnalysis
  ): PatternMatch {
    return {
      patternId: `component-structure-${analysis.dominantType}`,
      location: { file, line: 1, column: 1 },
      confidence: analysis.confidence,
      isOutlier: false,
    };
  }

  /**
   * Create a pattern match for a specific structure type
   */
  private createTypePattern(
    file: string,
    type: ComponentStructureType,
    count: number,
    analysis: ComponentStructureAnalysis
  ): PatternMatch {
    const total = analysis.components.filter(c => c.structureType !== 'unknown').length;
    const confidence = total > 0 ? count / total : 0;

    return {
      patternId: `component-structure-type-${type}`,
      location: { file, line: 1, column: 1 },
      confidence,
      isOutlier: confidence < 0.3,
    };
  }

  /**
   * Create a violation for an inconsistent component
   */
  private createInconsistencyViolation(
    file: string,
    component: DetectedComponent,
    dominantType: ComponentStructureType
  ): Violation | null {
    const suggestedPath = suggestRestructure(component, dominantType);
    
    const range: Range = {
      start: { line: 1, character: 1 },
      end: { line: 1, character: 1 },
    };

    const structureDescriptions: Record<ComponentStructureType, string> = {
      'single-file': 'single file (component, styles, and logic in one file)',
      'split-file': 'split files (component.tsx, component.styles.ts, component.hooks.ts)',
      'folder-index': 'folder with index (Component/index.tsx)',
      'folder-named': 'folder with named file (Component/Component.tsx)',
      'unknown': 'unknown',
    };

    return {
      id: `component-structure-${component.name}-${file.replace(/[^a-zA-Z0-9]/g, '-')}`,
      patternId: 'components/component-structure',
      severity: 'warning',
      file,
      range,
      message: `Component '${component.name}' uses ${structureDescriptions[component.structureType]} but project uses ${structureDescriptions[dominantType]}. Consider restructure to '${suggestedPath}'`,
      expected: structureDescriptions[dominantType],
      actual: structureDescriptions[component.structureType],
      aiExplainAvailable: true,
      aiFixAvailable: false,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new ComponentStructureDetector instance
 */
export function createComponentStructureDetector(): ComponentStructureDetector {
  return new ComponentStructureDetector();
}
