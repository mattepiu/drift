# Drift Rust Core Architecture

## Implementation Status

| Phase | Status | Details |
|-------|--------|---------|
| **Phase 1: Scanner** | ✅ COMPLETE | Parallel file walking, enterprise ignores, xxHash |
| **Phase 2: Parsers** | ✅ COMPLETE | All 9 languages: TS, JS, Python, Java, C#, PHP, Go, Rust, C++ |
| **Phase 3: Call Graph** | ✅ COMPLETE | Streaming builder, disk-backed resolution, NAPI bindings |
| **Phase 4: Analysis** | ✅ COMPLETE | Boundaries, coupling, test topology, error handling (AST-first) |
| **Phase 5: Polish** | ✅ COMPLETE | Cross-platform CI, TS fallback, benchmarks, integration tests |

### Phase 4 Implementation Notes
All analysis modules follow **AST-first with regex fallbacks**:
- **Boundaries**: Uses AST-parsed CallSite data to detect ORM/database calls. Regex only for embedded SQL strings.
- **Coupling**: Uses AST-parsed imports/exports for dependency analysis. No regex needed.
- **Test Topology**: Uses AST-parsed functions/decorators for test detection. Regex only for test names in strings.
- **Error Handling**: Uses AST-parsed functions/calls for try/catch detection. Regex only for catch type extraction.

### NAPI Bindings Exposed
All modules have NAPI bindings for Node.js consumption:
- `scan()` - File scanning
- `parse()` - Source parsing
- `buildCallGraph()` - Call graph construction
- `scanBoundaries()` / `scanBoundariesSource()` - Data access detection
- `analyzeCoupling()` - Module dependency analysis
- `analyzeTestTopology()` - Test-to-code mapping
- `analyzeErrorHandling()` - Error boundary/gap detection

### Phase 3 Benchmark Results
- **577 files** parsed in **1.3s** (drift/packages/core)
- **5,058 functions** extracted
- **25,178 calls** found
- **42.2% resolution rate** (same-file and unique matches)
- **Disk-backed resolution** prevents OOM on large codebases

### Parsing Benchmarks (criterion)
- **TypeScript**: ~234 µs per file (~4,200 files/sec)
- **Python**: ~237 µs per file (~4,200 files/sec)

### Full Pipeline Benchmarks (4-file test project)
- **Scan**: ~360 µs
- **Parse all files**: ~359 µs
- **Boundary scan**: ~74 ms
- **Coupling analysis**: ~70 ms
- **Test topology**: ~70 ms
- **Error handling**: ~70 ms

### Supported Languages (9 total)
TypeScript, JavaScript, Python, Java, C#, PHP, Go, Rust, C++

---

## Executive Summary

This document maps the complete migration of Drift's performance-critical components from TypeScript to Rust. The goal: handle codebases of any size (100K+ files) without OOM, with 10-100x faster parsing, and single-binary distribution.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           STAYS IN TYPESCRIPT                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  MCP Layer  │  │  Detectors  │  │  Dashboard  │  │  CLI UX (prompts,   │ │
│  │  (tools)    │  │  (patterns) │  │  (React)    │  │  spinners, colors)  │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│                              │                                               │
│                              ▼                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                     NAPI-RS FFI BRIDGE                                 │  │
│  │   @drift/native - Node.js native addon (drift-native.node)            │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                              │                                               │
└──────────────────────────────┼───────────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            RUST CORE                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ crates/drift-core/                                                      ││
│  │  ├── scanner/        - File walking, ignore patterns, file hashing     ││
│  │  ├── parsers/        - Tree-sitter for all 8 languages                 ││
│  │  ├── call-graph/     - Function extraction, call resolution, streaming ││
│  │  ├── boundaries/     - Data access detection, table extraction         ││
│  │  ├── lake/           - SQLite storage (replaces JSON shards)           ││
│  │  ├── coupling/       - Module dependency analysis                      ││
│  │  ├── test-topology/  - Test extraction, coverage mapping               ││
│  │  ├── error-handling/ - Error boundary detection                        ││
│  │  └── languages/      - Language-specific analyzers                     ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

## What Moves to Rust vs Stays in TypeScript

### RUST (Performance-Critical, Memory-Intensive)
- File system scanning and walking
- All parsing (tree-sitter native)
- Call graph building and resolution
- Data access/boundary detection
- Storage layer (SQLite)
- Module coupling analysis
- Test topology extraction
- Error handling analysis

### TYPESCRIPT (Business Logic, UX, Extensibility)
- MCP tool implementations
- Pattern detectors (user-extensible)
- Dashboard UI (React)
- CLI user experience
- Configuration loading
- Report generation
- AI integration layer

---

## Rust Crate Structure

```
crates/
├── drift-core/           # Main library crate
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs
│       ├── scanner/
│       ├── parsers/
│       ├── call_graph/
│       ├── boundaries/
│       ├── lake/
│       ├── coupling/
│       ├── test_topology/
│       ├── error_handling/
│       └── languages/
│
├── drift-napi/           # NAPI-RS bindings for Node.js
│   ├── Cargo.toml
│   ├── src/lib.rs
│   └── index.d.ts        # TypeScript declarations
│
└── drift-cli/            # Optional: Pure Rust CLI (future)
    ├── Cargo.toml
    └── src/main.rs
```


