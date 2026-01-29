/**
 * Duplicate Detection - AST-based duplicate component detection
 *
 * Detects duplicate and near-duplicate components using AST comparison
 * with configurable similarity thresholds. Supports exact duplicates (100%),
 * near-duplicates (80%+), and structural duplicates (same AST structure,
 * different identifiers).
 *
 * @requirements 8.3 - THE Component_Detector SHALL detect duplicate components with 80%+ similarity
 * @requirements 8.4 - THE Component_Detector SHALL detect near-duplicate components that should be abstracted
 */

import { ASTDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language, Range, ASTNode, AST } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

/**
 * Types of duplicate detection
 */
export type DuplicateType =
  | 'exact'        // 100% identical code
  | 'near'         // 80%+ similarity with minor differences
  | 'structural';  // Same AST structure, different identifiers

/**
 * Information about a detected duplicate pair
 */
export interface DuplicatePair {
  /** First component in the pair */
  component1: ComponentInfo;
  /** Second component in the pair */
  component2: ComponentInfo;
  /** Type of duplication */
  duplicateType: DuplicateType;
  /** Similarity score (0.0 to 1.0) */
  similarity: number;
  /** Differences between the components */
  differences: DuplicateDifference[];
}

/**
 * Information about a component for duplicate detection
 */
export interface ComponentInfo {
  /** Component name */
  name: string;
  /** File path */
  filePath: string;
  /** Line number where component starts */
  line: number;
  /** Column number where component starts */
  column: number;
  /** Normalized AST representation */
  normalizedAST: NormalizedNode | null;
  /** Raw source code */
  sourceCode: string;
  /** Hash of the normalized AST for quick comparison */
  astHash: string;
}

/**
 * Difference between two components
 */
export interface DuplicateDifference {
  /** Type of difference */
  type: 'identifier' | 'literal' | 'structure' | 'whitespace';
  /** Location in component 1 */
  location1: { line: number; column: number };
  /** Location in component 2 */
  location2: { line: number; column: number };
  /** Value in component 1 */
  value1: string;
  /** Value in component 2 */
  value2: string;
}

/**
 * Normalized AST node for comparison
 * Strips out position information and normalizes identifiers
 */
export interface NormalizedNode {
  /** Node type */
  type: string;
  /** Normalized value (for literals) or placeholder (for identifiers) */
  value?: string;
  /** Children nodes */
  children: NormalizedNode[];
  /** Original text (for comparison) */
  originalText?: string;
}

/**
 * Analysis result for duplicate detection
 */
export interface DuplicateAnalysis {
  /** All detected duplicate pairs */
  duplicates: DuplicatePair[];
  /** Components grouped by similarity */
  similarityGroups: ComponentInfo[][];
  /** Total number of components analyzed */
  totalComponents: number;
  /** Number of unique components (no duplicates) */
  uniqueComponents: number;
}

/**
 * Configuration for duplicate detection
 */
