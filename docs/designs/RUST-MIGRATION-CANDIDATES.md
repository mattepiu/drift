# Rust Migration Candidates

## Analysis Summary

After reviewing the codebase for performance bottlenecks and memory-intensive operations, here are the remaining components that would benefit from Rust migration.

## Already in Rust ✅

1. **Scanner** - File walking, hashing, language detection
2. **Parsers** - All 9 languages (TS, JS, Python, Java, C#, PHP, Go, Rust, C++)
3. **Call Graph Builder** - Function extraction, call resolution
4. **Boundary Scanner** - ORM detection, SQL parsing
5. **Coupling Analyzer** - Import/export analysis, cycle detection
6. **Test Topology** - Test file detection, framework identification
7. **Error Handling** - Try/catch detection, gap analysis
8. **Reachability Engine** - BFS traversal, sensitive data detection, inverse queries

## High Priority Candidates 🔴

### 1. ~~Reachability Engine~~ ✅ DONE

Implemented in `drift/crates/drift-core/src/reachability/`:
- `types.rs` - All data structures
- `engine.rs` - BFS traversal with FxHashSet
- NAPI bindings: `analyzeReachability()`, `analyzeInverseReachability()`
- TypeScript integration with automatic fallback

### 2. Pattern Detection Engine (`detectors/`)

**Why Rust?**
- Regex compilation per file (expensive)
- Multiple regex matches per detector
- 50+ detectors running sequentially
- String allocations for each match

**Current Issues:**
- Each detector creates new regex instances
- No regex caching across files
- Sequential execution (no parallelism)

**Rust Benefits:**
- Compiled regex crate (10x faster)
- Regex caching with lazy_static
- Parallel detector execution
- SIMD-accelerated string matching

**Estimated Effort:** 3-4 days

### 3. Resolution Index (`call-graph/streaming-builder.ts`)

**Why Rust?**
- NDJSON parsing is slow in JS
- Line-by-line file reading
- String splitting and JSON.parse per line
- Memory spikes during index loading

**Current Issues:**
- `readline` interface is synchronous-feeling but async
- JSON.parse allocates for each line
- Index loaded fully into memory for resolution

**Rust Benefits:**
- Memory-mapped file access
- Zero-copy JSON parsing with simd-json
- Streaming iterator without full load
- B-tree index for O(log n) lookups

**Estimated Effort:** 2 days

## Medium Priority Candidates 🟡

### 4. Graph Builder (`call-graph/analysis/graph-builder.ts`)

**Why Rust?**
- Large Map operations
- Frequent string concatenation for IDs
- Cross-file resolution lookups

**Rust Benefits:**
- FxHashMap (faster hashing)
- String interning for IDs
- Parallel file processing

**Estimated Effort:** 2 days

### 5. Store Operations (`store/*.ts`)

**Why Rust?**
- JSON.stringify/parse on large objects
- File I/O for each pattern/contract
- Checksum computation

**Rust Benefits:**
- simd-json for fast serialization
- Async file I/O with tokio
- SIMD-accelerated hashing

**Estimated Effort:** 2-3 days

### 6. Constraint Extraction (`constraints/`)

**Why Rust?**
- AST traversal for constraint detection
- Pattern matching across files
- Confidence scoring calculations

**Rust Benefits:**
- Native tree-sitter queries
- Parallel file processing
- Efficient pattern matching

**Estimated Effort:** 2 days

## Lower Priority Candidates 🟢

### 7. DNA Profile Analysis (`dna/`)

**Why Rust?**
- Statistical analysis of styling patterns
- Clustering algorithms
- Large sample processing

**Estimated Effort:** 1-2 days

### 8. Decision Mining (`decisions/`)

**Why Rust?**
- Git history traversal
- Diff parsing
- Pattern clustering

**Estimated Effort:** 2 days

### 9. Constants Analysis (`constants/`)

**Why Rust?**
- Regex-heavy detection
- Cross-file reference tracking

**Estimated Effort:** 1 day

## Implementation Order

Based on impact and dependencies:

1. ~~**Reachability Engine**~~ ✅ DONE
2. **Pattern Detection** - Most CPU-intensive, affects scan time
3. **Resolution Index** - Enables larger codebases
4. **Graph Builder** - Completes call graph in Rust
5. **Store Operations** - Reduces I/O overhead
6. **Remaining modules** - As needed

## Memory Optimization Opportunities

Even without full Rust migration, these TypeScript changes would help:

1. **Object pooling** for frequently created objects
2. **WeakMap** for caches that can be GC'd
3. **Streaming JSON** with `JSONStream` instead of `JSON.parse`
4. **Generator functions** instead of array accumulation
5. **Buffer reuse** for file reading

## Estimated Total Effort

- High priority (2-3): ~5-6 days (Reachability done)
- Medium priority (4-6): ~6-7 days
- Lower priority (7-9): ~4-5 days

**Total: ~15-18 days** for complete Rust migration of remaining performance-critical paths.

## Recommendation

Next priority is **Pattern Detection Engine** as it:
1. Is the most CPU-intensive operation during scans
2. Benefits greatly from Rust's compiled regex
3. Can be parallelized with rayon
4. Affects overall scan time significantly
