# Getting Started

Get Drift running in under 2 minutes.

## Installation

```bash
npm install -g driftdetect
```

Or use npx without installing:

```bash
npx driftdetect init
```

## Quick Start

```bash
# Navigate to your project
cd your-project

# Initialize Drift (creates .drift/ directory)
drift init

# Scan your codebase
drift scan

# See what Drift learned
drift status

# Open the dashboard
drift dashboard
```

## What Happens During Scan

1. **File Discovery** — Drift finds all source files (respects `.driftignore`)
2. **AST Parsing** — Tree-sitter parses each file into an AST
3. **Pattern Detection** — 170+ detectors analyze your code
4. **Call Graph Building** — Maps function calls and data access
5. **Pattern Storage** — Results saved to `.drift/` directory

## First Scan Output

After scanning, `drift status` shows:

```
Drift Status
============

Patterns: 47 discovered, 0 approved, 0 ignored
Categories: api (12), auth (8), errors (15), data-access (12)
Health Score: 72/100

Languages: TypeScript (45 files), Python (12 files)
Frameworks: Express, Prisma, FastAPI

Run 'drift approve <pattern-id>' to approve patterns
Run 'drift dashboard' to explore in the web UI
```

## Next Steps

### 1. Explore Patterns

```bash
# Open web dashboard
drift dashboard

# Or use the where command to find patterns
drift where "API" --limit 10

# See patterns in a specific file
drift files src/api/users.ts
```

### 2. Approve Patterns

Approve patterns that represent your conventions:

```bash
# Approve a specific pattern
drift approve <pattern-id>

# Approve all patterns in a category
drift approve --category api

# See what needs approval
drift status --pending
```

### 3. Connect to AI

Connect Drift to Claude, Cursor, or other AI agents via MCP.

See [MCP Setup](MCP-Setup) for detailed configuration.

### 4. Build Analysis Data

For advanced analysis, build additional data:

```bash
# Build test topology (test-to-code mapping)
drift test-topology build

# Build coupling analysis (dependency cycles)
drift coupling build

# Build error handling analysis
drift error-handling build
```

### 5. CI Integration

Add Drift to your CI pipeline:

```bash
# Check for violations (exits non-zero on failure)
drift check --ci

# Run quality gates
drift gate --policy strict
```

See [CI Integration](CI-Integration) for detailed setup.

---

## Project Structure

After initialization, Drift creates:

```
your-project/
├── .drift/
│   ├── config.json      # Project configuration
│   ├── manifest.json    # Scan metadata
│   ├── patterns/        # Detected patterns
│   │   ├── approved/    # Approved patterns
│   │   ├── discovered/  # New patterns
│   │   └── ignored/     # Ignored patterns
│   ├── lake/            # Data lake
│   │   ├── callgraph/   # Call graph data
│   │   ├── patterns/    # Pattern data
│   │   └── security/    # Security analysis
│   ├── contracts/       # API contracts
│   ├── boundaries/      # Data access boundaries
│   └── views/           # Pre-computed views
└── .driftignore         # Files to exclude
```

---

## Supported Languages

Drift supports 8 languages out of the box:

| Language | Frameworks | ORMs |
|----------|------------|------|
| TypeScript/JavaScript | React, Next.js, Express, NestJS | Prisma, TypeORM, Drizzle |
| Python | Django, FastAPI, Flask | SQLAlchemy, Django ORM |
| Java | Spring Boot | JPA/Hibernate |
| C# | ASP.NET Core, WPF | Entity Framework, Dapper |
| PHP | Laravel | Eloquent |
| Go | Gin, Echo, Fiber, Chi | GORM, sqlx |
| Rust | Actix-web, Axum, Rocket | SQLx, Diesel, SeaORM |
| C++ | Unreal Engine, Qt, Boost | SQLite, ODBC |

Check parser status:

```bash
drift parser
```

---

## Ignoring Files

Edit `.driftignore` (same syntax as `.gitignore`):

```
# Dependencies
node_modules/
vendor/

# Build output
dist/
build/
out/

# Tests (optional)
*.test.ts
*.spec.ts
__tests__/

# Generated
*.generated.ts
*.g.cs
```

---

## Configuration

Edit `.drift/config.json`:

```json
{
  "version": "1.0.0",
  "project": {
    "name": "my-project",
    "languages": ["typescript", "python"]
  },
  "scan": {
    "include": ["src/**/*"],
    "exclude": ["**/*.test.ts"]
  },
  "patterns": {
    "minConfidence": 0.7,
    "autoApprove": false
  }
}
```

See [Configuration](Configuration) for all options.

---

## Common Commands

| Command | Description |
|---------|-------------|
| `drift init` | Initialize Drift in a project |
| `drift scan` | Scan codebase for patterns |
| `drift status` | Show current status |
| `drift dashboard` | Open web dashboard |
| `drift where <pattern>` | Find pattern locations |
| `drift check` | Check for violations |

See [CLI Reference](CLI-Reference) for all commands.

---

## Troubleshooting

### Scan takes too long

- Check `.driftignore` excludes `node_modules/`, `dist/`
- Try scanning a subdirectory: `drift scan src/`
- Use incremental scan: `drift scan --incremental`

### No patterns found

- Ensure you're scanning source files, not just config
- Check language is supported: `drift parser`
- Try verbose mode: `drift scan --verbose`

### Permission errors

- Drift needs write access to create `.drift/` directory
- Run in a directory you own

### Parser errors

- Run `drift parser --test` to verify parsers work
- Check for syntax errors in your code
- Try regex fallback: `drift scan --fallback`

See [Troubleshooting](Troubleshooting) for more solutions.
