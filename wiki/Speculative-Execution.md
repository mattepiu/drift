# Speculative Execution

Drift's Speculative Execution Engine simulates multiple implementation approaches BEFORE you write code, helping you choose the best path.

## What is Speculative Execution?

Before implementing a feature, Drift can simulate different approaches and score them by:

- **Friction** — How much existing code needs to change
- **Impact** — Blast radius of the change
- **Pattern alignment** — How well it fits your conventions
- **Security** — Potential security implications

This helps you make informed decisions before writing a single line of code.

---

## How It Works

```
Your Task Description
        │
        ▼
┌─────────────────┐
│  Task Analysis  │ ← Understand what you're trying to do
└────────┬────────┘
        │
        ▼
┌─────────────────┐
│  Approach Gen   │ ← Generate multiple implementation approaches
└────────┬────────┘
        │
        ▼
┌─────────────────┐
│  Simulation     │ ← Simulate each approach against your codebase
└────────┬────────┘
        │
        ▼
┌─────────────────┐
│  Scoring        │ ← Score by friction, impact, alignment
└────────┬────────┘
        │
        ▼
┌─────────────────┐
│  Recommendation │ ← Rank approaches with trade-offs
└─────────────────┘
```

---

## Using Simulate

### Basic Usage

```bash
drift simulate "add rate limiting to API"
```

**Output:**
```
🔮 Speculative Execution Engine
═════════════════════════════════════════════════════════════════

Task: add rate limiting to API
Category: rate-limiting (auto-detected)

Analyzing codebase...
Generating approaches...
Simulating implementations...

═════════════════════════════════════════════════════════════════
📊 APPROACH COMPARISON
═════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────┐
│ #1 RECOMMENDED: Express Middleware (Score: 87/100)              │
├─────────────────────────────────────────────────────────────────┤
│ Friction: LOW (12)     Impact: MEDIUM (45)    Alignment: HIGH   │
│                                                                 │
│ Description:                                                    │
│   Add rate limiting as Express middleware using express-rate-   │
│   limit. Follows existing middleware patterns in your codebase. │
│                                                                 │
│ Files to modify:                                                │
│   • src/middleware/index.ts (add rate limiter)                  │
│   • src/app.ts (apply middleware)                               │
│   • package.json (add dependency)                               │
│                                                                 │
│ Pros:                                                           │
│   ✓ Matches existing middleware pattern                         │
│   ✓ Minimal code changes                                        │
│   ✓ Well-tested library                                         │
│                                                                 │
│ Cons:                                                           │
│   ✗ In-memory store (not distributed)                           │
│   ✗ No per-user limits                                          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ #2 Redis-backed Rate Limiter (Score: 82/100)                    │
├─────────────────────────────────────────────────────────────────┤
│ Friction: MEDIUM (35)  Impact: MEDIUM (50)    Alignment: HIGH   │
│                                                                 │
│ Description:                                                    │
│   Implement rate limiting with Redis backend for distributed    │
│   rate limiting across multiple server instances.               │
│                                                                 │
│ Files to modify:                                                │
│   • src/middleware/rate-limiter.ts (new file)                   │
│   • src/config/redis.ts (add rate limit config)                 │
│   • src/app.ts (apply middleware)                               │
│   • package.json (add ioredis)                                  │
│                                                                 │
│ Pros:                                                           │
│   ✓ Works across multiple instances                             │
│   ✓ Persistent rate limit state                                 │
│   ✓ You already use Redis for sessions                          │
│                                                                 │
│ Cons:                                                           │
│   ✗ More complex implementation                                 │
│   ✗ Redis dependency for rate limiting                          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ #3 API Gateway Rate Limiting (Score: 68/100)                    │
├─────────────────────────────────────────────────────────────────┤
│ Friction: HIGH (65)    Impact: LOW (20)       Alignment: MEDIUM │
│                                                                 │
│ Description:                                                    │
│   Move rate limiting to API gateway (Kong, AWS API Gateway).    │
│   No application code changes needed.                           │
│                                                                 │
│ Pros:                                                           │
│   ✓ No application code changes                                 │
│   ✓ Centralized rate limiting                                   │
│                                                                 │
│ Cons:                                                           │
│   ✗ Requires infrastructure changes                             │
│   ✗ You don't currently use an API gateway                      │
│   ✗ Higher operational complexity                               │
└─────────────────────────────────────────────────────────────────┘

═════════════════════════════════════════════════════════════════
💡 RECOMMENDATION
═════════════════════════════════════════════════════════════════

Start with Approach #1 (Express Middleware) for quick implementation.
Consider Approach #2 (Redis-backed) if you need distributed rate limiting.

Security Notes:
  • Ensure rate limit headers are returned (X-RateLimit-*)
  • Consider different limits for authenticated vs anonymous users
  • Log rate limit violations for monitoring
```

---

## Command Options

```bash
drift simulate <description> [options]

Options:
  -f, --format <format>        Output format (text, json)
  -v, --verbose                Show detailed analysis
  -n, --max-approaches <n>     Maximum approaches to simulate (default: 5)
  -c, --category <category>    Task category (auto-detected if not provided)
  -t, --target <target>        Target file or function
  --constraint <constraint>    Constraint (can be repeated for multiple constraints)
```

### With Constraints

```bash
drift simulate "add authentication" \
  --constraint "must work with existing session system" \
  --constraint "minimal file changes"
```

### Target Specific File

