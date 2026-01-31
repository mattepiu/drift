/**
 * AST Analyzer
 * 
 * Analyzes Abstract Syntax Trees to extract structural
 * features for code embeddings. Uses pattern matching
 * to identify common code structures.
 * 
 * @module embeddings/structural/ast-analyzer
 */

/**
 * Simplified AST node representation
 */
export interface ASTNode {
  type: string;
  children?: ASTNode[];
  name?: string;
  value?: string;
  startLine?: number;
  endLine?: number;
}

/**
 * Return type classification
 */
export type ReturnType = 
  | 'void'
  | 'primitive'
  | 'object'
  | 'array'
  | 'promise'
  | 'observable'
  | 'unknown';

/**
 * Side effect classification
 */
export interface SideEffect {
  type: 'io' | 'mutation' | 'network' | 'storage' | 'logging' | 'unknown';
  description: string;
  confidence: number;
}

/**
 * AST analysis result
 */
export interface ASTAnalysis {
  hasAsync: boolean;
  hasErrorHandling: boolean;
  hasLoops: boolean;
  hasConditionals: boolean;
  hasRecursion: boolean;
  callDepth: number;
  paramCount: number;
  returnType: ReturnType;
  sideEffects: SideEffect[];
  complexity: number;
  nodeCount: number;
  maxNesting: number;
}

/**
 * AST Analyzer for structural feature extraction
 * 
 * Note: This is a simplified analyzer that works with
 * regex-based pattern matching. For production use,
 * integrate with tree-sitter for proper AST parsing.
 */
export class ASTAnalyzer {
  /**
   * Parse code into a simplified AST representation
   * 
   * This is a lightweight parser for common patterns.
   * For full AST support, use tree-sitter integration.
   */
  parse(code: string, _language: string): ASTNode {
    // Create a root node
    const root: ASTNode = {
      type: 'program',
      children: [],
    };

    // Extract function declarations
    const functions = this.extractFunctions(code);
    root.children?.push(...functions);

    // Extract class declarations
    const classes = this.extractClasses(code);
    root.children?.push(...classes);

    return root;
  }

  /**
   * Analyze code for structural features
   */
  analyze(code: string, language: string): ASTAnalysis {
    const ast = this.parse(code, language);
    
    return {
      hasAsync: this.hasAsyncPattern(code),
      hasErrorHandling: this.hasErrorHandling(code),
      hasLoops: this.hasLoops(code),
      hasConditionals: this.hasConditionals(code),
      hasRecursion: this.detectRecursion(code),
      callDepth: this.measureCallDepth(code),
      paramCount: this.countParams(code),
      returnType: this.inferReturnType(code),
      sideEffects: this.detectSideEffects(code),
      complexity: this.estimateComplexity(code),
      nodeCount: this.countNodes(ast),
      maxNesting: this.measureMaxNesting(code),
    };
  }

