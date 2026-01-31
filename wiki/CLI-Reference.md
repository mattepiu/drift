# CLI Reference

Complete reference for all Drift CLI commands.

## Language-Specific Commands

### `drift ts`

TypeScript/JavaScript language analysis.

```bash
drift ts <subcommand> [path] [options]

Subcommands:
  status             Show project analysis summary
  routes             List HTTP routes (Express, NestJS, Next.js, Fastify)
  components         List React components
  hooks              Analyze React hooks usage
  errors             Analyze error handling patterns
  data-access        Analyze database patterns (Prisma, TypeORM, Drizzle, Sequelize, Mongoose)
  decorators         Analyze decorator usage (NestJS, TypeORM)

Options:
  --framework <fw>   Filter by framework
  --limit <n>        Limit results (default: 50)
  --json             JSON output
```

### `drift py`

Python language analysis.

```bash
drift py <subcommand> [path] [options]

Subcommands:
  status             Show project analysis summary
  routes             List HTTP routes (Flask, FastAPI, Django, Starlette)
  errors             Analyze error handling patterns
  data-access        Analyze database patterns (Django ORM, SQLAlchemy, Tortoise, Peewee)
  decorators         Analyze decorator usage
  async              Analyze async patterns

Options:
  --framework <fw>   Filter by framework
  --limit <n>        Limit results (default: 50)
  --json             JSON output
```

### `drift java`

Java language analysis.

```bash
drift java <subcommand> [path] [options]

Subcommands:
  status             Show project analysis summary
  routes             List HTTP routes (Spring MVC, JAX-RS, Micronaut, Quarkus)
  errors             Analyze error handling patterns
  data-access        Analyze database patterns (Spring Data JPA, Hibernate, JDBC, MyBatis)
  annotations        Analyze annotation usage

Options:
  --framework <fw>   Filter by framework
  --limit <n>        Limit results (default: 50)
  --json             JSON output
```

### `drift php`

PHP language analysis.

```bash
drift php <subcommand> [path] [options]

Subcommands:
  status             Show project analysis summary
  routes             List HTTP routes (Laravel, Symfony, Slim, Lumen)
  errors             Analyze error handling patterns
  data-access        Analyze database patterns (Eloquent, Doctrine, PDO)
  traits             Analyze trait definitions and usage

Options:
  --framework <fw>   Filter by framework
  --limit <n>        Limit results (default: 50)
  --json             JSON output
```

### `drift go`

Go language analysis.

```bash
drift go <subcommand> [path] [options]

Subcommands:
  status             Show project analysis summary
  routes             List HTTP routes (Gin, Echo, Chi, Fiber, net/http)
  errors             Analyze error handling patterns
  interfaces         List interfaces and implementations
  data-access        Analyze database patterns (GORM, sqlx, database/sql, Ent, Bun)
  goroutines         Analyze concurrency patterns

Options:
  --framework <fw>   Filter by framework
  --limit <n>        Limit results (default: 50)
  --json             JSON output
```

### `drift rust`

Rust language analysis.

```bash
drift rust <subcommand> [path] [options]

Subcommands:
  status             Show project analysis summary
  routes             List HTTP routes (Actix, Axum, Rocket, Warp)
  errors             Analyze error handling (Result, thiserror, anyhow)
  traits             List traits and implementations
  data-access        Analyze database patterns (SQLx, Diesel, SeaORM)
  async              Analyze async patterns and runtime usage

Options:
  --framework <fw>   Filter by framework
  --limit <n>        Limit results (default: 50)
  --json             JSON output
```

### `drift cpp`

C++ language analysis.

```bash
drift cpp <subcommand> [path] [options]

Subcommands:
  status             Show project analysis summary
  classes            List classes/structs with inheritance
  memory             Analyze memory management (smart pointers, RAII)
  templates          List template classes and functions
  virtual            Analyze virtual functions and polymorphism

Options:
  --framework <fw>   Filter by framework (Qt, Boost, Unreal)
  --limit <n>        Limit results (default: 50)
  --json             JSON output
```

### `drift wpf`