---

## Module-by-Module Mapping

### 1. `crates/drift-core/src/scanner/`

**Replaces:** `packages/core/src/scanner/`

| Rust Module | TypeScript File | Purpose |
|-------------|-----------------|---------|
| `mod.rs` | `index.ts` | Module exports |
| `walker.rs` | `scanner.ts` | Parallel file walking with ignore-rs |
| `ignores.rs` | `default-ignores.ts` | Enterprise ignore patterns |
| `hasher.rs` | (new) | xxHash file hashing for cache invalidation |
| `types.rs` | `types.ts` | ScanResult, FileInfo types |

**Key Improvements:**
- `ignore` crate for gitignore-style matching (10x faster than minimatch)
- `walkdir` + `rayon` for parallel directory traversal
- `xxhash-rust` for fast file hashing
- Memory-mapped file reading for large files

```rust
// scanner/walker.rs
use ignore::WalkBuilder;
use rayon::prelude::*;

pub struct Scanner {
    root: PathBuf,
    ignores: IgnorePatterns,
}

impl Scanner {
    pub fn scan(&self, patterns: &[&str]) -> ScanResult {
        WalkBuilder::new(&self.root)
            .add_custom_ignore_file(".driftignore")
            .build_parallel()
            .run(|| {
                // Process files in parallel
            })
    }
}
```

---

### 2. `crates/drift-core/src/parsers/`

**Replaces:** `packages/core/src/parsers/` + `packages/core/src/parsers/tree-sitter/`

| Rust Module | TypeScript Files | Purpose |
|-------------|------------------|---------|
| `mod.rs` | `index.ts` | Parser registry |
| `manager.rs` | `parser-manager.ts` | Language detection, parser selection |
| `types.rs` | `types.ts` | AST types, ParseResult |
| `typescript.rs` | `tree-sitter/tree-sitter-*.ts`, `typescript-parser.ts` | TS/JS parsing |
| `python.rs` | `tree-sitter/tree-sitter-python-parser.ts`, `python-parser.ts` | Python parsing |
| `csharp.rs` | `tree-sitter/tree-sitter-csharp-parser.ts` | C# parsing |
| `java.rs` | `tree-sitter/tree-sitter-java-parser.ts`, `java/` | Java parsing |
| `php.rs` | `tree-sitter/tree-sitter-php-parser.ts` | PHP parsing |
| `go.rs` | `tree-sitter/tree-sitter-go-parser.ts` | Go parsing |
| `rust.rs` | `tree-sitter/tree-sitter-rust-parser.ts` | Rust parsing |
| `cpp.rs` | `tree-sitter/tree-sitter-cpp-parser.ts` | C++ parsing |

**Key Improvements:**
- Native tree-sitter (no WASM overhead)
- Parallel parsing with rayon
- Zero-copy AST traversal
- Incremental parsing support

```rust
// parsers/manager.rs
use tree_sitter::{Parser, Language};

pub struct ParserManager {
    parsers: HashMap<&'static str, Parser>,
}

impl ParserManager {
    pub fn parse(&mut self, source: &str, lang: &str) -> ParseResult {
        let parser = self.parsers.get_mut(lang)?;
        let tree = parser.parse(source, None)?;
        // Convert to drift AST
    }
}
```

---

### 3. `crates/drift-core/src/call_graph/`

**Replaces:** `packages/core/src/call-graph/`

| Rust Module | TypeScript Files | Purpose |
|-------------|------------------|---------|
| `mod.rs` | `index.ts` | Module exports |
| `types.rs` | `types.ts` | CallGraph, FunctionNode, CallSite |
| `builder.rs` | `streaming-builder.ts` | Streaming graph construction |
| `resolver.rs` | (in streaming-builder.ts) | Call resolution with disk-backed index |
| `provider.rs` | `unified-provider.ts` | Unified access to call graph |
| `extractors/mod.rs` | `extractors/index.ts` | Extractor registry |
| `extractors/base.rs` | `extractors/base-extractor.ts` | Base extractor trait |
| `extractors/typescript.rs` | `extractors/typescript-extractor.ts` | TS function/call extraction |
| `extractors/python.rs` | `extractors/python-extractor.ts` | Python extraction |
| `extractors/csharp.rs` | `extractors/csharp-extractor.ts` | C# extraction |
| `extractors/java.rs` | `extractors/java-extractor.ts` | Java extraction |
| `extractors/php.rs` | `extractors/php-extractor.ts` | PHP extraction |
| `extractors/go.rs` | `extractors/go-extractor.ts` | Go extraction |
| `extractors/rust.rs` | `extractors/rust-extractor.ts` | Rust extraction |
| `extractors/cpp.rs` | `extractors/cpp-hybrid-extractor.ts` | C++ extraction |
| `analysis/impact.rs` | `analysis/impact-analyzer.ts` | Impact analysis |
| `analysis/dead_code.rs` | `analysis/dead-code-detector.ts` | Dead code detection |
| `analysis/coverage.rs` | `analysis/coverage-analyzer.ts` | Coverage analysis |
| `analysis/reachability.rs` | `store/reachability-engine.ts` | Reachability queries |