export interface DuplicateDetectionConfig {
  /** Minimum similarity threshold (0.0 to 1.0), default 0.8 */
  similarityThreshold: number;
  /** Whether to detect structural duplicates */
  detectStructural: boolean;
  /** Minimum component size (in AST nodes) to consider */
  minComponentSize: number;
  /** Whether to ignore whitespace differences */
  ignoreWhitespace: boolean;
  /** Whether to normalize identifiers for structural comparison */
  normalizeIdentifiers: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default configuration for duplicate detection
 */
export const DEFAULT_DUPLICATE_CONFIG: DuplicateDetectionConfig = {
  similarityThreshold: 0.8,
  detectStructural: true,
  minComponentSize: 5,
  ignoreWhitespace: true,
  normalizeIdentifiers: true,
};

/**
 * Node types that represent identifiers
 */
export const IDENTIFIER_NODE_TYPES = new Set([
  'identifier',
  'property_identifier',
  'shorthand_property_identifier',
  'type_identifier',
]);

/**
 * Node types that represent literals
 */
export const LITERAL_NODE_TYPES = new Set([
  'string',
  'string_fragment',
  'number',
  'true',
  'false',
  'null',
  'undefined',
]);

// ============================================================================
// Helper Functions - AST Normalization
// ============================================================================

/**
 * Normalize an AST node for comparison
 * Strips position info and optionally normalizes identifiers
 */
export function normalizeASTNode(
  node: ASTNode,
  normalizeIdentifiers: boolean = true,
  identifierMap: Map<string, string> = new Map()
): NormalizedNode {
  let value: string | undefined;
  
  // Handle identifiers - normalize to placeholders for structural comparison
  if (normalizeIdentifiers && IDENTIFIER_NODE_TYPES.has(node.type)) {
    const originalName = node.text;
    if (!identifierMap.has(originalName)) {
      identifierMap.set(originalName, `$id${identifierMap.size}`);
    }
    value = identifierMap.get(originalName);
  } else if (LITERAL_NODE_TYPES.has(node.type)) {
    // Keep literal values for comparison
    value = node.text;
  }
  
  const normalizedChildren = node.children.map(child =>
    normalizeASTNode(child, normalizeIdentifiers, identifierMap)
  );
  
  const result: NormalizedNode = {
    type: node.type,
    children: normalizedChildren,
    originalText: node.text,
  };
  
  if (value !== undefined) {
    result.value = value;
  }
  
  return result;
}

/**
 * Generate a hash for a normalized AST node
 * Used for quick equality checks
 */
export function hashNormalizedNode(node: NormalizedNode): string {
  const parts: string[] = [node.type];
  
  if (node.value !== undefined) {
    parts.push(node.value);
  }
  
  for (const child of node.children) {
    parts.push(hashNormalizedNode(child));
  }
  
  return parts.join('|');
}

/**
 * Count the number of nodes in a normalized AST
 */
export function countNodes(node: NormalizedNode): number {
  let count = 1;
  for (const child of node.children) {
    count += countNodes(child);
  }
  return count;
}

// ============================================================================
// Helper Functions - Similarity Calculation
// ============================================================================

/**
 * Calculate similarity between two normalized AST nodes
 * Returns a score from 0.0 to 1.0
 */
export function calculateASTSimilarity(
  node1: NormalizedNode,
  node2: NormalizedNode
): number {
  // If types don't match, no similarity
  if (node1.type !== node2.type) {
    return 0;
  }
  
  // Base score for matching type
  let score = 1;
  let totalWeight = 1;
  
  // Compare values if present
  if (node1.value !== undefined || node2.value !== undefined) {
    totalWeight += 1;
    if (node1.value === node2.value) {
      score += 1;
    }
  }
  
  // Compare children
  const maxChildren = Math.max(node1.children.length, node2.children.length);
  const minChildren = Math.min(node1.children.length, node2.children.length);
  
  if (maxChildren > 0) {
    // Calculate child similarity using optimal alignment
    const childSimilarities = calculateChildSimilarities(node1.children, node2.children);
    const childScore = childSimilarities.reduce((sum, s) => sum + s, 0);
    const childWeight = maxChildren;
    
    score += childScore;
    totalWeight += childWeight;
    
    // Penalty for different number of children
    if (maxChildren !== minChildren) {
      const penalty = (maxChildren - minChildren) * 0.5;
      score -= penalty;
    }
  }
  
  return Math.max(0, Math.min(1, score / totalWeight));
}

/**
 * Calculate similarities between two lists of child nodes
 * Uses a greedy matching algorithm for efficiency
 */
function calculateChildSimilarities(
  children1: NormalizedNode[],
  children2: NormalizedNode[]
): number[] {
  if (children1.length === 0 || children2.length === 0) {
    return [];
  }
  
  const similarities: number[] = [];
  const used2 = new Set<number>();
  
  // For each child in list 1, find best match in list 2
  for (const child1 of children1) {
    let bestScore = 0;
    let bestIndex = -1;
    
    for (let j = 0; j < children2.length; j++) {
      if (used2.has(j)) {continue;}
      
      const child2 = children2[j];
      if (!child2) {continue;}
      
      const score = calculateASTSimilarity(child1, child2);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = j;
      }
    }
    
    if (bestIndex >= 0) {
      used2.add(bestIndex);
    }
    similarities.push(bestScore);
  }
  
  // Add zeros for unmatched children in list 2
  for (let j = 0; j < children2.length; j++) {
    if (!used2.has(j)) {
      similarities.push(0);
    }
  }
  
  return similarities;
}

/**
 * Calculate text-based similarity using Levenshtein distance
 * Used as a fallback when AST is not available
 */