WPF (C#) framework analysis.

```bash
drift wpf <subcommand> [path] [options]

Subcommands:
  status             Show project analysis summary
  bindings           List XAML data bindings
  mvvm               Check MVVM compliance
  datacontext        Analyze DataContext resolution
  commands           List ICommand implementations

Options:
  --limit <n>        Limit results (default: 50)
  --json             JSON output
```

---

## AI Context Commands

### `drift context`

Generate package-scoped AI context for monorepos.

```bash
drift context [package] [options]

Options:
  -l, --list                List all detected packages
  -f, --format <format>     Output format: json, markdown, ai (default: json)
  -o, --output <file>       Output file (stdout if not specified)
  --snippets                Include code snippets in context
  --deps                    Include internal dependency patterns
  -c, --categories <cats>   Categories to include (comma-separated)
  --min-confidence <n>      Minimum pattern confidence (0.0-1.0)
  --max-tokens <n>          Maximum tokens for AI context (default: 8000)
  --compact                 Compact output (fewer details)
```

**Examples:**

```bash
# List all packages in monorepo
drift context --list

# Generate context for a package
drift context @drift/core

# AI-optimized format with snippets
drift context @drift/core --format ai --snippets

# Export to file
drift context @drift/core -o context.json
```

---

## Memory Commands

### `drift memory`

Manage Cortex V2 memories - institutional knowledge, procedures, patterns, and more.

```bash
drift memory <subcommand> [options]

Subcommands:
  init               Initialize the memory system
  status             Show memory system status and health
  add <type> <text>  Add a new memory
  list               List memories
  show <id>          Show memory details
  search <query>     Search memories
  update <id>        Update a memory
  delete <id>        Delete a memory (soft delete)
  learn              Learn from a correction
  feedback <id>      Provide feedback on a memory
  validate           Validate memories and heal issues
  consolidate        Consolidate episodic memories
  warnings           Show active warnings
  why <focus>        Get context for a task
  export <output>    Export memories to JSON
  import <input>     Import memories from JSON
  health             Get comprehensive health report

Options:
  -f, --format <format>   Output format (text, json)
  -v, --verbose           Enable verbose output
```

**Memory Types:**
- `tribal` — Institutional knowledge, gotchas, warnings
- `procedural` — How-to knowledge, step-by-step procedures
- `semantic` — Consolidated knowledge
- `pattern_rationale` — Why patterns exist
- `code_smell` — Patterns to avoid
- `decision_context` — Human context for decisions
- `constraint_override` — Approved exceptions

**Examples:**

```bash
# Initialize memory system
drift memory init

# Add tribal knowledge
drift memory add tribal "Always use bcrypt for passwords" --topic Security --importance high

# List all memories
drift memory list

# Search memories
drift memory search "authentication"

# Learn from a correction
drift memory learn --original "Use MD5" --feedback "Use bcrypt instead"

# Get context for a task
drift memory why "authentication" --intent add_feature

# Check health
drift memory health

# Export memories
drift memory export backup.json
```

→ [Full Memory CLI Reference](Memory-CLI)

---

## Core Commands

### `drift init`

Initialize Drift in a project.

```bash
drift init [options]

Options:
  --from-scaffold    Initialize from scaffold config
  --yes, -y          Skip confirmation prompts
```

### `drift scan`

Scan codebase for patterns.

```bash
drift scan [path] [options]

Options:
  --manifest         Generate manifest file
  --incremental      Only scan changed files
  --contracts        Detect API contracts
  --boundaries       Scan data access boundaries
  --project <name>   Target specific project
  --timeout <ms>     Scan timeout in milliseconds
```

### `drift check`

Check for violations against approved patterns.

```bash
drift check [options]

Options:
  --staged           Only check staged files
  --ci               CI mode (exit code on violations)
  --format <type>    Output format: text, json, github, gitlab
  --fail-on <level>  Fail on: error, warning, info
```

### `drift status`

Show current drift status.

```bash
drift status [options]

Options:
  --detailed         Show detailed breakdown
  --format <type>    Output format: text, json
```

### `drift approve`

Approve discovered patterns.

```bash
drift approve <pattern-id> [options]

Options:
  --category <cat>   Approve all in category
  --yes, -y          Skip confirmation
```

### `drift ignore`

Ignore patterns.

```bash
drift ignore <pattern-id> [options]

Options:
  --yes, -y          Skip confirmation
```

### `drift report`

Generate reports.

```bash
drift report [options]

Options:
  --format <type>    Format: html, json, markdown
  --output <path>    Output file path
  --categories       Filter by categories
```

---

## Discovery Commands

### `drift where`

Find pattern locations.

```bash
drift where <pattern-id> [options]

Options:
  --category <cat>   Filter by category
  --status <status>  Filter by status
  --json             JSON output
```

### `drift files`

Show patterns in specific files.

```bash
drift files <path> [options]

Options:
  --category <cat>   Filter by category
  --json             JSON output
```

### `drift export`

Export manifest.

```bash
drift export [options]

Options:
  --format <type>    Format: json, ai-context, summary, markdown
  --max-tokens <n>   Token limit for ai-context format
  --snippets         Include code snippets
```

---

## Monitoring Commands

### `drift watch`

Real-time file watching.

```bash
drift watch [options]

Options:
  --context          Show context for changes
  --debounce <ms>    Debounce delay
  --persist          Persist changes to disk
```

### `drift dashboard`

Launch web dashboard.

```bash
drift dashboard [options]

Options:
  --port <port>      Server port (default: 3000)
  --no-browser       Don't open browser
```

### `drift trends`

View pattern trends over time.

```bash
drift trends [options]

Options:
  --period <period>  Time period: 7d, 30d, 90d
  --verbose          Show detailed changes
```

---

## Analysis Commands

### `drift boundaries`

Data access boundary analysis.

```bash
drift boundaries <subcommand>

Subcommands:
  overview           Show boundary overview
  tables             List tables and access patterns
  file <path>        Show boundaries for a file
  sensitive          List sensitive data access
  check              Check boundary violations
  init-rules         Initialize boundary rules
```

### `drift callgraph`

Call graph analysis.

```bash
drift callgraph <subcommand>

Subcommands:
  build              Build call graph
  status             Show call graph status
  reach <location>   What data can this code reach?
  inverse <target>   Who can access this data?
  function <name>    Show function details
```

### `drift test-topology`

Test coverage analysis.

```bash
drift test-topology <subcommand>

Subcommands:
  build              Build test topology
  status             Show test coverage status
  uncovered          Find uncovered code
  mocks              Analyze mock usage
  affected <files>   Minimum tests for changed files
```

### `drift coupling`

Module coupling analysis.

```bash
drift coupling <subcommand>

Subcommands:
  build              Build coupling graph
  status             Show coupling metrics
  cycles             Find dependency cycles
  hotspots           High-coupling modules
  analyze <module>   Analyze specific module
  refactor-impact    Impact of refactoring
  unused-exports     Find dead exports
```

### `drift error-handling`

Error handling analysis.

```bash
drift error-handling <subcommand>

Subcommands:
  build              Build error handling map
  status             Show error handling status
  gaps               Find error handling gaps
  boundaries         Show error boundaries
  unhandled          Find unhandled errors
  analyze <func>     Analyze specific function
```

### `drift gate`

Run quality gates on code changes.

```bash
drift gate [files...] [options]

Options:
  -p, --policy <policy>   Policy to use: default, strict, relaxed, ci-fast, or custom ID
  -g, --gates <gates>     Specific gates to run (comma-separated)
  -f, --format <format>   Output format: text, json, github, gitlab, sarif
  --ci                    Run in CI mode (implies --format json)
  -v, --verbose           Verbose output with details
  --dry-run               Show what would be checked without running
  --staged                Check only staged files
  -o, --output <file>     Write report to file
  --fail-on <level>       Fail threshold: error (default), warning, or none
```

**Available Gates:**
- `pattern-compliance` - Check if code follows established patterns
- `constraint-verification` - Verify architectural constraints
- `regression-detection` - Detect pattern regressions
- `impact-simulation` - Analyze blast radius of changes
- `security-boundary` - Validate data access boundaries
- `custom-rules` - Run user-defined rules

**Available Policies:**
- `default` - Balanced settings for most projects
- `strict` - Strict settings for main/release branches
- `relaxed` - Relaxed settings for feature branches
- `ci-fast` - Minimal checks for fast CI feedback

**Examples:**

```bash
# Run with default policy
drift gate

# Run on specific files
drift gate src/routes/users.ts src/services/user-service.ts

# Run with strict policy
drift gate --policy strict

# Run specific gates only
drift gate --gates pattern-compliance,security-boundary

# CI mode with GitHub annotations
drift gate --ci --format github

# Generate SARIF report for security tools
drift gate --format sarif --output report.sarif

# Check only staged files before commit
drift gate --staged --fail-on warning
```

### `drift wrappers`

Framework wrapper detection.

```bash
drift wrappers [options]

Options:
  --min-confidence <n>   Minimum confidence (0-1)
  --category <cat>       Filter by category
  --include-tests        Include test files
```

### `drift constants`

Analyze constants, enums, and exported values.

```bash
drift constants [subcommand] [options]

Subcommands:
  (default)          Show constants overview
  list               List all constants
  get <name>         Show constant details
  secrets            Show potential hardcoded secrets
  inconsistent       Show constants with inconsistent values
  dead               Show potentially unused constants
  export <output>    Export constants to file

Options:
  --format <type>    Output format: text, json, csv
  --category <cat>   Filter by category
  --language <lang>  Filter by language
  --file <path>      Filter by file path
  --search <query>   Search by name
  --exported         Show only exported constants
  --severity <level> Min severity for secrets
  --limit <n>        Limit results
```

**Examples:**

```bash
# Show overview
drift constants

# List API constants
drift constants list --category api

# Find hardcoded secrets
drift constants secrets --severity high

# Export to JSON
drift constants export constants.json
```

### `drift dna`

Styling DNA analysis.

```bash
drift dna <subcommand>

Subcommands:
  scan               Scan for styling patterns
  status             Show DNA profile
  gene <name>        Show specific gene
  mutations          Find style inconsistencies
  playbook           Generate style playbook
  export             Export DNA profile
```

### `drift decisions`

Mine architectural decisions from git history.

```bash
drift decisions <subcommand> [options]

Subcommands:
  mine               Mine decisions from git history
  status             Show decision mining summary
  list               List all decisions
  show <id>          Show decision details
  export             Export decisions as markdown ADRs
  confirm <id>       Confirm a draft decision
  for-file <file>    Find decisions affecting a file
  timeline           Show decisions timeline

Options:
  -f, --format <format>    Output format (text, json)
  -v, --verbose            Enable verbose output
```

**Mine Options:**
```bash
drift decisions mine [options]

Options:
  -s, --since <date>       Start date (ISO format)
  -u, --until <date>       End date (ISO format)
  -c, --min-confidence <n> Minimum confidence (0-1, default: 0.5)
```

**List Options:**
```bash
drift decisions list [options]

Options:
  -l, --limit <n>          Maximum results (default: 20)
  --category <category>    Filter by category
  --status <status>        Filter by status (draft, confirmed, superseded, rejected)
```

**Categories:**
- `technology-adoption` — New technology introduced
- `technology-removal` — Technology removed
- `pattern-introduction` — New pattern introduced
- `pattern-migration` — Pattern changed/migrated
- `architecture-change` — Architectural changes
- `api-change` — API modifications
- `security-enhancement` — Security improvements
- `performance-optimization` — Performance work
- `refactoring` — Code refactoring
- `testing-strategy` — Testing changes
- `infrastructure` — Infrastructure changes
- `other` — Other decisions

**Examples:**

```bash
# Mine decisions from git history
drift decisions mine

# Mine with date range
drift decisions mine --since 2024-01-01 --until 2024-06-30

# List all decisions
drift decisions list

# List high-confidence architecture decisions
drift decisions list --category architecture-change --status confirmed

# Show decision details
drift decisions show ADR-001

# Export as markdown ADRs
drift decisions export

# Find decisions affecting a file
drift decisions for-file src/auth/middleware.ts

# View timeline
drift decisions timeline
```

---

## Enterprise Commands

### `drift simulate`

Speculative Execution Engine: Simulates implementation approaches BEFORE coding.

```bash
drift simulate <description> [options]

Options:
  -f, --format <format>        Output format (text, json)
  -v, --verbose                Show detailed analysis
  -n, --max-approaches <n>     Maximum approaches to simulate (default: 5)
  -c, --category <category>    Task category (rate-limiting, authentication, etc.)
  -t, --target <target>        Target file or function
  --constraint <constraint>    Constraints (can be repeated)
```

**Examples:**

```bash
# Simulate adding rate limiting
drift simulate "add rate limiting to API"

# With constraints
drift simulate "add authentication" --constraint "must work with existing auth"

# Verbose output
drift simulate "refactor user service" -v
```

### `drift constraints`

Manage architectural constraints learned from the codebase.

```bash
drift constraints <subcommand> [options]

Subcommands:
  extract            Extract constraints from codebase
  list               List all constraints
  show <id>          Show constraint details
  approve <id>       Approve a discovered constraint
  ignore <id>        Ignore a constraint
  verify <file>      Verify a file against constraints
  check              Check all files against constraints
  export <output>    Export constraints to JSON file

Options:
  -f, --format <format>    Output format (text, json)
  -v, --verbose            Enable verbose output
  -c, --category <cat>     Filter by category
  -s, --status <status>    Filter by status
  -l, --limit <n>          Maximum results
  --min-confidence <n>     Minimum confidence threshold
```

**Examples:**

```bash
# Extract constraints from codebase
drift constraints extract

# List all constraints
drift constraints list

# Verify a file
drift constraints verify src/api/users.ts

# Check entire codebase
drift constraints check
```

---

## Management Commands

### `drift projects`

Manage multiple projects.

```bash
drift projects <subcommand>

Subcommands:
  list               List registered projects
  switch <name>      Switch active project
  add <path>         Register a project
  remove <name>      Unregister a project
  info <name>        Show project details
  cleanup            Remove stale projects
```

### `drift skills`

Manage Agent Skills.

```bash
drift skills <subcommand>

Subcommands:
  list               List available skills
  install <name>     Install a skill
  info <name>        Show skill details
  search <query>     Search for skills
```

### `drift parser`

Show parser status.

```bash
drift parser [options]

Options:
  --test             Test parser functionality
  --format <type>    Output format
```

### `drift env`

Show environment variable access patterns.

```bash
drift env <subcommand> [options]

Subcommands:
  (default)          Show overview
  scan               Scan codebase for environment variable access
  list               List all discovered environment variables
  var <name>         Show details for a specific variable
  secrets            Show all secret and credential variables
  required           Show required variables without defaults
  file <pattern>     Show what env vars a file or pattern accesses

Options:
  -f, --format <format>    Output format (text, json)
  -s, --sensitivity <type> Filter by sensitivity (secret, credential, config)
  --verbose                Enable verbose output
```

**Examples:**

```bash
# Scan for environment variables
drift env scan

# List all variables
drift env list

# Show secrets
drift env secrets

# Check what a file accesses
drift env file src/config.ts
```

### `drift license`

Display license status and available features.

```bash
drift license [options]

Options:
  -f, --format <format>    Output format (text, json)
```

### `drift telemetry`

Manage telemetry settings (opt-in, privacy-first).

```bash
drift telemetry <subcommand> [options]

Subcommands:
  (default)          Show telemetry status
  enable             Enable telemetry
  disable            Disable telemetry and clear queued data
  setup              Interactive telemetry configuration
  flush              Manually flush queued telemetry events

Options:
  --all              Enable all telemetry options (enable only)
  -y, --yes          Skip confirmation prompts
```

### `drift next-steps`

Get personalized recommendations for what to do next.

```bash
drift next-steps [options]

Options:
  -f, --format <format>    Output format (text, json)
  -v, --verbose            Show all recommendations with detailed reasons
```

Analyzes your project state and recommends:
- High priority actions (initialize, scan, review patterns)
- Language-specific commands based on detected languages
- Analysis data to build (call graph, test topology, coupling)
- MCP setup suggestions

### `drift troubleshoot`

Diagnose common issues and get targeted fixes.

```bash
drift troubleshoot [options]

Options:
  -f, --format <format>    Output format (text, json)
  -v, --verbose            Show all issues including info-level
  --fix                    Attempt to auto-fix issues where possible
```

Checks for:
- Initialization issues
- Invalid configuration
- Missing patterns (needs scan)
- .driftignore problems
- Large directories slowing scans
- Stale cache
- Node.js version compatibility
- MCP configuration

### `drift migrate-storage`

Migrate to unified storage format.

```bash
drift migrate-storage [options]

Options:
  --status           Show migration status only
```

---

## Global Options

These options work with all commands:

```bash
--help, -h         Show help
--version, -v      Show version
--verbose          Verbose output
--quiet, -q        Suppress output
--no-color         Disable colors
```
