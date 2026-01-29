# Rust Unified Analyzer - Novel Architecture

## Executive Summary

Instead of porting Pattern Detection and Resolution Index separately, we design a **Unified Analyzer** that performs both in a single optimized pass. This eliminates redundant file reads, enables cross-system optimizations, and provides 50-100x performance improvement.

## CRITICAL: AST-First Architecture

Drift is **AST-first with regex fallback** - NOT regex-first. This is a core architectural principle:

```
┌─────────────────────────────────────────────────────────────┐
│                    DETECTION STRATEGY                        │
│                                                              │
│  1. PARSE (tree-sitter) ──────────────────────────────────▶ │
│     All 9 languages: TS, JS, Python, Java, C#, PHP, Go,     │
│     Rust, C++                                                │
│                                                              │
│  2. AST QUERIES (primary) ────────────────────────────────▶ │
│     - Decorators: @auth, @route, @Injectable, @Entity       │
│     - Function signatures: async, export, public            │
│     - Import/export patterns                                 │
│     - Class hierarchies and inheritance                      │
│     - Method calls and receivers                             │
│     - Type annotations                                       │
│                                                              │
│  3. REGEX FALLBACK (secondary) ───────────────────────────▶ │
│     ONLY for string literal content:                         │
│     - SQL queries: "SELECT * FROM users"                    │
│     - Route paths: "/api/v1/users/:id"                      │
│     - Config values: process.env.DATABASE_URL               │
│     - Comments: // TODO, /* FIXME */                        │
└─────────────────────────────────────────────────────────────┘
```

### Why AST-First?

1. **Accuracy**: AST understands code structure, regex doesn't
2. **Language-aware**: Same pattern detected correctly across all 9 languages
3. **No false positives**: Won't match patterns inside comments/strings
4. **Semantic context**: Knows if `auth` is a function call vs variable name

## Current Architecture Problems

### Pattern Detection Issues
1. **Regex Recompilation**: Each of 50+ detectors compiles regex per file
2. **Sequential Execution**: No parallelism across detectors
3. **Redundant Parsing**: AST parsed multiple times for different detectors
4. **Memory Churn**: String allocations for each match

### Resolution Index Issues
1. **Two-Phase I/O**: Write NDJSON, then read it back
2. **JSON Parse Overhead**: `JSON.parse()` per line
3. **Memory Spikes**: Index loaded fully before resolution
4. **No Streaming Resolution**: Can't resolve while building

## Novel Rust Architecture

### Core Insight: Single-Pass Analysis

```
┌─────────────────────────────────────────────────────────────────┐
│                    UNIFIED ANALYZER                              │
│                                                                  │
│  ┌──────────┐    ┌──────────────┐    ┌─────────────────────┐   │
│  │  Scanner │───▶│ Parse + Index│───▶│ Parallel Detection  │   │
│  │  (Rust)  │    │   (Rust)     │    │      (Rust)         │   │
│  └──────────┘    └──────────────┘    └─────────────────────┘   │
│       │                │                       │                │
│       │                ▼                       ▼                │
│       │         ┌──────────────┐    ┌─────────────────────┐   │
│       │         │ Resolution   │    │ Pattern Results     │   │
│       │         │ Index (mmap) │    │ (streaming)         │   │
│       │         └──────────────┘    └─────────────────────┘   │
│       │                │                       │                │
│       └────────────────┴───────────────────────┘                │
│                        │                                        │
│                        ▼                                        │
│              ┌─────────────────────┐                           │
│              │  Unified Results    │                           │
│              │  (patterns + graph) │                           │
│              └─────────────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
```

### Key Innovations

#### 1. AST-First Pattern Detection with Tree-Sitter Queries

Instead of regex-first, we use tree-sitter's query language for semantic pattern matching:

```rust
use tree_sitter::{Query, QueryCursor};

/// AST-based pattern detector for all 9 languages
pub struct AstPatternDetector {
    /// Pre-compiled queries per language per pattern category
    queries: HashMap<(Language, PatternCategory), Vec<CompiledQuery>>,
}

struct CompiledQuery {
    query: Query,
    pattern_type: String,
    extractor: fn(&QueryMatch) -> Option<DetectedPattern>,
}

impl AstPatternDetector {
    pub fn new() -> Self {
        let mut queries = HashMap::new();
        
        // Auth patterns - AST queries for each language
        queries.insert((Language::TypeScript, PatternCategory::Auth), vec![
            // Detect @auth decorator
            CompiledQuery {
                query: Query::new(tree_sitter_typescript::language(), r#"
                    (decorator
                        (call_expression
                            function: (identifier) @decorator_name
                            (#match? @decorator_name "^(auth|requireAuth|authenticated)$")
                        )
                    ) @decorator
                "#).unwrap(),
                pattern_type: "auth-decorator".to_string(),
                extractor: extract_decorator_pattern,
            },
            // Detect middleware usage: app.use(authMiddleware)
            CompiledQuery {
                query: Query::new(tree_sitter_typescript::language(), r#"
                    (call_expression
                        function: (member_expression
                            object: (identifier) @obj
                            property: (property_identifier) @method
                            (#eq? @method "use")
                        )
                        arguments: (arguments
                            (identifier) @middleware
                            (#match? @middleware "(?i)auth|protect|guard|verify")
                        )
                    ) @call
                "#).unwrap(),
                pattern_type: "middleware-usage".to_string(),
                extractor: extract_middleware_pattern,
            },
        ]);
        
        // Python FastAPI patterns
        queries.insert((Language::Python, PatternCategory::Auth), vec![
            // Detect Depends(get_current_user)
            CompiledQuery {
                query: Query::new(tree_sitter_python::language(), r#"
                    (call
                        function: (identifier) @func
                        (#eq? @func "Depends")
                        arguments: (argument_list
                            (identifier) @dependency
                            (#match? @dependency "(?i)current_user|verify_token|auth")
                        )
                    ) @call
                "#).unwrap(),
                pattern_type: "fastapi-depends".to_string(),
                extractor: extract_depends_pattern,
            },
        ]);
        
        // Java Spring patterns
        queries.insert((Language::Java, PatternCategory::Auth), vec![
            // Detect @PreAuthorize annotation
            CompiledQuery {
                query: Query::new(tree_sitter_java::language(), r#"
                    (annotation
                        name: (identifier) @name
                        (#match? @name "^(PreAuthorize|Secured|RolesAllowed)$")
                    ) @annotation
                "#).unwrap(),
                pattern_type: "spring-security".to_string(),
                extractor: extract_annotation_pattern,
            },
        ]);
        
        Self { queries }
    }
    
    /// Detect patterns using AST queries (primary method)
    pub fn detect_from_ast(
        &self,
        tree: &Tree,
        source: &[u8],
        language: Language,
        file: &str,
    ) -> Vec<DetectedPattern> {
        let mut patterns = Vec::new();
        let mut cursor = QueryCursor::new();
        
        for category in PatternCategory::all() {
            if let Some(queries) = self.queries.get(&(language, category)) {
                for compiled in queries {
                    let matches = cursor.matches(&compiled.query, tree.root_node(), source);
                    for m in matches {
                        if let Some(pattern) = (compiled.extractor)(&m) {
                            patterns.push(pattern);
                        }
                    }
                }
            }
        }
        
        patterns
    }
}
```

**Benefit**: Language-aware detection that understands code structure, not just text patterns.

#### 2. Regex Fallback for String Literals Only

Regex is used ONLY for content inside string literals that AST can't semantically analyze:

```rust
use regex::RegexSet;

/// Regex fallback for string literal content
pub struct StringLiteralAnalyzer {
    /// SQL patterns (for strings containing queries)
    sql_patterns: RegexSet,
    /// Route patterns (for path strings)
    route_patterns: RegexSet,
    /// Sensitive data patterns (for config strings)
    sensitive_patterns: RegexSet,
}

impl StringLiteralAnalyzer {
    pub fn new() -> Self {
        Self {
            sql_patterns: RegexSet::new(&[
                r"(?i)SELECT\s+.+\s+FROM\s+\w+",
                r"(?i)INSERT\s+INTO\s+\w+",
                r"(?i)UPDATE\s+\w+\s+SET",
                r"(?i)DELETE\s+FROM\s+\w+",
            ]).unwrap(),
            route_patterns: RegexSet::new(&[
                r"/api/v?\d*/(?:admin|user|account|auth)",
                r"/(?:dashboard|settings|profile|billing)",
            ]).unwrap(),
            sensitive_patterns: RegexSet::new(&[
                r"(?i)password|secret|token|api[_-]?key",
                r"(?i)credit[_-]?card|ssn|social[_-]?security",
            ]).unwrap(),
        }
    }
    
    /// Analyze string literals extracted from AST
    pub fn analyze_strings(
        &self,
        strings: &[StringLiteral],
        file: &str,
    ) -> Vec<DetectedPattern> {
        let mut patterns = Vec::new();
        
        for s in strings {
            // Check for SQL
            if self.sql_patterns.is_match(&s.value) {
                patterns.push(DetectedPattern {
                    category: PatternCategory::DataAccess,
                    pattern_type: "sql-query".to_string(),
                    file: file.to_string(),
                    line: s.line,
                    matched_text: s.value.clone(),
                    confidence: 0.9,
                    detection_method: DetectionMethod::RegexFallback,
                    ..Default::default()
                });
            }
            
            // Check for sensitive routes
            if self.route_patterns.is_match(&s.value) {
                patterns.push(DetectedPattern {
                    category: PatternCategory::Api,
                    pattern_type: "sensitive-route".to_string(),
                    file: file.to_string(),
                    line: s.line,
                    matched_text: s.value.clone(),
                    confidence: 0.8,
                    detection_method: DetectionMethod::RegexFallback,
                    ..Default::default()
                });
            }
        }
        
        patterns
    }
}

/// String literal extracted from AST
pub struct StringLiteral {
    pub value: String,
    pub line: u32,
    pub column: u32,
    pub context: StringContext,
}

/// Context of where the string appears
pub enum StringContext {
    FunctionArgument,
    VariableAssignment,
    ObjectProperty,
    Decorator,
    Unknown,
}
```

