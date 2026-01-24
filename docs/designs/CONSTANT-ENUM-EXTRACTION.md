# Constant & Enum Extraction Design

## Overview

Add comprehensive tracking of constants, enums, and exported values across all supported languages. This enables pattern detection for configuration consistency, magic number detection, and cross-file constant reference analysis.

## Goals

1. Extract all constant/enum definitions across 7 languages
2. Track where constants are used (references)
3. Detect patterns: config objects, feature flags, error codes, status enums
4. Enable "find all usages" for constants
5. Detect magic numbers/strings that should be constants
6. Full MCP tool suite for AI-assisted constant analysis
7. CLI commands for CI/CD integration
8. VSCode integration for inline constant insights
9. Pattern detection for constant consistency

---

## Enterprise Value Proposition

| Use Case | Value |
|----------|-------|
| **Config Drift Detection** | Find inconsistent config values across environments |
| **Magic Value Elimination** | Identify hardcoded values that should be constants |
| **Feature Flag Audit** | Track all feature flags and their usage |
| **API Contract Constants** | Ensure API status codes/error codes are consistent |
| **Security Audit** | Find hardcoded secrets, keys, credentials |
| **Dead Constant Detection** | Find unused constants for cleanup |
| **Refactoring Support** | Safe rename with full usage tracking |
| **Documentation Generation** | Auto-generate constant documentation |

---

## What to Extract Per Language

### TypeScript/JavaScript
```typescript
// Module-level const
export const API_URL = 'https://api.example.com';
export const MAX_RETRIES = 3;
export const CONFIG = { timeout: 5000, retries: 3 };

// Enums
export enum Status { PENDING, ACTIVE, COMPLETED }
export const Status = { PENDING: 0, ACTIVE: 1 } as const;

// Object.freeze patterns
export const ROLES = Object.freeze({ ADMIN: 'admin', USER: 'user' });
```

### Python
```python
# Module-level constants (UPPER_CASE convention)
MAX_CONNECTIONS = 100
API_ENDPOINT = "https://api.example.com"
DEFAULT_CONFIG = {"timeout": 30, "retries": 3}

# Enum classes
class Status(Enum):
    PENDING = "pending"
    ACTIVE = "active"

# typing.Final
IMMUTABLE_VALUE: Final[int] = 42
```

### Java
```java
// Static final fields
public static final int MAX_SIZE = 1000;
public static final String API_KEY = "key";

// Enums
public enum Status { PENDING, ACTIVE, COMPLETED }

// Interface constants
public interface Constants {
    String VERSION = "1.0.0";
}
```

### C#
```csharp
// const fields
public const int MaxRetries = 3;
public const string ApiUrl = "https://api.example.com";

// static readonly
public static readonly TimeSpan Timeout = TimeSpan.FromSeconds(30);

// Enums
public enum Status { Pending, Active, Completed }

// Flags enums
[Flags]
public enum Permissions { Read = 1, Write = 2, Execute = 4 }
```

### PHP
```php
// Class constants
class Config {
    public const MAX_RETRIES = 3;
    private const API_KEY = 'secret';
}

// define() constants
define('APP_VERSION', '1.0.0');

// Enums (PHP 8.1+)
enum Status: string {
    case Pending = 'pending';
    case Active = 'active';
}
```

### Go
```go
// const declarations
const MaxRetries = 3
const (
    StatusPending = iota
    StatusActive
    StatusCompleted
)

// Exported package-level vars (effectively constants)
var DefaultConfig = Config{Timeout: 30}
```

---

## Type Definitions