**Key Improvements:**
- Petgraph for efficient graph operations
- Memory-mapped resolution index
- Parallel extraction with rayon
- Streaming writes to SQLite

```rust
// call_graph/builder.rs
use petgraph::graph::DiGraph;
use rusqlite::Connection;

pub struct StreamingBuilder {
    db: Connection,
    graph: DiGraph<FunctionNode, CallEdge>,
}

impl StreamingBuilder {
    pub fn build(&mut self, files: &[PathBuf]) -> BuildResult {
        files.par_iter().for_each(|file| {
            let shard = self.extract_file(file);
            self.write_shard(&shard); // Immediate disk write
        });
        self.resolve_calls(); // Disk-backed resolution
    }
}
```


---

### 4. `crates/drift-core/src/boundaries/`

**Replaces:** `packages/core/src/boundaries/`

| Rust Module | TypeScript Files | Purpose |
|-------------|------------------|---------|
| `mod.rs` | `index.ts` | Module exports |
| `types.rs` | `types.ts` | DataAccessPoint, TableInfo |
| `scanner.rs` | `boundary-scanner.ts` | Data access detection |
| `store.rs` | `boundary-store.ts` | Access map persistence |
| `validator.rs` | `table-name-validator.ts` | Table name validation |
| `prioritizer.rs` | `security-prioritizer.ts` | Sensitivity classification |
| `learner.rs` | `data-access-learner.ts` | Pattern learning |
| `extractors/mod.rs` | `field-extractors/index.ts` | Field extractor registry |
| `extractors/prisma.rs` | `field-extractors/prisma-extractor.ts` | Prisma field extraction |
| `extractors/typeorm.rs` | `field-extractors/typeorm-extractor.ts` | TypeORM extraction |
| `extractors/sequelize.rs` | `field-extractors/sequelize-extractor.ts` | Sequelize extraction |
| `extractors/drizzle.rs` | `field-extractors/drizzle-extractor.ts` | Drizzle extraction |
| `extractors/mongoose.rs` | `field-extractors/mongoose-extractor.ts` | Mongoose extraction |
| `extractors/sqlalchemy.rs` | `field-extractors/sqlalchemy-extractor.ts` | SQLAlchemy extraction |
| `extractors/django.rs` | `field-extractors/django-extractor.ts` | Django ORM extraction |
| `extractors/ef_core.rs` | `field-extractors/ef-core-extractor.ts` | Entity Framework extraction |
| `extractors/spring.rs` | `field-extractors/spring-data-extractor.ts` | Spring Data extraction |
| `extractors/eloquent.rs` | `field-extractors/eloquent-extractor.ts` | Laravel Eloquent extraction |

**Key Improvements:**
- Regex crate for fast pattern matching
- Parallel table/field extraction
- SQLite for access map storage

```rust
// boundaries/scanner.rs
use regex::Regex;

pub struct BoundaryScanner {
    extractors: Vec<Box<dyn FieldExtractor>>,
}

impl BoundaryScanner {
    pub fn scan(&self, ast: &AST, file: &str) -> Vec<DataAccessPoint> {
        self.extractors.par_iter()
            .flat_map(|e| e.extract(ast, file))
            .collect()
    }
}
```

---

### 5. `crates/drift-core/src/lake/`

**Replaces:** `packages/core/src/lake/` + `packages/core/src/store/`

| Rust Module | TypeScript Files | Purpose |
|-------------|------------------|---------|
| `mod.rs` | `index.ts` | Module exports |
| `types.rs` | `types.ts` | Shard types, view types |
| `db.rs` | (new - replaces JSON) | SQLite database management |
| `migrations.rs` | (new) | Schema migrations |
| `patterns.rs` | `pattern-shard-store.ts` | Pattern storage |
| `callgraph.rs` | `callgraph-shard-store.ts` | Call graph storage |
| `security.rs` | `security-shard-store.ts` | Security data storage |
| `views.rs` | `view-generator.ts` | Materialized view generation |
| `indexes.rs` | `index-builder.ts` | Index building |
| `manifest.rs` | `manifest-manager.ts` | Manifest management |

**Key Improvements:**
- SQLite with WAL mode for concurrent reads
- Memory-mapped database for large datasets
- Prepared statements for fast queries
- Automatic schema migrations

```rust
// lake/db.rs
use rusqlite::{Connection, params};

pub struct DriftDb {
    conn: Connection,
}

impl DriftDb {
    pub fn new(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        Ok(Self { conn })
    }
}
```