  /**
   * Check for async/await patterns
   */
  hasAsyncPattern(code: string): boolean {
    return /\basync\b|\bawait\b|\.then\s*\(|Promise\s*[.<]/.test(code);
  }

  /**
   * Check for error handling patterns
   */
  hasErrorHandling(code: string): boolean {
    return /\btry\s*\{|\bcatch\s*\(|\.catch\s*\(|\bthrow\s+/.test(code);
  }

  /**
   * Check for loop patterns
   */
  hasLoops(code: string): boolean {
    return /\bfor\s*\(|\bwhile\s*\(|\bdo\s*\{|\.forEach\s*\(|\.map\s*\(|\.reduce\s*\(/.test(code);
  }

  /**
   * Check for conditional patterns
   */
  hasConditionals(code: string): boolean {
    return /\bif\s*\(|\bswitch\s*\(|\?.*:/.test(code);
  }

  /**
   * Detect potential recursion
   */
  detectRecursion(code: string): boolean {
    // Extract function names
    const funcMatch = code.match(/(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s*)?\()/g);
    if (!funcMatch) return false;

    const funcNames = funcMatch.map(m => {
      const match = m.match(/(?:function\s+|const\s+)(\w+)/);
      return match?.[1];
    }).filter(Boolean);

    // Check if any function name appears in the body
    for (const name of funcNames) {
      if (name) {
        // Count occurrences - if more than the definition, likely recursive
        const matches = code.match(new RegExp(`\\b${name}\\s*\\(`, 'g'));
        if (matches && matches.length > 1) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Measure maximum call depth (nesting of function calls)
   */
  measureCallDepth(code: string): number {
    let maxDepth = 0;
    let currentDepth = 0;

    for (const char of code) {
      if (char === '(') {
        currentDepth++;
        maxDepth = Math.max(maxDepth, currentDepth);
      } else if (char === ')') {
        currentDepth = Math.max(0, currentDepth - 1);
      }
    }

    return maxDepth;
  }

  /**
   * Count parameters in function signatures
   */
  countParams(code: string): number {
    // Find function parameters
    const funcMatch = code.match(/(?:function\s*\w*|=>)\s*\(([^)]*)\)/);
    if (!funcMatch || !funcMatch[1]) return 0;

    const params = funcMatch[1].trim();
    if (params === '') return 0;

    // Count commas + 1 (or handle destructuring)
    return params.split(',').length;
  }

  /**
   * Infer return type from code patterns
   */
  inferReturnType(code: string): ReturnType {
    // Check for Promise patterns
    if (/\basync\b|Promise\s*[.<]|\.then\s*\(/.test(code)) {
      return 'promise';
    }

    // Check for Observable patterns
    if (/Observable\s*[.<]|\.pipe\s*\(|\.subscribe\s*\(/.test(code)) {
      return 'observable';
    }

    // Check return statements
    const returnMatch = code.match(/return\s+([^;]+)/);
    if (!returnMatch) {
      // No return statement - likely void
      if (/\breturn\s*;|\breturn\s*$/.test(code)) {
        return 'void';
      }
      return 'void';
    }

    const returnExpr = returnMatch[1]!;

    // Check for array patterns
    if (/^\s*\[/.test(returnExpr) || /\.map\s*\(|\.filter\s*\(/.test(returnExpr)) {
      return 'array';
    }

    // Check for object patterns
    if (/^\s*\{/.test(returnExpr) || /new\s+\w+/.test(returnExpr)) {
      return 'object';
    }

    // Check for primitive patterns
    if (/^\s*["'`]|^\s*\d|^\s*(true|false|null|undefined)/.test(returnExpr)) {
      return 'primitive';
    }

    return 'unknown';
  }

  /**
   * Detect side effects in code
   */
  detectSideEffects(code: string): SideEffect[] {
    const effects: SideEffect[] = [];

    // IO operations
    if (/console\.|process\.stdout|process\.stderr/.test(code)) {
      effects.push({
        type: 'logging',
        description: 'Console/stdout output',
        confidence: 0.9,
      });
    }

    // Network operations
    if (/fetch\s*\(|axios\.|http\.|https\.|\.get\s*\(|\.post\s*\(|\.put\s*\(|\.delete\s*\(/.test(code)) {
      effects.push({
        type: 'network',
        description: 'HTTP/network request',
        confidence: 0.85,
      });
    }

    // Storage operations
    if (/localStorage|sessionStorage|indexedDB|\.setItem\s*\(|\.getItem\s*\(/.test(code)) {
      effects.push({
        type: 'storage',
        description: 'Browser storage access',
        confidence: 0.9,
      });
    }

    // File system operations
    if (/fs\.|readFile|writeFile|readdir|mkdir/.test(code)) {
      effects.push({
        type: 'io',
        description: 'File system operation',
        confidence: 0.9,
      });
    }

    // Database operations
    if (/\.query\s*\(|\.execute\s*\(|\.save\s*\(|\.insert\s*\(|\.update\s*\(|\.delete\s*\(/.test(code)) {
      effects.push({
        type: 'io',
        description: 'Database operation',
        confidence: 0.8,
      });
    }

    // Mutation patterns
    if (/\.push\s*\(|\.pop\s*\(|\.splice\s*\(|\.shift\s*\(|\.unshift\s*\(/.test(code)) {
      effects.push({
        type: 'mutation',
        description: 'Array mutation',
        confidence: 0.7,
      });
    }

    return effects;
  }

  /**
   * Estimate cyclomatic complexity
   */
  estimateComplexity(code: string): number {
    let complexity = 1; // Base complexity

    // Count decision points
    const patterns = [
      /\bif\s*\(/g,
      /\belse\s+if\s*\(/g,
      /\bfor\s*\(/g,
      /\bwhile\s*\(/g,
      /\bcase\s+/g,
      /\bcatch\s*\(/g,
      /\?\s*[^:]+\s*:/g, // Ternary
      /&&/g,
      /\|\|/g,
    ];

    for (const pattern of patterns) {
      const matches = code.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    }

    return complexity;
  }

  // Private helpers

  private extractFunctions(code: string): ASTNode[] {
    const functions: ASTNode[] = [];
    const pattern = /(?:async\s+)?function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/g;
    
    let match;
    while ((match = pattern.exec(code)) !== null) {
      const name = match[1] ?? match[2];
      if (name) {
        functions.push({
          type: 'function',
          name,
        });
      }
    }

    return functions;
  }

  private extractClasses(code: string): ASTNode[] {
    const classes: ASTNode[] = [];
    const pattern = /class\s+(\w+)/g;
    
    let match;
    while ((match = pattern.exec(code)) !== null) {
      const name = match[1];
      if (name) {
        classes.push({
          type: 'class',
          name,
        });
      }
    }

    return classes;
  }

  private countNodes(node: ASTNode): number {
    let count = 1;
    if (node.children) {
      for (const child of node.children) {
        count += this.countNodes(child);
      }
    }
    return count;
  }

  private measureMaxNesting(code: string): number {
    let maxNesting = 0;
    let currentNesting = 0;

    for (const char of code) {
      if (char === '{') {
        currentNesting++;
        maxNesting = Math.max(maxNesting, currentNesting);
      } else if (char === '}') {
        currentNesting = Math.max(0, currentNesting - 1);
      }
    }

    return maxNesting;
  }
}