```typescript
// drift/packages/core/src/constants/types.ts

export type ConstantLanguage = 'typescript' | 'javascript' | 'python' | 'java' | 'csharp' | 'php' | 'go';

export type ConstantKind = 
  | 'primitive'      // string, number, boolean
  | 'enum'           // enum declaration
  | 'enum_member'    // individual enum value
  | 'object'         // const object/frozen object
  | 'array'          // const array
  | 'computed';      // value derived from expression

export type ConstantCategory =
  | 'config'         // configuration values
  | 'api'            // API endpoints, keys
  | 'status'         // status codes, states
  | 'error'          // error codes, messages
  | 'feature_flag'   // feature toggles
  | 'limit'          // limits, thresholds
  | 'regex'          // regex patterns
  | 'uncategorized'; // default

export interface ConstantExtraction {
  /** Unique ID: "file:name:line" */
  id: string;
  
  /** Constant name */
  name: string;
  
  /** Qualified name (Class.CONST or module.CONST) */
  qualifiedName: string;
  
  /** Source file */
  file: string;
  
  /** Line number */
  line: number;
  
  /** Language */
  language: ConstantLanguage;
  
  /** What kind of constant */
  kind: ConstantKind;
  
  /** Inferred category */
  category: ConstantCategory;
  
  /** Value if extractable (primitives only) */
  value?: string | number | boolean;
  
  /** Type annotation if present */
  type?: string;
  
  /** Is exported/public */
  isExported: boolean;
  
  /** Parent class/enum/interface name */
  parentName?: string;
  
  /** Documentation comment */
  docComment?: string;
  
  /** Decorators/attributes */
  decorators: string[];
}

export interface EnumExtraction {
  /** Unique ID */
  id: string;
  
  /** Enum name */
  name: string;
  
  /** Qualified name */
  qualifiedName: string;
  
  /** Source file */
  file: string;
  
  /** Line number */
  line: number;
  
  /** Language */
  language: ConstantLanguage;
  
  /** Is exported/public */
  isExported: boolean;
  
  /** Enum members */
  members: EnumMember[];
  
  /** Is flags enum (C#) */
  isFlags: boolean;
  
  /** Backing type (string, int, etc.) */
  backingType?: string;
  
  /** Documentation */
  docComment?: string;
}

export interface EnumMember {
  name: string;
  value?: string | number;
  line: number;
  docComment?: string;
}

export interface ConstantReference {
  /** The constant being referenced */
  constantId: string;
  
  /** File containing the reference */
  file: string;
  
  /** Line number */
  line: number;
  
  /** Column */
  column: number;
  
  /** Context: function/method containing the reference */
  containingFunction?: string;
}

export interface FileConstantResult {
  file: string;
  language: ConstantLanguage;
  constants: ConstantExtraction[];
  enums: EnumExtraction[];
  references: ConstantReference[];
  errors: string[];
}
```

---

## Architecture

```
drift/packages/core/src/constants/
├── types.ts                        # Type definitions
├── extractors/
│   ├── base-extractor.ts           # Abstract base with hybrid support
│   ├── typescript-extractor.ts     # TS/JS extraction
│   ├── python-extractor.ts
│   ├── java-extractor.ts
│   ├── csharp-extractor.ts
│   ├── php-extractor.ts
│   ├── go-extractor.ts
│   └── regex/                      # Fallback regex extractors
│       ├── base-regex.ts
│       ├── typescript-regex.ts
│       ├── python-regex.ts
│       ├── java-regex.ts
│       ├── csharp-regex.ts
│       ├── php-regex.ts
│       └── go-regex.ts
├── analysis/
│   ├── categorizer.ts              # Infer constant categories
│   ├── reference-finder.ts         # Find usages across codebase
│   ├── magic-detector.ts           # Find magic values
│   ├── dead-constant-detector.ts   # Find unused constants
│   ├── consistency-analyzer.ts     # Find inconsistent values
│   └── security-scanner.ts         # Find hardcoded secrets
├── store/
│   ├── constant-store.ts           # Main persistence layer
│   ├── constant-shard-store.ts     # Per-file sharding
│   └── constant-index.ts           # Fast lookups
├── integration/
│   ├── scanner-adapter.ts          # Hook into main scanner
│   ├── callgraph-adapter.ts        # Link to call graph
│   └── pattern-adapter.ts          # Feed into pattern system
└── index.ts                        # Public API

drift/packages/cli/src/commands/
└── constants.ts                    # CLI command

drift/packages/mcp/src/tools/analysis/
└── constants.ts                    # MCP tools

drift/packages/vscode/src/views/
└── constants-tree-provider.ts      # VSCode tree view

drift/packages/detectors/src/config/
├── constant-consistency-detector.ts
├── magic-value-detector.ts
└── hardcoded-secret-detector.ts
```

---

## Extraction Strategy Per Language

### TypeScript/JavaScript (tree-sitter + TS compiler API)

```typescript
// Node types to capture:
// - variable_declaration with const keyword
// - lexical_declaration (const)
// - enum_declaration
// - export_statement containing above

// Tree-sitter approach:
case 'lexical_declaration':
  if (node.children.some(c => c.type === 'const')) {
    for (const declarator of node.children.filter(c => c.type === 'variable_declarator')) {
      extractConstant(declarator);
    }
  }
  break;

case 'enum_declaration':
  extractEnum(node);
  break;
```

### Python (tree-sitter)