**SQLite Schema:**
```sql
-- patterns table
CREATE TABLE patterns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    status TEXT NOT NULL,
    confidence REAL NOT NULL,
    data BLOB NOT NULL  -- MessagePack serialized
);

-- functions table  
CREATE TABLE functions (
    id TEXT PRIMARY KEY,
    file TEXT NOT NULL,
    name TEXT NOT NULL,
    start_line INTEGER,
    end_line INTEGER,
    is_entry_point BOOLEAN,
    is_data_accessor BOOLEAN,
    data BLOB NOT NULL
);

-- calls table
CREATE TABLE calls (
    caller_id TEXT NOT NULL,
    callee_id TEXT,
    target TEXT NOT NULL,
    resolved BOOLEAN,
    confidence REAL,
    line INTEGER,
    FOREIGN KEY (caller_id) REFERENCES functions(id)
);

-- data_access table
CREATE TABLE data_access (
    id INTEGER PRIMARY KEY,
    function_id TEXT NOT NULL,
    table_name TEXT NOT NULL,
    operation TEXT NOT NULL,
    fields TEXT,  -- JSON array
    line INTEGER,
    FOREIGN KEY (function_id) REFERENCES functions(id)
);

-- Indexes for fast queries
CREATE INDEX idx_patterns_category ON patterns(category);
CREATE INDEX idx_functions_file ON functions(file);
CREATE INDEX idx_calls_callee ON calls(callee_id);
CREATE INDEX idx_data_access_table ON data_access(table_name);
```


---

### 6. `crates/drift-core/src/coupling/`

**Replaces:** `packages/core/src/module-coupling/`

| Rust Module | TypeScript Files | Purpose |
|-------------|------------------|---------|
| `mod.rs` | `index.ts` | Module exports |
| `types.rs` | `types.ts` | CouplingMetrics, ModuleNode |
| `analyzer.rs` | `coupling-analyzer.ts` | Dependency analysis |
| `cycles.rs` | (in coupling-analyzer.ts) | Cycle detection |
| `metrics.rs` | (in coupling-analyzer.ts) | Robert C. Martin metrics |

