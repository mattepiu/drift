# MCP Tools Reference

Drift provides **50 MCP tools** organized in a **7-layer architecture** designed for efficient AI agent interaction. This architecture minimizes token usage while maximizing capability — a model for how MCP servers should be built.

## Architecture Philosophy

Drift's MCP architecture follows key principles that make it the gold standard for AI tool design:

### 1. Layered Tool Design

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 1: ORCHESTRATION                                          │
│  "Tell me what you want to do, I'll give you everything"         │
│  drift_context, drift_package_context                            │
├─────────────────────────────────────────────────────────────────┤
│  Layer 2: DISCOVERY                                              │
│  "Quick health check, what's available?"                         │
│  drift_status, drift_capabilities, drift_projects                │
├─────────────────────────────────────────────────────────────────┤
│  Layer 3: SURGICAL                                               │
│  "I need exactly this one thing, nothing more"                   │
│  12 ultra-focused tools (200-500 tokens each)                    │
├─────────────────────────────────────────────────────────────────┤
│  Layer 4: EXPLORATION                                            │
│  "Let me browse and filter"                                      │
│  drift_patterns_list, drift_security_summary, etc.               │
├─────────────────────────────────────────────────────────────────┤
│  Layer 5: DETAIL                                                 │
│  "Deep dive into this specific thing"                            │
│  drift_pattern_get, drift_code_examples, etc.                    │
├─────────────────────────────────────────────────────────────────┤
│  Layer 6: ANALYSIS                                               │
│  "Run complex analysis"                                          │
│  drift_test_topology, drift_coupling, drift_error_handling       │
├─────────────────────────────────────────────────────────────────┤
│  Layer 7: GENERATION                                             │
│  "Help me write/validate code"                                   │
│  drift_suggest_changes, drift_validate_change, drift_explain     │
└─────────────────────────────────────────────────────────────────┘
```

### 2. Token Budget Awareness

Every tool is designed with token budgets:

| Layer | Target Tokens | Max Tokens | Purpose |
|-------|---------------|------------|---------|
| Orchestration | 1000-2000 | 4000 | Comprehensive context |
| Discovery | 200-500 | 1000 | Quick status |
| Surgical | 200-500 | 800 | Precise lookups |
| Exploration | 500-1000 | 2000 | Paginated lists |
| Detail | 500-1500 | 3000 | Deep dives |
| Analysis | 1000-2000 | 4000 | Complex analysis |
| Generation | 500-1500 | 3000 | Code suggestions |

### 3. Response Structure

Every response follows a consistent structure:

```json
{
  "summary": "One-line description of what was found",
  "data": { /* The actual payload */ },
  "pagination": {
    "cursor": "next_page_token",
    "hasMore": true,
    "totalCount": 150,
    "pageSize": 20
  },
  "hints": {
    "nextActions": ["Suggested next steps"],
    "relatedTools": ["drift_tool_1", "drift_tool_2"],
    "warnings": ["Important warnings"]
  },
  "meta": {
    "requestId": "req_abc123",
    "durationMs": 45,
    "cached": false,
    "tokenEstimate": 850
  }
}
```

### 4. Smart Caching & Rate Limiting

- **Response caching** — Repeated queries return cached results
- **Rate limiting** — Prevents runaway tool calls
- **Metrics collection** — Track usage patterns

---

## Layer 1: Orchestration

**The recommended starting point.** These tools understand your intent and return curated context.

### `drift_context`

The "final boss" tool. Instead of making the AI figure out which tools to call, this tool understands intent and returns everything needed.

```json
{
  "intent": "add_feature",
  "focus": "user authentication",
  "question": "How do I add a new auth endpoint?",
  "project": "backend"
}
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `intent` | enum | Yes | What you're trying to do |
| `focus` | string | Yes | The area you're working with |
| `question` | string | No | Specific question to answer |
| `project` | string | No | Target a specific registered project |

**Intent Options:**
- `add_feature` — Adding new functionality
- `fix_bug` — Fixing a bug or issue
- `refactor` — Improving code structure
- `security_audit` — Reviewing for security issues
- `understand_code` — Learning how something works
- `add_test` — Adding test coverage

**Returns:**