```typescript
// Node types:
// - expression_statement with assignment to UPPER_CASE identifier
// - class_definition extending Enum
// - annotated_assignment with Final type

case 'expression_statement':
  const assignment = node.children.find(c => c.type === 'assignment');
  if (assignment) {
    const name = assignment.childForFieldName('left')?.text;
    if (name && isUpperCase(name)) {
      extractConstant(assignment);
    }
  }
  break;

case 'class_definition':
  if (extendsEnum(node)) {
    extractPythonEnum(node);
  }
  break;
```

### Java (tree-sitter)

```typescript
// Node types:
// - field_declaration with static final modifiers
// - enum_declaration
// - interface constants

case 'field_declaration':
  if (hasModifiers(node, ['static', 'final'])) {
    extractConstant(node);
  }
  break;

case 'enum_declaration':
  extractEnum(node);
  break;
```

### C# (tree-sitter)

```typescript
// Node types:
// - field_declaration with const modifier
// - field_declaration with static readonly
// - enum_declaration

case 'field_declaration':
  if (hasModifier(node, 'const') || hasModifiers(node, ['static', 'readonly'])) {
    extractConstant(node);
  }
  break;

case 'enum_declaration':
  extractEnum(node);
  break;
```

### PHP (tree-sitter)

```typescript
// Node types:
// - const_declaration (class constants)
// - function_call_expression for define()
// - enum_declaration (PHP 8.1+)

case 'const_declaration':
  extractClassConstant(node);
  break;

case 'function_call_expression':
  if (node.childForFieldName('function')?.text === 'define') {
    extractDefineConstant(node);
  }
  break;

case 'enum_declaration':
  extractEnum(node);
  break;
```

### Go (tree-sitter)

```typescript
// Node types:
// - const_declaration
// - var_declaration at package level (exported)

case 'const_declaration':
  for (const spec of node.children.filter(c => c.type === 'const_spec')) {
    extractConstant(spec);
  }
  break;

case 'var_declaration':
  if (isPackageLevel(node) && isExported(node)) {
    extractPackageVar(node);
  }
  break;
```

---

## Category Inference

```typescript
// analysis/categorizer.ts

export function inferCategory(constant: ConstantExtraction): ConstantCategory {
  const name = constant.name.toLowerCase();
  const value = String(constant.value ?? '').toLowerCase();
  
  // Config patterns
  if (name.includes('config') || name.includes('settings') || name.includes('options')) {
    return 'config';
  }
  
  // API patterns
  if (name.includes('url') || name.includes('endpoint') || name.includes('api') ||
      value.startsWith('http') || name.includes('key') || name.includes('secret')) {
    return 'api';
  }
  
  // Status patterns
  if (name.includes('status') || name.includes('state') || 
      constant.parentName?.toLowerCase().includes('status')) {
    return 'status';
  }
  
  // Error patterns
  if (name.includes('error') || name.includes('err_') || name.startsWith('e_')) {
    return 'error';
  }
  
  // Feature flag patterns
  if (name.includes('feature') || name.includes('flag') || name.includes('enable') ||
      name.includes('disable') || name.startsWith('ff_')) {
    return 'feature_flag';
  }
  
  // Limit patterns
  if (name.includes('max') || name.includes('min') || name.includes('limit') ||
      name.includes('threshold') || name.includes('timeout') || name.includes('size')) {
    return 'limit';
  }
  
  // Regex patterns
  if (name.includes('regex') || name.includes('pattern') || 
      (typeof constant.value === 'string' && constant.value.startsWith('/'))) {
    return 'regex';
  }
  
  return 'uncategorized';
}
```

---

## Storage Schema

```typescript
// Store in .drift/lake/constants/

// Per-file shards: .drift/lake/constants/files/{hash}.json
interface ConstantFileShard {
  file: string;
  hash: string;
  extractedAt: string;
  constants: ConstantExtraction[];
  enums: EnumExtraction[];
}

// Index: .drift/lake/constants/index.json
interface ConstantIndex {
  version: '1.0';
  generatedAt: string;
  byCategory: Record<ConstantCategory, string[]>;  // constant IDs
  byFile: Record<string, string[]>;
  byName: Record<string, string[]>;  // for quick lookup
  stats: {
    totalConstants: number;
    totalEnums: number;
    byLanguage: Record<ConstantLanguage, number>;
    byCategory: Record<ConstantCategory, number>;
  };
}
```

---

## Integration Points

### 1. Scanner Integration
Add to existing file scanning pipeline:

```typescript
// In scanner-service.ts or detector-worker.ts
const constantResult = await constantExtractor.extract(filePath, content, language);
await constantStore.saveFileConstants(constantResult);
```

### 2. Call Graph Integration
Link constants to functions that use them:

```typescript
// In FileExtractionResult, add:
interface FileExtractionResult {
  // ... existing fields
  constants: ConstantExtraction[];
  enums: EnumExtraction[];
}
```

### 3. Pattern Detection
Create detectors for constant patterns:

```typescript
// detectors/src/config/constant-patterns-detector.ts
- Detect inconsistent config patterns
- Find magic numbers that should be constants
- Identify unused constants
```

### 4. MCP Tools
Add constant-related tools:

```typescript
// drift_constants_list - List all constants with filtering
// drift_constant_usages - Find where a constant is used
// drift_magic_values - Find magic numbers/strings
```

---

## Implementation Phases

### Phase 1: Core Infrastructure (3-4 days)
- [ ] Create `constants/types.ts` with all type definitions
- [ ] Implement `constant-store.ts` with sharding
- [ ] Implement `constant-index.ts` for fast lookups
- [ ] Create base extractor with hybrid support
- [ ] Unit tests for store and types

### Phase 2: Language Extractors (5-6 days)
- [ ] TypeScript/JavaScript extractor (tree-sitter + TS compiler)
- [ ] Python extractor (tree-sitter)
- [ ] Java extractor (tree-sitter)
- [ ] C# extractor (tree-sitter)
- [ ] PHP extractor (tree-sitter)
- [ ] Go extractor (tree-sitter)
- [ ] Regex fallback extractors for each language
- [ ] Unit tests for each extractor

### Phase 3: Analysis Engine (4-5 days)
- [ ] Category inference (`categorizer.ts`)
- [ ] Reference finder (`reference-finder.ts`)
- [ ] Magic value detector (`magic-detector.ts`)
- [ ] Dead constant detector (`dead-constant-detector.ts`)
- [ ] Consistency analyzer (`consistency-analyzer.ts`)
- [ ] Security scanner (`security-scanner.ts`)
- [ ] Integration tests

### Phase 4: Scanner Integration (2-3 days)
- [ ] Hook into main scanner pipeline
- [ ] Call graph integration
- [ ] Pattern system integration
- [ ] Incremental update support

### Phase 5: MCP Tools (2-3 days)
- [ ] Implement `drift_constants` tool with all actions
- [ ] Add to enterprise server
- [ ] Response formatting and pagination
- [ ] Tool documentation

### Phase 6: CLI Commands (2 days)
- [ ] Implement `drift constants` command
- [ ] All subcommands (status, list, get, usages, magic, dead, secrets, inconsistent, export)
- [ ] CI/CD exit codes
- [ ] Output formatting (table, json, csv)

### Phase 7: VSCode Integration (3-4 days)
- [ ] Constants tree view provider
- [ ] Inline decorations
- [ ] CodeLens provider
- [ ] Hover provider enhancements
- [ ] Commands (find usages, extract, rename)

### Phase 8: Pattern Detectors (2-3 days)
- [ ] Constant consistency detector
- [ ] Magic value detector
- [ ] Hardcoded secret detector
- [ ] Integration with pattern system

### Phase 9: Dashboard (2-3 days)
- [ ] Constants tab component
- [ ] Overview cards and charts
- [ ] Searchable constant list
- [ ] Issue tables with actions
- [ ] Galaxy layer integration (optional)

### Phase 10: Documentation & Polish (1-2 days)
- [ ] Wiki documentation
- [ ] MCP tools reference update
- [ ] CLI reference update
- [ ] Example configurations

**Total Estimated Time: 26-35 days**

---

## Testing Strategy

### Unit Tests
- Each extractor: 20+ test cases per language
- Store operations: CRUD, sharding, indexing
- Analysis functions: categorization, detection

### Integration Tests
- Full scan of demo projects
- Cross-language constant tracking
- Reference resolution accuracy

### E2E Tests
- CLI command outputs
- MCP tool responses
- VSCode extension functionality

### Performance Tests
- Large codebase (10k+ files)
- Incremental update speed
- Memory usage under load

---

## Example Output