export function calculateTextSimilarity(text1: string, text2: string): number {
  // Normalize whitespace
  const normalized1 = text1.replace(/\s+/g, ' ').trim();
  const normalized2 = text2.replace(/\s+/g, ' ').trim();
  
  if (normalized1 === normalized2) {
    return 1.0;
  }
  
  const maxLen = Math.max(normalized1.length, normalized2.length);
  if (maxLen === 0) {
    return 1.0;
  }
  
  const distance = levenshteinDistance(normalized1, normalized2);
  return 1 - (distance / maxLen);
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  
  // Use two rows instead of full matrix for memory efficiency
  let prevRow = new Array(n + 1).fill(0).map((_, i) => i);
  let currRow = new Array(n + 1).fill(0);
  
  for (let i = 1; i <= m; i++) {
    currRow[0] = i;
    
    for (let j = 1; j <= n; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        (prevRow[j] ?? 0) + 1,           // deletion
        (currRow[j - 1] ?? 0) + 1,       // insertion
        (prevRow[j - 1] ?? 0) + cost     // substitution
      );
    }
    
    [prevRow, currRow] = [currRow, prevRow];
  }
  
  return prevRow[n] ?? 0;
}

/**
 * Determine the type of duplication based on similarity
 */
export function determineDuplicateType(
  similarity: number,
  hasIdentifierDifferences: boolean
): DuplicateType {
  if (similarity >= 0.99) {
    return 'exact';
  }
  
  if (hasIdentifierDifferences && similarity >= 0.8) {
    return 'structural';
  }
  
  return 'near';
}

// ============================================================================
// Helper Functions - Component Extraction
// ============================================================================

/**
 * Check if a node represents a React component
 */
export function isReactComponentNode(node: ASTNode, content: string): boolean {
  // Check for function/arrow function that returns JSX
  if (node.type === 'function_declaration' || 
      node.type === 'arrow_function' ||
      node.type === 'function_expression') {
    // Component names should be PascalCase
    const name = extractComponentNameFromNode(node, content);
    if (!name || !/^[A-Z]/.test(name)) {
      return false;
    }
    // Check if it returns JSX
    const nodeText = node.text;
    return nodeText.includes('<') && (nodeText.includes('/>') || nodeText.includes('</'));
  }
  return false;
}

/**
 * Extract component name from an AST node
 */
export function extractComponentNameFromNode(node: ASTNode, content: string): string | undefined {
  // For function declarations, get the name directly
  if (node.type === 'function_declaration') {
    const nameNode = node.children.find(c => c.type === 'identifier');
    return nameNode?.text;
  }
  
  // For arrow functions and function expressions, look for variable declaration
  const lines = content.split('\n');
  const line = lines[node.startPosition.row];
  if (line) {
    const match = line.match(/(?:const|let|var|export\s+(?:const|let|var)?)\s+([A-Z][a-zA-Z0-9]*)\s*[=:]/);
    if (match?.[1]) {
      return match[1];
    }
  }
  return undefined;
}

/**
 * Extract component info from an AST node
 */
export function extractComponentInfo(
  node: ASTNode,
  filePath: string,
  content: string,
  config: DuplicateDetectionConfig
): ComponentInfo | null {
  const name = extractComponentNameFromNode(node, content);
  if (!name) {
    return null;
  }
  
  const normalizedAST = normalizeASTNode(node, config.normalizeIdentifiers);
  const nodeCount = countNodes(normalizedAST);
  
  // Skip components that are too small
  if (nodeCount < config.minComponentSize) {
    return null;
  }
  
  return {
    name,
    filePath,
    line: node.startPosition.row + 1,
    column: node.startPosition.column + 1,
    normalizedAST,
    sourceCode: node.text,
    astHash: hashNormalizedNode(normalizedAST),
  };
}

// ============================================================================
// Helper Functions - Difference Detection
// ============================================================================

/**
 * Find differences between two normalized AST nodes
 */
