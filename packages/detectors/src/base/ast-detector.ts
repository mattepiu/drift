/**
 * AST Detector - AST-based detection base class
 *
 * Provides Tree-sitter query helpers and utilities for AST-based pattern detection.
 * Extends BaseDetector with specialized methods for traversing and querying ASTs.
 *
 * @requirements 6.4 - THE Detector_System SHALL support detection methods: ast, regex, semantic, structural, and custom
 */

import { BaseDetector } from './base-detector.js';

import type { AST, ASTNode } from 'driftdetect-core';


// ============================================================================
// AST Pattern Types
// ============================================================================

/**
 * Pattern definition for AST matching
 *
 * Defines criteria for matching AST nodes during detection.
 */
export interface ASTPattern {
  /** Node type to match (e.g., 'FunctionDeclaration', 'ClassDeclaration') */
  type?: string;

  /** Text content to match (exact string or regex) */
  text?: string | RegExp;

  /** Whether text matching should be exact */
  exactText?: boolean;

  /** Child patterns to match */
  children?: ASTPattern[];

  /** Minimum number of children required */
  minChildren?: number;

  /** Maximum number of children allowed */
  maxChildren?: number;

  /** Custom predicate for additional matching logic */
  predicate?: (node: ASTNode) => boolean;

  /** Whether to match any descendant (not just direct children) */
  matchDescendants?: boolean;

  /** Capture name for extracting matched nodes */
  capture?: string;
}

/**
 * Result of an AST pattern match
 */
export interface ASTMatchResult {
  /** The matched node */
  node: ASTNode;

  /** Confidence score (0-1) */
  confidence: number;

  /** Captured nodes by name */
  captures: Map<string, ASTNode>;

  /** Start position in source */
  startPosition: { row: number; column: number };

  /** End position in source */
  endPosition: { row: number; column: number };
}

/**
 * Options for AST traversal
 */
export interface TraversalOptions {
  /** Maximum depth to traverse (undefined = unlimited) */
  maxDepth?: number;

  /** Node types to skip during traversal */
  skipTypes?: string[];

  /** Whether to include the root node in traversal */
  includeRoot?: boolean;
}

/**
 * Visitor function for AST traversal
 *
 * @param node - Current node being visited
 * @param parent - Parent node (null for root)
 * @param depth - Current depth in the tree
 * @returns false to stop traversal of subtree, undefined to continue
 */
export type ASTVisitor = (
  node: ASTNode,
  parent: ASTNode | null,
  depth: number
) => boolean | void;

// ============================================================================
// AST Detector Abstract Class
// ============================================================================

/**
 * Abstract base class for AST-based detectors
 *
 * Provides Tree-sitter query helpers and utilities for pattern detection
 * that operates on parsed AST structures.
 *
 * @requirements 6.4 - THE Detector_System SHALL support detection methods: ast
 *
 * @example
 * ```typescript
 * class FunctionNamingDetector extends ASTDetector {
 *   readonly id = 'structural/function-naming';
 *   readonly category = 'structural';
 *   readonly subcategory = 'naming-conventions';
 *   readonly name = 'Function Naming Detector';
 *   readonly description = 'Detects function naming patterns';
 *   readonly supportedLanguages = ['typescript', 'javascript'];
 *
 *   async detect(context: DetectionContext): Promise<DetectionResult> {
 *     if (!context.ast) {
 *       return this.createEmptyResult();
 *     }
 *
 *     const functions = this.findNodes(context.ast, 'function_declaration');
 *     // Analyze function naming patterns...
 *   }
 *
 *   generateQuickFix(violation: Violation): QuickFix | null {
 *     return null;
 *   }
 * }
 * ```
 */
export abstract class ASTDetector extends BaseDetector {
  /**
   * Detection method is always 'ast' for AST-based detectors
   *
   * @requirements 6.4 - Detector declares detection method as 'ast'
   */
  readonly detectionMethod = 'ast' as const;

  // ============================================================================
  // Node Finding Methods
  // ============================================================================

  /**
   * Find all nodes of a specific type in the AST
   *
   * Traverses the entire AST and returns all nodes matching the specified type.
   *
   * @param ast - The AST to search
   * @param nodeType - The type of node to find (e.g., 'function_declaration', 'class_declaration')
   * @returns Array of matching nodes
   *
   * @example
   * ```typescript
   * const functions = this.findNodes(ast, 'function_declaration');
   * const classes = this.findNodes(ast, 'class_declaration');
   * ```
   */
  protected findNodes(ast: AST, nodeType: string): ASTNode[] {
    const results: ASTNode[] = [];

    this.traverse(ast, (node) => {
      if (node.type === nodeType) {
        results.push(node);
      }
    });

    return results;
  }