```json
{
  "constants": [
    {
      "id": "src/config.ts:API_URL:5",
      "name": "API_URL",
      "qualifiedName": "API_URL",
      "file": "src/config.ts",
      "line": 5,
      "language": "typescript",
      "kind": "primitive",
      "category": "api",
      "value": "https://api.example.com",
      "type": "string",
      "isExported": true,
      "decorators": []
    }
  ],
  "enums": [
    {
      "id": "src/types.ts:Status:10",
      "name": "Status",
      "qualifiedName": "Status",
      "file": "src/types.ts",
      "line": 10,
      "language": "typescript",
      "isExported": true,
      "members": [
        { "name": "PENDING", "value": 0, "line": 11 },
        { "name": "ACTIVE", "value": 1, "line": 12 },
        { "name": "COMPLETED", "value": 2, "line": 13 }
      ],
      "isFlags": false
    }
  ]
}
```

---

## Open Questions

1. **Scope**: Should we track local constants (inside functions) or only module/class level?
   - Recommendation: Start with module/class level only

2. **Value extraction**: How deep to go with object/array values?
   - Recommendation: Store stringified representation up to 500 chars

3. **Reference tracking**: Full reference tracking is expensive. Enable by flag?
   - Recommendation: Make it opt-in via config

4. **Magic value detection**: What thresholds for "magic"?
   - Recommendation: Numbers > 1 used more than once, strings > 5 chars used more than once

---

## MCP Tools Specification

### drift_constants (Primary Tool)

Multi-action tool for constant analysis, following existing drift patterns.

```typescript
// drift/packages/mcp/src/tools/analysis/constants.ts

interface ConstantsToolInput {
  action: 'status' | 'list' | 'get' | 'usages' | 'magic' | 'dead' | 'secrets' | 'inconsistent';
  
  // For 'list' action
  category?: ConstantCategory;
  language?: ConstantLanguage;
  file?: string;
  search?: string;
  exported?: boolean;
  limit?: number;
  cursor?: string;
  
  // For 'get' action
  id?: string;
  name?: string;
  
  // For 'usages' action
  constantId?: string;
  maxDepth?: number;
  
  // For 'magic' action
  minOccurrences?: number;
  includeStrings?: boolean;
  includeNumbers?: boolean;
  
  // For 'secrets' action
  severity?: 'low' | 'medium' | 'high' | 'critical';
}
```

#### Action: status
Get overview of constants in the codebase.

```json
{
  "action": "status"
}
```

Response:
```json
{
  "totalConstants": 847,
  "totalEnums": 42,
  "byLanguage": {
    "typescript": 523,
    "python": 124,
    "java": 89,
    "csharp": 67,
    "php": 34,
    "go": 10
  },
  "byCategory": {
    "config": 156,
    "api": 89,
    "status": 67,
    "error": 45,
    "feature_flag": 23,
    "limit": 78,
    "regex": 12,
    "uncategorized": 377
  },
  "issues": {
    "magicValues": 34,
    "deadConstants": 12,
    "potentialSecrets": 3,
    "inconsistentValues": 8
  },
  "lastScanAt": "2024-01-15T10:30:00Z"
}
```

#### Action: list
List constants with filtering and pagination.

```json
{
  "action": "list",
  "category": "config",
  "language": "typescript",
  "exported": true,
  "limit": 20
}
```

Response:
```json
{
  "constants": [
    {
      "id": "src/config.ts:API_URL:5",
      "name": "API_URL",
      "qualifiedName": "API_URL",
      "file": "src/config.ts",
      "line": 5,
      "language": "typescript",
      "kind": "primitive",
      "category": "api",
      "value": "https://api.example.com",
      "isExported": true,
      "usageCount": 23
    }
  ],
  "enums": [
    {
      "id": "src/types.ts:Status:10",
      "name": "Status",
      "memberCount": 5,
      "file": "src/types.ts",
      "line": 10,
      "usageCount": 45
    }
  ],
  "total": 156,
  "cursor": "eyJvZmZzZXQiOjIwfQ=="
}
```

#### Action: get
Get detailed information about a specific constant or enum.

```json
{
  "action": "get",
  "id": "src/config.ts:API_URL:5"
}
```

Response:
```json
{
  "constant": {
    "id": "src/config.ts:API_URL:5",
    "name": "API_URL",
    "qualifiedName": "API_URL",
    "file": "src/config.ts",
    "line": 5,
    "language": "typescript",
    "kind": "primitive",
    "category": "api",
    "value": "https://api.example.com",
    "type": "string",
    "isExported": true,
    "docComment": "Base URL for API requests",
    "decorators": []
  },
  "usages": [
    {
      "file": "src/api/client.ts",
      "line": 12,
      "context": "const client = axios.create({ baseURL: API_URL });",
      "containingFunction": "createApiClient"
    }
  ],
  "usageCount": 23,
  "relatedConstants": [
    {
      "id": "src/config.ts:API_TIMEOUT:6",
      "name": "API_TIMEOUT",
      "reason": "same_file"
    }
  ]
}
```