export function findDifferences(
  node1: NormalizedNode,
  node2: NormalizedNode,
  line1: number = 1,
  line2: number = 1
): DuplicateDifference[] {
  const differences: DuplicateDifference[] = [];
  
  // Type difference
  if (node1.type !== node2.type) {
    differences.push({
      type: 'structure',
      location1: { line: line1, column: 1 },
      location2: { line: line2, column: 1 },
      value1: node1.type,
      value2: node2.type,
    });
    return differences;
  }
  
  // Value difference
  if (node1.value !== node2.value) {
    const diffType = IDENTIFIER_NODE_TYPES.has(node1.type) ? 'identifier' : 'literal';
    differences.push({
      type: diffType,
      location1: { line: line1, column: 1 },
      location2: { line: line2, column: 1 },
      value1: node1.originalText || node1.value || '',
      value2: node2.originalText || node2.value || '',
    });
  }
  
  // Compare children
  const maxChildren = Math.max(node1.children.length, node2.children.length);
  for (let i = 0; i < maxChildren; i++) {
    const child1 = node1.children[i];
    const child2 = node2.children[i];
    
    if (!child1 || !child2) {
      differences.push({
        type: 'structure',
        location1: { line: line1, column: 1 },
        location2: { line: line2, column: 1 },
        value1: child1?.type || '(missing)',
        value2: child2?.type || '(missing)',
      });
    } else {
      const childDiffs = findDifferences(child1, child2, line1, line2);
      differences.push(...childDiffs);
    }
  }
  
  return differences;
}

/**
 * Check if differences are only identifier-based
 */
export function hasOnlyIdentifierDifferences(differences: DuplicateDifference[]): boolean {
  return differences.every(d => d.type === 'identifier');
}

// ============================================================================
// Helper Functions - Duplicate Analysis
// ============================================================================

/**
 * Compare two components and return duplicate info if similar enough
 */
export function compareComponents(
  comp1: ComponentInfo,
  comp2: ComponentInfo,
  config: DuplicateDetectionConfig
): DuplicatePair | null {
  // Quick check using hash for exact duplicates
  if (comp1.astHash === comp2.astHash) {
    return {
      component1: comp1,
      component2: comp2,
      duplicateType: 'exact',
      similarity: 1.0,
      differences: [],
    };
  }
  
  // Calculate similarity
  let similarity: number;
  let differences: DuplicateDifference[] = [];
  
  if (comp1.normalizedAST && comp2.normalizedAST) {
    similarity = calculateASTSimilarity(comp1.normalizedAST, comp2.normalizedAST);
    if (similarity >= config.similarityThreshold) {
      differences = findDifferences(comp1.normalizedAST, comp2.normalizedAST, comp1.line, comp2.line);
    }
  } else {
    // Fallback to text similarity
    similarity = calculateTextSimilarity(comp1.sourceCode, comp2.sourceCode);
  }
  
  // Check if similarity meets threshold
  if (similarity < config.similarityThreshold) {
    return null;
  }
  
  const hasIdentifierDiffs = hasOnlyIdentifierDifferences(differences);
  const duplicateType = determineDuplicateType(similarity, hasIdentifierDiffs);
  
  // Skip structural duplicates if not configured
  if (duplicateType === 'structural' && !config.detectStructural) {
    return null;
  }
  
  return {
    component1: comp1,
    component2: comp2,
    duplicateType,
    similarity,
    differences,
  };
}

/**
 * Analyze a list of components for duplicates
 */
export function analyzeDuplicates(
  components: ComponentInfo[],
  config: DuplicateDetectionConfig = DEFAULT_DUPLICATE_CONFIG
): DuplicateAnalysis {
  const duplicates: DuplicatePair[] = [];
  const componentGroups = new Map<string, ComponentInfo[]>();
  
  // Group by hash for quick exact duplicate detection
  for (const comp of components) {
    const existing = componentGroups.get(comp.astHash) || [];
    existing.push(comp);
    componentGroups.set(comp.astHash, existing);
  }
  
  // Find exact duplicates from hash groups
  for (const group of componentGroups.values()) {
    if (group.length > 1) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const comp1 = group[i];
          const comp2 = group[j];
          if (comp1 && comp2) {
            duplicates.push({
              component1: comp1,
              component2: comp2,
              duplicateType: 'exact',
              similarity: 1.0,
              differences: [],
            });
          }
        }
      }
    }
  }
  
  // Find near-duplicates by comparing across groups
  const groupKeys = Array.from(componentGroups.keys());
  for (let i = 0; i < groupKeys.length; i++) {
    for (let j = i + 1; j < groupKeys.length; j++) {
      const group1 = componentGroups.get(groupKeys[i] ?? '') || [];
      const group2 = componentGroups.get(groupKeys[j] ?? '') || [];
      
      for (const comp1 of group1) {
        for (const comp2 of group2) {
          const pair = compareComponents(comp1, comp2, config);
          if (pair) {
            duplicates.push(pair);
          }
        }
      }
    }
  }
  
  // Build similarity groups
  const similarityGroups = buildSimilarityGroups(components, duplicates);
  
  return {
    duplicates,
    similarityGroups,
    totalComponents: components.length,
    uniqueComponents: similarityGroups.filter(g => g.length === 1).length,
  };
}