  /**
   * Find all nodes matching multiple types
   *
   * @param ast - The AST to search
   * @param nodeTypes - Array of node types to find
   * @returns Array of matching nodes
   *
   * @example
   * ```typescript
   * const declarations = this.findNodesByTypes(ast, ['function_declaration', 'arrow_function']);
   * ```
   */
  protected findNodesByTypes(ast: AST, nodeTypes: string[]): ASTNode[] {
    const typeSet = new Set(nodeTypes);
    const results: ASTNode[] = [];

    this.traverse(ast, (node) => {
      if (typeSet.has(node.type)) {
        results.push(node);
      }
    });

    return results;
  }

  /**
   * Find the first node of a specific type
   *
   * @param ast - The AST to search
   * @param nodeType - The type of node to find
   * @returns The first matching node, or null if not found
   */
  protected findFirstNode(ast: AST, nodeType: string): ASTNode | null {
    let result: ASTNode | null = null;

    this.traverse(ast, (node) => {
      if (node.type === nodeType) {
        result = node;
        return false; // Stop traversal
      }
      return undefined;
    });

    return result;
  }

  /**
   * Find nodes matching a predicate function
   *
   * @param ast - The AST to search
   * @param predicate - Function that returns true for matching nodes
   * @returns Array of matching nodes
   *
   * @example
   * ```typescript
   * const asyncFunctions = this.findNodesWhere(ast, (node) =>
   *   node.type === 'function_declaration' && node.text.includes('async')
   * );
   * ```
   */
  protected findNodesWhere(
    ast: AST,
    predicate: (node: ASTNode) => boolean
  ): ASTNode[] {
    const results: ASTNode[] = [];

    this.traverse(ast, (node) => {
      if (predicate(node)) {
        results.push(node);
      }
    });

    return results;
  }

  // ============================================================================
  // Ancestor/Descendant Methods
  // ============================================================================

  /**
   * Find the nearest ancestor of a specific type
   *
   * Traverses up the tree from the given node to find the first ancestor
   * matching the specified type.
   *
   * @param node - The starting node
   * @param nodeType - The type of ancestor to find
   * @param ast - The AST containing the node (needed for parent lookup)
   * @returns The ancestor node, or null if not found
   *
   * @example
   * ```typescript
   * const parentClass = this.findAncestor(methodNode, 'class_declaration', ast);
   * ```
   */
  protected findAncestor(
    node: ASTNode,
    nodeType: string,
    ast: AST
  ): ASTNode | null {
    const parentChain = this.getParentChain(ast, node);

    // Search from immediate parent up to root
    for (let i = parentChain.length - 1; i >= 0; i--) {
      const parent = parentChain[i];
      if (parent?.type === nodeType) {
        return parent;
      }
    }

    return null;
  }

  /**
   * Find all ancestors of a node
   *
   * @param node - The starting node
   * @param ast - The AST containing the node
   * @returns Array of ancestor nodes from immediate parent to root
   */
  protected findAllAncestors(node: ASTNode, ast: AST): ASTNode[] {
    const parentChain = this.getParentChain(ast, node);
    return parentChain.reverse();
  }

  /**
   * Find all descendants of a node
   *
   * @param node - The starting node
   * @returns Array of all descendant nodes
   */
  protected findDescendants(node: ASTNode): ASTNode[] {
    const descendants: ASTNode[] = [];

    const collect = (n: ASTNode): void => {
      for (const child of n.children) {
        descendants.push(child);
        collect(child);
      }
    };

    collect(node);
    return descendants;
  }

  /**
   * Find descendants of a specific type
   *
   * @param node - The starting node
   * @param nodeType - The type of descendants to find
   * @returns Array of matching descendant nodes
   */
  protected findDescendantsByType(node: ASTNode, nodeType: string): ASTNode[] {
    const results: ASTNode[] = [];

    const search = (n: ASTNode): void => {
      for (const child of n.children) {
        if (child.type === nodeType) {
          results.push(child);
        }
        search(child);
      }
    };

    search(node);
    return results;
  }

  // ============================================================================
  // Node Text Methods
  // ============================================================================