#### Action: usages
Find all usages of a constant across the codebase.

```json
{
  "action": "usages",
  "constantId": "src/config.ts:API_URL:5",
  "maxDepth": 3
}
```

Response:
```json
{
  "constant": {
    "id": "src/config.ts:API_URL:5",
    "name": "API_URL"
  },
  "directUsages": [
    {
      "file": "src/api/client.ts",
      "line": 12,
      "column": 45,
      "context": "baseURL: API_URL",
      "containingFunction": "createApiClient"
    }
  ],
  "indirectUsages": [
    {
      "file": "src/services/user-service.ts",
      "line": 8,
      "reason": "calls createApiClient which uses API_URL",
      "depth": 2
    }
  ],
  "totalUsages": 23,
  "entryPointsAffected": ["src/api/index.ts", "src/main.ts"]
}
```

#### Action: magic
Find magic values that should be constants.

```json
{
  "action": "magic",
  "minOccurrences": 2,
  "includeStrings": true,
  "includeNumbers": true
}
```

Response:
```json
{
  "magicValues": [
    {
      "value": 3600,
      "type": "number",
      "occurrences": [
        { "file": "src/cache.ts", "line": 15, "context": "ttl: 3600" },
        { "file": "src/session.ts", "line": 8, "context": "maxAge: 3600" },
        { "file": "src/token.ts", "line": 22, "context": "expiresIn: 3600" }
      ],
      "suggestedName": "ONE_HOUR_SECONDS",
      "suggestedCategory": "limit",
      "severity": "medium"
    },
    {
      "value": "application/json",
      "type": "string",
      "occurrences": [
        { "file": "src/api/client.ts", "line": 10 },
        { "file": "src/middleware/parser.ts", "line": 5 }
      ],
      "suggestedName": "CONTENT_TYPE_JSON",
      "suggestedCategory": "api",
      "severity": "low"
    }
  ],
  "total": 34,
  "bySeverity": { "high": 5, "medium": 12, "low": 17 }
}
```

#### Action: dead
Find unused constants.

```json
{
  "action": "dead"
}
```

Response:
```json
{
  "deadConstants": [
    {
      "id": "src/config.ts:OLD_API_URL:8",
      "name": "OLD_API_URL",
      "file": "src/config.ts",
      "line": 8,
      "lastModified": "2023-06-15",
      "confidence": 0.95,
      "reason": "no_references_found"
    }
  ],
  "total": 12,
  "potentialSavings": "~150 lines"
}
```

#### Action: secrets
Find potential hardcoded secrets.

```json
{
  "action": "secrets",
  "severity": "high"
}
```

Response:
```json
{
  "potentialSecrets": [
    {
      "id": "src/config.ts:API_KEY:12",
      "name": "API_KEY",
      "file": "src/config.ts",
      "line": 12,
      "value": "sk_live_****",
      "secretType": "api_key",
      "severity": "critical",
      "recommendation": "Move to environment variable"
    }
  ],
  "total": 3,
  "bySeverity": { "critical": 1, "high": 2 }
}
```

#### Action: inconsistent
Find constants with inconsistent values across the codebase.

```json
{
  "action": "inconsistent"
}
```

Response:
```json
{
  "inconsistencies": [
    {
      "name": "MAX_RETRIES",
      "instances": [
        { "file": "src/api/client.ts", "line": 5, "value": 3 },
        { "file": "src/queue/worker.ts", "line": 12, "value": 5 },
        { "file": "src/email/sender.ts", "line": 8, "value": 3 }
      ],
      "recommendation": "Consolidate to single constant in shared config"
    }
  ],
  "total": 8
}
```

---

## CLI Commands

### drift constants

```bash
# Overview
drift constants status

# List constants
drift constants list [--category <cat>] [--language <lang>] [--exported] [--json]

# Get constant details
drift constants get <id-or-name>

# Find usages
drift constants usages <id-or-name> [--depth <n>]

# Find magic values
drift constants magic [--min-occurrences <n>] [--strings] [--numbers]

# Find dead constants
drift constants dead [--json]

# Security scan for secrets
drift constants secrets [--severity <level>] [--fail-on <level>]

# Find inconsistencies
drift constants inconsistent [--json]

# Export all constants
drift constants export [--format json|csv|markdown] [--output <file>]
```

#### Example Output: drift constants status