```bash
drift simulate "add caching" --target src/api/users.ts
```

### Verbose Output

```bash
drift simulate "add logging" --verbose
```

Shows detailed scoring breakdown and analysis.

---

## Task Categories

Drift auto-detects the category, or you can specify:

| Category | Description |
|----------|-------------|
| `rate-limiting` | Rate limiting implementation |
| `authentication` | Auth system changes |
| `authorization` | Permission/RBAC changes |
| `api-endpoint` | New API endpoint |
| `data-access` | Database access patterns |
| `error-handling` | Error handling improvements |
| `caching` | Caching implementation |
| `logging` | Logging/observability |
| `testing` | Test implementation |
| `validation` | Input validation |
| `middleware` | Middleware implementation |
| `refactoring` | Code refactoring |
| `generic` | General implementation |

---

## Scoring Breakdown

### Friction Score (0-100)

How much existing code needs to change:

| Score | Level | Meaning |
|-------|-------|---------|
| 0-20 | LOW | Minimal changes, mostly additive |
| 21-50 | MEDIUM | Some refactoring needed |
| 51-80 | HIGH | Significant changes required |
| 81-100 | VERY HIGH | Major restructuring |

### Impact Score (0-100)

Blast radius of the change:

| Score | Level | Meaning |
|-------|-------|---------|
| 0-20 | LOW | Isolated change, few dependencies |
| 21-50 | MEDIUM | Moderate dependencies affected |
| 51-80 | HIGH | Many files/functions affected |
| 81-100 | VERY HIGH | System-wide impact |

### Pattern Alignment

How well the approach fits your existing patterns:

| Level | Meaning |
|-------|---------|
| HIGH | Follows established patterns exactly |
| MEDIUM | Partially follows patterns |
| LOW | Introduces new patterns |
| NONE | Conflicts with existing patterns |

---

## MCP Integration

### `drift_simulate` Tool

```json
{
  "task": "add rate limiting to API",
  "category": "rate-limiting",
  "target": "src/api/",
  "constraints": ["must work with existing auth"],
  "maxApproaches": 5,
  "includeSecurityAnalysis": true
}
```

**Parameters:**
- `task` — Required. Task description (e.g., "add rate limiting to API")
- `category` — Task category (auto-detected if not provided): `rate-limiting`, `authentication`, `authorization`, `api-endpoint`, `data-access`, `error-handling`, `caching`, `logging`, `testing`, `validation`, `middleware`, `refactoring`, `generic`
- `target` — Target file or function to focus on
- `constraints` — Array of constraints (e.g., ["must work with existing auth", "minimal file changes"])
- `maxApproaches` — Maximum approaches to simulate (default: 5)
- `includeSecurityAnalysis` — Include security analysis (default: true)

**Returns:**

```json
{
  "summary": "3 approaches analyzed for 'add rate limiting to API'",
  "task": {
    "description": "add rate limiting to API",
    "category": "rate-limiting",
    "detectedIntent": "Add rate limiting middleware"
  },
  "approaches": [
    {
      "rank": 1,
      "name": "Express Middleware",
      "score": 87,
      "friction": { "score": 12, "level": "LOW" },
      "impact": { "score": 45, "level": "MEDIUM" },
      "alignment": "HIGH",
      "description": "Add rate limiting as Express middleware...",
      "filesToModify": ["src/middleware/index.ts", "src/app.ts"],
      "pros": ["Matches existing pattern", "Minimal changes"],
      "cons": ["In-memory store", "Not distributed"],
      "securityNotes": ["Ensure rate limit headers"]
    }
  ],
  "recommendation": {
    "primary": 1,
    "reasoning": "Best balance of friction and alignment"
  }
}
```

---

## Use Cases

### Before Starting a Feature

```bash
drift simulate "add user preferences API"
```

Understand the best approach before writing code.

### Evaluating Refactoring Options

```bash
drift simulate "refactor user service to use repository pattern"
```

See the impact of different refactoring strategies.

### Security-Sensitive Changes

```bash
drift simulate "add password reset flow" --verbose
```

Get security analysis for sensitive features.

### Comparing Approaches

```bash
drift simulate "add caching" --max-approaches 5
```

See multiple options ranked by fit.

---

## Best Practices

### 1. Be Specific

```bash
# Good
drift simulate "add Redis-based rate limiting with per-user limits"

# Less helpful
drift simulate "add rate limiting"
```

### 2. Add Constraints

```bash
drift simulate "add authentication" \
  --constraint "must use existing User model" \
  --constraint "JWT tokens required"
```

### 3. Review Security Notes

Always check the security notes in the output, especially for:
- Authentication changes
- Data access changes
- API endpoint additions

### 4. Consider All Approaches

Don't always pick #1. Sometimes a higher-friction approach is better long-term.

---

## Troubleshooting

### "No approaches generated"

1. Be more specific in your description
2. Specify a category: `--category api-endpoint`
3. Check your codebase has been scanned: `drift scan`

### "Scores seem wrong"

1. Run with `--verbose` to see scoring breakdown
2. Ensure patterns are approved: `drift status`
3. Rebuild call graph: `drift callgraph build`

### "Missing security analysis"

Security analysis requires:
- Boundary data: `drift boundaries tables`
- Call graph: `drift callgraph build`

---

## Next Steps

- [Quality Gates](Quality-Gates) — Validate implementations
- [Skills](Skills) — Implementation guides
- [Pattern Categories](Pattern-Categories) — Understand patterns