  /**
   * Get the text content of a node
   *
   * Returns the source text corresponding to the node's position.
   * If content is provided, extracts from content; otherwise uses node.text.
   *
   * @param node - The node to get text for
   * @param content - Optional source content to extract from
   * @returns The text content of the node
   *
   * @example
   * ```typescript
   * const functionName = this.getNodeText(identifierNode, context.content);
   * ```
   */
  protected getNodeText(node: ASTNode, content?: string): string {
    if (content) {
      const lines = content.split('\n');
      const startLine = node.startPosition.row;
      const endLine = node.endPosition.row;
      const startCol = node.startPosition.column;
      const endCol = node.endPosition.column;

      if (startLine === endLine) {
        // Single line
        const line = lines[startLine];
        return line ? line.slice(startCol, endCol) : node.text;
      } else {
        // Multi-line
        const result: string[] = [];
        for (let i = startLine; i <= endLine; i++) {
          const line = lines[i];
          if (!line) {continue;}

          if (i === startLine) {
            result.push(line.slice(startCol));
          } else if (i === endLine) {
            result.push(line.slice(0, endCol));
          } else {
            result.push(line);
          }
        }
        return result.join('\n');
      }
    }

    return node.text;
  }

  /**
   * Get the trimmed text content of a node
   *
   * @param node - The node to get text for
   * @param content - Optional source content to extract from
   * @returns The trimmed text content
   */
  protected getNodeTextTrimmed(node: ASTNode, content?: string): string {
    return this.getNodeText(node, content).trim();
  }

  // ============================================================================
  // Pattern Matching Methods
  // ============================================================================

  /**
   * Match an AST against a pattern
   *
   * Searches the AST for nodes matching the specified pattern and returns
   * all matches with their confidence scores.
   *
   * @param ast - The AST to search
   * @param pattern - The pattern to match
   * @returns Array of match results
   *
   * @example
   * ```typescript
   * const matches = this.matchPattern(ast, {
   *   type: 'function_declaration',
   *   children: [{ type: 'identifier', capture: 'name' }]
   * });
   * ```
   */
  protected matchPattern(ast: AST, pattern: ASTPattern): ASTMatchResult[] {
    const results: ASTMatchResult[] = [];

    this.traverse(ast, (node) => {
      const captures = new Map<string, ASTNode>();
      const confidence = this.matchNode(node, pattern, captures);

      if (confidence > 0) {
        results.push({
          node,
          confidence,
          captures,
          startPosition: node.startPosition,
          endPosition: node.endPosition,
        });
      }
    });

    return results;
  }

  /**
   * Match a single node against a pattern
   *
   * @param node - The node to match
   * @param pattern - The pattern to match against
   * @param captures - Map to store captured nodes
   * @returns Confidence score (0-1), 0 if no match
   */
  private matchNode(
    node: ASTNode,
    pattern: ASTPattern,
    captures: Map<string, ASTNode>
  ): number {
    let score = 1.0;

    // Check type
    if (pattern.type !== undefined && node.type !== pattern.type) {
      return 0;
    }

    // Check text
    if (pattern.text !== undefined) {
      const textMatches = this.matchText(node.text, pattern.text, pattern.exactText);
      if (!textMatches) {
        return 0;
      }
    }

    // Check children count constraints
    if (pattern.minChildren !== undefined && node.children.length < pattern.minChildren) {
      return 0;
    }

    if (pattern.maxChildren !== undefined && node.children.length > pattern.maxChildren) {
      return 0;
    }

    // Check custom predicate
    if (pattern.predicate !== undefined && !pattern.predicate(node)) {
      return 0;
    }

    // Check child patterns
    if (pattern.children !== undefined && pattern.children.length > 0) {
      const childScore = this.matchChildPatterns(
        node,
        pattern.children,
        pattern.matchDescendants,
        captures
      );
      if (childScore === 0) {
        return 0;
      }
      score *= childScore;
    }

    // Capture the node if requested
    if (pattern.capture !== undefined) {
      captures.set(pattern.capture, node);
    }

    return score;
  }

  /**
   * Match text against a pattern (string or regex)
   */
  private matchText(text: string, pattern: string | RegExp, exact?: boolean): boolean {
    if (pattern instanceof RegExp) {
      return pattern.test(text);
    }

    if (exact) {
      return text === pattern;
    }

    return text.includes(pattern);
  }