```
Constants Analysis
==================

Total Constants: 847
Total Enums: 42

By Language:
  TypeScript  ████████████████████  523 (62%)
  Python      █████                 124 (15%)
  Java        ████                   89 (10%)
  C#          ███                    67 (8%)
  PHP         ██                     34 (4%)
  Go          █                      10 (1%)

By Category:
  config        156
  api            89
  status         67
  error          45
  feature_flag   23
  limit          78
  regex          12
  uncategorized 377

Issues Found:
  ⚠️  Magic values:        34
  🗑️  Dead constants:      12
  🔐 Potential secrets:    3
  ⚡ Inconsistent values:  8

Run 'drift constants magic' for magic value details
Run 'drift constants secrets' for security scan
```

#### Example Output: drift constants magic

```
Magic Values Detected
=====================

🔢 Numbers (17 found):

  3600 (3 occurrences) - suggested: ONE_HOUR_SECONDS
    src/cache.ts:15        ttl: 3600
    src/session.ts:8       maxAge: 3600
    src/token.ts:22        expiresIn: 3600

  86400 (2 occurrences) - suggested: ONE_DAY_SECONDS
    src/cleanup.ts:10      interval: 86400
    src/backup.ts:5        frequency: 86400

📝 Strings (17 found):

  "application/json" (4 occurrences) - suggested: CONTENT_TYPE_JSON
    src/api/client.ts:10
    src/middleware/parser.ts:5
    src/utils/fetch.ts:8
    src/webhook/handler.ts:15

Run 'drift constants magic --json' for machine-readable output
```

#### CI/CD Integration

```yaml
# .github/workflows/constants-check.yml
- name: Check for hardcoded secrets
  run: drift constants secrets --fail-on high

- name: Check for magic values
  run: drift constants magic --min-occurrences 3 --fail-on-count 10
```

---

## VSCode Integration

### Constants Tree View

Add a new tree view in the Drift panel showing constants organized by category.

```typescript
// drift/packages/vscode/src/views/constants-tree-provider.ts

export class ConstantsTreeProvider implements vscode.TreeDataProvider<ConstantTreeItem> {
  // Tree structure:
  // 📁 Constants
  //   📁 Config (156)
  //     📄 API_URL (src/config.ts:5)
  //     📄 DATABASE_URL (src/config.ts:6)
  //   📁 Feature Flags (23)
  //     📄 ENABLE_NEW_UI (src/flags.ts:10)
  //   📁 Enums (42)
  //     📄 Status (src/types.ts:10)
  //   ⚠️ Issues
  //     🔐 Potential Secrets (3)
  //     🗑️ Dead Constants (12)
  //     ⚡ Magic Values (34)
}
```

### Inline Decorations

Show constant usage count and category inline.

```typescript
// In decoration-controller.ts
// Show: "API_URL" → "API_URL (23 usages, api)"
```

### CodeLens

Add CodeLens above constant declarations.

```typescript
// "23 usages | Find all | Rename"
export const API_URL = 'https://api.example.com';
```

### Hover Information

Enhanced hover showing:
- Category
- Usage count
- Where it's used (top 5)
- Related constants

### Commands

```typescript
// package.json contributions
"commands": [
  { "command": "drift.constants.findUsages", "title": "Find Constant Usages" },
  { "command": "drift.constants.showMagicValues", "title": "Show Magic Values" },
  { "command": "drift.constants.extractConstant", "title": "Extract to Constant" },
  { "command": "drift.constants.renameConstant", "title": "Rename Constant (Safe)" }
]
```

---

## Pattern Detectors

### 1. Constant Consistency Detector

```typescript
// drift/packages/detectors/src/config/constant-consistency-detector.ts

export class ConstantConsistencyDetector extends UnifiedDetector {
  // Detects:
  // - Same constant name with different values
  // - Similar constant names (typos)
  // - Constants that should be consolidated
  
  patterns = [
    {
      id: 'inconsistent-constant-value',
      severity: 'warning',
      message: 'Constant {name} has different values in {files}'
    },
    {
      id: 'duplicate-constant-definition',
      severity: 'info',
      message: 'Constant {name} is defined in multiple files'
    }
  ];
}
```

### 2. Magic Value Detector

```typescript
// drift/packages/detectors/src/config/magic-value-detector.ts

export class MagicValueDetector extends UnifiedDetector {
  // Detects:
  // - Repeated numeric literals
  // - Repeated string literals
  // - Hardcoded URLs, paths, etc.
  
  patterns = [
    {
      id: 'magic-number',
      severity: 'info',
      message: 'Magic number {value} used {count} times'
    },
    {
      id: 'magic-string',
      severity: 'info', 
      message: 'Magic string "{value}" used {count} times'
    }
  ];
}
```