**Key Improvements:**
- Petgraph for cycle detection (Tarjan's algorithm)
- Parallel metric calculation
- Efficient transitive closure

```rust
// coupling/analyzer.rs
use petgraph::algo::tarjan_scc;

pub struct CouplingAnalyzer {
    graph: DiGraph<ModuleNode, ImportEdge>,
}

impl CouplingAnalyzer {
    pub fn detect_cycles(&self) -> Vec<DependencyCycle> {
        tarjan_scc(&self.graph)
            .into_iter()
            .filter(|scc| scc.len() > 1)
            .map(|scc| self.build_cycle(scc))
            .collect()
    }
}
```

---

### 7. `crates/drift-core/src/test_topology/`

**Replaces:** `packages/core/src/test-topology/`

| Rust Module | TypeScript Files | Purpose |
|-------------|------------------|---------|
| `mod.rs` | `index.ts` | Module exports |
| `types.rs` | `types.ts` | TestCase, MockStatement, TestCoverage |
| `analyzer.rs` | `test-topology-analyzer.ts` | Main analyzer |
| `extractors/mod.rs` | `extractors/index.ts` | Extractor registry |
| `extractors/typescript.rs` | `extractors/typescript-test-extractor.ts` | Jest/Vitest extraction |
| `extractors/python.rs` | `extractors/python-test-extractor.ts` | Pytest extraction |
| `extractors/java.rs` | `extractors/java-test-extractor.ts` | JUnit extraction |
| `extractors/csharp.rs` | `extractors/csharp-test-extractor.ts` | xUnit/NUnit extraction |
| `extractors/php.rs` | `extractors/php-test-extractor.ts` | PHPUnit extraction |
| `extractors/go.rs` | `extractors/go-test-extractor.ts` | Go testing extraction |
| `extractors/cpp.rs` | `extractors/cpp-test-extractor.ts` | GoogleTest extraction |

```rust
// test_topology/analyzer.rs
pub struct TestTopologyAnalyzer {
    extractors: Vec<Box<dyn TestExtractor>>,
    call_graph: Arc<CallGraph>,
}

impl TestTopologyAnalyzer {
    pub fn analyze(&self, files: &[PathBuf]) -> TestTopologyResult {
        let tests = self.extract_tests(files);
        let coverage = self.compute_coverage(&tests);
        TestTopologyResult { tests, coverage }
    }
}
```

---

### 8. `crates/drift-core/src/error_handling/`

**Replaces:** `packages/core/src/error-handling/`

| Rust Module | TypeScript Files | Purpose |
|-------------|------------------|---------|
| `mod.rs` | `index.ts` | Module exports |
| `types.rs` | `types.ts` | ErrorBoundary, CatchClause |
| `analyzer.rs` | `error-handling-analyzer.ts` | Error handling analysis |
| `gaps.rs` | (in analyzer) | Gap detection |
| `boundaries.rs` | (in analyzer) | Boundary detection |

---

### 9. `crates/drift-core/src/languages/`

**Replaces:** Language-specific analyzers

| Rust Module | TypeScript Directory | Purpose |
|-------------|---------------------|---------|
| `typescript/mod.rs` | `typescript/` | TS/JS analysis |
| `python/mod.rs` | `python/` | Python analysis |
| `java/mod.rs` | `java/` | Java analysis |
| `csharp/mod.rs` | (in call-graph) | C# analysis |
| `php/mod.rs` | `php/` | PHP analysis |
| `go/mod.rs` | `go/` | Go analysis |
| `rust/mod.rs` | `rust/` | Rust analysis |
| `cpp/mod.rs` | `cpp/` | C++ analysis |
| `wpf/mod.rs` | `wpf/` | WPF/XAML analysis |

Each language module contains:
- Route extraction
- Error handling patterns
- Data access patterns
- Framework-specific detection

---

## NAPI-RS Bridge

**Location:** `crates/drift-napi/`

The bridge exposes Rust functions to Node.js:

```rust
// drift-napi/src/lib.rs
use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi]
pub struct DriftCore {
    inner: drift_core::DriftCore,
}

#[napi]
impl DriftCore {
    #[napi(constructor)]
    pub fn new(root_dir: String) -> Result<Self> {
        Ok(Self {
            inner: drift_core::DriftCore::new(&root_dir)?,
        })
    }

    #[napi]
    pub async fn scan(&self, patterns: Vec<String>) -> Result<ScanResult> {
        self.inner.scan(&patterns).await
    }

    #[napi]
    pub async fn build_call_graph(&self) -> Result<CallGraphResult> {
        self.inner.build_call_graph().await
    }

    #[napi]
    pub fn query_reachability(&self, entry: String) -> Result<ReachabilityResult> {
        self.inner.query_reachability(&entry)
    }

    #[napi]
    pub fn get_patterns(&self, filter: PatternFilter) -> Result<Vec<Pattern>> {
        self.inner.get_patterns(&filter)
    }
}
```

**TypeScript Usage:**
```typescript
// packages/core/src/native.ts
import { DriftCore } from '@drift/native';

const core = new DriftCore(rootDir);
const result = await core.scan(['**/*.ts']);
const callGraph = await core.buildCallGraph();
```


---

## What Stays in TypeScript

### 1. MCP Layer (`packages/mcp/`)
- Tool implementations (drift_context, drift_status, etc.)
- Tool orchestration and filtering
- Response formatting
- Stays in TS because: Business logic, easy to modify, not performance-critical

### 2. Detectors (`packages/detectors/`)
- Pattern detection rules
- Framework-specific detectors
- User-extensible patterns
- Stays in TS because: Extensibility, user customization, pattern DSL

### 3. Dashboard (`packages/dashboard/`)
- React UI
- Visualization components
- Stays in TS because: Web technology, React ecosystem

### 4. CLI UX (`packages/cli/`)
- Command parsing (Commander.js)
- Spinners, colors, prompts
- Progress bars
- Stays in TS because: UX polish, rapid iteration

### 5. AI Integration
- LLM prompts and responses
- Suggestion generation
- Stays in TS because: Rapid iteration, prompt engineering

### 6. Configuration (`packages/core/src/config/`)
- Config file loading
- Validation
- Stays in TS because: User-facing, schema validation

---

## Migration Strategy

### Phase 1: Scanner + Parsers (Week 1-2)
1. Implement `drift-core/scanner` with ignore-rs
2. Implement `drift-core/parsers` with native tree-sitter
3. Create NAPI bridge for scan/parse
4. Benchmark: Target 10x improvement

### Phase 2: Call Graph (Week 3-4)
1. Implement `drift-core/call_graph` extractors
2. Implement streaming builder with SQLite
3. Implement resolution with disk-backed index
4. Benchmark: Target 100K files without OOM

### Phase 3: Storage Layer (Week 5-6)
1. Implement SQLite schema and migrations
2. Migrate from JSON shards to SQLite
3. Implement materialized views
4. Benchmark: Query latency < 10ms

### Phase 4: Analysis Modules (Week 7-8)
1. Implement boundaries/coupling/test-topology
2. Implement error-handling analysis
3. Wire up all NAPI exports
4. Full integration testing

### Phase 5: Polish + Release (Week 9-10)
1. Cross-platform builds (macOS, Linux, Windows)
2. Fallback to pure-TS if native fails
3. Documentation
4. Performance benchmarks

---

## Cargo Dependencies

```toml
# crates/drift-core/Cargo.toml
[dependencies]
# Parsing
tree-sitter = "0.22"
tree-sitter-typescript = "0.22"
tree-sitter-python = "0.22"
tree-sitter-c-sharp = "0.22"
tree-sitter-java = "0.22"
tree-sitter-php = "0.22"
tree-sitter-go = "0.22"
tree-sitter-rust = "0.22"
tree-sitter-cpp = "0.22"

# File system
walkdir = "2"
ignore = "0.4"
globset = "0.4"

# Parallelism
rayon = "1.10"
crossbeam = "0.8"

# Storage
rusqlite = { version = "0.31", features = ["bundled"] }
rmp-serde = "1"  # MessagePack serialization

# Graphs
petgraph = "0.6"

# Hashing
xxhash-rust = { version = "0.8", features = ["xxh3"] }

# Regex
regex = "1"

# Serialization
serde = { version = "1", features = ["derive"] }
serde_json = "1"

# Error handling
thiserror = "1"
anyhow = "1"

# Async (for NAPI)
tokio = { version = "1", features = ["rt-multi-thread"] }
```

```toml
# crates/drift-napi/Cargo.toml
[dependencies]
drift-core = { path = "../drift-core" }
napi = { version = "2", features = ["async", "serde-json"] }
napi-derive = "2"

[build-dependencies]
napi-build = "2"
```

---

## Performance Targets

| Operation | Current (TS) | Target (Rust) | Improvement |
|-----------|--------------|---------------|-------------|
| Scan 10K files | 15s | 1.5s | 10x |
| Parse 10K files | 45s | 3s | 15x |
| Build call graph (10K) | 120s | 8s | 15x |
| Build call graph (100K) | OOM | 60s | ∞ |
| Query reachability | 500ms | 5ms | 100x |
| Pattern lookup | 100ms | 1ms | 100x |

---

## File Count Summary

| Component | TypeScript Files | Rust Modules | Notes |
|-----------|-----------------|--------------|-------|
| Scanner | 5 | 5 | Direct port |
| Parsers | 25 | 10 | Consolidated |
| Call Graph | 35 | 20 | Consolidated |
| Boundaries | 15 | 15 | Direct port |
| Lake/Storage | 12 | 8 | SQLite replaces JSON |
| Coupling | 3 | 4 | Direct port |
| Test Topology | 12 | 10 | Direct port |
| Error Handling | 4 | 4 | Direct port |
| Languages | 8 | 9 | Direct port |
| **Total** | **~120** | **~85** | 30% reduction |

---

## Risk Mitigation

1. **Fallback Mode**: If native addon fails to load, fall back to pure TypeScript
2. **Incremental Migration**: Each module can be migrated independently
3. **Feature Flags**: Enable/disable Rust core per-feature
4. **Cross-Platform CI**: Test on macOS, Linux, Windows ARM/x64

---

## Success Criteria

1. ✅ Scan 100K+ files without OOM
2. ✅ 10x faster parsing
3. ✅ 100x faster queries (SQLite)
4. ✅ Single binary distribution (no tree-sitter WASM)
5. ✅ Cross-platform support
6. ✅ Graceful fallback to TypeScript


---

## Complete File-by-File Mapping

### Scanner Module
| TypeScript Path | Rust Path | Status |
|-----------------|-----------|--------|
| `scanner/index.ts` | `scanner/mod.rs` | Port |
| `scanner/scanner.ts` | `scanner/walker.rs` | Port |
| `scanner/default-ignores.ts` | `scanner/ignores.rs` | Port |
| `scanner/types.ts` | `scanner/types.rs` | Port |

### Parsers Module
| TypeScript Path | Rust Path | Status |
|-----------------|-----------|--------|
| `parsers/index.ts` | `parsers/mod.rs` | Port |
| `parsers/base-parser.ts` | `parsers/base.rs` | Port |
| `parsers/parser-manager.ts` | `parsers/manager.rs` | Port |
| `parsers/types.ts` | `parsers/types.rs` | Port |
| `parsers/typescript-parser.ts` | `parsers/typescript.rs` | Merge |
| `parsers/python-parser.ts` | `parsers/python.rs` | Merge |
| `parsers/css-parser.ts` | `parsers/css.rs` | Port |
| `parsers/json-parser.ts` | `parsers/json.rs` | Port |
| `parsers/markdown-parser.ts` | `parsers/markdown.rs` | Port |
| `parsers/tree-sitter/index.ts` | (merged into language modules) | Merge |
| `parsers/tree-sitter/loader.ts` | (native - not needed) | Remove |
| `parsers/tree-sitter/config.ts` | (native - not needed) | Remove |
| `parsers/tree-sitter/tree-sitter-python-parser.ts` | `parsers/python.rs` | Merge |
| `parsers/tree-sitter/tree-sitter-csharp-parser.ts` | `parsers/csharp.rs` | Merge |
| `parsers/tree-sitter/tree-sitter-java-parser.ts` | `parsers/java.rs` | Merge |
| `parsers/tree-sitter/tree-sitter-php-parser.ts` | `parsers/php.rs` | Merge |
| `parsers/tree-sitter/tree-sitter-go-parser.ts` | `parsers/go.rs` | Merge |
| `parsers/tree-sitter/tree-sitter-rust-parser.ts` | `parsers/rust_lang.rs` | Merge |
| `parsers/tree-sitter/tree-sitter-cpp-parser.ts` | `parsers/cpp.rs` | Merge |
| `parsers/tree-sitter/*-loader.ts` | (native - not needed) | Remove |
| `parsers/tree-sitter/*-ast-converter.ts` | (merged into parsers) | Merge |

### Call Graph Module
| TypeScript Path | Rust Path | Status |
|-----------------|-----------|--------|
| `call-graph/index.ts` | `call_graph/mod.rs` | Port |
| `call-graph/types.ts` | `call_graph/types.rs` | Port |
| `call-graph/streaming-builder.ts` | `call_graph/builder.rs` | Port |
| `call-graph/unified-provider.ts` | `call_graph/provider.rs` | Port |
| `call-graph/extractors/index.ts` | `call_graph/extractors/mod.rs` | Port |
| `call-graph/extractors/base-extractor.ts` | `call_graph/extractors/base.rs` | Port |
| `call-graph/extractors/typescript-extractor.ts` | `call_graph/extractors/typescript.rs` | Port |
| `call-graph/extractors/python-extractor.ts` | `call_graph/extractors/python.rs` | Port |
| `call-graph/extractors/csharp-extractor.ts` | `call_graph/extractors/csharp.rs` | Port |
| `call-graph/extractors/java-extractor.ts` | `call_graph/extractors/java.rs` | Port |
| `call-graph/extractors/php-extractor.ts` | `call_graph/extractors/php.rs` | Port |
| `call-graph/extractors/go-extractor.ts` | `call_graph/extractors/go.rs` | Port |
| `call-graph/extractors/rust-extractor.ts` | `call_graph/extractors/rust_lang.rs` | Port |
| `call-graph/extractors/cpp-hybrid-extractor.ts` | `call_graph/extractors/cpp.rs` | Port |
| `call-graph/extractors/*-hybrid-extractor.ts` | (merged into main extractors) | Merge |
| `call-graph/extractors/*-data-access-extractor.ts` | `boundaries/extractors/*.rs` | Move |
| `call-graph/extractors/semantic-data-access-scanner.ts` | `boundaries/scanner.rs` | Move |
| `call-graph/extractors/regex/*.ts` | (merged into extractors) | Merge |
| `call-graph/analysis/impact-analyzer.ts` | `call_graph/analysis/impact.rs` | Port |
| `call-graph/analysis/dead-code-detector.ts` | `call_graph/analysis/dead_code.rs` | Port |
| `call-graph/analysis/coverage-analyzer.ts` | `call_graph/analysis/coverage.rs` | Port |
| `call-graph/store/reachability-engine.ts` | `call_graph/analysis/reachability.rs` | Port |
| `call-graph/store/call-graph-store.ts` | `lake/callgraph.rs` | Move |
| `call-graph/store/graph-builder.ts` | `call_graph/builder.rs` | Merge |
| `call-graph/enrichment/*.ts` | `call_graph/enrichment.rs` | Merge |

### Boundaries Module
| TypeScript Path | Rust Path | Status |
|-----------------|-----------|--------|
| `boundaries/index.ts` | `boundaries/mod.rs` | Port |
| `boundaries/types.ts` | `boundaries/types.rs` | Port |
| `boundaries/boundary-scanner.ts` | `boundaries/scanner.rs` | Port |
| `boundaries/boundary-store.ts` | `boundaries/store.rs` | Port |
| `boundaries/table-name-validator.ts` | `boundaries/validator.rs` | Port |
| `boundaries/security-prioritizer.ts` | `boundaries/prioritizer.rs` | Port |
| `boundaries/data-access-learner.ts` | `boundaries/learner.rs` | Port |
| `boundaries/field-extractors/index.ts` | `boundaries/extractors/mod.rs` | Port |
| `boundaries/field-extractors/prisma-extractor.ts` | `boundaries/extractors/prisma.rs` | Port |
| `boundaries/field-extractors/typeorm-extractor.ts` | `boundaries/extractors/typeorm.rs` | Port |
| `boundaries/field-extractors/sequelize-extractor.ts` | `boundaries/extractors/sequelize.rs` | Port |
| `boundaries/field-extractors/drizzle-extractor.ts` | `boundaries/extractors/drizzle.rs` | Port |
| `boundaries/field-extractors/mongoose-extractor.ts` | `boundaries/extractors/mongoose.rs` | Port |
| `boundaries/field-extractors/sqlalchemy-extractor.ts` | `boundaries/extractors/sqlalchemy.rs` | Port |
| `boundaries/field-extractors/django-extractor.ts` | `boundaries/extractors/django.rs` | Port |
| `boundaries/field-extractors/ef-core-extractor.ts` | `boundaries/extractors/ef_core.rs` | Port |
| `boundaries/field-extractors/spring-data-extractor.ts` | `boundaries/extractors/spring.rs` | Port |
| `boundaries/field-extractors/eloquent-extractor.ts` | `boundaries/extractors/eloquent.rs` | Port |

### Lake/Storage Module
| TypeScript Path | Rust Path | Status |
|-----------------|-----------|--------|
| `lake/index.ts` | `lake/mod.rs` | Port |
| `lake/types.ts` | `lake/types.rs` | Port |
| `lake/data-lake.ts` | `lake/db.rs` | Rewrite (SQLite) |
| `lake/manifest-manager.ts` | `lake/manifest.rs` | Port |
| `lake/view-generator.ts` | `lake/views.rs` | Port |
| `lake/index-builder.ts` | `lake/indexes.rs` | Port |
| `lake/pattern-shard-store.ts` | `lake/patterns.rs` | Rewrite (SQLite) |
| `lake/callgraph-shard-store.ts` | `lake/callgraph.rs` | Rewrite (SQLite) |
| `lake/security-shard-store.ts` | `lake/security.rs` | Rewrite (SQLite) |
| `lake/example-store.ts` | `lake/examples.rs` | Rewrite (SQLite) |
| `store/pattern-store.ts` | `lake/patterns.rs` | Merge |
| `store/contract-store.ts` | `lake/contracts.rs` | Port |
| `store/history-store.ts` | `lake/history.rs` | Port |
| `store/cache-manager.ts` | (SQLite handles caching) | Remove |
| `store/project-registry.ts` | `lake/registry.rs` | Port |
| `store/project-config.ts` | (stays in TS - config) | Keep TS |

### Module Coupling
| TypeScript Path | Rust Path | Status |
|-----------------|-----------|--------|
| `module-coupling/index.ts` | `coupling/mod.rs` | Port |
| `module-coupling/types.ts` | `coupling/types.rs` | Port |
| `module-coupling/coupling-analyzer.ts` | `coupling/analyzer.rs` | Port |

### Test Topology
| TypeScript Path | Rust Path | Status |
|-----------------|-----------|--------|
| `test-topology/index.ts` | `test_topology/mod.rs` | Port |
| `test-topology/types.ts` | `test_topology/types.rs` | Port |
| `test-topology/test-topology-analyzer.ts` | `test_topology/analyzer.rs` | Port |
| `test-topology/hybrid-test-topology-analyzer.ts` | (merged) | Merge |
| `test-topology/extractors/typescript-test-extractor.ts` | `test_topology/extractors/typescript.rs` | Port |
| `test-topology/extractors/python-test-extractor.ts` | `test_topology/extractors/python.rs` | Port |
| `test-topology/extractors/java-test-extractor.ts` | `test_topology/extractors/java.rs` | Port |
| `test-topology/extractors/csharp-test-extractor.ts` | `test_topology/extractors/csharp.rs` | Port |
| `test-topology/extractors/php-test-extractor.ts` | `test_topology/extractors/php.rs` | Port |
| `test-topology/extractors/go-test-extractor.ts` | `test_topology/extractors/go.rs` | Port |
| `test-topology/extractors/cpp-test-extractor.ts` | `test_topology/extractors/cpp.rs` | Port |

### Error Handling
| TypeScript Path | Rust Path | Status |
|-----------------|-----------|--------|
| `error-handling/index.ts` | `error_handling/mod.rs` | Port |
| `error-handling/types.ts` | `error_handling/types.rs` | Port |
| `error-handling/error-handling-analyzer.ts` | `error_handling/analyzer.rs` | Port |

### Language Analyzers
| TypeScript Path | Rust Path | Status |
|-----------------|-----------|--------|
| `typescript/index.ts` | `languages/typescript/mod.rs` | Port |
| `typescript/typescript-analyzer.ts` | `languages/typescript/analyzer.rs` | Port |
| `python/index.ts` | `languages/python/mod.rs` | Port |
| `python/python-analyzer.ts` | `languages/python/analyzer.rs` | Port |
| `java/index.ts` | `languages/java/mod.rs` | Port |
| `java/java-analyzer.ts` | `languages/java/analyzer.rs` | Port |
| `php/index.ts` | `languages/php/mod.rs` | Port |
| `php/php-analyzer.ts` | `languages/php/analyzer.rs` | Port |
| `go/index.ts` | `languages/go/mod.rs` | Port |
| `go/go-analyzer.ts` | `languages/go/analyzer.rs` | Port |
| `rust/index.ts` | `languages/rust_lang/mod.rs` | Port |
| `rust/rust-analyzer.ts` | `languages/rust_lang/analyzer.rs` | Port |
| `cpp/index.ts` | `languages/cpp/mod.rs` | Port |
| `cpp/cpp-analyzer.ts` | `languages/cpp/analyzer.rs` | Port |
| `wpf/index.ts` | `languages/wpf/mod.rs` | Port |
| `wpf/*.ts` | `languages/wpf/*.rs` | Port |

### Stays in TypeScript (Not Ported)
| TypeScript Path | Reason |
|-----------------|--------|
| `analyzers/*` | Business logic, extensible |
| `config/*` | User-facing config |
| `constraints/*` | Business logic |
| `context/*` | MCP context |
| `decisions/*` | Git integration (libgit2 optional) |
| `dna/*` | Styling analysis |
| `environment/*` | Env var detection |
| `language-intelligence/*` | Framework patterns |
| `learning/*` | Pattern learning |
| `licensing/*` | License checks |
| `manifest/*` | Pattern discovery |
| `matcher/*` | Pattern matching |
| `patterns/*` | Pattern repository |
| `quality-gates/*` | CI integration |
| `rules/*` | Rule evaluation |
| `simulation/*` | Speculative execution |
| `speculative/*` | Approach simulation |
| `telemetry/*` | Analytics |
| `types/*` | Shared types |
| `unified-provider/*` | Orchestration |
| `wrappers/*` | Wrapper detection |

---

## Summary Statistics

| Category | Files Moving to Rust | Files Staying in TS |
|----------|---------------------|---------------------|
| Scanner | 4 | 0 |
| Parsers | 25 → 10 | 0 |
| Call Graph | 35 → 20 | 0 |
| Boundaries | 15 | 0 |
| Lake/Storage | 12 → 8 | 2 |
| Coupling | 3 | 0 |
| Test Topology | 12 → 10 | 0 |
| Error Handling | 4 | 0 |
| Languages | 18 | 0 |
| **Subtotal** | **~85 Rust modules** | - |
| Analyzers | - | 15 |
| Config | - | 8 |
| Constraints | - | 12 |
| Decisions | - | 20 |
| DNA | - | 10 |
| Learning | - | 8 |
| Matcher | - | 12 |
| Patterns | - | 15 |
| Rules | - | 10 |
| Simulation | - | 15 |
| Other | - | 25 |
| **Subtotal** | - | **~150 TS files** |

**Total: ~85 Rust modules replace ~120 TS files (30% consolidation)**
**~150 TS files remain for business logic, UX, extensibility**