  /**
   * Match child patterns against node children
   */
  private matchChildPatterns(
    node: ASTNode,
    childPatterns: ASTPattern[],
    matchDescendants?: boolean,
    captures?: Map<string, ASTNode>
  ): number {
    const nodesToSearch = matchDescendants
      ? this.findDescendants(node)
      : node.children;

    let matchedCount = 0;

    for (const childPattern of childPatterns) {
      let found = false;

      for (const child of nodesToSearch) {
        const childCaptures = captures || new Map<string, ASTNode>();
        const confidence = this.matchNode(child, childPattern, childCaptures);

        if (confidence > 0) {
          found = true;
          matchedCount++;

          // Merge captures
          if (captures) {
            for (const [key, value] of childCaptures) {
              captures.set(key, value);
            }
          }
          break;
        }
      }

      if (!found) {
        return 0; // Required child pattern not found
      }
    }

    return matchedCount / childPatterns.length;
  }

  // ============================================================================
  // Traversal Methods
  // ============================================================================

  /**
   * Traverse the AST depth-first
   *
   * Visits each node in the AST, calling the visitor function.
   * The visitor can return false to stop traversal of a subtree.
   *
   * @param ast - The AST to traverse
   * @param visitor - Function called for each node
   * @param options - Traversal options
   *
   * @example
   * ```typescript
   * this.traverse(ast, (node, parent, depth) => {
   *   console.log(`${node.type} at depth ${depth}`);
   *   if (depth > 5) return false; // Stop going deeper
   * });
   * ```
   */
  protected traverse(
    ast: AST,
    visitor: ASTVisitor,
    options: TraversalOptions = {}
  ): void {
    const { maxDepth, skipTypes, includeRoot = true } = options;
    const skipSet = skipTypes ? new Set(skipTypes) : null;

    const visit = (node: ASTNode, parent: ASTNode | null, depth: number): boolean => {
      // Check max depth
      if (maxDepth !== undefined && depth > maxDepth) {
        return true;
      }

      // Check if type should be skipped
      if (skipSet && skipSet.has(node.type)) {
        return true;
      }

      // Call visitor
      const result = visitor(node, parent, depth);

      // If visitor returns false, stop traversal of this subtree
      if (result === false) {
        return true;
      }

      // Traverse children
      for (const child of node.children) {
        visit(child, node, depth + 1);
      }

      return true;
    };

    if (includeRoot) {
      visit(ast.rootNode, null, 0);
    } else {
      for (const child of ast.rootNode.children) {
        visit(child, ast.rootNode, 1);
      }
    }
  }