```json
{
  "summary": "Adding feature in 'user authentication'. Found 5 relevant patterns...",
  "relevantPatterns": [
    {
      "id": "auth-jwt-pattern",
      "name": "JWT Authentication",
      "category": "auth",
      "why": "Directly related to 'authentication' - this is the established pattern",
      "example": "// Code example from your codebase",
      "confidence": 0.92,
      "locationCount": 12
    }
  ],
  "suggestedFiles": [
    {
      "file": "src/auth/login.ts",
      "reason": "Matches focus area",
      "patterns": ["JWT Authentication", "Error Handling"],
      "risk": "medium"
    }
  ],
  "guidance": {
    "keyInsights": [
      "This codebase has established API patterns - follow them for consistency",
      "Error handling patterns exist - use the established error types"
    ],
    "commonMistakes": [
      "Don't create new patterns when existing ones apply",
      "Remember to add appropriate logging"
    ],
    "decisionPoints": [
      "Decide if this feature needs its own module or fits in existing structure"
    ]
  },
  "warnings": [
    {
      "type": "data_access",
      "message": "src/auth/login.ts accesses sensitive data: users.password_hash",
      "severity": "warning"
    }
  ],
  "confidence": {
    "patternCoverage": 80,
    "dataFreshness": "Current session",
    "limitations": []
  },
  "deeperDive": [
    {
      "tool": "drift_code_examples",
      "args": { "pattern": "auth-jwt-pattern", "maxExamples": 3 },
      "reason": "See more examples of 'JWT Authentication' pattern"
    }
  ],
  "semanticInsights": {
    "frameworks": ["Express", "Prisma"],
    "entryPoints": [
      { "name": "login", "file": "src/auth/login.ts", "type": "route", "path": "/api/auth/login" }
    ],
    "dataAccessors": [
      { "name": "findUser", "file": "src/repositories/user.ts", "tables": ["users"] }
    ]
  },
  "constraints": [
    {
      "id": "auth-required",
      "name": "Authentication Required",
      "enforcement": "error",
      "guidance": "All /api/* routes must use @RequireAuth middleware"
    }
  ]
}
```

### `drift_package_context`

Get context for a specific package or module.

```json
{
  "package": "src/auth",
  "depth": "detailed"
}
```

---

## Layer 2: Discovery

Quick, lightweight tools for health checks and capability discovery.

### `drift_status`

Codebase health snapshot. Always fast, always lightweight.

```json
{}
```

**Returns:**

```json
{
  "summary": "47 patterns (12 approved), health score 72/100",
  "data": {
    "patterns": {
      "total": 47,
      "approved": 12,
      "discovered": 32,
      "ignored": 3
    },
    "categories": {
      "api": 12,
      "auth": 8,
      "errors": 15,
      "data-access": 12
    },
    "healthScore": 72,
    "criticalIssues": []
  }
}
```

### `drift_capabilities`

List all Drift capabilities and when to use each tool.

```json
{}
```

**Returns:** Organized guide to all 50 available tools.

### `drift_projects`

Manage registered projects for multi-project workflows.

```json
{
  "action": "list"
}
```

**Actions:** `list`, `info`, `switch`, `recent`, `register`

---

## Layer 3: Surgical Tools

**12 ultra-focused tools** designed for minimal token usage. Each tool does exactly one thing.

### `drift_signature`

Get function signature without reading entire files.

```json
{
  "symbol": "handleLogin",
  "file": "src/auth/login.ts",
  "includeDocs": true
}
```

**Returns:**

```json
{
  "summary": "Found function 'handleLogin' in src/auth/login.ts:45",
  "data": {
    "found": true,
    "signatures": [{
      "file": "src/auth/login.ts",
      "line": 45,
      "kind": "function",
      "signature": "export async function handleLogin(email: string, password: string): Promise<User>",
      "parameters": [
        { "name": "email", "type": "string", "required": true },
        { "name": "password", "type": "string", "required": true }
      ],
      "returnType": "Promise<User>",
      "exported": true
    }]
  }
}
```

### `drift_callers`

Lightweight "who calls this function" lookup.

```json
{
  "function": "validateToken",
  "transitive": true,
  "maxDepth": 2
}
```

**Returns:**

```json
{
  "summary": "'validateToken' has 5 direct callers (public API)",
  "data": {
    "target": { "function": "validateToken", "file": "src/auth/token.ts", "line": 23 },
    "directCallers": [
      { "function": "requireAuth", "file": "src/middleware/auth.ts", "line": 12, "callSite": 34 }
    ],
    "transitiveCallers": [
      { "function": "handleRequest", "file": "src/api/handler.ts", "depth": 2, "path": ["validateToken", "requireAuth"] }
    ],
    "stats": {
      "directCount": 5,
      "transitiveCount": 12,
      "isPublicApi": true,
      "isWidelyUsed": true
    }
  }
}
```