/**
 * Build groups of similar components using union-find
 */
function buildSimilarityGroups(
  components: ComponentInfo[],
  duplicates: DuplicatePair[]
): ComponentInfo[][] {
  // Create a map from component key to index
  const componentIndex = new Map<string, number>();
  components.forEach((comp, idx) => {
    componentIndex.set(`${comp.filePath}:${comp.line}`, idx);
  });
  
  // Union-find data structure
  const parent = components.map((_, i) => i);
  
  function find(x: number): number {
    if (parent[x] !== x) {
      parent[x] = find(parent[x] ?? x);
    }
    return parent[x] ?? x;
  }
  
  function union(x: number, y: number): void {
    const px = find(x);
    const py = find(y);
    if (px !== py) {
      parent[px] = py;
    }
  }
  
  // Union components that are duplicates
  for (const dup of duplicates) {
    const idx1 = componentIndex.get(`${dup.component1.filePath}:${dup.component1.line}`);
    const idx2 = componentIndex.get(`${dup.component2.filePath}:${dup.component2.line}`);
    if (idx1 !== undefined && idx2 !== undefined) {
      union(idx1, idx2);
    }
  }
  
  // Group components by their root
  const groups = new Map<number, ComponentInfo[]>();
  components.forEach((comp, idx) => {
    const root = find(idx);
    const group = groups.get(root) || [];
    group.push(comp);
    groups.set(root, group);
  });
  
  return Array.from(groups.values());
}

/**
 * Generate a refactoring suggestion for duplicates
 */
export function generateRefactoringSuggestion(pair: DuplicatePair): string {
  const { component1, component2, duplicateType, similarity } = pair;
  
  if (duplicateType === 'exact') {
    return `Components '${component1.name}' and '${component2.name}' are identical. ` +
           `Consider extracting to a shared component.`;
  }
  
  if (duplicateType === 'structural') {
    return `Components '${component1.name}' and '${component2.name}' have the same structure ` +
           `but different identifiers. Consider creating a generic component with props.`;
  }
  
  const percentSimilar = Math.round(similarity * 100);
  return `Components '${component1.name}' and '${component2.name}' are ${percentSimilar}% similar. ` +
         `Consider abstracting common logic into a shared component.`;
}

// ============================================================================
// Duplicate Detector Class
// ============================================================================

/**
 * Detector for duplicate and near-duplicate components
 *
 * Uses AST-based comparison to detect:
 * - Exact duplicates (100% identical)
 * - Near-duplicates (80%+ similarity)
 * - Structural duplicates (same structure, different identifiers)
 *
 * @requirements 8.3 - THE Component_Detector SHALL detect duplicate components with 80%+ similarity
 */
export class DuplicateDetector extends ASTDetector {
  readonly id = 'components/duplicate-detection';
  readonly category = 'components' as const;
  readonly subcategory = 'duplicates';
  readonly name = 'Duplicate Component Detector';
  readonly description = 'Detects duplicate and near-duplicate components using AST-based comparison with 80%+ similarity threshold';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript'];

  private config: DuplicateDetectionConfig;

  constructor(config: Partial<DuplicateDetectionConfig> = {}) {
    super();
    this.config = { ...DEFAULT_DUPLICATE_CONFIG, ...config };
  }

  /**
   * Detect duplicate components in the project
   */
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    // Extract components from all project files
    const allComponents = this.extractAllComponents(context);
    
    if (allComponents.length < 2) {
      return this.createEmptyResult();
    }

    // Analyze for duplicates
    const analysis = analyzeDuplicates(allComponents, this.config);