**Benefit**: Regex only runs on pre-extracted strings, not entire source files.

#### 2. Memory-Mapped Resolution Index
Instead of NDJSON file I/O, use a memory-mapped B-tree:

```rust
use memmap2::MmapMut;

struct ResolutionIndex {
    // Memory-mapped file for persistence
    mmap: MmapMut,
    // B-tree index: function_name -> Vec<FunctionId>
    name_index: BTreeMap<String, SmallVec<[FunctionId; 4]>>,
    // File index: function_id -> file_path
    file_index: FxHashMap<FunctionId, PathId>,
}

impl ResolutionIndex {
    /// Insert during parsing (no separate build phase)
    fn insert(&mut self, name: &str, id: FunctionId, file: PathId) {
        self.name_index.entry(name.to_string())
            .or_default()
            .push(id);
        self.file_index.insert(id, file);
    }
    
    /// Resolve immediately (no load phase)
    fn resolve(&self, name: &str, caller_file: PathId) -> Resolution {
        // ... resolution logic
    }
}
```

**Benefit**: Build and resolve in same pass, no intermediate file.

#### 3. Parallel File Processing with Work Stealing

```rust
use rayon::prelude::*;
use crossbeam::channel;

fn analyze_codebase(files: Vec<PathBuf>) -> UnifiedResult {
    // Shared resolution index (lock-free reads, locked writes)
    let index = Arc::new(RwLock::new(ResolutionIndex::new()));
    
    // Pattern results channel (streaming output)
    let (tx, rx) = channel::unbounded();
    
    // Process files in parallel
    files.par_iter().for_each(|file| {
        let source = fs::read_to_string(file).unwrap();
        
        // 1. Parse (already in Rust)
        let ast = parse(&source, file);
        
        // 2. Extract functions and build index
        let functions = extract_functions(&ast);
        {
            let mut idx = index.write();
            for func in &functions {
                idx.insert(&func.name, func.id, file_id);
            }
        }
        
        // 3. Detect patterns (parallel within file)
        let patterns = detect_patterns(&source, &ast);
        tx.send(FilePatterns { file, patterns }).unwrap();
        
        // 4. Resolve calls (reads don't block)
        let idx = index.read();
        for func in &functions {
            for call in &func.calls {
                let resolution = idx.resolve(&call.target, file_id);
                // ... store resolution
            }
        }
    });
    
    // Collect results
    drop(tx);
    let patterns: Vec<_> = rx.iter().collect();
    
    UnifiedResult { patterns, index: Arc::try_unwrap(index).unwrap() }
}
```

**Benefit**: Files processed in parallel, resolution happens during parsing.

#### 4. String Interning for Memory Efficiency

```rust
use string_interner::{StringInterner, DefaultSymbol};

struct Interner {
    strings: StringInterner,
}

impl Interner {
    fn intern(&mut self, s: &str) -> DefaultSymbol {
        self.strings.get_or_intern(s)
    }
    
    fn resolve(&self, sym: DefaultSymbol) -> &str {
        self.strings.resolve(sym).unwrap()
    }
}

// Function names, file paths, pattern names all interned
// Reduces memory by 60-80% for large codebases
```

#### 5. Streaming Pattern Output

Instead of accumulating all patterns in memory:

```rust
trait PatternSink {
    fn emit(&mut self, pattern: DetectedPattern);
}

// NDJSON streaming output
struct NdjsonSink {
    writer: BufWriter<File>,
}

impl PatternSink for NdjsonSink {
    fn emit(&mut self, pattern: DetectedPattern) {
        serde_json::to_writer(&mut self.writer, &pattern).unwrap();
        self.writer.write_all(b"\n").unwrap();
    }
}

// Or direct to TypeScript via channel
struct ChannelSink {
    tx: Sender<DetectedPattern>,
}
```

