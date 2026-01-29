# Drift Rust Core

High-performance code analysis engine for Drift, written in Rust with NAPI-RS bindings for Node.js.

## Architecture

```
crates/
├── drift-core/       # Main library - parsing, analysis, storage
│   ├── scanner/      # Parallel file walking with enterprise ignores
│   ├── parsers/      # Tree-sitter parsers for 9 languages
│   ├── call_graph/   # Function extraction and call resolution
│   ├── boundaries/   # Data access detection (AST-first)
│   ├── coupling/     # Module dependency analysis (AST-first)
│   ├── test_topology/# Test-to-code mapping (AST-first)
│   └── error_handling/# Error boundary detection (AST-first)
│
└── drift-napi/       # NAPI-RS bindings for Node.js
    ├── src/lib.rs    # All NAPI exports
    ├── index.d.ts    # TypeScript declarations
    └── package.json  # npm package config
```

## Supported Languages

- TypeScript / JavaScript
- Python
- Java
- C#
- PHP
- Go
- Rust
- C++

## Performance

| Operation | Time | Throughput |
|-----------|------|------------|
| Parse TypeScript | ~234 µs | ~4,200 files/sec |
| Parse Python | ~237 µs | ~4,200 files/sec |
| Boundary scan (4 files) | ~74 ms | - |
| Coupling analysis (4 files) | ~70 ms | - |
| Test topology (4 files) | ~70 ms | - |
| Error handling (4 files) | ~70 ms | - |

## Building

```bash
# Build all crates
cargo build --release

# Run tests
cargo test

# Run benchmarks
cargo bench --package drift-core
```

## NAPI Bindings

The `drift-napi` crate exposes the following functions to Node.js:

```typescript
// Scanning
scan(config: ScanConfig): ScanResult

// Parsing
parse(source: string, filePath: string): ParseResult | null
supportedLanguages(): string[]
version(): string

// Call Graph
buildCallGraph(config: BuildConfig): BuildResult

// Boundaries
scanBoundaries(files: string[]): BoundaryScanResult
scanBoundariesSource(source: string, filePath: string): BoundaryScanResult

// Coupling
analyzeCoupling(files: string[]): CouplingResult

// Test Topology
analyzeTestTopology(files: string[]): TestTopologyResult

// Error Handling
analyzeErrorHandling(files: string[]): ErrorHandlingResult
```

## Design Principles

### AST-First with Regex Fallbacks

All analysis modules follow the **AST-first** pattern:

1. **Primary**: Use tree-sitter parsed AST data (functions, classes, imports, exports, calls)
2. **Fallback**: Use regex only for data that can't be captured via AST (SQL strings, test names in string literals)

This ensures:
- Semantic accuracy (AST understands code structure)
- Performance (tree-sitter is highly optimized)
- Maintainability (regex only where necessary)

### Streaming Architecture

For large codebases:
- Files are processed in parallel with rayon
- Results are written to disk immediately (no memory accumulation)
- Resolution uses disk-backed indexes (prevents OOM)

## Integration with TypeScript

The `packages/core/src/native/` module provides:
- Automatic fallback to TypeScript when native unavailable
- Type-safe wrappers for all NAPI functions
- Identical API regardless of backend

```typescript
import { native } from '@drift/core/native';

if (native.isAvailable()) {
  console.log('Using Rust core:', native.getVersion());
} else {
  console.log('Using TypeScript fallback');
}

// Same API either way
const result = await native.parse(source, 'file.ts');
```

## License

MIT