### `drift_imports`

Resolve correct import statements.

```json
{
  "symbols": ["User", "createUser"],
  "targetFile": "src/api/users.ts"
}
```

### `drift_prevalidate`

Quick validation before making changes.

```json
{
  "code": "export async function createUser(data: UserInput): Promise<User> { ... }",
  "targetFile": "src/api/users.ts",
  "kind": "function"
}
```

### `drift_similar`

Find semantically similar code.

```json
{
  "intent": "api_endpoint",
  "description": "user preferences CRUD",
  "scope": "src/api",
  "limit": 3
}
```

### `drift_type`

Expand type definitions.

```json
{
  "type": "User",
  "depth": 2,
  "file": "src/types/user.ts"
}
```

### `drift_recent`

Show recent changes in an area.

```json
{
  "area": "src/api/",
  "days": 7,
  "type": "feat"
}
```

### `drift_test_template`

Generate test scaffolding.

```json
{
  "targetFile": "src/auth/login.ts",
  "function": "handleLogin",
  "type": "unit"
}
```

### `drift_dependencies`

Package dependencies lookup (multi-language).

```json
{
  "search": "react",
  "type": "prod",
  "category": "framework",
  "language": "javascript"
}
```

### `drift_middleware`

Middleware pattern lookup.

```json
{
  "type": "auth",
  "framework": "express",
  "limit": 20
}
```

### `drift_hooks`

React/Vue hooks lookup.

```json
{
  "component": "UserProfile",
  "file": "src/components/UserProfile.tsx"
}
```

### `drift_errors`

Error types and handling gaps.

```json
{
  "function": "handlePayment",
  "file": "src/payments/handler.ts"
}
```

---

## Layer 4: Exploration

Paginated listing tools for browsing and filtering.

### `drift_patterns_list`

List patterns with summaries.

```json
{
  "categories": ["api", "auth"],
  "status": "approved",
  "minConfidence": 0.8,
  "search": "controller",
  "limit": 20,
  "cursor": "next_page_token"
}
```

### `drift_security_summary`

Security posture overview.

```json
{
  "focus": "critical",
  "limit": 10
}
```

**Focus options:** `all`, `critical`, `data-access`, `auth`

### `drift_contracts_list`

API contracts between frontend and backend.

```json
{
  "status": "mismatch",
  "limit": 20
}
```

**Status options:** `all`, `verified`, `mismatch`, `discovered`

### `drift_trends`

Pattern trend analysis over time.

```json
{
  "period": "30d",
  "category": "security",
  "severity": "critical"
}
```

### `drift_env`

Environment variable analysis.

```json
{
  "action": "list",
  "category": "secrets"
}
```

---

## Layer 5: Detail

Deep dives into specific patterns, files, and analysis.

### `drift_pattern_get`

Complete details for a specific pattern.

```json
{
  "id": "api-rest-controller-pattern",
  "includeLocations": true,
  "includeOutliers": true,
  "maxLocations": 20
}
```

### `drift_code_examples`

Real code examples for patterns.

```json
{
  "categories": ["api", "errors"],
  "pattern": "error-handling-try-catch",
  "maxExamples": 3,
  "contextLines": 10
}
```

### `drift_files_list`

List files with patterns.

```json
{
  "path": "src/api/**/*.ts",
  "category": "api",
  "limit": 20
}
```

### `drift_file_patterns`

All patterns in a specific file.

```json
{
  "file": "src/api/users.controller.ts",
  "category": "api"
}
```

### `drift_impact_analysis`

Analyze impact of changing a file or function.

```json
{
  "target": "src/auth/login.ts",
  "maxDepth": 10,
  "limit": 10
}
```

### `drift_reachability`

Data reachability analysis.

```json
{
  "direction": "forward",
  "location": "src/api/users.ts:42",
  "maxDepth": 10,
  "sensitiveOnly": true
}
```

**Or inverse:**

```json
{
  "direction": "inverse",
  "target": "users.password_hash",
  "maxDepth": 10
}
```

### `drift_dna_profile`

Styling DNA profile for frontend consistency.

```json
{
  "gene": "variant-handling"
}
```

**Gene options:** `variant-handling`, `responsive-approach`, `state-styling`, `theming`, `spacing-philosophy`, `animation-approach`

### `drift_wrappers`

Framework wrapper detection.