    // Create pattern matches for unique components
    if (analysis.uniqueComponents > 0) {
      patterns.push({
        patternId: 'component-uniqueness',
        location: { file: context.file, line: 1, column: 1 },
        confidence: analysis.uniqueComponents / analysis.totalComponents,
        isOutlier: false,
      });
    }

    // Create violations for duplicates involving the current file
    for (const duplicate of analysis.duplicates) {
      if (this.involvesCurrentFile(duplicate, context.file)) {
        const violation = this.createDuplicateViolation(duplicate, context.file);
        violations.push(violation);
      }
    }

    const confidence = analysis.totalComponents > 0
      ? analysis.uniqueComponents / analysis.totalComponents
      : 1.0;

    return this.createResult(patterns, violations, confidence);
  }

  /**
   * Extract all components from project files
   */
  private extractAllComponents(context: DetectionContext): ComponentInfo[] {
    const components: ComponentInfo[] = [];
    
    // Extract from current file using AST if available
    if (context.ast) {
      const fileComponents = this.extractComponentsFromAST(
        context.ast,
        context.file,
        context.content
      );
      components.push(...fileComponents);
    } else {
      // Fallback to regex-based extraction
      const fileComponents = this.extractComponentsFromContent(
        context.file,
        context.content
      );
      components.push(...fileComponents);
    }
    
    // For a complete analysis, we would also extract from other project files
    // This is a simplified version that focuses on the current file
    // In a full implementation, this would use the project context
    
    return components;
  }

  /**
   * Extract components from an AST
   */
  private extractComponentsFromAST(
    ast: AST,
    filePath: string,
    content: string
  ): ComponentInfo[] {
    const components: ComponentInfo[] = [];
    
    const functionNodes = this.findNodesByTypes(ast, [
      'function_declaration',
      'arrow_function',
      'function_expression',
    ]);
    
    for (const node of functionNodes) {
      if (isReactComponentNode(node, content)) {
        const info = extractComponentInfo(node, filePath, content, this.config);
        if (info) {
          components.push(info);
        }
      }
    }
    
    return components;
  }

  /**
   * Extract components from content using regex (fallback)
   */
  private extractComponentsFromContent(
    filePath: string,
    content: string
  ): ComponentInfo[] {
    const components: ComponentInfo[] = [];
    
    // Match component patterns
    const patterns = [
      // Arrow function: const Button = ({ ... }) => ...
      /(?:export\s+)?const\s+([A-Z][a-zA-Z0-9]*)\s*(?::\s*(?:React\.)?(?:FC|FunctionComponent)\s*<[^>]*>\s*)?=\s*\([^)]*\)\s*=>\s*[\s\S]*?(?=\n(?:export\s+)?(?:const|function|class)\s+[A-Z]|\n*$)/g,
      // Function declaration: function Button({ ... }) { ... }
      /(?:export\s+)?function\s+([A-Z][a-zA-Z0-9]*)\s*\([^)]*\)\s*\{[\s\S]*?\n\}/g,
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const name = match[1];
        if (!name) {continue;}
        
        const sourceCode = match[0];
        const beforeMatch = content.slice(0, match.index);
        const line = beforeMatch.split('\n').length;
        
        // Create a simple normalized representation
        const normalizedAST = this.createSimpleNormalizedAST(sourceCode);
        
        components.push({
          name,
          filePath,
          line,
          column: 1,
          normalizedAST,
          sourceCode,
          astHash: hashNormalizedNode(normalizedAST),
        });
      }
    }
    
    return components;
  }

  /**
   * Create a simple normalized AST from source code (fallback)
   */
  private createSimpleNormalizedAST(sourceCode: string): NormalizedNode {
    // Normalize whitespace and create a simple structure
    const normalized = sourceCode.replace(/\s+/g, ' ').trim();
    
    return {
      type: 'component',
      value: normalized,
      children: [],
      originalText: sourceCode,
    };
  }

  /**
   * Check if a duplicate pair involves the current file
   */
  private involvesCurrentFile(pair: DuplicatePair, currentFile: string): boolean {
    return pair.component1.filePath === currentFile || 
           pair.component2.filePath === currentFile;
  }

  /**
   * Create a violation for a duplicate pair
   */
  private createDuplicateViolation(
    pair: DuplicatePair,
    currentFile: string
  ): Violation {
    const { component1, component2, duplicateType, similarity } = pair;
    
    // Determine which component is in the current file
    const currentComponent = component1.filePath === currentFile ? component1 : component2;
    const otherComponent = component1.filePath === currentFile ? component2 : component1;
    
    const percentSimilar = Math.round(similarity * 100);
    const suggestion = generateRefactoringSuggestion(pair);
    
    const severityMap: Record<DuplicateType, 'error' | 'warning' | 'info'> = {
      'exact': 'warning',
      'near': 'info',
      'structural': 'info',
    };
    
    const range: Range = {
      start: { line: currentComponent.line, character: currentComponent.column },
      end: { line: currentComponent.line, character: currentComponent.column + currentComponent.name.length },
    };

    return {
      id: `duplicate-${currentComponent.name}-${otherComponent.name}-${currentFile.replace(/[^a-zA-Z0-9]/g, '-')}`,
      patternId: 'components/duplicate-detection',
      severity: severityMap[duplicateType],
      file: currentFile,
      range,
      message: `${duplicateType === 'exact' ? 'Exact' : duplicateType === 'structural' ? 'Structural' : 'Near'} duplicate detected: '${currentComponent.name}' is ${percentSimilar}% similar to '${otherComponent.name}' in ${otherComponent.filePath}:${otherComponent.line}`,
      explanation: suggestion,
      expected: 'Unique component or intentional reuse through shared abstraction',
      actual: `${percentSimilar}% similarity with ${otherComponent.name}`,
      quickFix: this.createExtractQuickFix(pair, currentFile),
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }

  /**
   * Create a quick fix for extracting duplicates into a shared component
   */
  private createExtractQuickFix(pair: DuplicatePair, currentFile: string): QuickFix {
    const { component1, component2, duplicateType } = pair;
    
    const sharedName = this.generateSharedComponentName(component1.name, component2.name);
    
    let title: string;
    let preview: string;
    
    if (duplicateType === 'exact') {
      title = `Extract to shared component '${sharedName}'`;
      preview = `Create a shared component '${sharedName}' and replace both usages`;
    } else if (duplicateType === 'structural') {
      title = `Create generic component '${sharedName}' with props`;
      preview = `Create a generic component that accepts the differing values as props`;
    } else {
      title = `Refactor to shared component '${sharedName}'`;
      preview = `Extract common logic into a shared component`;
    }

    return {
      title,
      kind: 'refactor',
      edit: {
        changes: {},
        documentChanges: [
          { uri: currentFile, edits: [] },
        ],
      },
      isPreferred: true,
      confidence: pair.similarity,
      preview,
    };
  }

  /**
   * Generate a name for a shared component
   */
  private generateSharedComponentName(name1: string, name2: string): string {
    // Find common prefix
    let commonPrefix = '';
    const minLen = Math.min(name1.length, name2.length);
    
    for (let i = 0; i < minLen; i++) {
      if (name1[i] === name2[i]) {
        commonPrefix += name1[i];
      } else {
        break;
      }
    }
    
    if (commonPrefix.length >= 3) {
      return `Shared${commonPrefix}`;
    }
    
    // Use the shorter name as base
    const baseName = name1.length <= name2.length ? name1 : name2;
    return `Shared${baseName}`;
  }

  /**
   * Generate a quick fix for a violation
   */
  generateQuickFix(violation: Violation): QuickFix | null {
    // Extract component names from the violation message
    const match = violation.message.match(/similar to '([^']+)'/);
    if (!match?.[1]) {
      return null;
    }

    const otherComponentName = match[1];
    const currentComponentName = violation.message.match(/duplicate detected: '([^']+)'/)?.[1] || 'Component';
    
    const sharedName = this.generateSharedComponentName(currentComponentName, otherComponentName);

    return {
      title: `Extract to shared component '${sharedName}'`,
      kind: 'refactor',
      edit: {
        changes: {},
        documentChanges: [
          { uri: violation.file, edits: [] },
        ],
      },
      isPreferred: true,
      confidence: 0.8,
      preview: `Create a shared component '${sharedName}' to eliminate duplication`,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new DuplicateDetector instance
 */
export function createDuplicateDetector(
  config?: Partial<DuplicateDetectionConfig>
): DuplicateDetector {
  return new DuplicateDetector(config);
}