  /**
   * Traverse a specific node and its descendants
   *
   * @param node - The node to start traversal from
   * @param visitor - Function called for each node
   * @param options - Traversal options
   */
  protected traverseNode(
    node: ASTNode,
    visitor: ASTVisitor,
    options: TraversalOptions = {}
  ): void {
    const { maxDepth, skipTypes } = options;
    const skipSet = skipTypes ? new Set(skipTypes) : null;

    const visit = (n: ASTNode, parent: ASTNode | null, depth: number): boolean => {
      if (maxDepth !== undefined && depth > maxDepth) {
        return true;
      }

      if (skipSet && skipSet.has(n.type)) {
        return true;
      }

      const result = visitor(n, parent, depth);

      if (result === false) {
        return true;
      }

      for (const child of n.children) {
        visit(child, n, depth + 1);
      }

      return true;
    };

    visit(node, null, 0);
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Get the parent chain from root to a specific node
   *
   * @param ast - The AST to search
   * @param targetNode - The node to find parents for
   * @returns Array of parent nodes from root to immediate parent
   */
  protected getParentChain(ast: AST, targetNode: ASTNode): ASTNode[] {
    const parents: ASTNode[] = [];

    const findParents = (node: ASTNode, chain: ASTNode[]): boolean => {
      if (node === targetNode) {
        parents.push(...chain);
        return true;
      }

      for (const child of node.children) {
        if (findParents(child, [...chain, node])) {
          return true;
        }
      }

      return false;
    };

    findParents(ast.rootNode, []);
    return parents;
  }

  /**
   * Get the immediate parent of a node
   *
   * @param ast - The AST containing the node
   * @param node - The node to find the parent of
   * @returns The parent node, or null if node is root
   */
  protected getParent(ast: AST, node: ASTNode): ASTNode | null {
    const chain = this.getParentChain(ast, node);
    return chain.length > 0 ? chain[chain.length - 1] ?? null : null;
  }

  /**
   * Get the depth of a node in the AST
   *
   * @param ast - The AST containing the node
   * @param targetNode - The node to get depth for
   * @returns The depth (0 for root), or -1 if not found
   */
  protected getNodeDepth(ast: AST, targetNode: ASTNode): number {
    let foundDepth = -1;

    this.traverse(ast, (node, _parent, depth) => {
      if (node === targetNode) {
        foundDepth = depth;
        return false;
      }
      return undefined;
    });

    return foundDepth;
  }

  /**
   * Check if a node is a leaf node (has no children)
   *
   * @param node - The node to check
   * @returns true if the node has no children
   */
  protected isLeafNode(node: ASTNode): boolean {
    return node.children.length === 0;
  }

  /**
   * Get direct children of a specific type
   *
   * @param node - The parent node
   * @param nodeType - The type of children to find
   * @returns Array of matching child nodes
   */
  protected getChildrenByType(node: ASTNode, nodeType: string): ASTNode[] {
    return node.children.filter((child) => child.type === nodeType);
  }

  /**
   * Get the first direct child of a specific type
   *
   * @param node - The parent node
   * @param nodeType - The type of child to find
   * @returns The first matching child, or null if not found
   */
  protected getFirstChildByType(node: ASTNode, nodeType: string): ASTNode | null {
    return node.children.find((child) => child.type === nodeType) ?? null;
  }

  /**
   * Check if a node has a child of a specific type
   *
   * @param node - The parent node
   * @param nodeType - The type to check for
   * @returns true if a child of the specified type exists
   */
  protected hasChildOfType(node: ASTNode, nodeType: string): boolean {
    return node.children.some((child) => child.type === nodeType);
  }

  /**
   * Check if a node has a descendant of a specific type
   *
   * @param node - The starting node
   * @param nodeType - The type to check for
   * @returns true if a descendant of the specified type exists
   */
  protected hasDescendantOfType(node: ASTNode, nodeType: string): boolean {
    const descendants = this.findDescendantsByType(node, nodeType);
    return descendants.length > 0;
  }

  /**
   * Get siblings of a node (other children of the same parent)
   *
   * @param ast - The AST containing the node
   * @param node - The node to find siblings for
   * @returns Array of sibling nodes (excluding the node itself)
   */
  protected getSiblings(ast: AST, node: ASTNode): ASTNode[] {
    const parent = this.getParent(ast, node);
    if (!parent) {
      return [];
    }

    return parent.children.filter((child) => child !== node);
  }

  /**
   * Get the next sibling of a node
   *
   * @param ast - The AST containing the node
   * @param node - The node to find the next sibling for
   * @returns The next sibling, or null if none exists
   */
  protected getNextSibling(ast: AST, node: ASTNode): ASTNode | null {
    const parent = this.getParent(ast, node);
    if (!parent) {
      return null;
    }

    const index = parent.children.indexOf(node);
    if (index === -1 || index === parent.children.length - 1) {
      return null;
    }

    return parent.children[index + 1] ?? null;
  }

  /**
   * Get the previous sibling of a node
   *
   * @param ast - The AST containing the node
   * @param node - The node to find the previous sibling for
   * @returns The previous sibling, or null if none exists
   */
  protected getPreviousSibling(ast: AST, node: ASTNode): ASTNode | null {
    const parent = this.getParent(ast, node);
    if (!parent) {
      return null;
    }

    const index = parent.children.indexOf(node);
    if (index <= 0) {
      return null;
    }

    return parent.children[index - 1] ?? null;
  }

  /**
   * Count nodes of a specific type in the AST
   *
   * @param ast - The AST to search
   * @param nodeType - The type of nodes to count
   * @returns The count of matching nodes
   */
  protected countNodes(ast: AST, nodeType: string): number {
    return this.findNodes(ast, nodeType).length;
  }

  /**
   * Check if the AST contains a node of a specific type
   *
   * @param ast - The AST to search
   * @param nodeType - The type to check for
   * @returns true if a node of the specified type exists
   */
  protected hasNodeOfType(ast: AST, nodeType: string): boolean {
    return this.findFirstNode(ast, nodeType) !== null;
  }

  /**
   * Get the line number of a node (1-indexed)
   *
   * @param node - The node to get the line number for
   * @returns The line number (1-indexed)
   */
  protected getLineNumber(node: ASTNode): number {
    return node.startPosition.row + 1;
  }

  /**
   * Get the column number of a node (1-indexed)
   *
   * @param node - The node to get the column number for
   * @returns The column number (1-indexed)
   */
  protected getColumnNumber(node: ASTNode): number {
    return node.startPosition.column + 1;
  }
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a detector is an AST detector
 *
 * @param detector - The detector to check
 * @returns true if the detector is an ASTDetector
 */
export function isASTDetector(detector: BaseDetector): detector is ASTDetector {
  return detector.detectionMethod === 'ast';
}