```json
{
  "category": "data-fetching",
  "minConfidence": 0.5,
  "minClusterSize": 2
}
```

---

## Layer 6: Analysis

Complex analysis tools. Some require pre-built data.

> **Note:** Run build commands first:
> - `drift test-topology build`
> - `drift coupling build`
> - `drift error-handling build`

### `drift_test_topology`

Test-to-code mapping analysis.

```json
{
  "action": "affected",
  "files": ["src/auth/login.ts", "src/auth/logout.ts"]
}
```

**Actions:** `status`, `coverage`, `uncovered`, `mocks`, `affected`, `quality`

### `drift_coupling`

Module dependency analysis.

```json
{
  "action": "cycles",
  "minSeverity": "warning"
}
```

**Actions:** `status`, `cycles`, `hotspots`, `analyze`, `refactor-impact`, `unused-exports`

### `drift_error_handling`

Error handling pattern analysis.

```json
{
  "action": "gaps",
  "minSeverity": "medium"
}
```

**Actions:** `status`, `gaps`, `boundaries`, `unhandled`, `analyze`

### `drift_constants`

Analyze constants, enums, and exported values.

```json
{
  "action": "secrets",
  "severity": "high"
}
```

**Actions:** `status`, `list`, `get`, `usages`, `magic`, `dead`, `secrets`, `inconsistent`

### `drift_quality_gate`

Run quality gates on code changes.

```json
{
  "files": ["src/routes/users.ts"],
  "policy": "strict",
  "gates": "pattern-compliance,security-boundary",
  "format": "github"
}
```

**Policies:** `default`, `strict`, `relaxed`, `ci-fast`

**Gates:** `pattern-compliance`, `constraint-verification`, `regression-detection`, `impact-simulation`, `security-boundary`, `custom-rules`

### `drift_decisions`

Architectural decision records.

```json
{
  "action": "list",
  "status": "active"
}
```

### `drift_constraints`

Architectural constraints.

```json
{
  "action": "list"
}
```

### `drift_simulate`

Simulate changes before making them.

```json
{
  "file": "src/api/users.ts",
  "change": "add new endpoint"
}
```

---

## Layer 7: Generation

AI-assisted code generation and validation.

### `drift_suggest_changes`

AI-guided fix suggestions.

```json
{
  "target": "src/api/users.ts",
  "issue": "outlier",
  "patternId": "api-rest-controller",
  "maxSuggestions": 3
}
```

**Issue types:** `outlier`, `security`, `coupling`, `error-handling`, `test-coverage`, `pattern-violation`

### `drift_validate_change`

Validate proposed changes against patterns.

```json
{
  "file": "src/api/users.ts",
  "content": "// new code here",
  "strictMode": false
}
```

**Or with diff:**

```json
{
  "file": "src/api/users.ts",
  "diff": "--- a/file\n+++ b/file\n...",
  "strictMode": true
}
```

### `drift_explain`

Comprehensive code explanation.

```json
{
  "target": "src/auth/middleware.ts",
  "depth": "comprehensive",
  "focus": "security"
}
```

**Depth options:** `summary`, `detailed`, `comprehensive`

**Focus options:** `security`, `performance`, `architecture`, `testing`

---

## Language-Specific Tools

All 9 languages have dedicated MCP tools for language-specific analysis.

### `drift_typescript`

TypeScript/JavaScript-specific analysis.

```json
{
  "action": "status",
  "path": "src/",
  "framework": "express",
  "limit": 50
}
```

**Actions:**
- `status` — Project overview (files, frameworks, stats)
- `routes` — HTTP routes (Express, NestJS, Next.js, Fastify)
- `components` — React components (functional, class)
- `hooks` — React hooks usage (builtin, custom)
- `errors` — Error handling patterns (try-catch, boundaries)
- `data-access` — Database patterns (Prisma, TypeORM, Drizzle, Sequelize, Mongoose)
- `decorators` — Decorator usage (NestJS, TypeORM)

### `drift_python`

Python-specific analysis.

```json
{
  "action": "routes",
  "framework": "fastapi"
}
```

**Actions:**
- `status` — Project overview
- `routes` — HTTP routes (Flask, FastAPI, Django, Starlette)
- `errors` — Error handling patterns (try-except, custom exceptions)
- `data-access` — Database patterns (Django ORM, SQLAlchemy, Tortoise, Peewee)
- `decorators` — Decorator usage
- `async` — Async patterns (async/await, asyncio)

### `drift_java`

Java-specific analysis.