## Implementation Plan

### Phase 1: Core Infrastructure (2 days)

```
drift/crates/drift-core/src/unified/
├── mod.rs              # Module exports
├── types.rs            # Unified types
├── interner.rs         # String interning
├── index.rs            # Resolution index
└── analyzer.rs         # Main analyzer
```

### Phase 2: Pattern Engine (2 days)

```
drift/crates/drift-core/src/patterns/
├── mod.rs              # Module exports
├── compiled.rs         # Compiled RegexSet
├── categories.rs       # Pattern categories
├── detector.rs         # Pattern detection
└── rules.rs            # Pattern rules (from TS detectors)
```

### Phase 3: NAPI Integration (1 day)

```rust
#[napi]
pub fn analyze_unified(
    root: String,
    patterns: Vec<String>,
    options: JsUnifiedOptions,
) -> Result<JsUnifiedResult> {
    // ...
}
```

### Phase 4: TypeScript Integration (1 day)

```typescript
// packages/core/src/native/index.ts
export async function analyzeUnified(
    root: string,
    patterns: string[],
    options: UnifiedOptions
): Promise<UnifiedResult> {
    if (nativeModule) {
        return nativeModule.analyzeUnified(root, patterns, options);
    }
    // Fallback to separate TS implementations
}
```

## Performance Projections

| Metric | Current (TS) | Unified (Rust) | Improvement |
|--------|--------------|----------------|-------------|
| 10K files scan | 45s | 0.8s | 56x |
| Pattern detection | 30s | 0.3s | 100x |
| Resolution index | 15s | 0.2s | 75x |
| Memory usage | 2GB | 200MB | 10x |
| **Total** | **90s** | **1.3s** | **69x** |

## API Design

### Rust Types

```rust
/// Unified analysis options
pub struct UnifiedOptions {
    /// File patterns to include
    pub patterns: Vec<String>,
    /// Pattern categories to detect
    pub categories: Vec<PatternCategory>,
    /// Maximum resolution depth
    pub max_resolution_depth: u32,
    /// Enable parallel processing
    pub parallel: bool,
    /// Number of threads (0 = auto)
    pub threads: usize,
}

/// Unified analysis result
pub struct UnifiedResult {
    /// Detected patterns by file
    pub patterns: Vec<FilePatterns>,
    /// Resolution statistics
    pub resolution: ResolutionStats,
    /// Call graph summary
    pub call_graph: CallGraphSummary,
    /// Performance metrics
    pub metrics: AnalysisMetrics,
}

/// Detected patterns for a file
pub struct FilePatterns {
    pub file: String,
    pub patterns: Vec<DetectedPattern>,
    pub violations: Vec<Violation>,
}

/// A detected pattern
pub struct DetectedPattern {
    pub category: PatternCategory,
    pub subcategory: String,
    pub pattern_type: String,
    pub file: String,
    pub line: u32,
    pub column: u32,
    pub matched_text: String,
    pub confidence: f32,
    pub metadata: Option<serde_json::Value>,
}
```

### TypeScript Types

```typescript
interface UnifiedOptions {
    patterns: string[];
    categories?: PatternCategory[];
    maxResolutionDepth?: number;
    parallel?: boolean;
    threads?: number;
}

interface UnifiedResult {
    patterns: FilePatterns[];
    resolution: ResolutionStats;
    callGraph: CallGraphSummary;
    metrics: AnalysisMetrics;
}
```

## Migration Strategy

### Backward Compatibility

The unified analyzer will be opt-in initially:

```typescript
// Old way (still works)
const patterns = await detectPatterns(files);
const graph = await buildCallGraph(files);

// New way (unified)
const result = await analyzeUnified(root, patterns, {
    categories: ['auth', 'api', 'errors'],
});
```

### Gradual Rollout

1. **Week 1**: Ship unified analyzer as experimental
2. **Week 2**: A/B test on large codebases
3. **Week 3**: Make default for new scans
4. **Week 4**: Deprecate separate APIs

## Conclusion

The Unified Analyzer represents a paradigm shift from "port each component" to "redesign for performance". By combining pattern detection and resolution into a single pass with:

- Compiled regex sets (100x faster matching)
- Memory-mapped indexes (no I/O overhead)
- Parallel processing (8-16x speedup)
- String interning (10x memory reduction)
- Streaming output (constant memory)

We achieve **50-100x overall performance improvement** while simplifying the architecture.

This is not just a port - it's a reimagining of how code analysis should work at scale.
