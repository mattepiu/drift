# Go Language Support Design

## Overview

Add comprehensive support for Go (Golang), enabling full call graph analysis, data flow mapping, pattern detection, and framework-aware extraction across Go codebases. This follows Drift's established hybrid extraction pattern: tree-sitter (primary) with regex fallback for enterprise-grade coverage.

## Motivation

Go is the dominant language for cloud-native infrastructure, microservices, and DevOps tooling. Enterprise customers running Kubernetes, building APIs with Gin/Echo/Fiber, or using Go for backend services need Drift support. Current gap prevents:

- Mapping HTTP handlers to database operations
- Tracing data flow through middleware chains
- Detecting Go-specific patterns (error handling, interfaces, goroutines)
- Understanding dependency injection and service patterns
- Analyzing gRPC service definitions

## Goals

1. Parse Go files with tree-sitter (primary) and regex fallback
2. Extract functions, methods, interfaces, structs, and calls
3. Detect Go framework patterns (Gin, Echo, Fiber, Chi, net/http)
4. Extract data access patterns (GORM, sqlx, database/sql, ent)
5. Integrate with existing call graph and pattern detection
6. Support CLI and MCP interfaces
7. Test topology extraction for Go testing frameworks

## Non-Goals

- CGo interop analysis (separate initiative)
- Assembly file analysis
- Build constraint analysis (//go:build)
- Generics type parameter inference (basic support only)

---

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      Go Support Layer                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ Go Tree-Sitter  │  │  Go Regex       │  │  Go Data Access │  │
│  │ Extractor       │──│  Fallback       │──│  Extractor      │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│         │                    │                     │             │
│         ▼                    ▼                     ▼             │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              Go Hybrid Extractor                             ││
│  │  (Combines AST + Regex with confidence tracking)             ││
│  └─────────────────────────────────────────────────────────────┘│
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │           Existing Call Graph + Pattern System               ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### File Structure

```
packages/core/src/
├── parsers/tree-sitter/
│   ├── go-loader.ts                    # Tree-sitter Go grammar loader
│   └── tree-sitter-go-parser.ts        # Go-specific parser utilities
├── call-graph/extractors/
│   ├── go-extractor.ts                 # Main Go extractor (tree-sitter)
│   ├── go-hybrid-extractor.ts          # Hybrid AST + regex extractor
│   ├── go-data-access-extractor.ts     # GORM/sqlx/database-sql detection
│   └── regex/
│       └── go-regex.ts                 # Regex fallback patterns
├── test-topology/extractors/
│   ├── go-test-extractor.ts            # Go testing framework extractor
│   └── regex/
│       └── go-test-regex.ts            # Test regex fallback
├── unified-provider/
│   ├── normalization/
│   │   └── go-normalizer.ts            # Go-specific normalization
│   └── matching/
│       ├── gorm-matcher.ts             # GORM pattern matcher
│       ├── sqlx-matcher.ts             # sqlx pattern matcher
│       └── database-sql-matcher.ts     # database/sql matcher

packages/cli/src/commands/
├── go.ts                               # drift go <subcommand>

packages/mcp/src/tools/analysis/
├── go.ts                               # drift_go MCP tool

packages/detectors/src/
├── api/go/
│   ├── gin-detector.ts                 # Gin framework patterns
│   ├── echo-detector.ts                # Echo framework patterns
│   ├── fiber-detector.ts               # Fiber framework patterns
│   ├── chi-detector.ts                 # Chi router patterns
│   └── net-http-detector.ts            # Standard library patterns
├── errors/go/
│   └── error-handling-detector.ts      # Go error handling patterns
└── auth/go/
    └── middleware-detector.ts          # Auth middleware patterns
```

---

## Phase 1: Tree-Sitter Parser Setup

### 1.1 Go Grammar Loader

```typescript
// packages/core/src/parsers/tree-sitter/go-loader.ts

import type { TreeSitterParser } from './types.js';

let goParser: TreeSitterParser | null = null;
let goAvailable: boolean | null = null;

/**
 * Check if tree-sitter-go is available
 */
export function isGoTreeSitterAvailable(): boolean {
  if (goAvailable !== null) return goAvailable;

  try {
    require.resolve('tree-sitter-go');
    goAvailable = true;
  } catch {
    goAvailable = false;
  }

  return goAvailable;
}

/**
 * Create a Go parser instance
 */
export function createGoParser(): TreeSitterParser {
  if (goParser) return goParser;

  if (!isGoTreeSitterAvailable()) {
    throw new Error('tree-sitter-go is not installed');
  }

  const Parser = require('tree-sitter');
  const Go = require('tree-sitter-go');

  goParser = new Parser();
  goParser.setLanguage(Go);

  return goParser;
}

/**
 * Reset parser (for testing)
 */
export function resetGoParser(): void {
  goParser = null;
  goAvailable = null;
}
```

### 1.2 Dependencies

Add to `packages/core/package.json`:

```json
{
  "dependencies": {
    "tree-sitter-go": "^0.21.0"
  }
}
```

---

## Phase 2: Core Types

### 2.1 Go-Specific Types

```typescript
// packages/core/src/call-graph/extractors/go-types.ts

export interface GoFunction {
  name: string;
  qualifiedName: string;           // package.Type.Method or package.Function
  receiver?: GoReceiver;           // For methods
  parameters: GoParameter[];
  returnTypes: GoReturnType[];
  isExported: boolean;             // Starts with uppercase
  isMethod: boolean;
  isVariadic: boolean;
  startLine: number;
  endLine: number;
  bodyStartLine: number;
  bodyEndLine: number;
}

export interface GoReceiver {
  name: string;                    // e.g., "s" in (s *Server)
  type: string;                    // e.g., "Server"
  isPointer: boolean;              // true for *Server
}

export interface GoParameter {
  name: string;
  type: string;
  isVariadic: boolean;             // ...string
}

export interface GoReturnType {
  name?: string;                   // Named return
  type: string;
}

export interface GoStruct {
  name: string;
  isExported: boolean;
  fields: GoField[];
  methods: string[];               // Method names
  embeddedTypes: string[];         // Embedded structs/interfaces
  startLine: number;
  endLine: number;
}

export interface GoField {
  name: string;
  type: string;
  tag?: string;                    // `json:"name" db:"name"`
  isExported: boolean;
  isEmbedded: boolean;
}

export interface GoInterface {
  name: string;
  isExported: boolean;
  methods: GoInterfaceMethod[];
  embeddedInterfaces: string[];
  startLine: number;
  endLine: number;
}

export interface GoInterfaceMethod {
  name: string;
  parameters: GoParameter[];
  returnTypes: GoReturnType[];
}

export interface GoImport {
  path: string;                    // "github.com/gin-gonic/gin"
  alias?: string;                  // Alias or blank import "_"
  isBlankImport: boolean;          // import _ "..."
  isDotImport: boolean;            // import . "..."
  line: number;
}

export interface GoCall {
  calleeName: string;
  receiver?: string;               // For method calls
  package?: string;                // For qualified calls
  fullExpression: string;
  line: number;
  column: number;
  argumentCount: number;
  isMethodCall: boolean;
  isDeferCall: boolean;            // defer func()
  isGoRoutine: boolean;            // go func()
}
```

---

## Phase 3: Tree-Sitter Extractor

### 3.1 Go Tree-Sitter Extractor

```typescript
// packages/core/src/call-graph/extractors/go-extractor.ts

import type { CallGraphLanguage, FileExtractionResult } from '../types.js';
import { isGoTreeSitterAvailable, createGoParser } from '../../parsers/tree-sitter/go-loader.js';
import type { TreeSitterParser, TreeSitterNode } from '../../parsers/tree-sitter/types.js';

export class GoExtractor {
  readonly language: CallGraphLanguage = 'go';
  readonly extensions: string[] = ['.go'];

  private parser: TreeSitterParser | null = null;

  extract(source: string, filePath: string): FileExtractionResult {
    const result: FileExtractionResult = {
      file: filePath,
      language: this.language,
      functions: [],
      calls: [],
      imports: [],
      exports: [],
      classes: [],  // Used for structs/interfaces
      errors: [],
    };

    if (!isGoTreeSitterAvailable()) {
      result.errors.push('tree-sitter-go not available');
      return result;
    }

    try {
      if (!this.parser) {
        this.parser = createGoParser();
      }

      const tree = this.parser.parse(source);
      const packageName = this.extractPackageName(tree.rootNode);
      
      this.visitNode(tree.rootNode, result, source, packageName);

    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : 'Unknown parse error');
    }

    return result;
  }

  private extractPackageName(root: TreeSitterNode): string {
    for (const child of root.children) {
      if (child.type === 'package_clause') {
        const nameNode = child.childForFieldName('name');
        return nameNode?.text ?? 'main';
      }
    }
    return 'main';
  }

  private visitNode(
    node: TreeSitterNode,
    result: FileExtractionResult,
    source: string,
    packageName: string
  ): void {
    switch (node.type) {
      case 'function_declaration':
        this.extractFunctionDeclaration(node, result, packageName);
        break;

      case 'method_declaration':
        this.extractMethodDeclaration(node, result, packageName);
        break;

      case 'type_declaration':
        this.extractTypeDeclaration(node, result, packageName);
        break;

      case 'import_declaration':
        this.extractImportDeclaration(node, result);
        break;

      case 'call_expression':
        this.extractCallExpression(node, result);
        break;

      case 'go_statement':
        this.extractGoStatement(node, result);
        break;

      case 'defer_statement':
        this.extractDeferStatement(node, result);
        break;

      default:
        for (const child of node.children) {
          this.visitNode(child, result, source, packageName);
        }
    }
  }

  private extractFunctionDeclaration(
    node: TreeSitterNode,
    result: FileExtractionResult,
    packageName: string
  ): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nameNode.text;
    const isExported = /^[A-Z]/.test(name);
    const parametersNode = node.childForFieldName('parameters');
    const resultNode = node.childForFieldName('result');
    const bodyNode = node.childForFieldName('body');

    const parameters = parametersNode ? this.extractParameters(parametersNode) : [];
    const returnType = resultNode ? this.extractReturnType(resultNode) : undefined;

    result.functions.push({
      name,
      qualifiedName: `${packageName}.${name}`,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      startColumn: node.startPosition.column,
      endColumn: node.endPosition.column,
      parameters,
      returnType,
      isMethod: false,
      isStatic: true,  // Go functions are effectively static
      isExported,
      isConstructor: name === 'New' || name.startsWith('New'),
      isAsync: false,  // Go uses goroutines, not async
      decorators: [],
      bodyStartLine: bodyNode ? bodyNode.startPosition.row + 1 : node.startPosition.row + 1,
      bodyEndLine: bodyNode ? bodyNode.endPosition.row + 1 : node.endPosition.row + 1,
    });

    // Extract calls from body
    if (bodyNode) {
      this.extractCallsFromBody(bodyNode, result);
    }
  }

  private extractMethodDeclaration(
    node: TreeSitterNode,
    result: FileExtractionResult,
    packageName: string
  ): void {
    const nameNode = node.childForFieldName('name');
    const receiverNode = node.childForFieldName('receiver');
    if (!nameNode) return;

    const name = nameNode.text;
    const isExported = /^[A-Z]/.test(name);
    const parametersNode = node.childForFieldName('parameters');
    const resultNode = node.childForFieldName('result');
    const bodyNode = node.childForFieldName('body');

    // Extract receiver info
    let className: string | undefined;
    if (receiverNode) {
      const receiverType = this.extractReceiverType(receiverNode);
      className = receiverType;
    }

    const parameters = parametersNode ? this.extractParameters(parametersNode) : [];
    const returnType = resultNode ? this.extractReturnType(resultNode) : undefined;

    const qualifiedName = className 
      ? `${packageName}.${className}.${name}`
      : `${packageName}.${name}`;

    result.functions.push({
      name,
      qualifiedName,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      startColumn: node.startPosition.column,
      endColumn: node.endPosition.column,
      parameters,
      returnType,
      isMethod: true,
      isStatic: false,
      isExported,
      isConstructor: false,
      isAsync: false,
      className,
      decorators: [],
      bodyStartLine: bodyNode ? bodyNode.startPosition.row + 1 : node.startPosition.row + 1,
      bodyEndLine: bodyNode ? bodyNode.endPosition.row + 1 : node.endPosition.row + 1,
    });

    if (bodyNode) {
      this.extractCallsFromBody(bodyNode, result);
    }
  }

  private extractReceiverType(receiverNode: TreeSitterNode): string {
    // (s *Server) or (s Server)
    for (const child of receiverNode.children) {
      if (child.type === 'parameter_declaration') {
        const typeNode = child.childForFieldName('type');
        if (typeNode) {
          // Handle pointer types
          if (typeNode.type === 'pointer_type') {
            const innerType = typeNode.namedChild(0);
            return innerType?.text ?? 'unknown';
          }
          return typeNode.text;
        }
      }
    }
    return 'unknown';
  }

  private extractTypeDeclaration(
    node: TreeSitterNode,
    result: FileExtractionResult,
    packageName: string
  ): void {
    for (const child of node.children) {
      if (child.type === 'type_spec') {
        const nameNode = child.childForFieldName('name');
        const typeNode = child.childForFieldName('type');
        
        if (!nameNode || !typeNode) continue;

        const name = nameNode.text;
        const isExported = /^[A-Z]/.test(name);

        if (typeNode.type === 'struct_type') {
          this.extractStructType(name, typeNode, result, isExported);
        } else if (typeNode.type === 'interface_type') {
          this.extractInterfaceType(name, typeNode, result, isExported);
        }
      }
    }
  }

  private extractStructType(
    name: string,
    node: TreeSitterNode,
    result: FileExtractionResult,
    isExported: boolean
  ): void {
    const methods: string[] = [];
    const baseClasses: string[] = [];  // Embedded types

    // Extract fields and embedded types
    const fieldListNode = node.childForFieldName('fields');
    if (fieldListNode) {
      for (const field of fieldListNode.children) {
        if (field.type === 'field_declaration') {
          const fieldNames = field.childForFieldName('name');
          const fieldType = field.childForFieldName('type');
          
          // Embedded type (no name, just type)
          if (!fieldNames && fieldType) {
            baseClasses.push(fieldType.text.replace(/^\*/, ''));
          }
        }
      }
    }

    result.classes.push({
      name,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      baseClasses,
      methods,
      isExported,
    });
  }

  private extractInterfaceType(
    name: string,
    node: TreeSitterNode,
    result: FileExtractionResult,
    isExported: boolean
  ): void {
    const methods: string[] = [];
    const baseClasses: string[] = [];  // Embedded interfaces

    for (const child of node.children) {
      if (child.type === 'method_spec') {
        const methodName = child.childForFieldName('name');
        if (methodName) {
          methods.push(methodName.text);
        }
      } else if (child.type === 'type_identifier') {
        // Embedded interface
        baseClasses.push(child.text);
      }
    }

    result.classes.push({
      name,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      baseClasses,
      methods,
      isExported,
    });
  }

  private extractImportDeclaration(
    node: TreeSitterNode,
    result: FileExtractionResult
  ): void {
    const importSpecs = this.findAllNodes(node, 'import_spec');

    for (const spec of importSpecs) {
      const pathNode = spec.childForFieldName('path');
      const nameNode = spec.childForFieldName('name');

      if (!pathNode) continue;

      const path = pathNode.text.replace(/^"|"$/g, '');
      const alias = nameNode?.text;
      const isBlankImport = alias === '_';
      const isDotImport = alias === '.';

      // Extract package name from path
      const packageName = path.split('/').pop() ?? path;

      result.imports.push({
        source: path,
        names: [{
          imported: packageName,
          local: alias ?? packageName,
          isDefault: false,
          isNamespace: isDotImport,
        }],
        line: spec.startPosition.row + 1,
        isTypeOnly: false,
      });
    }
  }

  private extractCallExpression(
    node: TreeSitterNode,
    result: FileExtractionResult
  ): void {
    const funcNode = node.childForFieldName('function');
    const argsNode = node.childForFieldName('arguments');

    if (!funcNode) return;

    let calleeName: string;
    let receiver: string | undefined;
    let isMethodCall = false;

    if (funcNode.type === 'selector_expression') {
      // obj.Method() or pkg.Function()
      const operandNode = funcNode.childForFieldName('operand');
      const fieldNode = funcNode.childForFieldName('field');
      
      if (operandNode && fieldNode) {
        receiver = operandNode.text;
        calleeName = fieldNode.text;
        isMethodCall = true;
      } else {
        calleeName = funcNode.text;
      }
    } else if (funcNode.type === 'identifier') {
      calleeName = funcNode.text;
    } else {
      calleeName = funcNode.text;
    }

    let argumentCount = 0;
    if (argsNode) {
      for (const child of argsNode.children) {
        if (child.type !== '(' && child.type !== ')' && child.type !== ',') {
          argumentCount++;
        }
      }
    }

    result.calls.push({
      calleeName,
      receiver,
      fullExpression: node.text,
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
      argumentCount,
      isMethodCall,
      isConstructorCall: calleeName === 'New' || calleeName.startsWith('New'),
    });
  }

  private extractGoStatement(
    node: TreeSitterNode,
    result: FileExtractionResult
  ): void {
    // go func() or go obj.Method()
    const callNode = node.namedChild(0);
    if (callNode?.type === 'call_expression') {
      this.extractCallExpression(callNode, result);
    }
  }

  private extractDeferStatement(
    node: TreeSitterNode,
    result: FileExtractionResult
  ): void {
    // defer func() or defer obj.Method()
    const callNode = node.namedChild(0);
    if (callNode?.type === 'call_expression') {
      this.extractCallExpression(callNode, result);
    }
  }

  private extractCallsFromBody(
    node: TreeSitterNode,
    result: FileExtractionResult
  ): void {
    const visit = (n: TreeSitterNode): void => {
      if (n.type === 'call_expression') {
        this.extractCallExpression(n, result);
      } else if (n.type === 'go_statement') {
        this.extractGoStatement(n, result);
      } else if (n.type === 'defer_statement') {
        this.extractDeferStatement(n, result);
      }

      for (const child of n.children) {
        visit(child);
      }
    };

    for (const child of node.children) {
      visit(child);
    }
  }

  private extractParameters(
    node: TreeSitterNode
  ): FileExtractionResult['functions'][0]['parameters'] {
    const params: FileExtractionResult['functions'][0]['parameters'] = [];

    for (const child of node.children) {
      if (child.type === 'parameter_declaration') {
        const names: string[] = [];
        let type: string | undefined;
        let isVariadic = false;

        for (const paramChild of child.children) {
          if (paramChild.type === 'identifier') {
            names.push(paramChild.text);
          } else if (paramChild.type === 'variadic_parameter_declaration') {
            isVariadic = true;
            const variadicType = paramChild.childForFieldName('type');
            type = variadicType?.text;
          } else if (
            paramChild.type === 'type_identifier' ||
            paramChild.type === 'pointer_type' ||
            paramChild.type === 'slice_type' ||
            paramChild.type === 'map_type' ||
            paramChild.type === 'channel_type' ||
            paramChild.type === 'function_type' ||
            paramChild.type === 'qualified_type'
          ) {
            type = paramChild.text;
          }
        }

        // If no names, it's an unnamed parameter
        if (names.length === 0) {
          params.push({ name: '_', type, hasDefault: false, isRest: isVariadic });
        } else {
          for (const name of names) {
            params.push({ name, type, hasDefault: false, isRest: isVariadic });
          }
        }
      }
    }

    return params;
  }

  private extractReturnType(node: TreeSitterNode): string {
    if (node.type === 'parameter_list') {
      // Multiple return values: (int, error)
      const types: string[] = [];
      for (const child of node.children) {
        if (child.type === 'parameter_declaration') {
          const typeNode = child.childForFieldName('type');
          if (typeNode) types.push(typeNode.text);
        }
      }
      return `(${types.join(', ')})`;
    }
    return node.text;
  }

  private findAllNodes(node: TreeSitterNode, type: string): TreeSitterNode[] {
    const results: TreeSitterNode[] = [];
    
    const visit = (n: TreeSitterNode): void => {
      if (n.type === type) {
        results.push(n);
      }
      for (const child of n.children) {
        visit(child);
      }
    };

    visit(node);
    return results;
  }
}

export function createGoExtractor(): GoExtractor {
  return new GoExtractor();
}
```

---

## Phase 4: Regex Fallback

### 4.1 Go Regex Patterns

```typescript
// packages/core/src/call-graph/extractors/regex/go-regex.ts

import { BaseRegexExtractor } from './base-regex-extractor.js';
import type {
  CallGraphLanguage,
  FunctionExtraction,
  CallExtraction,
  ImportExtraction,
  ExportExtraction,
  ClassExtraction,
} from '../../types.js';
import type { LanguagePatterns } from '../types.js';

const GO_PATTERNS: LanguagePatterns = {
  language: 'go',
  functions: [],
  classes: [],
  imports: [],
  exports: [],
  calls: [],
};

export class GoRegexExtractor extends BaseRegexExtractor {
  readonly language: CallGraphLanguage = 'go';
  readonly extensions: string[] = ['.go'];
  protected readonly patterns = GO_PATTERNS;

  // ==========================================================================
  // Function Extraction
  // ==========================================================================

  protected extractFunctions(
    cleanSource: string,
    originalSource: string,
    _filePath: string
  ): FunctionExtraction[] {
    const functions: FunctionExtraction[] = [];
    const seen = new Set<string>();

    // Pattern 1: Regular function declarations
    // func FunctionName(params) returnType {
    const funcPattern = /^func\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*([^{]*)\s*\{/gm;
    let match;

    while ((match = funcPattern.exec(cleanSource)) !== null) {
      const name = match[1]!;
      const paramsStr = match[2] || '';
      const returnStr = match[3]?.trim() || '';
      const startLine = this.getLineNumber(originalSource, match.index);
      const key = `${name}:${startLine}`;

      if (seen.has(key)) continue;
      seen.add(key);

      const endIndex = this.findBlockEnd(cleanSource, match.index);
      const endLine = this.getLineNumber(originalSource, endIndex);
      const isExported = /^[A-Z]/.test(name);

      functions.push(this.createFunction({
        name,
        startLine,
        endLine,
        parameters: this.parseGoParameters(paramsStr),
        returnType: returnStr || undefined,
        isMethod: false,
        isStatic: true,
        isExported,
        isConstructor: name === 'New' || name.startsWith('New'),
        decorators: [],
      }));
    }

    // Pattern 2: Method declarations
    // func (r *Receiver) MethodName(params) returnType {
    const methodPattern = /^func\s+\((\w+)\s+\*?(\w+)\)\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*([^{]*)\s*\{/gm;

    while ((match = methodPattern.exec(cleanSource)) !== null) {
      const receiverName = match[1]!;
      const receiverType = match[2]!;
      const name = match[3]!;
      const paramsStr = match[4] || '';
      const returnStr = match[5]?.trim() || '';
      const startLine = this.getLineNumber(originalSource, match.index);
      const key = `${receiverType}.${name}:${startLine}`;

      if (seen.has(key)) continue;
      seen.add(key);

      const endIndex = this.findBlockEnd(cleanSource, match.index);
      const endLine = this.getLineNumber(originalSource, endIndex);
      const isExported = /^[A-Z]/.test(name);

      functions.push(this.createFunction({
        name,
        qualifiedName: `${receiverType}.${name}`,
        startLine,
        endLine,
        parameters: this.parseGoParameters(paramsStr),
        returnType: returnStr || undefined,
        isMethod: true,
        isStatic: false,
        isExported,
        isConstructor: false,
        className: receiverType,
        decorators: [],
      }));
    }

    return functions;
  }

  private parseGoParameters(paramsStr: string): FunctionExtraction['parameters'] {
    if (!paramsStr.trim()) return [];

    const params: FunctionExtraction['parameters'] = [];
    const parts = this.splitGoParams(paramsStr);

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      // Handle variadic: name ...type
      const isVariadic = trimmed.includes('...');
      
      // Pattern: name type or name, name2 type
      const paramMatch = trimmed.match(/^(\w+(?:\s*,\s*\w+)*)\s+(.+)$/);
      if (paramMatch) {
        const names = paramMatch[1]!.split(',').map(n => n.trim());
        const type = paramMatch[2]!.replace('...', '');
        
        for (const name of names) {
          params.push({ name, type, hasDefault: false, isRest: isVariadic });
        }
      } else {
        // Unnamed parameter (just type)
        params.push({ name: '_', type: trimmed, hasDefault: false, isRest: isVariadic });
      }
    }

    return params;
  }

  private splitGoParams(paramsStr: string): string[] {
    const parts: string[] = [];
    let current = '';
    let depth = 0;

    for (const char of paramsStr) {
      if (char === '(' || char === '[' || char === '{') depth++;
      else if (char === ')' || char === ']' || char === '}') depth--;
      else if (char === ',' && depth === 0) {
        parts.push(current.trim());
        current = '';
        continue;
      }
      current += char;
    }
    if (current.trim()) parts.push(current.trim());

    return parts;
  }

  // ==========================================================================
  // Class (Struct/Interface) Extraction
  // ==========================================================================

  protected extractClasses(
    cleanSource: string,
    originalSource: string,
    _filePath: string
  ): ClassExtraction[] {
    const classes: ClassExtraction[] = [];

    // Pattern 1: Struct declarations
    // type StructName struct {
    const structPattern = /type\s+(\w+)\s+struct\s*\{/g;
    let match;

    while ((match = structPattern.exec(cleanSource)) !== null) {
      const name = match[1]!;
      const startLine = this.getLineNumber(originalSource, match.index);
      const endIndex = this.findBlockEnd(cleanSource, match.index);
      const endLine = this.getLineNumber(originalSource, endIndex);
      const isExported = /^[A-Z]/.test(name);

      // Extract embedded types from struct body
      const structBody = cleanSource.slice(match.index, endIndex);
      const embeddedTypes = this.extractEmbeddedTypes(structBody);

      classes.push(this.createClass({
        name,
        startLine,
        endLine,
        baseClasses: embeddedTypes,
        methods: [],
        isExported,
      }));
    }

    // Pattern 2: Interface declarations
    // type InterfaceName interface {
    const interfacePattern = /type\s+(\w+)\s+interface\s*\{/g;

    while ((match = interfacePattern.exec(cleanSource)) !== null) {
      const name = match[1]!;
      const startLine = this.getLineNumber(originalSource, match.index);
      const endIndex = this.findBlockEnd(cleanSource, match.index);
      const endLine = this.getLineNumber(originalSource, endIndex);
      const isExported = /^[A-Z]/.test(name);

      // Extract interface methods
      const interfaceBody = cleanSource.slice(match.index, endIndex);
      const methods = this.extractInterfaceMethods(interfaceBody);
      const embeddedInterfaces = this.extractEmbeddedInterfaces(interfaceBody);

      classes.push(this.createClass({
        name,
        startLine,
        endLine,
        baseClasses: embeddedInterfaces,
        methods,
        isExported,
      }));
    }

    return classes;
  }

  private extractEmbeddedTypes(structBody: string): string[] {
    const embedded: string[] = [];
    // Look for lines with just a type name (no field name)
    const lines = structBody.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      // Embedded type: just *TypeName or TypeName
      const embeddedMatch = trimmed.match(/^\*?([A-Z]\w*)$/);
      if (embeddedMatch) {
        embedded.push(embeddedMatch[1]!);
      }
    }

    return embedded;
  }

  private extractInterfaceMethods(interfaceBody: string): string[] {
    const methods: string[] = [];
    // Look for method signatures: MethodName(params) returnType
    const methodPattern = /^\s*([A-Z]\w*)\s*\(/gm;
    let match;

    while ((match = methodPattern.exec(interfaceBody)) !== null) {
      methods.push(match[1]!);
    }

    return methods;
  }

  private extractEmbeddedInterfaces(interfaceBody: string): string[] {
    const embedded: string[] = [];
    const lines = interfaceBody.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      // Embedded interface: just InterfaceName (no parentheses)
      if (/^[A-Z]\w*$/.test(trimmed) && !trimmed.includes('(')) {
        embedded.push(trimmed);
      }
    }

    return embedded;
  }

  // ==========================================================================
  // Import Extraction
  // ==========================================================================

  protected extractImports(
    cleanSource: string,
    originalSource: string,
    _filePath: string
  ): ImportExtraction[] {
    const imports: ImportExtraction[] = [];

    // Pattern 1: Single import
    // import "package/path"
    // import alias "package/path"
    const singleImportPattern = /import\s+(?:(\w+|\.)\s+)?"([^"]+)"/g;
    let match;

    while ((match = singleImportPattern.exec(cleanSource)) !== null) {
      const alias = match[1];
      const path = match[2]!;
      const line = this.getLineNumber(originalSource, match.index);
      const packageName = path.split('/').pop() ?? path;

      imports.push(this.createImport({
        source: path,
        names: [{
          imported: packageName,
          local: alias ?? packageName,
          isDefault: false,
          isNamespace: alias === '.',
        }],
        line,
      }));
    }

    // Pattern 2: Import block
    // import (
    //   "package1"
    //   alias "package2"
    // )
    const importBlockPattern = /import\s*\(\s*([\s\S]*?)\s*\)/g;

    while ((match = importBlockPattern.exec(cleanSource)) !== null) {
      const blockContent = match[1]!;
      const blockStart = match.index;
      const importLines = blockContent.split('\n');

      for (const importLine of importLines) {
        const trimmed = importLine.trim();
        if (!trimmed || trimmed.startsWith('//')) continue;

        const lineMatch = trimmed.match(/^(?:(\w+|\.)\s+)?"([^"]+)"$/);
        if (lineMatch) {
          const alias = lineMatch[1];
          const path = lineMatch[2]!;
          const packageName = path.split('/').pop() ?? path;

          imports.push(this.createImport({
            source: path,
            names: [{
              imported: packageName,
              local: alias ?? packageName,
              isDefault: false,
              isNamespace: alias === '.',
            }],
            line: this.getLineNumber(originalSource, blockStart),
          }));
        }
      }
    }

    return imports;
  }

  // ==========================================================================
  // Export Extraction
  // ==========================================================================

  protected extractExports(
    cleanSource: string,
    originalSource: string,
    _filePath: string
  ): ExportExtraction[] {
    const exports: ExportExtraction[] = [];

    // Package declaration
    const packagePattern = /package\s+(\w+)/;
    const match = cleanSource.match(packagePattern);
    
    if (match) {
      exports.push(this.createExport({
        name: match[1]!,
        line: this.getLineNumber(originalSource, match.index ?? 0),
      }));
    }

    return exports;
  }

  // ==========================================================================
  // Call Extraction
  // ==========================================================================

  protected extractCalls(
    cleanSource: string,
    originalSource: string,
    _filePath: string
  ): CallExtraction[] {
    const calls: CallExtraction[] = [];
    const seen = new Set<string>();

    // Pattern 1: Method/package calls - obj.Method() or pkg.Function()
    const methodCallPattern = /(\w+)\.(\w+)\s*\(/g;
    let match;

    while ((match = methodCallPattern.exec(cleanSource)) !== null) {
      const receiver = match[1]!;
      const calleeName = match[2]!;
      const line = this.getLineNumber(originalSource, match.index);
      const key = `${receiver}.${calleeName}:${line}`;

      if (seen.has(key)) continue;
      seen.add(key);

      calls.push(this.createCall({
        calleeName,
        receiver,
        fullExpression: `${receiver}.${calleeName}`,
        line,
        isMethodCall: true,
      }));
    }

    // Pattern 2: Direct function calls - FunctionName()
    const funcCallPattern = /(?<![.\w])([A-Za-z_]\w*)\s*\(/g;

    while ((match = funcCallPattern.exec(cleanSource)) !== null) {
      const calleeName = match[1]!;
      const line = this.getLineNumber(originalSource, match.index);
      const key = `${calleeName}:${line}`;

      if (seen.has(key)) continue;
      seen.add(key);

      // Skip Go keywords
      const keywords = ['if', 'for', 'switch', 'select', 'go', 'defer', 'return',
                       'func', 'type', 'struct', 'interface', 'map', 'chan',
                       'range', 'make', 'new', 'append', 'len', 'cap', 'close',
                       'delete', 'copy', 'panic', 'recover', 'print', 'println'];
      if (keywords.includes(calleeName)) continue;

      calls.push(this.createCall({
        calleeName,
        fullExpression: calleeName,
        line,
        isConstructorCall: calleeName === 'New' || calleeName.startsWith('New'),
      }));
    }

    return calls;
  }
}
```

---

## Phase 5: Hybrid Extractor

### 5.1 Go Hybrid Extractor

```typescript
// packages/core/src/call-graph/extractors/go-hybrid-extractor.ts

import { HybridExtractorBase } from './hybrid-extractor-base.js';
import { GoRegexExtractor } from './regex/go-regex.js';
import type { CallGraphLanguage, FileExtractionResult } from '../types.js';
import { isGoTreeSitterAvailable, createGoParser } from '../../parsers/tree-sitter/go-loader.js';
import type { TreeSitterParser, TreeSitterNode } from '../../parsers/tree-sitter/types.js';
import type { HybridExtractorConfig } from './types.js';

export class GoHybridExtractor extends HybridExtractorBase {
  readonly language: CallGraphLanguage = 'go';
  readonly extensions: string[] = ['.go'];
  protected regexExtractor = new GoRegexExtractor();

  private parser: TreeSitterParser | null = null;

  constructor(config?: HybridExtractorConfig) {
    super(config);
  }

  protected isTreeSitterAvailable(): boolean {
    return isGoTreeSitterAvailable();
  }

  protected extractWithTreeSitter(source: string, filePath: string): FileExtractionResult | null {
    if (!isGoTreeSitterAvailable()) {
      return null;
    }

    const result: FileExtractionResult = {
      file: filePath,
      language: this.language,
      functions: [],
      calls: [],
      imports: [],
      exports: [],
      classes: [],
      errors: [],
    };

    try {
      if (!this.parser) {
        this.parser = createGoParser();
      }

      const tree = this.parser.parse(source);
      const packageName = this.extractPackageName(tree.rootNode);
      
      this.visitNode(tree.rootNode, result, source, packageName);

    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : 'Unknown parse error');
    }

    return result;
  }

  // ... (same implementation as GoExtractor above)
  // The full tree-sitter extraction logic goes here
}

export function createGoHybridExtractor(config?: HybridExtractorConfig): GoHybridExtractor {
  return new GoHybridExtractor(config);
}
```

---

## Phase 6: Data Access Extraction

### 6.1 Go Data Access Extractor

```typescript
// packages/core/src/call-graph/extractors/go-data-access-extractor.ts

import { BaseDataAccessExtractor, type DataAccessExtractionResult } from './data-access-extractor.js';
import type { CallGraphLanguage } from '../types.js';
import type { DataOperation } from '../../boundaries/types.js';
import { isGoTreeSitterAvailable, createGoParser } from '../../parsers/tree-sitter/go-loader.js';
import type { TreeSitterParser, TreeSitterNode } from '../../parsers/tree-sitter/types.js';

export class GoDataAccessExtractor extends BaseDataAccessExtractor {
  readonly language: CallGraphLanguage = 'go';
  readonly extensions: string[] = ['.go'];

  private parser: TreeSitterParser | null = null;

  static isAvailable(): boolean {
    return isGoTreeSitterAvailable();
  }

  extract(source: string, filePath: string): DataAccessExtractionResult {
    const result = this.createEmptyResult(filePath);

    if (!isGoTreeSitterAvailable()) {
      result.errors.push('Tree-sitter not available for Go parsing');
      return result;
    }

    try {
      if (!this.parser) {
        this.parser = createGoParser();
      }

      const tree = this.parser.parse(source);
      this.visitNode(tree.rootNode, result, filePath, source);

    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : 'Unknown parse error');
    }

    return result;
  }

  private visitNode(
    node: TreeSitterNode,
    result: DataAccessExtractionResult,
    filePath: string,
    source: string
  ): void {
    if (node.type === 'call_expression') {
      this.analyzeCallExpression(node, result, filePath, source);
    }

    for (const child of node.children) {
      this.visitNode(child, result, filePath, source);
    }
  }

  private analyzeCallExpression(
    node: TreeSitterNode,
    result: DataAccessExtractionResult,
    filePath: string,
    _source: string
  ): void {
    const chain = this.getMethodChain(node);
    
    const accessPoint = 
      this.tryGormPattern(chain, node, filePath) ||
      this.trySqlxPattern(chain, node, filePath) ||
      this.tryDatabaseSqlPattern(chain, node, filePath) ||
      this.tryEntPattern(chain, node, filePath) ||
      this.tryBunPattern(chain, node, filePath);

    if (accessPoint) {
      const exists = result.accessPoints.some(ap => ap.id === accessPoint.id);
      if (!exists) {
        result.accessPoints.push(accessPoint);
      }
    }
  }

  private getMethodChain(node: TreeSitterNode): { names: string[]; args: TreeSitterNode[][] } {
    const names: string[] = [];
    const args: TreeSitterNode[][] = [];
    
    let current: TreeSitterNode | null = node;
    
    while (current) {
      if (current.type === 'call_expression') {
        const funcNode = current.childForFieldName('function');
        const argsNode = current.childForFieldName('arguments');
        
        if (funcNode?.type === 'selector_expression') {
          const fieldNode = funcNode.childForFieldName('field');
          if (fieldNode) {
            names.unshift(fieldNode.text);
          }
          current = funcNode.childForFieldName('operand');
        } else if (funcNode?.type === 'identifier') {
          names.unshift(funcNode.text);
          break;
        } else {
          break;
        }
        
        if (argsNode) {
          const argList: TreeSitterNode[] = [];
          for (const child of argsNode.children) {
            if (child.type !== '(' && child.type !== ')' && child.type !== ',') {
              argList.push(child);
            }
          }
          args.unshift(argList);
        } else {
          args.unshift([]);
        }
      } else if (current.type === 'selector_expression') {
        const fieldNode = current.childForFieldName('field');
        if (fieldNode) {
          names.unshift(fieldNode.text);
          args.unshift([]);
        }
        current = current.childForFieldName('operand');
      } else if (current.type === 'identifier') {
        names.unshift(current.text);
        args.unshift([]);
        break;
      } else {
        break;
      }
    }
    
    return { names, args };
  }

  /**
   * GORM patterns:
   * db.Find(&users)
   * db.Where("name = ?", name).First(&user)
   * db.Create(&user)
   * db.Model(&User{}).Where(...).Update(...)
   * db.Delete(&user)
   */
  private tryGormPattern(
    chain: { names: string[]; args: TreeSitterNode[][] },
    node: TreeSitterNode,
    filePath: string
  ): ReturnType<typeof this.createAccessPoint> | null {
    const gormReadMethods = ['Find', 'First', 'Last', 'Take', 'Scan', 'Pluck', 'Count', 'Row', 'Rows'];
    const gormWriteMethods = ['Create', 'Save', 'Update', 'Updates', 'UpdateColumn', 'UpdateColumns'];
    const gormDeleteMethods = ['Delete', 'Unscoped'];
    const gormChainMethods = ['Where', 'Or', 'Not', 'Limit', 'Offset', 'Order', 'Group', 
                             'Having', 'Joins', 'Preload', 'Select', 'Omit', 'Model', 'Table'];

    // Check if this looks like a GORM chain
    const hasGormMethod = chain.names.some(n => 
      gormReadMethods.includes(n) || 
      gormWriteMethods.includes(n) || 
      gormDeleteMethods.includes(n) ||
      gormChainMethods.includes(n)
    );

    if (!hasGormMethod) return null;

    // Determine operation from terminal method
    let operation: DataOperation = 'unknown';
    let table = 'unknown';

    for (let i = chain.names.length - 1; i >= 0; i--) {
      const method = chain.names[i]!;
      
      if (gormReadMethods.includes(method)) {
        operation = 'read';
        // Try to infer table from argument type
        const methodArgs = chain.args[i];
        if (methodArgs && methodArgs.length > 0) {
          table = this.inferTableFromGoArg(methodArgs[0]!);
        }
        break;
      } else if (gormWriteMethods.includes(method)) {
        operation = 'write';
        const methodArgs = chain.args[i];
        if (methodArgs && methodArgs.length > 0) {
          table = this.inferTableFromGoArg(methodArgs[0]!);
        }
        break;
      } else if (gormDeleteMethods.includes(method)) {
        operation = 'delete';
        const methodArgs = chain.args[i];
        if (methodArgs && methodArgs.length > 0) {
          table = this.inferTableFromGoArg(methodArgs[0]!);
        }
        break;
      } else if (method === 'Model' || method === 'Table') {
        const methodArgs = chain.args[i];
        if (methodArgs && methodArgs.length > 0) {
          table = this.inferTableFromGoArg(methodArgs[0]!);
        }
      }
    }

    if (operation === 'unknown') return null;

    return this.createAccessPoint({
      table,
      fields: [],
      operation,
      file: filePath,
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
      context: node.text.slice(0, 200),
      framework: 'gorm',
      tableFromLiteral: false,
    });
  }

  /**
   * sqlx patterns:
   * db.Select(&users, "SELECT * FROM users WHERE ...")
   * db.Get(&user, "SELECT * FROM users WHERE id = ?", id)
   * db.Exec("INSERT INTO users ...")
   * db.NamedExec("INSERT INTO users ...", user)
   */
  private trySqlxPattern(
    chain: { names: string[]; args: TreeSitterNode[][] },
    node: TreeSitterNode,
    filePath: string
  ): ReturnType<typeof this.createAccessPoint> | null {
    const sqlxReadMethods = ['Select', 'Get', 'Queryx', 'QueryRowx', 'NamedQuery'];
    const sqlxWriteMethods = ['Exec', 'NamedExec', 'MustExec'];

    const lastMethod = chain.names[chain.names.length - 1];
    if (!lastMethod) return null;

    let operation: DataOperation = 'unknown';
    let table = 'unknown';

    if (sqlxReadMethods.includes(lastMethod)) {
      operation = 'read';
    } else if (sqlxWriteMethods.includes(lastMethod)) {
      operation = 'write';
    }

    if (operation === 'unknown') return null;

    // Try to extract SQL from string argument
    const methodArgs = chain.args[chain.args.length - 1];
    if (methodArgs) {
      for (const arg of methodArgs) {
        const sqlText = this.extractStringValue(arg);
        if (sqlText) {
          const parsed = this.parseSQLStatement(sqlText);
          table = parsed.table;
          if (parsed.operation !== 'unknown') {
            operation = parsed.operation;
          }
          break;
        }
      }
    }

    return this.createAccessPoint({
      table,
      fields: [],
      operation,
      file: filePath,
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
      context: node.text.slice(0, 200),
      isRawSql: true,
      framework: 'sqlx',
      tableFromLiteral: true,
    });
  }

  /**
   * database/sql patterns:
   * db.Query("SELECT * FROM users")
   * db.QueryRow("SELECT * FROM users WHERE id = ?", id)
   * db.Exec("INSERT INTO users ...")
   * stmt.Query(args...)
   */
  private tryDatabaseSqlPattern(
    chain: { names: string[]; args: TreeSitterNode[][] },
    node: TreeSitterNode,
    filePath: string
  ): ReturnType<typeof this.createAccessPoint> | null {
    const sqlReadMethods = ['Query', 'QueryRow', 'QueryContext', 'QueryRowContext'];
    const sqlWriteMethods = ['Exec', 'ExecContext'];

    const lastMethod = chain.names[chain.names.length - 1];
    if (!lastMethod) return null;

    let operation: DataOperation = 'unknown';
    let table = 'unknown';

    if (sqlReadMethods.includes(lastMethod)) {
      operation = 'read';
    } else if (sqlWriteMethods.includes(lastMethod)) {
      operation = 'write';
    }

    if (operation === 'unknown') return null;

    // Try to extract SQL from string argument
    const methodArgs = chain.args[chain.args.length - 1];
    if (methodArgs && methodArgs.length > 0) {
      const sqlText = this.extractStringValue(methodArgs[0]!);
      if (sqlText) {
        const parsed = this.parseSQLStatement(sqlText);
        table = parsed.table;
        if (parsed.operation !== 'unknown') {
          operation = parsed.operation;
        }
      }
    }

    return this.createAccessPoint({
      table,
      fields: [],
      operation,
      file: filePath,
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
      context: node.text.slice(0, 200),
      isRawSql: true,
      framework: 'raw-sql',
      tableFromLiteral: true,
    });
  }

  /**
   * Ent patterns:
   * client.User.Query().All(ctx)
   * client.User.Create().SetName("...").Save(ctx)
   * client.User.Delete().Where(...).Exec(ctx)
   */
  private tryEntPattern(
    chain: { names: string[]; args: TreeSitterNode[][] },
    node: TreeSitterNode,
    filePath: string
  ): ReturnType<typeof this.createAccessPoint> | null {
    const entReadMethods = ['All', 'Only', 'First', 'Count', 'Exist', 'IDs'];
    const entWriteMethods = ['Save', 'SaveX'];
    const entDeleteMethods = ['Exec', 'ExecX'];
    const entBuilderMethods = ['Query', 'Create', 'Update', 'Delete'];

    // Check for Ent patterns
    const hasEntBuilder = chain.names.some(n => entBuilderMethods.includes(n));
    if (!hasEntBuilder) return null;

    let operation: DataOperation = 'unknown';
    let table = 'unknown';

    // Find the entity name (usually after 'client')
    const clientIdx = chain.names.indexOf('client');
    if (clientIdx >= 0 && clientIdx + 1 < chain.names.length) {
      table = this.inferTableFromName(chain.names[clientIdx + 1]!);
    }

    // Determine operation
    if (chain.names.includes('Query')) {
      operation = 'read';
    } else if (chain.names.includes('Create') || chain.names.includes('Update')) {
      operation = 'write';
    } else if (chain.names.includes('Delete')) {
      operation = 'delete';
    }

    // Refine based on terminal method
    for (const method of chain.names) {
      if (entReadMethods.includes(method)) operation = 'read';
      else if (entWriteMethods.includes(method)) operation = 'write';
      else if (entDeleteMethods.includes(method) && chain.names.includes('Delete')) operation = 'delete';
    }

    if (operation === 'unknown') return null;

    return this.createAccessPoint({
      table,
      fields: [],
      operation,
      file: filePath,
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
      context: node.text.slice(0, 200),
      framework: 'ent',
      tableFromLiteral: false,
    });
  }

  /**
   * Bun patterns:
   * db.NewSelect().Model(&users).Scan(ctx)
   * db.NewInsert().Model(&user).Exec(ctx)
   * db.NewUpdate().Model(&user).Exec(ctx)
   * db.NewDelete().Model(&user).Exec(ctx)
   */
  private tryBunPattern(
    chain: { names: string[]; args: TreeSitterNode[][] },
    node: TreeSitterNode,
    filePath: string
  ): ReturnType<typeof this.createAccessPoint> | null {
    const bunBuilders = ['NewSelect', 'NewInsert', 'NewUpdate', 'NewDelete', 'NewRaw'];
    
    const hasBuilder = chain.names.some(n => bunBuilders.includes(n));
    if (!hasBuilder) return null;

    let operation: DataOperation = 'unknown';
    let table = 'unknown';

    if (chain.names.includes('NewSelect')) operation = 'read';
    else if (chain.names.includes('NewInsert')) operation = 'write';
    else if (chain.names.includes('NewUpdate')) operation = 'write';
    else if (chain.names.includes('NewDelete')) operation = 'delete';

    // Try to get table from Model() argument
    const modelIdx = chain.names.indexOf('Model');
    if (modelIdx >= 0) {
      const modelArgs = chain.args[modelIdx];
      if (modelArgs && modelArgs.length > 0) {
        table = this.inferTableFromGoArg(modelArgs[0]!);
      }
    }

    if (operation === 'unknown') return null;

    return this.createAccessPoint({
      table,
      fields: [],
      operation,
      file: filePath,
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
      context: node.text.slice(0, 200),
      framework: 'bun',
      tableFromLiteral: false,
    });
  }

  private inferTableFromGoArg(node: TreeSitterNode): string {
    // Handle &User{}, &users, User{}, etc.
    const text = node.text;
    
    // &User{} or User{}
    const structMatch = text.match(/&?(\w+)\{\}/);
    if (structMatch) {
      return this.inferTableFromName(structMatch[1]!);
    }
    
    // &users (pointer to slice variable)
    const varMatch = text.match(/&(\w+)/);
    if (varMatch) {
      return this.inferTableFromName(varMatch[1]!);
    }

    return 'unknown';
  }

  private extractStringValue(node: TreeSitterNode): string | null {
    if (node.type === 'interpreted_string_literal' || node.type === 'raw_string_literal') {
      return node.text.replace(/^["`]|["`]$/g, '');
    }
    return null;
  }

  private parseSQLStatement(sql: string): { table: string; operation: DataOperation; fields: string[] } {
    const upperSql = sql.toUpperCase().trim();
    let operation: DataOperation = 'unknown';
    let table = 'unknown';

    if (upperSql.startsWith('SELECT')) operation = 'read';
    else if (upperSql.startsWith('INSERT')) operation = 'write';
    else if (upperSql.startsWith('UPDATE')) operation = 'write';
    else if (upperSql.startsWith('DELETE')) operation = 'delete';

    const fromMatch = sql.match(/FROM\s+["'`]?(\w+)["'`]?/i);
    const intoMatch = sql.match(/INTO\s+["'`]?(\w+)["'`]?/i);
    const updateMatch = sql.match(/UPDATE\s+["'`]?(\w+)["'`]?/i);

    if (fromMatch?.[1]) table = fromMatch[1].toLowerCase();
    else if (intoMatch?.[1]) table = intoMatch[1].toLowerCase();
    else if (updateMatch?.[1]) table = updateMatch[1].toLowerCase();

    return { table, operation, fields: [] };
  }
}

export function createGoDataAccessExtractor(): GoDataAccessExtractor {
  return new GoDataAccessExtractor();
}
```

---

## Phase 7: Test Topology Extraction

### 7.1 Go Test Extractor

```typescript
// packages/core/src/test-topology/extractors/go-test-extractor.ts

import type Parser from 'tree-sitter';
import { BaseTestExtractor } from './base-test-extractor.js';
import type {
  TestExtraction,
  TestCase,
  MockStatement,
  SetupBlock,
  AssertionInfo,
  TestFramework,
} from '../types.js';

const FRAMEWORK_IMPORTS: Record<string, TestFramework> = {
  'testing': 'go-testing',
  'github.com/stretchr/testify': 'testify',
  'github.com/stretchr/testify/assert': 'testify',
  'github.com/stretchr/testify/require': 'testify',
  'github.com/stretchr/testify/suite': 'testify',
  'github.com/onsi/ginkgo': 'ginkgo',
  'github.com/onsi/gomega': 'gomega',
};

export class GoTestExtractor extends BaseTestExtractor {
  constructor(parser: Parser) {
    super(parser, 'go');
  }

  extract(content: string, filePath: string): TestExtraction {
    const tree = this.parser.parse(content);
    const root = tree.rootNode;

    const framework = this.detectFramework(root);
    const testCases = this.extractTestCases(root);
    const mocks = this.extractMocks(root, framework);
    const setupBlocks = this.extractSetupBlocks(root);

    for (const test of testCases) {
      const testMocks = mocks.filter(m => 
        m.line >= test.line && m.line <= test.line + 100
      );
      test.quality = this.calculateQuality(test.assertions, testMocks, test.directCalls);
    }

    return {
      file: filePath,
      framework,
      language: 'go',
      testCases,
      mocks,
      setupBlocks,
    };
  }

  detectFramework(root: Parser.SyntaxNode): TestFramework {
    const imports = this.findImports(root);

    for (const imp of imports) {
      for (const [pattern, framework] of Object.entries(FRAMEWORK_IMPORTS)) {
        if (imp.includes(pattern)) {
          return framework;
        }
      }
    }

    // Check for test function patterns
    const text = root.text;
    if (text.includes('func Test') && text.includes('*testing.T')) {
      return 'go-testing';
    }

    return 'unknown';
  }

  extractTestCases(root: Parser.SyntaxNode): TestCase[] {
    const testCases: TestCase[] = [];

    this.walkNode(root, (node) => {
      // Find test functions: func TestXxx(t *testing.T)
      if (node.type === 'function_declaration') {
        const nameNode = node.childForFieldName('name');
        const parametersNode = node.childForFieldName('parameters');
        const bodyNode = node.childForFieldName('body');

        if (nameNode && parametersNode && bodyNode) {
          const name = nameNode.text;
          
          // Check if it's a test function
          if (name.startsWith('Test') && this.hasTestingTParam(parametersNode)) {
            const directCalls = this.extractFunctionCalls(bodyNode);
            const assertions = this.extractAssertions(bodyNode);

            testCases.push({
              id: this.generateTestId('', name, node.startPosition.row),
              name,
              qualifiedName: name,
              file: '',
              line: node.startPosition.row + 1,
              directCalls,
              transitiveCalls: [],
              assertions,
              quality: {
                assertionCount: assertions.length,
                hasErrorCases: false,
                hasEdgeCases: false,
                mockRatio: 0,
                setupRatio: 0,
                score: 50,
              },
            });
          }
        }
      }

      // Find table-driven test cases: t.Run("name", func(t *testing.T) {...})
      if (node.type === 'call_expression') {
        const funcNode = node.childForFieldName('function');
        
        if (funcNode?.type === 'selector_expression') {
          const fieldNode = funcNode.childForFieldName('field');
          
          if (fieldNode?.text === 'Run') {
            const argsNode = node.childForFieldName('arguments');
            if (argsNode) {
              const args = argsNode.namedChildren;
              if (args.length >= 2) {
                const nameArg = args[0];
                const funcArg = args[1];
                
                if (nameArg && funcArg?.type === 'func_literal') {
                  const testName = nameArg.text.replace(/^"|"$/g, '');
                  const bodyNode = funcArg.childForFieldName('body');
                  
                  if (bodyNode) {
                    const directCalls = this.extractFunctionCalls(bodyNode);
                    const assertions = this.extractAssertions(bodyNode);

                    testCases.push({
                      id: this.generateTestId('', testName, node.startPosition.row),
                      name: testName,
                      qualifiedName: testName,
                      file: '',
                      line: node.startPosition.row + 1,
                      directCalls,
                      transitiveCalls: [],
                      assertions,
                      isSubtest: true,
                      quality: {
                        assertionCount: assertions.length,
                        hasErrorCases: false,
                        hasEdgeCases: false,
                        mockRatio: 0,
                        setupRatio: 0,
                        score: 50,
                      },
                    });
                  }
                }
              }
            }
          }
        }
      }
    });

    return testCases;
  }

  private hasTestingTParam(parametersNode: Parser.SyntaxNode): boolean {
    for (const child of parametersNode.children) {
      if (child.type === 'parameter_declaration') {
        const typeNode = child.childForFieldName('type');
        if (typeNode?.text.includes('testing.T') || typeNode?.text.includes('testing.B')) {
          return true;
        }
      }
    }
    return false;
  }

  extractMocks(root: Parser.SyntaxNode, _framework: TestFramework): MockStatement[] {
    const mocks: MockStatement[] = [];

    this.walkNode(root, (node) => {
      // gomock: ctrl.EXPECT().Method().Return(...)
      if (node.type === 'call_expression') {
        const funcNode = node.childForFieldName('function');
        
        if (funcNode?.type === 'selector_expression') {
          const fieldNode = funcNode.childForFieldName('field');
          
          if (fieldNode?.text === 'EXPECT') {
            mocks.push({
              target: funcNode.text,
              mockType: 'gomock',
              line: node.startPosition.row + 1,
              isExternal: false,
            });
          }
        }
      }

      // testify mock: mock.On("Method", args).Return(...)
      if (node.type === 'call_expression') {
        const funcNode = node.childForFieldName('function');
        
        if (funcNode?.type === 'selector_expression') {
          const fieldNode = funcNode.childForFieldName('field');
          
          if (fieldNode?.text === 'On') {
            mocks.push({
              target: funcNode.text,
              mockType: 'testify-mock',
              line: node.startPosition.row + 1,
              isExternal: false,
            });
          }
        }
      }
    });

    return mocks;
  }

  extractSetupBlocks(root: Parser.SyntaxNode): SetupBlock[] {
    const blocks: SetupBlock[] = [];

    this.walkNode(root, (node) => {
      // Find TestMain function
      if (node.type === 'function_declaration') {
        const nameNode = node.childForFieldName('name');
        const bodyNode = node.childForFieldName('body');

        if (nameNode?.text === 'TestMain' && bodyNode) {
          const calls = this.extractFunctionCalls(bodyNode);
          blocks.push({
            type: 'beforeAll',
            line: node.startPosition.row + 1,
            calls,
          });
        }
      }

      // Find t.Cleanup() calls
      if (node.type === 'call_expression') {
        const funcNode = node.childForFieldName('function');
        
        if (funcNode?.type === 'selector_expression') {
          const fieldNode = funcNode.childForFieldName('field');
          
          if (fieldNode?.text === 'Cleanup') {
            blocks.push({
              type: 'afterEach',
              line: node.startPosition.row + 1,
              calls: [],
            });
          }
        }
      }
    });

    return blocks;
  }

  protected findImports(root: Parser.SyntaxNode): string[] {
    const imports: string[] = [];

    this.walkNode(root, (node) => {
      if (node.type === 'import_spec') {
        const pathNode = node.childForFieldName('path');
        if (pathNode) {
          imports.push(pathNode.text.replace(/^"|"$/g, ''));
        }
      }
    });

    return imports;
  }

  private extractAssertions(node: Parser.SyntaxNode): AssertionInfo[] {
    const assertions: AssertionInfo[] = [];

    this.walkNode(node, (child) => {
      if (child.type === 'call_expression') {
        const funcNode = child.childForFieldName('function');
        
        if (funcNode?.type === 'selector_expression') {
          const operandNode = funcNode.childForFieldName('operand');
          const fieldNode = funcNode.childForFieldName('field');
          
          if (fieldNode) {
            const method = fieldNode.text;
            const receiver = operandNode?.text ?? '';

            // Standard testing.T assertions
            if (method === 'Error' || method === 'Errorf' || method === 'Fatal' || method === 'Fatalf') {
              assertions.push({
                matcher: method,
                line: child.startPosition.row + 1,
                isErrorAssertion: true,
                isEdgeCaseAssertion: false,
              });
            }

            // testify assertions
            if (receiver.includes('assert') || receiver.includes('require')) {
              assertions.push({
                matcher: `${receiver}.${method}`,
                line: child.startPosition.row + 1,
                isErrorAssertion: method.includes('Error') || method.includes('Panic'),
                isEdgeCaseAssertion: method === 'Nil' || method === 'NotNil' ||
                                    method === 'Empty' || method === 'NotEmpty' ||
                                    method === 'Zero' || method === 'True' || method === 'False',
              });
            }

            // gomega assertions
            if (method === 'Expect' || method === 'Should' || method === 'To') {
              assertions.push({
                matcher: method,
                line: child.startPosition.row + 1,
                isErrorAssertion: false,
                isEdgeCaseAssertion: false,
              });
            }
          }
        }
      }
    });

    return assertions;
  }
}

export function createGoTestExtractor(parser: Parser): GoTestExtractor {
  return new GoTestExtractor(parser);
}
```

### 7.2 Go Test Regex Fallback

```typescript
// packages/core/src/test-topology/extractors/regex/go-test-regex.ts

import type { TestExtraction, TestCase, MockStatement, SetupBlock, TestFramework } from '../../types.js';

export class GoTestRegexExtractor {
  extract(content: string, filePath: string): TestExtraction {
    const framework = this.detectFramework(content);
    const testCases = this.extractTestCases(content);
    const mocks = this.extractMocks(content);
    const setupBlocks = this.extractSetupBlocks(content);

    return {
      file: filePath,
      framework,
      language: 'go',
      testCases,
      mocks,
      setupBlocks,
    };
  }

  private detectFramework(content: string): TestFramework {
    if (content.includes('github.com/stretchr/testify')) return 'testify';
    if (content.includes('github.com/onsi/ginkgo')) return 'ginkgo';
    if (content.includes('*testing.T') || content.includes('*testing.B')) return 'go-testing';
    return 'unknown';
  }

  private extractTestCases(content: string): TestCase[] {
    const testCases: TestCase[] = [];
    
    // Pattern: func TestXxx(t *testing.T) {
    const testFuncPattern = /func\s+(Test\w+)\s*\(\s*\w+\s+\*testing\.[TB]\s*\)\s*\{/g;
    let match;

    while ((match = testFuncPattern.exec(content)) !== null) {
      const name = match[1]!;
      const line = this.getLineNumber(content, match.index);

      testCases.push({
        id: `go:${name}:${line}`,
        name,
        qualifiedName: name,
        file: '',
        line,
        directCalls: [],
        transitiveCalls: [],
        assertions: [],
        quality: {
          assertionCount: 0,
          hasErrorCases: false,
          hasEdgeCases: false,
          mockRatio: 0,
          setupRatio: 0,
          score: 50,
        },
      });
    }

    // Pattern: t.Run("name", func(t *testing.T) {
    const subtestPattern = /t\.Run\s*\(\s*"([^"]+)"/g;

    while ((match = subtestPattern.exec(content)) !== null) {
      const name = match[1]!;
      const line = this.getLineNumber(content, match.index);

      testCases.push({
        id: `go:subtest:${name}:${line}`,
        name,
        qualifiedName: name,
        file: '',
        line,
        directCalls: [],
        transitiveCalls: [],
        assertions: [],
        isSubtest: true,
        quality: {
          assertionCount: 0,
          hasErrorCases: false,
          hasEdgeCases: false,
          mockRatio: 0,
          setupRatio: 0,
          score: 50,
        },
      });
    }

    return testCases;
  }

  private extractMocks(content: string): MockStatement[] {
    const mocks: MockStatement[] = [];

    // gomock: ctrl.EXPECT()
    const gomockPattern = /(\w+)\.EXPECT\(\)/g;
    let match;

    while ((match = gomockPattern.exec(content)) !== null) {
      mocks.push({
        target: match[1]!,
        mockType: 'gomock',
        line: this.getLineNumber(content, match.index),
        isExternal: false,
      });
    }

    // testify mock: mock.On("Method"
    const testifyMockPattern = /(\w+)\.On\s*\(\s*"(\w+)"/g;

    while ((match = testifyMockPattern.exec(content)) !== null) {
      mocks.push({
        target: `${match[1]}.${match[2]}`,
        mockType: 'testify-mock',
        line: this.getLineNumber(content, match.index),
        isExternal: false,
      });
    }

    return mocks;
  }

  private extractSetupBlocks(content: string): SetupBlock[] {
    const blocks: SetupBlock[] = [];

    // TestMain function
    const testMainPattern = /func\s+TestMain\s*\(/g;
    let match;

    while ((match = testMainPattern.exec(content)) !== null) {
      blocks.push({
        type: 'beforeAll',
        line: this.getLineNumber(content, match.index),
        calls: [],
      });
    }

    // t.Cleanup()
    const cleanupPattern = /t\.Cleanup\s*\(/g;

    while ((match = cleanupPattern.exec(content)) !== null) {
      blocks.push({
        type: 'afterEach',
        line: this.getLineNumber(content, match.index),
        calls: [],
      });
    }

    return blocks;
  }

  private getLineNumber(content: string, index: number): number {
    return content.slice(0, index).split('\n').length;
  }
}
```

---

## Phase 8: Framework Detectors

### 8.1 Gin Framework Detector

```typescript
// packages/detectors/src/api/go/gin-detector.ts

import type { PatternDetector, DetectedPattern } from '../../types.js';

export class GinDetector implements PatternDetector {
  readonly name = 'gin-routes';
  readonly category = 'api';
  readonly language = 'go';

  detect(content: string, filePath: string): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    // Route definitions: r.GET("/path", handler)
    const routePattern = /(\w+)\.(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s*\(\s*"([^"]+)"\s*,\s*(\w+)/g;
    let match;

    while ((match = routePattern.exec(content)) !== null) {
      const method = match[2]!;
      const path = match[3]!;
      const handler = match[4]!;
      const line = this.getLineNumber(content, match.index);

      patterns.push({
        id: `gin-route:${method}:${path}:${line}`,
        name: `${method} ${path}`,
        category: 'api',
        confidence: 0.95,
        file: filePath,
        line,
        metadata: {
          framework: 'gin',
          method,
          path,
          handler,
        },
      });
    }

    // Route groups: r.Group("/api")
    const groupPattern = /(\w+)\.Group\s*\(\s*"([^"]+)"/g;

    while ((match = groupPattern.exec(content)) !== null) {
      const prefix = match[2]!;
      const line = this.getLineNumber(content, match.index);

      patterns.push({
        id: `gin-group:${prefix}:${line}`,
        name: `Route Group: ${prefix}`,
        category: 'api',
        confidence: 0.9,
        file: filePath,
        line,
        metadata: {
          framework: 'gin',
          type: 'group',
          prefix,
        },
      });
    }

    // Middleware: r.Use(middleware)
    const middlewarePattern = /(\w+)\.Use\s*\(\s*(\w+)/g;

    while ((match = middlewarePattern.exec(content)) !== null) {
      const middleware = match[2]!;
      const line = this.getLineNumber(content, match.index);

      patterns.push({
        id: `gin-middleware:${middleware}:${line}`,
        name: `Middleware: ${middleware}`,
        category: 'api',
        confidence: 0.85,
        file: filePath,
        line,
        metadata: {
          framework: 'gin',
          type: 'middleware',
          middleware,
        },
      });
    }

    return patterns;
  }

  private getLineNumber(content: string, index: number): number {
    return content.slice(0, index).split('\n').length;
  }
}
```

### 8.2 Echo Framework Detector

```typescript
// packages/detectors/src/api/go/echo-detector.ts

import type { PatternDetector, DetectedPattern } from '../../types.js';

export class EchoDetector implements PatternDetector {
  readonly name = 'echo-routes';
  readonly category = 'api';
  readonly language = 'go';

  detect(content: string, filePath: string): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    // Route definitions: e.GET("/path", handler)
    const routePattern = /(\w+)\.(GET|POST|PUT|DELETE|PATCH)\s*\(\s*"([^"]+)"\s*,\s*(\w+)/g;
    let match;

    while ((match = routePattern.exec(content)) !== null) {
      const method = match[2]!;
      const path = match[3]!;
      const handler = match[4]!;
      const line = this.getLineNumber(content, match.index);

      patterns.push({
        id: `echo-route:${method}:${path}:${line}`,
        name: `${method} ${path}`,
        category: 'api',
        confidence: 0.95,
        file: filePath,
        line,
        metadata: {
          framework: 'echo',
          method,
          path,
          handler,
        },
      });
    }

    // Route groups: e.Group("/api")
    const groupPattern = /(\w+)\.Group\s*\(\s*"([^"]+)"/g;

    while ((match = groupPattern.exec(content)) !== null) {
      const prefix = match[2]!;
      const line = this.getLineNumber(content, match.index);

      patterns.push({
        id: `echo-group:${prefix}:${line}`,
        name: `Route Group: ${prefix}`,
        category: 'api',
        confidence: 0.9,
        file: filePath,
        line,
        metadata: {
          framework: 'echo',
          type: 'group',
          prefix,
        },
      });
    }

    return patterns;
  }

  private getLineNumber(content: string, index: number): number {
    return content.slice(0, index).split('\n').length;
  }
}
```

### 8.3 Go Error Handling Detector

```typescript
// packages/detectors/src/errors/go/error-handling-detector.ts

import type { PatternDetector, DetectedPattern } from '../../types.js';

export class GoErrorHandlingDetector implements PatternDetector {
  readonly name = 'go-error-handling';
  readonly category = 'errors';
  readonly language = 'go';

  detect(content: string, filePath: string): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    // Standard error check: if err != nil {
    const errorCheckPattern = /if\s+(\w+)\s*!=\s*nil\s*\{/g;
    let match;

    while ((match = errorCheckPattern.exec(content)) !== null) {
      const errVar = match[1]!;
      const line = this.getLineNumber(content, match.index);

      // Look for what happens after the check
      const afterCheck = content.slice(match.index, match.index + 200);
      const hasReturn = /return.*err/.test(afterCheck);
      const hasWrap = /fmt\.Errorf|errors\.Wrap|errors\.WithStack/.test(afterCheck);
      const hasLog = /log\.|logger\./.test(afterCheck);

      patterns.push({
        id: `go-error-check:${line}`,
        name: `Error Check: ${errVar}`,
        category: 'errors',
        confidence: 0.9,
        file: filePath,
        line,
        metadata: {
          errorVariable: errVar,
          hasReturn,
          hasWrap,
          hasLog,
          pattern: hasWrap ? 'wrapped' : hasReturn ? 'propagated' : 'handled',
        },
      });
    }

    // Error wrapping: fmt.Errorf("...: %w", err)
    const wrapPattern = /fmt\.Errorf\s*\([^)]*%w/g;

    while ((match = wrapPattern.exec(content)) !== null) {
      const line = this.getLineNumber(content, match.index);

      patterns.push({
        id: `go-error-wrap:${line}`,
        name: 'Error Wrapping',
        category: 'errors',
        confidence: 0.95,
        file: filePath,
        line,
        metadata: {
          type: 'wrap',
          method: 'fmt.Errorf',
        },
      });
    }

    // Custom error types: type XxxError struct
    const customErrorPattern = /type\s+(\w+Error)\s+struct/g;

    while ((match = customErrorPattern.exec(content)) !== null) {
      const errorType = match[1]!;
      const line = this.getLineNumber(content, match.index);

      patterns.push({
        id: `go-custom-error:${errorType}:${line}`,
        name: `Custom Error: ${errorType}`,
        category: 'errors',
        confidence: 0.95,
        file: filePath,
        line,
        metadata: {
          type: 'custom-error',
          errorType,
        },
      });
    }

    // Sentinel errors: var ErrXxx = errors.New("...")
    const sentinelPattern = /var\s+(Err\w+)\s*=\s*errors\.New/g;

    while ((match = sentinelPattern.exec(content)) !== null) {
      const errorName = match[1]!;
      const line = this.getLineNumber(content, match.index);

      patterns.push({
        id: `go-sentinel-error:${errorName}:${line}`,
        name: `Sentinel Error: ${errorName}`,
        category: 'errors',
        confidence: 0.95,
        file: filePath,
        line,
        metadata: {
          type: 'sentinel',
          errorName,
        },
      });
    }

    return patterns;
  }

  private getLineNumber(content: string, index: number): number {
    return content.slice(0, index).split('\n').length;
  }
}
```

---

## Phase 9: CLI Commands

### 9.1 drift go Command

```typescript
// packages/cli/src/commands/go.ts

import { Command } from 'commander';
import chalk from 'chalk';
import { createGoAnalyzer } from 'driftdetect-core';
import { createSpinner } from '../ui/spinner.js';

export interface GoOptions {
  format?: 'text' | 'json';
  verbose?: boolean;
}

export function createGoCommand(): Command {
  const go = new Command('go')
    .description('Go language analysis commands');

  // drift go routes
  go
    .command('routes [path]')
    .description('List all HTTP routes (Gin, Echo, Chi, net/http)')
    .option('-f, --format <format>', 'Output format: text, json', 'text')
    .option('-v, --verbose', 'Enable verbose output')
    .action(async (targetPath: string | undefined, options: GoOptions) => {
      await routesAction(targetPath, options);
    });

  // drift go errors
  go
    .command('errors [path]')
    .description('Analyze error handling patterns')
    .option('-f, --format <format>', 'Output format: text, json', 'text')
    .option('-v, --verbose', 'Enable verbose output')
    .action(async (targetPath: string | undefined, options: GoOptions) => {
      await errorsAction(targetPath, options);
    });

  // drift go interfaces
  go
    .command('interfaces [path]')
    .description('List interfaces and their implementations')
    .option('-f, --format <format>', 'Output format: text, json', 'text')
    .option('-v, --verbose', 'Enable verbose output')
    .action(async (targetPath: string | undefined, options: GoOptions) => {
      await interfacesAction(targetPath, options);
    });

  // drift go data-access
  go
    .command('data-access [path]')
    .description('Analyze database access patterns (GORM, sqlx, database/sql)')
    .option('-f, --format <format>', 'Output format: text, json', 'text')
    .option('-v, --verbose', 'Enable verbose output')
    .action(async (targetPath: string | undefined, options: GoOptions) => {
      await dataAccessAction(targetPath, options);
    });

  // drift go status
  go
    .command('status [path]')
    .description('Show Go project analysis summary')
    .option('-f, --format <format>', 'Output format: text, json', 'text')
    .option('-v, --verbose', 'Enable verbose output')
    .action(async (targetPath: string | undefined, options: GoOptions) => {
      await statusAction(targetPath, options);
    });

  return go;
}

async function routesAction(targetPath: string | undefined, options: GoOptions): Promise<void> {
  const rootDir = targetPath ?? process.cwd();
  const format = options.format ?? 'text';
  const isTextFormat = format === 'text';

  const spinner = isTextFormat ? createSpinner('Analyzing Go routes...') : null;
  spinner?.start();

  try {
    const analyzer = createGoAnalyzer({ rootDir, verbose: options.verbose });
    const result = await analyzer.analyzeRoutes();

    spinner?.stop();

    if (format === 'json') {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log();
    console.log(chalk.bold('🛣️  Go HTTP Routes'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log();

    // Group by framework
    const byFramework = new Map<string, typeof result.routes>();
    for (const route of result.routes) {
      const existing = byFramework.get(route.framework) ?? [];
      existing.push(route);
      byFramework.set(route.framework, existing);
    }

    for (const [framework, routes] of byFramework) {
      console.log(chalk.bold(`${framework} (${routes.length} routes)`));
      
      for (const route of routes) {
        const methodColor = {
          GET: chalk.green,
          POST: chalk.blue,
          PUT: chalk.yellow,
          DELETE: chalk.red,
          PATCH: chalk.magenta,
        }[route.method] ?? chalk.white;

        console.log(`  ${methodColor(route.method.padEnd(7))} ${route.path}`);
        console.log(chalk.gray(`    → ${route.handler} (${route.file}:${route.line})`));
      }
      console.log();
    }

    console.log(`Total: ${chalk.cyan(result.routes.length)} routes`);

  } catch (error) {
    spinner?.stop();
    if (format === 'json') {
      console.log(JSON.stringify({ error: String(error) }));
    } else {
      console.log(chalk.red(`\n❌ Error: ${error}`));
    }
  }
}

async function errorsAction(targetPath: string | undefined, options: GoOptions): Promise<void> {
  const rootDir = targetPath ?? process.cwd();
  const format = options.format ?? 'text';
  const isTextFormat = format === 'text';

  const spinner = isTextFormat ? createSpinner('Analyzing error handling...') : null;
  spinner?.start();

  try {
    const analyzer = createGoAnalyzer({ rootDir, verbose: options.verbose });
    const result = await analyzer.analyzeErrorHandling();

    spinner?.stop();

    if (format === 'json') {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log();
    console.log(chalk.bold('⚠️  Go Error Handling Analysis'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log();

    console.log(`Error Checks: ${chalk.cyan(result.stats.errorChecks)}`);
    console.log(`Wrapped Errors: ${chalk.green(result.stats.wrappedErrors)}`);
    console.log(`Sentinel Errors: ${chalk.blue(result.stats.sentinelErrors)}`);
    console.log(`Custom Error Types: ${chalk.magenta(result.stats.customErrorTypes)}`);
    console.log();

    if (result.issues.length > 0) {
      console.log(chalk.bold('Issues:'));
      for (const issue of result.issues.slice(0, 10)) {
        console.log(`  ${chalk.yellow('⚠')} ${issue.file}:${issue.line}`);
        console.log(chalk.gray(`    ${issue.message}`));
      }
      if (result.issues.length > 10) {
        console.log(chalk.gray(`  ... and ${result.issues.length - 10} more`));
      }
    }

  } catch (error) {
    spinner?.stop();
    if (format === 'json') {
      console.log(JSON.stringify({ error: String(error) }));
    } else {
      console.log(chalk.red(`\n❌ Error: ${error}`));
    }
  }
}

async function interfacesAction(targetPath: string | undefined, options: GoOptions): Promise<void> {
  // Implementation similar to above
}

async function dataAccessAction(targetPath: string | undefined, options: GoOptions): Promise<void> {
  // Implementation similar to above
}

async function statusAction(targetPath: string | undefined, options: GoOptions): Promise<void> {
  // Implementation similar to above
}
```

---

## Phase 10: MCP Tool

### 10.1 drift_go MCP Tool

```typescript
// packages/mcp/src/tools/analysis/go.ts

import { z } from 'zod';
import { createGoAnalyzer } from 'driftdetect-core';

export type GoAction = 
  | 'status'       // Project status overview
  | 'routes'       // HTTP routes analysis
  | 'errors'       // Error handling patterns
  | 'interfaces'   // Interface analysis
  | 'data-access'  // Database access patterns
  | 'goroutines';  // Goroutine/concurrency analysis

export interface GoArgs {
  action: GoAction;
  path?: string;
  framework?: string;  // Filter by framework
  limit?: number;
}

export interface ToolContext {
  projectRoot: string;
}

export async function executeGoTool(
  args: GoArgs,
  context: ToolContext
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const projectPath = args.path ?? context.projectRoot;
  const limit = args.limit ?? 50;

  const analyzer = createGoAnalyzer({
    rootDir: projectPath,
    verbose: false,
  });

  let result: unknown;

  switch (args.action) {
    case 'status': {
      const analysisResult = await analyzer.analyze();
      result = formatStatusResult(analysisResult, limit);
      break;
    }

    case 'routes': {
      const routesResult = await analyzer.analyzeRoutes();
      result = formatRoutesResult(routesResult, args.framework, limit);
      break;
    }

    case 'errors': {
      const errorsResult = await analyzer.analyzeErrorHandling();
      result = formatErrorsResult(errorsResult, limit);
      break;
    }

    case 'interfaces': {
      const interfacesResult = await analyzer.analyzeInterfaces();
      result = formatInterfacesResult(interfacesResult, limit);
      break;
    }

    case 'data-access': {
      const dataAccessResult = await analyzer.analyzeDataAccess();
      result = formatDataAccessResult(dataAccessResult, limit);
      break;
    }

    case 'goroutines': {
      const goroutinesResult = await analyzer.analyzeGoroutines();
      result = formatGoroutinesResult(goroutinesResult, limit);
      break;
    }

    default:
      throw new Error(`Unknown action: ${args.action}`);
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(result, null, 2),
    }],
  };
}

function formatStatusResult(result: any, limit: number): unknown {
  return {
    project: {
      moduleName: result.moduleName,
      goVersion: result.goVersion,
      packages: result.packages.length,
      files: result.stats.fileCount,
      functions: result.stats.functionCount,
      structs: result.stats.structCount,
      interfaces: result.stats.interfaceCount,
    },
    frameworks: result.detectedFrameworks,
    stats: {
      linesOfCode: result.stats.linesOfCode,
      testFiles: result.stats.testFileCount,
      testFunctions: result.stats.testFunctionCount,
    },
    topPackages: result.packages
      .slice(0, limit)
      .map((pkg: any) => ({
        name: pkg.name,
        files: pkg.files.length,
        functions: pkg.functions.length,
      })),
    summary: `Go project with ${result.stats.fileCount} files, ${result.stats.functionCount} functions, ${result.stats.structCount} structs`,
  };
}

function formatRoutesResult(result: any, framework: string | undefined, limit: number): unknown {
  let routes = result.routes;
  
  if (framework) {
    routes = routes.filter((r: any) => r.framework === framework);
  }

  return {
    total: routes.length,
    byFramework: groupBy(routes, 'framework'),
    routes: routes.slice(0, limit).map((r: any) => ({
      method: r.method,
      path: r.path,
      handler: r.handler,
      framework: r.framework,
      file: r.file,
      line: r.line,
      middleware: r.middleware,
    })),
    truncated: routes.length > limit,
    summary: `${routes.length} HTTP routes across ${Object.keys(groupBy(routes, 'framework')).length} framework(s)`,
  };
}

function formatErrorsResult(result: any, limit: number): unknown {
  return {
    stats: {
      errorChecks: result.stats.errorChecks,
      wrappedErrors: result.stats.wrappedErrors,
      sentinelErrors: result.stats.sentinelErrors,
      customErrorTypes: result.stats.customErrorTypes,
      uncheckedErrors: result.stats.uncheckedErrors,
    },
    patterns: {
      propagated: result.patterns.filter((p: any) => p.type === 'propagated').length,
      wrapped: result.patterns.filter((p: any) => p.type === 'wrapped').length,
      logged: result.patterns.filter((p: any) => p.type === 'logged').length,
      ignored: result.patterns.filter((p: any) => p.type === 'ignored').length,
    },
    issues: result.issues.slice(0, limit).map((i: any) => ({
      type: i.type,
      file: i.file,
      line: i.line,
      message: i.message,
      suggestion: i.suggestion,
    })),
    sentinelErrors: result.sentinelErrors.slice(0, limit),
    customErrors: result.customErrors.slice(0, limit),
    summary: `${result.stats.errorChecks} error checks, ${result.issues.length} potential issues`,
  };
}

function formatInterfacesResult(result: any, limit: number): unknown {
  return {
    total: result.interfaces.length,
    interfaces: result.interfaces.slice(0, limit).map((i: any) => ({
      name: i.name,
      package: i.package,
      methods: i.methods.length,
      implementations: i.implementations.length,
      file: i.file,
      line: i.line,
    })),
    implementations: result.implementations.slice(0, limit).map((impl: any) => ({
      struct: impl.struct,
      interface: impl.interface,
      file: impl.file,
    })),
    summary: `${result.interfaces.length} interfaces with ${result.implementations.length} implementations`,
  };
}

function formatDataAccessResult(result: any, limit: number): unknown {
  return {
    total: result.accessPoints.length,
    byFramework: groupBy(result.accessPoints, 'framework'),
    byOperation: {
      read: result.accessPoints.filter((a: any) => a.operation === 'read').length,
      write: result.accessPoints.filter((a: any) => a.operation === 'write').length,
      delete: result.accessPoints.filter((a: any) => a.operation === 'delete').length,
    },
    accessPoints: result.accessPoints.slice(0, limit).map((a: any) => ({
      table: a.table,
      operation: a.operation,
      framework: a.framework,
      file: a.file,
      line: a.line,
      isRawSql: a.isRawSql,
    })),
    tables: [...new Set(result.accessPoints.map((a: any) => a.table))],
    summary: `${result.accessPoints.length} data access points across ${[...new Set(result.accessPoints.map((a: any) => a.table))].length} tables`,
  };
}

function formatGoroutinesResult(result: any, limit: number): unknown {
  return {
    total: result.goroutines.length,
    stats: {
      goStatements: result.stats.goStatements,
      channels: result.stats.channels,
      mutexes: result.stats.mutexes,
      waitGroups: result.stats.waitGroups,
    },
    goroutines: result.goroutines.slice(0, limit).map((g: any) => ({
      file: g.file,
      line: g.line,
      function: g.function,
      hasRecover: g.hasRecover,
      channelOps: g.channelOps,
    })),
    potentialIssues: result.issues.slice(0, limit).map((i: any) => ({
      type: i.type,
      file: i.file,
      line: i.line,
      message: i.message,
    })),
    summary: `${result.goroutines.length} goroutines, ${result.issues.length} potential concurrency issues`,
  };
}

function groupBy<T>(array: T[], key: keyof T): Record<string, number> {
  return array.reduce((acc, item) => {
    const k = String(item[key]);
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}
```

---

## Phase 11: Unified Provider Integration

### 11.1 Go Normalizer

```typescript
// packages/core/src/unified-provider/normalization/go-normalizer.ts

import { BaseNormalizer, type NormalizedDataAccess } from './base-normalizer.js';
import type { DataAccessPoint } from '../../boundaries/types.js';

export class GoNormalizer extends BaseNormalizer {
  readonly language = 'go';

  normalize(accessPoint: DataAccessPoint): NormalizedDataAccess {
    return {
      table: this.normalizeTableName(accessPoint.table),
      fields: accessPoint.fields.map(f => this.normalizeFieldName(f)),
      operation: accessPoint.operation,
      framework: this.normalizeFramework(accessPoint.framework),
      confidence: this.calculateConfidence(accessPoint),
      originalContext: accessPoint.context,
    };
  }

  private normalizeTableName(table: string): string {
    // Go conventions: User -> users, UserProfile -> user_profiles
    return table
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '')
      .replace(/_+/g, '_');
  }

  private normalizeFieldName(field: string): string {
    // Same convention as table names
    return field
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '');
  }

  private normalizeFramework(framework?: string): string {
    const frameworkMap: Record<string, string> = {
      'gorm': 'gorm',
      'sqlx': 'sqlx',
      'database/sql': 'database-sql',
      'raw-sql': 'raw-sql',
      'ent': 'ent',
      'bun': 'bun',
    };
    return frameworkMap[framework ?? ''] ?? framework ?? 'unknown';
  }

  private calculateConfidence(accessPoint: DataAccessPoint): number {
    let confidence = 0.7;

    // Higher confidence for ORM patterns
    if (accessPoint.framework === 'gorm' || accessPoint.framework === 'ent') {
      confidence += 0.15;
    }

    // Lower confidence for raw SQL
    if (accessPoint.isRawSql) {
      confidence -= 0.1;
    }

    // Higher confidence if table name is from literal
    if (accessPoint.tableFromLiteral) {
      confidence += 0.1;
    }

    return Math.min(1, Math.max(0, confidence));
  }
}
```

### 11.2 GORM Matcher

```typescript
// packages/core/src/unified-provider/matching/gorm-matcher.ts

import type { PatternMatcher, MatchResult } from '../types.js';

export class GormMatcher implements PatternMatcher {
  readonly framework = 'gorm';
  readonly language = 'go';

  match(code: string): MatchResult[] {
    const results: MatchResult[] = [];

    // GORM query patterns
    const patterns = [
      // db.Find(&users)
      { regex: /\.Find\s*\(\s*&(\w+)/, operation: 'read' as const },
      // db.First(&user)
      { regex: /\.First\s*\(\s*&(\w+)/, operation: 'read' as const },
      // db.Create(&user)
      { regex: /\.Create\s*\(\s*&(\w+)/, operation: 'write' as const },
      // db.Save(&user)
      { regex: /\.Save\s*\(\s*&(\w+)/, operation: 'write' as const },
      // db.Delete(&user)
      { regex: /\.Delete\s*\(\s*&(\w+)/, operation: 'delete' as const },
      // db.Model(&User{})
      { regex: /\.Model\s*\(\s*&(\w+)\{\}/, operation: 'unknown' as const },
      // db.Table("users")
      { regex: /\.Table\s*\(\s*"(\w+)"/, operation: 'unknown' as const },
    ];

    for (const pattern of patterns) {
      let match;
      const regex = new RegExp(pattern.regex, 'g');
      
      while ((match = regex.exec(code)) !== null) {
        results.push({
          framework: this.framework,
          table: this.inferTable(match[1]!),
          operation: pattern.operation,
          confidence: 0.9,
          matchedText: match[0],
          index: match.index,
        });
      }
    }

    return results;
  }

  private inferTable(identifier: string): string {
    // Convert Go struct name to table name
    // User -> users, UserProfile -> user_profiles
    return identifier
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '')
      .replace(/s$/, '') + 's';  // Pluralize
  }
}
```

---

## Implementation Plan

### Milestone 1: Core Parser (1 week)
- [ ] Tree-sitter Go grammar integration
- [ ] Go loader and parser utilities
- [ ] Basic function/struct/interface extraction
- [ ] Unit tests with sample Go code

### Milestone 2: Hybrid Extractor (1 week)
- [ ] Go regex fallback patterns
- [ ] Hybrid extractor combining AST + regex
- [ ] Call extraction (including goroutines, defer)
- [ ] Import/export extraction

### Milestone 3: Data Access (1 week)
- [ ] GORM pattern detection
- [ ] sqlx pattern detection
- [ ] database/sql pattern detection
- [ ] Ent and Bun pattern detection
- [ ] Unified provider integration

### Milestone 4: Framework Detectors (1 week)
- [ ] Gin route detection
- [ ] Echo route detection
- [ ] Chi route detection
- [ ] net/http pattern detection
- [ ] Middleware detection

### Milestone 5: Test Topology (3 days)
- [ ] Go testing framework extraction
- [ ] testify support
- [ ] gomock support
- [ ] Table-driven test detection

### Milestone 6: CLI + MCP (3 days)
- [ ] `drift go` CLI commands
- [ ] `drift_go` MCP tool
- [ ] Documentation

### Milestone 7: Testing & Polish (1 week)
- [ ] Integration tests with real Go projects
- [ ] Performance optimization
- [ ] Edge case handling
- [ ] Demo project creation

---

## Example Outputs

### drift go routes

```
$ drift go routes

🛣️  Go HTTP Routes
────────────────────────────────────────────────────────────

gin (12 routes)
  GET     /api/users
    → handlers.GetUsers (handlers/users.go:15)
  POST    /api/users
    → handlers.CreateUser (handlers/users.go:45)
  GET     /api/users/:id
    → handlers.GetUser (handlers/users.go:78)
  PUT     /api/users/:id
    → handlers.UpdateUser (handlers/users.go:112)
  DELETE  /api/users/:id
    → handlers.DeleteUser (handlers/users.go:145)

echo (3 routes)
  GET     /health
    → handlers.HealthCheck (handlers/health.go:10)
  GET     /metrics
    → handlers.Metrics (handlers/metrics.go:15)

Total: 15 routes
```

### drift go errors

```
$ drift go errors

⚠️  Go Error Handling Analysis
────────────────────────────────────────────────────────────

Error Checks: 156
Wrapped Errors: 89
Sentinel Errors: 12
Custom Error Types: 5

Issues:
  ⚠ services/user.go:45
    Error returned without wrapping context
  ⚠ handlers/auth.go:78
    Error logged but not returned
  ⚠ repository/db.go:112
    Potential unchecked error from Close()
```

### MCP Tool Response

```json
{
  "action": "data-access",
  "result": {
    "total": 24,
    "byFramework": {
      "gorm": 18,
      "sqlx": 4,
      "raw-sql": 2
    },
    "byOperation": {
      "read": 15,
      "write": 7,
      "delete": 2
    },
    "accessPoints": [
      {
        "table": "users",
        "operation": "read",
        "framework": "gorm",
        "file": "repository/user.go",
        "line": 25
      }
    ],
    "tables": ["users", "orders", "products", "sessions"],
    "summary": "24 data access points across 4 tables"
  }
}
```

---

## Dependencies

### New Dependencies
```json
{
  "dependencies": {
    "tree-sitter-go": "^0.21.0"
  }
}
```

### Existing Infrastructure Used
- `HybridExtractorBase` - AST + regex fallback pattern
- `BaseDataAccessExtractor` - Data access extraction base
- `BaseTestExtractor` - Test topology extraction base
- `CallGraphBuilder` - Graph construction
- `UnifiedLanguageProvider` - Cross-language normalization

---

## Testing Strategy

### Unit Tests
- Go function/method extraction
- Struct/interface extraction
- Import parsing
- Call extraction (including goroutines)
- Error handling pattern detection
- Framework route detection

### Integration Tests
- Full Go project scan
- Call graph generation
- Data access mapping
- Pattern detection accuracy

### Test Projects
- Simple Go API (Gin)
- Microservice (Echo + GORM)
- CLI tool (Cobra)
- gRPC service

---

## Future Considerations

### Phase 2 Enhancements
- gRPC service definition parsing
- Protocol buffer integration
- Go generics full support
- CGo interop analysis
- Build constraint awareness

### Galaxy Visualization
- Packages as "systems"
- Structs as "planets"
- Interfaces as "space stations"
- Goroutines as "satellites"
- Channels as "communication links"