```json
{
  "action": "annotations",
  "framework": "spring"
}
```

**Actions:**
- `status` — Project overview
- `routes` — HTTP routes (Spring MVC, JAX-RS, Micronaut, Quarkus)
- `errors` — Error handling patterns (try-catch, exception handlers)
- `data-access` — Database patterns (Spring Data JPA, Hibernate, JDBC, MyBatis)
- `annotations` — Annotation usage (@RestController, @Service, etc.)

### `drift_php`

PHP-specific analysis.

```json
{
  "action": "traits",
  "framework": "laravel"
}
```

**Actions:**
- `status` — Project overview
- `routes` — HTTP routes (Laravel, Symfony, Slim, Lumen)
- `errors` — Error handling patterns (try-catch, custom exceptions)
- `data-access` — Database patterns (Eloquent, Doctrine, PDO)
- `traits` — Trait definitions and usage

### `drift_go`

Go-specific analysis.

```json
{
  "action": "goroutines"
}
```

**Actions:**
- `status` — Project overview
- `routes` — HTTP routes (Gin, Echo, Chi, Fiber, net/http)
- `errors` — Error handling patterns
- `interfaces` — Interface implementations
- `data-access` — Database patterns (GORM, sqlx, database/sql)
- `goroutines` — Concurrency patterns

### `drift_rust`

Rust-specific analysis.

```json
{
  "action": "async"
}
```

**Actions:**
- `status` — Project overview
- `routes` — HTTP routes (Actix, Axum, Rocket, Warp)
- `errors` — Error handling (Result, thiserror, anyhow)
- `traits` — Trait implementations
- `data-access` — Database patterns (SQLx, Diesel, SeaORM)
- `async` — Async patterns and runtime usage

### `drift_cpp`

C++-specific analysis.

```json
{
  "action": "memory"
}
```

**Actions:**
- `status` — Project overview
- `classes` — Class/struct analysis with inheritance
- `memory` — Memory management (smart pointers, RAII)
- `templates` — Template classes and functions
- `virtual` — Virtual functions and polymorphism

### `drift_wpf`