### 3. Hardcoded Secret Detector

```typescript
// drift/packages/detectors/src/config/hardcoded-secret-detector.ts

export class HardcodedSecretDetector extends UnifiedDetector {
  // Detects:
  // - API keys (sk_live_, pk_live_, etc.)
  // - Passwords in constants
  // - Private keys
  // - Connection strings with credentials
  
  secretPatterns = [
    { pattern: /sk_live_[a-zA-Z0-9]+/, type: 'stripe_secret_key', severity: 'critical' },
    { pattern: /-----BEGIN.*PRIVATE KEY-----/, type: 'private_key', severity: 'critical' },
    { pattern: /password\s*[:=]\s*['"][^'"]+['"]/, type: 'password', severity: 'high' },
    { pattern: /mongodb\+srv:\/\/[^:]+:[^@]+@/, type: 'connection_string', severity: 'high' },
  ];
}
```

---

## Dashboard Integration

### Constants Tab

Add a new tab in the Drift dashboard for constant analysis.

```typescript
// drift/packages/dashboard/src/client/components/ConstantsTab.tsx

// Features:
// - Overview cards (total, by category, issues)
// - Searchable/filterable constant list
// - Category breakdown chart
// - Magic values table with "Extract" action
// - Dead constants table with "Remove" action
// - Security issues with severity badges
```

### Galaxy Integration

Show constants as a separate layer in the Galaxy visualization.

```typescript
// Constants appear as small satellites around their containing files
// Color-coded by category
// Size based on usage count
// Red glow for security issues
```

---

## Call Graph Integration

Link constants to the call graph for impact analysis.

```typescript
// In FileExtractionResult, add:
interface FileExtractionResult {
  // ... existing fields
  constants: ConstantExtraction[];
  enums: EnumExtraction[];
  constantReferences: ConstantReference[];
}

// Enable queries like:
// "What entry points are affected if I change API_URL?"
// "What functions use this feature flag?"
```

---

## Configuration

```json
// .drift/config.json
{
  "constants": {
    "enabled": true,
    "trackReferences": true,
    "categories": {
      "custom": ["MY_CUSTOM_CATEGORY"]
    },
    "magicValues": {
      "minOccurrences": 2,
      "ignoreValues": [0, 1, -1, "", "true", "false"],
      "ignorePatterns": ["test", "spec", "mock"]
    },
    "secrets": {
      "enabled": true,
      "customPatterns": [
        { "pattern": "INTERNAL_.*_KEY", "severity": "high" }
      ],
      "allowlist": ["src/test/**"]
    }
  }
}
```


---

## Open Questions

1. **Scope**: Should we track local constants (inside functions) or only module/class level?
   - Recommendation: Start with module/class level only, add local as opt-in later

2. **Value extraction**: How deep to go with object/array values?
   - Recommendation: Store stringified representation up to 500 chars

3. **Reference tracking**: Full reference tracking is expensive. Enable by flag?
   - Recommendation: Enable by default, add `--skip-references` for fast scans

4. **Magic value detection**: What thresholds for "magic"?
   - Recommendation: Numbers > 1 used more than once, strings > 5 chars used more than once

5. **Secret detection**: How to handle false positives?
   - Recommendation: Allowlist patterns, severity levels, manual review workflow

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Extraction accuracy | >95% of constants detected |
| Reference accuracy | >90% of usages found |
| False positive rate (secrets) | <10% |
| Scan performance | <5s for 1000 files |
| Incremental update | <500ms per file change |

---

## Dependencies

- Tree-sitter parsers for all languages (already available)
- Existing scanner infrastructure
- Pattern system for detector integration
- Call graph for impact analysis

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Performance impact on large codebases | Sharded storage, incremental updates, lazy loading |
| False positives in secret detection | Configurable patterns, allowlists, severity levels |
| Complex object constants | Limit depth, store hash for comparison |
| Cross-file reference resolution | Leverage existing import tracking |

---

## Future Enhancements

1. **AI-Assisted Naming**: Suggest better constant names using LLM
2. **Auto-Refactoring**: One-click extraction of magic values to constants
3. **Constant Documentation**: Auto-generate JSDoc/docstrings
4. **Version Tracking**: Track constant value changes over time
5. **Team Standards**: Enforce naming conventions per team config
