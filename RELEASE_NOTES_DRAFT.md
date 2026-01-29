# v1.0.0 - The Rust Core Release 🦀

## TL;DR
Drift's entire analysis engine has been rewritten in Rust. Call graphs that used to OOM on 1600 files now process 10,000 files in 2.3 seconds.

## What Changed

### 🚀 Performance
| Operation | Before | After | Improvement |
|-----------|--------|-------|-------------|
| Call graph (5K files) | 4.86s | 1.11s | **4.4x faster** |
| Call graph (10K files) | OOM crash | 2.34s | **∞ (now works)** |
| Memory usage | Unbounded | O(1) queries | **SQLite-backed** |

### 🦀 Rust Core (12 Modules)
All analysis modules now run natively:
- Scanner, Parsers, Call Graph, Boundaries
- Coupling, Test Topology, Error Handling, Reachability
- Unified Analyzer, Constants, Environment, Wrappers

### 💾 SQLite Storage
- Call graphs stored in `.drift/lake/callgraph/callgraph.db`
- WAL mode for concurrent reads during writes
- SQL-based resolution instead of O(n²) file I/O

### 🔧 Key Fixes
- **OOM Prevention**: ESM module loading fix enables native Rust execution
- **Prisma Detection**: Now handles `this.prisma.user.findMany()` patterns
- **Test Counting**: Fixed 0-indexed vs 1-indexed line number handling
- **Skipped Tests**: Detects `it.skip()` and `test.skip()` patterns

## Language Support
Full AST-based parsing for 9 languages:
TypeScript, JavaScript, Python, Java, C#, PHP, Go, Rust, C++

## Breaking Changes
None - TypeScript fallback ensures backward compatibility.

## Migration
No action required. Native modules load automatically when available.

---

**Full Changelog**: https://github.com/AryehRotberg/drift/compare/v0.3.0...v1.0.0