WPF (C#) specific analysis.

```json
{
  "action": "bindings"
}
```

**Actions:**
- `status` — Project overview
- `bindings` — XAML data bindings
- `mvvm` — MVVM compliance check
- `datacontext` — DataContext resolution
- `commands` — ICommand implementations

---

## Pattern Categories

Available categories for filtering:

| Category | Description |
|----------|-------------|
| `api` | REST endpoints, GraphQL resolvers |
| `auth` | Authentication, authorization |
| `security` | Security patterns, validation |
| `errors` | Error handling patterns |
| `logging` | Logging, observability |
| `data-access` | Database queries, ORM usage |
| `config` | Configuration patterns |
| `testing` | Test patterns, mocks |
| `performance` | Caching, optimization |
| `components` | UI components |
| `styling` | CSS, styling patterns |
| `structural` | Code organization |
| `types` | Type definitions |
| `accessibility` | A11y patterns |
| `documentation` | Doc patterns |

---

## Memory Tools (Cortex V2)

Cortex V2 introduces intelligent memory tools for learning, retrieval, and causal understanding.

### `drift_why`

Get causal narrative explaining WHY something exists.

```json
{
  "intent": "understand_code",
  "focus": "authentication",
  "maxDepth": 3
}
```

**Returns:** Human-readable narrative tracing causal chains.

### `drift_memory_status`

Health overview with recommendations.

```json
{}
```

**Returns:**
```json
{
  "summary": "Memory system healthy. 47 memories, 0.78 avg confidence",
  "data": {
    "totalMemories": 47,
    "byType": { "tribal_knowledge": 20, "pattern_rationale": 15, ... },
    "averageConfidence": 0.78,
    "validationBacklog": 5,
    "healthScore": 85
  },
  "recommendations": [
    "5 memories need validation",
    "Consider consolidating similar memories"
  ]
}
```

### `drift_memory_for_context`

Get memories for current context with token efficiency.

```json
{
  "intent": "add_feature",
  "focus": "authentication",
  "maxTokens": 2000,
  "compressionLevel": 2,
  "sessionId": "session_abc123"
}
```

**Compression levels:** `0` (IDs only), `1` (one-liners), `2` (with examples), `3` (full detail)

### `drift_memory_search`

Search with session deduplication.

```json
{
  "query": "password hashing",
  "types": ["tribal_knowledge", "pattern_rationale"],
  "minConfidence": 0.5,
  "sessionId": "session_abc123",
  "limit": 10
}
```

### `drift_memory_add`

Add memory with automatic causal inference.

```json
{
  "type": "tribal_knowledge",
  "content": "Always use bcrypt for password hashing",
  "source": "security_audit",
  "context": {
    "file": "src/auth/password.ts",
    "relatedMemories": ["mem_security_audit"]
  }
}
```

### `drift_memory_learn`

Learn from corrections (full learning pipeline).

```json
{
  "original": "Use MD5 for hashing",
  "correction": "MD5 is insecure. Use bcrypt.",
  "correctCode": "const hash = await bcrypt.hash(password, 10);",
  "context": {
    "file": "src/auth.ts",
    "intent": "fix_bug"
  }
}
```

**Returns:** Created memories, extracted principles, updated confidence.

### `drift_memory_feedback`

Confirm, reject, or modify memories.

```json
{
  "memoryId": "mem_abc123",
  "action": "confirmed"
}
```

**Actions:** `confirmed`, `rejected`, `modified`

For modifications:
```json
{
  "memoryId": "mem_abc123",
  "action": "modified",
  "newContent": "Updated guidance..."
}
```

### `drift_memory_health`

Comprehensive health report.

```json
{
  "includeRecommendations": true,
  "includeMetrics": true
}
```

**Returns:** Detailed health metrics, validation backlog, consolidation opportunities.

### `drift_memory_explain`

Get causal explanation for a memory.

```json
{
  "memoryId": "mem_abc123",
  "includeNarrative": true,
  "maxDepth": 3
}
```

**Returns:** Causal chain and human-readable narrative.

### `drift_memory_predict`

Get predicted memories for current context.

```json
{
  "activeFile": "src/auth/login.ts",
  "recentFiles": ["src/auth/logout.ts"],
  "intent": "add_feature",
  "limit": 10
}
```

**Returns:** Ranked predictions with confidence scores and reasons.

### `drift_memory_conflicts`

Detect conflicting memories.

```json
{
  "memoryId": "mem_abc123"
}
```

**Or scan all:**
```json
{
  "scanAll": true,
  "minSeverity": "medium"
}
```

### `drift_memory_graph`

Visualize memory relationships.

```json
{
  "memoryId": "mem_abc123",
  "direction": "both",
  "maxDepth": 3,
  "format": "mermaid"
}
```

**Formats:** `json`, `mermaid`, `dot`

### `drift_memory_validate`

Validate memories and get healing suggestions.

```json
{
  "limit": 5,
  "includePrompts": true
}
```

**Returns:** Memories needing validation with suggested prompts.

### `drift_memory_get`

Get memory with optional causal chain.

```json
{
  "memoryId": "mem_abc123",
  "includeCausalChain": true,
  "chainDepth": 3
}
```

---

## Best Practices for AI Agents

### 1. Start with `drift_context`

For any code generation task, start here:

```json
{
  "intent": "add_feature",
  "focus": "the area you're working on"
}
```

### 2. Use Surgical Tools for Precision

When you need exactly one thing:

```json
// Need a signature?
{ "tool": "drift_signature", "symbol": "functionName" }

// Need callers?
{ "tool": "drift_callers", "function": "functionName" }

// Need imports?
{ "tool": "drift_imports", "symbol": "TypeName" }
```

### 3. Validate Before Committing

Always validate generated code:

```json
{
  "tool": "drift_validate_change",
  "file": "path/to/file.ts",
  "content": "// generated code"
}
```

### 4. Use Pagination for Large Results

When results are paginated:

```json
// First call
{ "limit": 20 }

// Next page
{ "limit": 20, "cursor": "returned_cursor" }
```

### 5. Check Hints for Next Steps

Every response includes hints:

```json
{
  "hints": {
    "nextActions": ["What to do next"],
    "relatedTools": ["Other useful tools"],
    "warnings": ["Important warnings"]
  }
}
```

---

## Infrastructure Features

### Caching

Responses are cached for repeated queries. Cache is invalidated when:
- Files change
- Patterns are approved/ignored
- Call graph is rebuilt

### Rate Limiting

Prevents runaway tool calls. Default: 60 requests/minute.

### Metrics

Usage metrics are collected for:
- Tool call frequency
- Response times
- Cache hit rates
- Error rates

### Warmup

On startup, Drift warms up stores for instant responses:
- Pattern store loaded
- Call graph indexed
- Boundary data cached
