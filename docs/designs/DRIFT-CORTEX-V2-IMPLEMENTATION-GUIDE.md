# Drift Cortex v2: Implementation Guide

> **Companion Document to:** DRIFT-CORTEX-TOKEN-EFFICIENT-MEMORY.md  
> **Status:** Approved for Development  
> **Date:** January 2026  
> **Verdict:** 🟢 GREEN LIGHT

---

## Executive Summary

This document provides the complete implementation roadmap for the Token-Efficient Memory system. It includes:

1. Gap analysis against existing infrastructure
2. Architecture compatibility assessment
3. Phased implementation plan with 100% file coverage
4. Design principles (modular, scalable, single-responsibility)

---

## Part I: Gap Analysis

### 🔬 Detailed Gap Analysis

#### 1. Hybrid Embedding Architecture (CRITICAL)

| Aspect | Current State | Required State |
|--------|---------------|----------------|
| Provider | Single-provider (MiniLM/OpenAI/Ollama) | 3-component hybrid |
| Dimensions | 384/1536/768 (provider-dependent) | 768 (128+512+128) |
| Code Understanding | Generic text embeddings | Code-aware (CodeBERT) |
| AST Integration | None | Structural embeddings |
| Caching | None | L1/L2/L3 cache layers |

**Impact:** Without code-aware embeddings, retrieval quality suffers significantly. Code semantics like `user.save()` vs `userRepository.persist()` won't be recognized as similar.

**Dependencies:**
- CodeBERT or similar code-trained model
- AST parsing integration (tree-sitter already in Drift)
- Embedding cache infrastructure

#### 2. Causal Memory Graphs (CRITICAL)

| Aspect | Current State | Required State |
|--------|---------------|----------------|
| Relationship Types | 5 basic types | 8 causal types |
| Storage | `memory_relationships` table | `causal_edges` table |
| Traversal | Basic `getRelated()` | Full graph traversal |
| Inference | None | Automatic causal inference |
| Narrative | None | Human-readable explanations |

**Impact:** The "why" narrative generation depends entirely on causal chains. Without this, `drift_why` returns flat lists instead of coherent explanations.

**New Tables Required:**
```sql
CREATE TABLE causal_edges (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  strength REAL DEFAULT 1.0,
  evidence TEXT,  -- JSON array
  created_at TEXT,
  validated_at TEXT
);
```

#### 3. True Learning System (CRITICAL)

| Aspect | Current State | Required State |
|--------|---------------|----------------|
| Correction Extraction | Stores "User rejected this" | Full analysis with principles |
| Categorization | None | 10 correction categories |
| Principle Extraction | None | Generalizable rules |
| Confidence Calibration | Static | Evidence-based adjustment |
| Active Learning | None | Validation prompts |

**Impact:** Without this, the system doesn't actually learn from mistakes. It just stores that something was rejected without understanding why.

**New Components Required:**
- `CorrectionAnalyzer` - Categorize and analyze corrections
- `ConfidenceCalibrator` - Calculate confidence with evidence
- `ActiveLearningLoop` - Identify validation candidates
- `LearningMemoryFactory` - Create memories from corrections

#### 4. Hierarchical Compression (HIGH)

| Aspect | Current State | Required State |
|--------|---------------|----------------|
| Levels | 3 (summary, expanded, full) | 4 (IDs, one-liners, examples, full) |
| Token Tracking | Basic estimation | Precise per-level tracking |
| Level Selection | Fixed | Dynamic based on budget |
| Session Awareness | None | Tracks what's been sent |

**Impact:** Token efficiency depends on granular compression control. Current system can't do ultra-lightweight retrieval.

#### 5. Session State Tracking (HIGH)

| Aspect | Current State | Required State |
|--------|---------------|----------------|
| Memory Tracking | None | `loadedMemories` set |
| Pattern Tracking | None | `loadedPatterns` set |
| Deduplication | None | Automatic |
| Persistence | None | Per-session storage |

**Impact:** Major token waste without this. Same context gets re-sent repeatedly.

---

## Part II: Architecture Compatibility

### ✅ No Breaking Changes Required

The spec builds on existing infrastructure with additive changes only:

| Component | Change Type | Breaking? |
|-----------|-------------|-----------|
| Type System | Extension | ❌ No |
| Storage Schema | New tables | ❌ No |
| Embedding Providers | New providers | ❌ No |
| Retrieval Engine | Enhancement | ❌ No |
| MCP Tools | New tools + enhancements | ❌ No |
| Consolidation | Enhancement | ❌ No |

### Design Doc Supersession

```
DRIFT-CORTEX-MEMORY-SYSTEM.md (Foundation)
           ↓
DRIFT-CORTEX-ULTIMATE-MEMORY-ARCHITECTURE.md (Superseded)
           ↓
DRIFT-CORTEX-TOKEN-EFFICIENT-MEMORY.md (Current)
           ↓
DRIFT-CORTEX-V2-IMPLEMENTATION-GUIDE.md (This Document)
```

### 📦 New Dependencies Required

```json
{
  "dependencies": {
    "onnxruntime-node": "^1.16.0",
    "@huggingface/hub": "^0.15.0",
    "lru-cache": "^10.0.0",
    "murmurhash": "^2.0.0"
  }
}
```

| Dependency | Purpose | Size |
|------------|---------|------|
| `onnxruntime-node` | CodeBERT inference | ~50MB |
| `@huggingface/hub` | Model downloads | ~2MB |
| `lru-cache` | L1 embedding cache | ~50KB |
| `murmurhash` | Fast content hashing | ~10KB |

---

## Part III: Design Principles

### Core Principles

1. **Single Responsibility** - Each module does one thing well
2. **Modular** - Components can be swapped/upgraded independently
3. **Scalable** - Works for 100 memories or 100,000
4. **Testable** - Every component has clear inputs/outputs
5. **Orchestrators Justified** - Only when coordinating multiple components

### Directory Structure Philosophy

```
src/
├── types/           # Data structures only (no logic)
├── storage/         # Persistence only
├── embeddings/      # Embedding generation only
├── retrieval/       # Query and ranking only
├── learning/        # Learning from feedback only
├── causal/          # Causal graph only (NEW)
├── compression/     # Token compression only (NEW)
├── session/         # Session state only (NEW)
├── prediction/      # Predictive retrieval only (NEW)
├── generation/      # Code generation context only (NEW)
├── validation/      # Validation only
├── consolidation/   # Consolidation only
└── orchestrators/   # Coordination only (NEW)
```


---

## Part IV: Phased Implementation Plan

### Overview

| Phase | Focus | Duration | Priority |
|-------|-------|----------|----------|
| 1a | Causal Graphs & Types | 2 weeks | 🔴 CRITICAL |
| 1b | Hybrid Embeddings | 2 weeks | 🔴 CRITICAL |
| 2 | Learning System | 2 weeks | 🔴 CRITICAL |
| 3 | Token Efficiency | 2 weeks | 🟡 HIGH |
| 4 | Predictive Retrieval | 2 weeks | 🟢 MEDIUM |
| 5 | Code Generation | 2 weeks | 🟢 MEDIUM |
| 6 | MCP Tools & Integration | 2 weeks | 🟢 MEDIUM |
| 7 | Testing & Polish | 2 weeks | 🟢 MEDIUM |

**Total Estimated Duration:** 16 weeks (4 months)

### ⚠️ Critical Dependency Note

**Embeddings MUST come before Learning.**

The Learning System (Phase 2) relies on:
- Analyzing code diffs semantically
- Clustering similar corrections
- Categorizing corrections by code patterns

Without Code-Aware Embeddings, the system will be "blind" to code semantics:
- `user.save()` and `repo.persist()` will appear unrelated
- `authMiddleware` and `authentication guard` won't cluster
- Correction categorization will fail on semantic similarity

**Rule: Get the "Eyes" (Embeddings) working before you build the "Brain" (Learning).**

---

## Phase 1a: Causal Graphs & Foundation Types (Weeks 1-2)

### 1.1 New Types

```
packages/cortex/src/types/
├── causal.ts                    # NEW - Causal relationship types
├── compressed-memory.ts         # NEW - Compression level types
├── session-context.ts           # NEW - Session state types
├── learning.ts                  # NEW - Learning/correction types
├── prediction.ts                # NEW - Prediction signal types
└── generation-context.ts        # NEW - Code generation context types
```

#### File: `types/causal.ts`
**Responsibility:** Define causal relationship data structures
**Exports:**
- `CausalRelation` - Union type of 8 relation types
- `CausalEdge` - Edge in causal graph
- `CausalChain` - Path through causal graph
- `CausalInferenceResult` - Result of automatic inference
- `GraphTraversalOptions` - Options for graph queries

#### File: `types/compressed-memory.ts`
**Responsibility:** Define compression level data structures
**Exports:**
- `CompressionLevel` - Enum (0-3)
- `CompressedMemory` - Memory with compression metadata
- `CompressionResult` - Result of compression operation
- `LevelConfig` - Configuration per level

#### File: `types/session-context.ts`
**Responsibility:** Define session state data structures
**Exports:**
- `SessionContext` - Current session state
- `LoadedMemorySet` - Set of loaded memory IDs
- `SessionConfig` - Session configuration
- `SessionStats` - Session statistics

#### File: `types/learning.ts`
**Responsibility:** Define learning system data structures
**Exports:**
- `AnalyzedCorrection` - Analyzed correction result
- `CorrectionCategory` - 10 correction categories
- `ExtractedPrinciple` - Generalizable rule
- `ConfidenceMetrics` - Confidence calculation inputs
- `ValidationCandidate` - Memory needing validation

#### File: `types/prediction.ts`
**Responsibility:** Define prediction data structures
**Exports:**
- `PredictionSignals` - Input signals for prediction
- `PredictedMemory` - Memory with prediction confidence
- `PredictionResult` - Full prediction result
- `PredictionConfig` - Prediction configuration

#### File: `types/generation-context.ts`
**Responsibility:** Define code generation context
**Exports:**
- `GenerationContext` - Full context for generation
- `GenerationTarget` - What we're generating
- `CodeProvenance` - Provenance tracking
- `GeneratedCode` - Generated code with metadata


### 1.2 Causal Graph Module

```
packages/cortex/src/causal/           # NEW DIRECTORY
├── index.ts                          # Public exports
├── types.ts                          # Re-export from types/causal.ts
├── storage/
│   ├── index.ts                      # Storage exports
│   ├── interface.ts                  # ICausalStorage interface
│   └── sqlite.ts                     # SQLite implementation
├── traversal/
│   ├── index.ts                      # Traversal exports
│   ├── traverser.ts                  # CausalGraphTraverser
│   ├── path-finder.ts                # Find paths between nodes
│   └── subgraph.ts                   # Extract subgraphs
├── inference/
│   ├── index.ts                      # Inference exports
│   ├── engine.ts                     # CausalInferenceEngine
│   ├── temporal.ts                   # Temporal proximity inference
│   ├── semantic.ts                   # Semantic similarity inference
│   ├── entity.ts                     # Entity overlap inference
│   └── explicit.ts                   # Explicit reference inference
├── narrative/
│   ├── index.ts                      # Narrative exports
│   ├── generator.ts                  # NarrativeGenerator
│   └── templates.ts                  # Narrative templates
└── __tests__/
    ├── traverser.test.ts
    ├── inference.test.ts
    └── narrative.test.ts
```

#### File: `causal/storage/interface.ts`
**Responsibility:** Define causal storage contract
**Exports:**
- `ICausalStorage` interface with methods:
  - `createEdge(edge: CausalEdge): Promise<string>`
  - `getEdge(id: string): Promise<CausalEdge | null>`
  - `getEdgesFrom(sourceId: string): Promise<CausalEdge[]>`
  - `getEdgesTo(targetId: string): Promise<CausalEdge[]>`
  - `deleteEdge(id: string): Promise<void>`
  - `updateStrength(id: string, strength: number): Promise<void>`

#### File: `causal/storage/sqlite.ts`
**Responsibility:** SQLite implementation of causal storage
**Single Responsibility:** Persist causal edges to SQLite
**Dependencies:** `better-sqlite3`, `ICausalStorage`

#### File: `causal/traversal/traverser.ts`
**Responsibility:** Traverse causal graph
**Single Responsibility:** Graph traversal algorithms only
**Exports:**
- `CausalGraphTraverser` class with methods:
  - `traceOrigins(memoryId, maxDepth): Promise<CausalChain>`
  - `traceEffects(memoryId, maxDepth): Promise<CausalChain>`
  - `findPath(fromId, toId): Promise<CausalChain | null>`
  - `getSubgraph(memoryIds): Promise<CausalChain>`

#### File: `causal/inference/engine.ts`
**Responsibility:** Orchestrate causal inference
**Justification:** Orchestrator - coordinates 4 inference strategies
**Dependencies:** `temporal.ts`, `semantic.ts`, `entity.ts`, `explicit.ts`
**Exports:**
- `CausalInferenceEngine` class with methods:
  - `inferCauses(memory: Memory): Promise<CausalEdge[]>`
  - `inferEffects(memory: Memory): Promise<CausalEdge[]>`
  - `validateInference(edge: CausalEdge): Promise<boolean>`

#### File: `causal/narrative/generator.ts`
**Responsibility:** Generate human-readable narratives
**Single Responsibility:** Convert causal chains to text
**Exports:**
- `NarrativeGenerator` class with methods:
  - `generateNarrative(chain: CausalChain): string`
  - `generateSummary(chain: CausalChain): string`
  - `formatForMCP(chain: CausalChain): object`


### 1.3 Storage Schema Updates

```
packages/cortex/src/storage/sqlite/
├── migrations/
│   ├── index.ts                      # Migration runner
│   ├── 001_initial.ts                # Existing
│   ├── 002_causal_edges.ts           # NEW - Causal edges table
│   ├── 003_session_context.ts        # NEW - Session tracking
│   ├── 004_validation_history.ts     # NEW - Validation feedback
│   └── 005_usage_history.ts          # NEW - Memory effectiveness
└── schema.ts                         # MODIFY - Add new table definitions
```

#### Migration: `002_causal_edges.ts`
```sql
CREATE TABLE causal_edges (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relation TEXT NOT NULL CHECK (relation IN (
    'caused', 'enabled', 'prevented', 'contradicts',
    'supersedes', 'supports', 'derived_from', 'triggered_by'
  )),
  strength REAL DEFAULT 1.0 CHECK (strength >= 0 AND strength <= 1),
  evidence TEXT,  -- JSON array of evidence IDs
  created_at TEXT DEFAULT (datetime('now')),
  validated_at TEXT,
  
  FOREIGN KEY (source_id) REFERENCES memories(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES memories(id) ON DELETE CASCADE
);

CREATE INDEX idx_causal_source ON causal_edges(source_id);
CREATE INDEX idx_causal_target ON causal_edges(target_id);
CREATE INDEX idx_causal_relation ON causal_edges(relation);
CREATE INDEX idx_causal_strength ON causal_edges(strength);
```

#### Migration: `003_session_context.ts`
```sql
CREATE TABLE session_contexts (
  id TEXT PRIMARY KEY,
  started_at TEXT DEFAULT (datetime('now')),
  ended_at TEXT,
  loaded_memories TEXT,  -- JSON array of memory IDs
  loaded_patterns TEXT,  -- JSON array of pattern IDs
  tokens_sent INTEGER DEFAULT 0,
  queries_made INTEGER DEFAULT 0
);

CREATE INDEX idx_session_started ON session_contexts(started_at);
```

#### Migration: `004_validation_history.ts`
```sql
CREATE TABLE validation_history (
  id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('confirmed', 'rejected', 'modified')),
  previous_confidence REAL,
  new_confidence REAL,
  feedback TEXT,
  validated_at TEXT DEFAULT (datetime('now')),
  validated_by TEXT,
  
  FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
);

CREATE INDEX idx_validation_memory ON validation_history(memory_id);
CREATE INDEX idx_validation_action ON validation_history(action);
```

#### Migration: `005_usage_history.ts`
```sql
CREATE TABLE usage_history (
  id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('accepted', 'modified', 'rejected')),
  context TEXT,  -- JSON with generation context
  used_at TEXT DEFAULT (datetime('now')),
  
  FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
);

CREATE INDEX idx_usage_memory ON usage_history(memory_id);
CREATE INDEX idx_usage_outcome ON usage_history(outcome);
```

### 1.4 Phase 1 Tests

```
packages/cortex/src/__tests__/
├── causal/                           # NEW DIRECTORY
│   ├── storage.test.ts               # Causal storage tests
│   ├── traverser.test.ts             # Graph traversal tests
│   ├── inference.test.ts             # Causal inference tests
│   └── narrative.test.ts             # Narrative generation tests
└── types/                            # NEW DIRECTORY
    ├── causal.test.ts                # Type validation tests
    └── compressed-memory.test.ts     # Compression type tests
```

### 1.5 Phase 1 Deliverables Checklist

- [ ] `types/causal.ts` - Causal relationship types
- [ ] `types/compressed-memory.ts` - Compression level types
- [ ] `types/session-context.ts` - Session state types
- [ ] `types/learning.ts` - Learning/correction types
- [ ] `types/prediction.ts` - Prediction signal types
- [ ] `types/generation-context.ts` - Code generation context types
- [ ] `causal/storage/interface.ts` - ICausalStorage interface
- [ ] `causal/storage/sqlite.ts` - SQLite implementation
- [ ] `causal/traversal/traverser.ts` - CausalGraphTraverser
- [ ] `causal/traversal/path-finder.ts` - Path finding
- [ ] `causal/traversal/subgraph.ts` - Subgraph extraction
- [ ] `causal/inference/engine.ts` - CausalInferenceEngine
- [ ] `causal/inference/temporal.ts` - Temporal inference
- [ ] `causal/inference/semantic.ts` - Semantic inference
- [ ] `causal/inference/entity.ts` - Entity inference
- [ ] `causal/inference/explicit.ts` - Explicit inference
- [ ] `causal/narrative/generator.ts` - NarrativeGenerator
- [ ] `causal/narrative/templates.ts` - Narrative templates
- [ ] `storage/sqlite/migrations/002_causal_edges.ts`
- [ ] `storage/sqlite/migrations/003_session_context.ts`
- [ ] `storage/sqlite/migrations/004_validation_history.ts`
- [ ] `storage/sqlite/migrations/005_usage_history.ts`
- [ ] All Phase 1a tests passing


---

## Phase 1b: Hybrid Embeddings (Weeks 3-4)

> **⚠️ Why Phase 1b (not Phase 4)?**
> 
> The Learning System (Phase 2) needs code-aware embeddings to:
> - Semantically analyze code diffs
> - Cluster similar corrections  
> - Categorize corrections by code patterns
>
> Without this, `user.save()` and `repo.persist()` appear unrelated.
> **Get the "Eyes" (Embeddings) working before you build the "Brain" (Learning).**

### 1b.1 Embeddings Module Enhancement

```
packages/cortex/src/embeddings/        # ENHANCE EXISTING
├── index.ts                           # MODIFY - Add new exports
├── interface.ts                       # KEEP - Existing interface
├── factory.ts                         # MODIFY - Add hybrid provider
├── local.ts                           # KEEP - Existing
├── openai.ts                          # KEEP - Existing
├── ollama.ts                          # KEEP - Existing
├── structural/                        # NEW DIRECTORY
│   ├── index.ts                       # Structural exports
│   ├── embedder.ts                    # StructuralEmbedder
│   ├── ast-analyzer.ts                # ASTAnalyzer
│   ├── feature-extractor.ts           # FeatureExtractor
│   └── pattern-classifier.ts          # PatternClassifier
├── semantic/                          # NEW DIRECTORY
│   ├── index.ts                       # Semantic exports
│   ├── embedder.ts                    # SemanticEmbedder
│   ├── codebert.ts                    # CodeBERTProvider
│   └── model-loader.ts                # ModelLoader
├── lexical/                           # NEW DIRECTORY
│   ├── index.ts                       # Lexical exports
│   ├── embedder.ts                    # LexicalEmbedder
│   ├── tokenizer.ts                   # CodeTokenizer
│   └── tfidf.ts                       # TFIDFCalculator
├── hybrid/                            # NEW DIRECTORY
│   ├── index.ts                       # Hybrid exports
│   ├── embedder.ts                    # HybridEmbedder
│   ├── fusion.ts                      # FusionLayer
│   └── weights.ts                     # WeightConfig
├── cache/                             # NEW DIRECTORY
│   ├── index.ts                       # Cache exports
│   ├── manager.ts                     # EmbeddingCacheManager
│   ├── l1-memory.ts                   # L1MemoryCache
│   ├── l2-sqlite.ts                   # L2SQLiteCache
│   └── l3-precomputed.ts              # L3PrecomputedCache
└── __tests__/
    ├── structural.test.ts
    ├── semantic.test.ts
    ├── lexical.test.ts
    ├── hybrid.test.ts
    └── cache.test.ts
```

### 1b.2 Structural Embeddings Submodule

#### File: `embeddings/structural/embedder.ts`
**Responsibility:** Generate AST-based structural embeddings
**Single Responsibility:** Structural embedding generation only
**Exports:**
```typescript
class StructuralEmbedder {
  readonly dimensions = 128;
  
  constructor(
    private astAnalyzer: ASTAnalyzer,
    private featureExtractor: FeatureExtractor
  ) {}
  
  async embed(code: string, language: string): Promise<number[]>;
  
  private parseAST(code: string, language: string): AST;
  private extractFeatures(ast: AST): StructuralFeatures;
  private featuresToVector(features: StructuralFeatures): number[];
}
```

#### File: `embeddings/structural/ast-analyzer.ts`
**Responsibility:** Parse and analyze AST
**Single Responsibility:** AST analysis only
**Exports:**
```typescript
class ASTAnalyzer {
  parse(code: string, language: string): AST;
  
  hasAsyncPattern(ast: AST): boolean;
  hasErrorHandling(ast: AST): boolean;
  measureCallDepth(ast: AST): number;
  countParams(ast: AST): number;
  inferReturnType(ast: AST): ReturnType;
  detectSideEffects(ast: AST): SideEffect[];
}
```

#### File: `embeddings/structural/feature-extractor.ts`
**Responsibility:** Extract structural features from AST
**Single Responsibility:** Feature extraction only
**Exports:**
```typescript
class FeatureExtractor {
  extract(ast: AST): StructuralFeatures;
  
  interface StructuralFeatures {
    hasAsync: boolean;
    hasErrorHandling: boolean;
    callDepth: number;
    paramCount: number;
    returnType: ReturnType;
    sideEffects: SideEffect[];
    patterns: string[];
  }
}
```

### 1b.3 Semantic Embeddings Submodule

#### File: `embeddings/semantic/embedder.ts`
**Responsibility:** Generate code-aware semantic embeddings
**Single Responsibility:** Semantic embedding generation only
**Exports:**
```typescript
class SemanticEmbedder {
  readonly dimensions = 512;
  
  constructor(
    private modelLoader: ModelLoader,
    private provider: CodeBERTProvider
  ) {}
  
  async initialize(): Promise<void>;
  async embed(code: string): Promise<number[]>;
  async embedBatch(codes: string[]): Promise<number[][]>;
  async isAvailable(): Promise<boolean>;
}
```

#### File: `embeddings/semantic/codebert.ts`
**Responsibility:** CodeBERT model inference
**Single Responsibility:** Model inference only
**Exports:**
```typescript
class CodeBERTProvider {
  constructor(private session: InferenceSession) {}
  
  async encode(tokens: number[]): Promise<number[]>;
  tokenize(code: string): number[];
  
  static async load(modelPath: string): Promise<CodeBERTProvider>;
}
```

#### File: `embeddings/semantic/model-loader.ts`
**Responsibility:** Load and manage ML models
**Single Responsibility:** Model loading only
**Exports:**
```typescript
class ModelLoader {
  async loadCodeBERT(): Promise<InferenceSession>;
  async downloadIfNeeded(modelId: string): Promise<string>;
  getModelPath(modelId: string): string;
  
  private readonly MODEL_CACHE_DIR = '.drift/models';
}
```

### 1b.4 Lexical Embeddings Submodule

#### File: `embeddings/lexical/embedder.ts`
**Responsibility:** Generate TF-IDF based lexical embeddings
**Single Responsibility:** Lexical embedding generation only
**Exports:**
```typescript
class LexicalEmbedder {
  readonly dimensions = 128;
  
  constructor(
    private tokenizer: CodeTokenizer,
    private tfidf: TFIDFCalculator
  ) {}
  
  embed(text: string): number[];
  
  private tokenize(text: string): string[];
  private computeVector(tokens: string[]): number[];
  private normalize(vector: number[]): number[];
}
```

#### File: `embeddings/lexical/tokenizer.ts`
**Responsibility:** Tokenize code for lexical analysis
**Single Responsibility:** Tokenization only
**Exports:**
```typescript
class CodeTokenizer {
  tokenize(code: string): string[];
  
  private splitCamelCase(token: string): string[];
  private splitSnakeCase(token: string): string[];
  private removeCommonTokens(tokens: string[]): string[];
}
```

#### File: `embeddings/lexical/tfidf.ts`
**Responsibility:** Calculate TF-IDF scores
**Single Responsibility:** TF-IDF calculation only
**Exports:**
```typescript
class TFIDFCalculator {
  constructor(private idfScores: Map<string, number>) {}
  
  calculateTF(tokens: string[]): Map<string, number>;
  calculateTFIDF(tokens: string[]): Map<string, number>;
  
  static async buildFromCorpus(documents: string[]): Promise<TFIDFCalculator>;
}
```

### 1b.5 Hybrid Embeddings Submodule

#### File: `embeddings/hybrid/embedder.ts`
**Responsibility:** Combine all three embedding types
**Justification:** Orchestrator - coordinates 3 embedding strategies
**Exports:**
```typescript
class HybridEmbedder implements IEmbeddingProvider {
  readonly name = 'hybrid';
  readonly dimensions = 768;  // 128 + 512 + 128
  
  constructor(
    private structural: StructuralEmbedder,
    private semantic: SemanticEmbedder,
    private lexical: LexicalEmbedder,
    private fusion: FusionLayer
  ) {}
  
  async initialize(): Promise<void>;
  async embed(text: string, context?: EmbeddingContext): Promise<number[]>;
  async embedBatch(texts: string[]): Promise<number[][]>;
  async isAvailable(): Promise<boolean>;
  
  async hybridSearch(
    query: string,
    candidates: Memory[],
    weights: FusionWeights
  ): Promise<ScoredMemory[]>;
}
```

#### File: `embeddings/hybrid/fusion.ts`
**Responsibility:** Fuse multiple embedding types
**Single Responsibility:** Fusion logic only
**Exports:**
```typescript
class FusionLayer {
  fuse(
    structural: number[],
    semantic: number[],
    lexical: number[],
    weights: FusionWeights
  ): number[];
  
  interface FusionWeights {
    structural: number;  // Default: 0.3
    semantic: number;    // Default: 0.5
    lexical: number;     // Default: 0.2
  }
}
```

### 1b.6 Embedding Cache Submodule

#### File: `embeddings/cache/manager.ts`
**Responsibility:** Manage multi-level embedding cache
**Justification:** Orchestrator - coordinates 3 cache levels
**Exports:**
```typescript
class EmbeddingCacheManager {
  constructor(
    private l1: L1MemoryCache,
    private l2: L2SQLiteCache,
    private l3: L3PrecomputedCache
  ) {}
  
  async get(hash: string): Promise<number[] | null>;
  async set(hash: string, embedding: number[]): Promise<void>;
  async preload(hashes: string[]): Promise<void>;
  
  getStats(): CacheStats;
  clear(level?: 1 | 2 | 3): void;
}
```

#### File: `embeddings/cache/l1-memory.ts`
**Responsibility:** In-memory LRU cache for hot embeddings
**Single Responsibility:** L1 cache only
**Exports:**
```typescript
class L1MemoryCache {
  private cache: LRUCache<string, number[]>;
  
  constructor(maxSize: number = 1000) {
    this.cache = new LRUCache({ max: maxSize });
  }
  
  get(hash: string): number[] | null;
  set(hash: string, embedding: number[]): void;
  has(hash: string): boolean;
  clear(): void;
}
```

#### File: `embeddings/cache/l2-sqlite.ts`
**Responsibility:** SQLite cache for all computed embeddings
**Single Responsibility:** L2 cache only
**Exports:**
```typescript
class L2SQLiteCache {
  constructor(private db: Database) {}
  
  async get(hash: string): Promise<number[] | null>;
  async set(hash: string, embedding: number[]): Promise<void>;
  async has(hash: string): Promise<boolean>;
  async clear(): Promise<void>;
  
  private serializeEmbedding(embedding: number[]): Buffer;
  private deserializeEmbedding(buffer: Buffer): number[];
}
```

#### File: `embeddings/cache/l3-precomputed.ts`
**Responsibility:** Precomputed embeddings for common queries
**Single Responsibility:** L3 cache only
**Exports:**
```typescript
class L3PrecomputedCache {
  private patterns: Map<string, number[]>;
  private fileTypes: Map<string, number[]>;
  private intents: Map<Intent, number[]>;
  
  async initialize(): Promise<void>;
  get(key: string, type: 'pattern' | 'fileType' | 'intent'): number[] | null;
  
  private async loadPrecomputed(): Promise<void>;
}
```

### 1b.7 Phase 1b Deliverables Checklist

- [ ] `embeddings/structural/embedder.ts` - StructuralEmbedder
- [ ] `embeddings/structural/ast-analyzer.ts` - ASTAnalyzer
- [ ] `embeddings/structural/feature-extractor.ts` - FeatureExtractor
- [ ] `embeddings/structural/pattern-classifier.ts` - PatternClassifier
- [ ] `embeddings/semantic/embedder.ts` - SemanticEmbedder
- [ ] `embeddings/semantic/codebert.ts` - CodeBERTProvider
- [ ] `embeddings/semantic/model-loader.ts` - ModelLoader
- [ ] `embeddings/lexical/embedder.ts` - LexicalEmbedder
- [ ] `embeddings/lexical/tokenizer.ts` - CodeTokenizer
- [ ] `embeddings/lexical/tfidf.ts` - TFIDFCalculator
- [ ] `embeddings/hybrid/embedder.ts` - HybridEmbedder
- [ ] `embeddings/hybrid/fusion.ts` - FusionLayer
- [ ] `embeddings/hybrid/weights.ts` - WeightConfig
- [ ] `embeddings/cache/manager.ts` - EmbeddingCacheManager
- [ ] `embeddings/cache/l1-memory.ts` - L1MemoryCache
- [ ] `embeddings/cache/l2-sqlite.ts` - L2SQLiteCache
- [ ] `embeddings/cache/l3-precomputed.ts` - L3PrecomputedCache
- [ ] `embeddings/factory.ts` - MODIFY to add hybrid provider
- [ ] All Phase 1b tests passing


---

## Phase 2: Learning System (Weeks 5-6)

> **Dependency:** Phase 1b (Hybrid Embeddings) MUST be complete.
> The Learning System uses embeddings for semantic diff analysis and correction clustering.

### 2.1 Learning Module Structure

```
packages/cortex/src/learning/         # ENHANCE EXISTING
├── index.ts                          # MODIFY - Add new exports
├── correction-extractor.ts           # REPLACE - Full implementation
├── fact-extractor.ts                 # KEEP - Existing
├── outcome-tracker.ts                # ENHANCE - Add feedback loop
├── preference-learner.ts             # KEEP - Existing
├── analysis/                         # NEW DIRECTORY
│   ├── index.ts                      # Analysis exports
│   ├── analyzer.ts                   # CorrectionAnalyzer
│   ├── categorizer.ts                # CorrectionCategorizer
│   ├── principle-extractor.ts        # PrincipleExtractor
│   └── diff-analyzer.ts              # DiffAnalyzer
├── confidence/                       # NEW DIRECTORY
│   ├── index.ts                      # Confidence exports
│   ├── calibrator.ts                 # ConfidenceCalibrator
│   ├── metrics.ts                    # MetricsCalculator
│   └── decay-integrator.ts           # Integrate with decay system
├── active/                           # NEW DIRECTORY
│   ├── index.ts                      # Active learning exports
│   ├── loop.ts                       # ActiveLearningLoop
│   ├── candidate-selector.ts         # ValidationCandidateSelector
│   └── prompt-generator.ts           # ValidationPromptGenerator
├── factory/                          # NEW DIRECTORY
│   ├── index.ts                      # Factory exports
│   ├── memory-factory.ts             # LearningMemoryFactory
│   ├── tribal-creator.ts             # TribalMemoryCreator
│   ├── pattern-creator.ts            # PatternRationaleCreator
│   └── smell-creator.ts              # CodeSmellCreator
└── __tests__/
    ├── analyzer.test.ts
    ├── calibrator.test.ts
    ├── active-loop.test.ts
    └── factory.test.ts
```

### 2.2 Analysis Submodule

#### File: `learning/analysis/analyzer.ts`
**Responsibility:** Orchestrate correction analysis
**Justification:** Orchestrator - coordinates categorizer, principle extractor, diff analyzer
**Exports:**
```typescript
class CorrectionAnalyzer {
  constructor(
    private categorizer: CorrectionCategorizer,
    private principleExtractor: PrincipleExtractor,
    private diffAnalyzer: DiffAnalyzer
  ) {}
  
  async analyze(
    original: string,
    feedback: string,
    correctedCode?: string
  ): Promise<AnalyzedCorrection>;
}
```

#### File: `learning/analysis/categorizer.ts`
**Responsibility:** Categorize corrections into 10 types
**Single Responsibility:** Classification only
**Exports:**
```typescript
class CorrectionCategorizer {
  categorize(
    original: string,
    feedback: string,
    diff: Diff | null
  ): CorrectionCategory;
  
  private checkPatternViolation(original: string): boolean;
  private checkTribalMiss(original: string): boolean;
  private checkConstraintViolation(original: string): boolean;
  private analyzeFeedbackText(feedback: string): CorrectionCategory;
}
```

#### File: `learning/analysis/principle-extractor.ts`
**Responsibility:** Extract generalizable principles from corrections
**Single Responsibility:** Principle extraction only
**Exports:**
```typescript
class PrincipleExtractor {
  extract(
    original: string,
    feedback: string,
    diff: Diff | null,
    category: CorrectionCategory
  ): ExtractedPrinciple;
  
  private extractFromDiff(diff: Diff): ExtractedPrinciple | null;
  private extractFromFeedback(feedback: string): ExtractedPrinciple;
  private determineScope(principle: string): string[];
}
```

#### File: `learning/analysis/diff-analyzer.ts`
**Responsibility:** Analyze code diffs
**Single Responsibility:** Diff analysis only
**Exports:**
```typescript
class DiffAnalyzer {
  computeDiff(original: string, corrected: string): Diff;
  summarizeChanges(diff: Diff): DiffSummary;
  
  interface DiffSummary {
    replacements: { from: string; to: string }[];
    additions: string[];
    removals: string[];
  }
}
```

### 2.3 Confidence Submodule

#### File: `learning/confidence/calibrator.ts`
**Responsibility:** Calculate and calibrate confidence scores
**Single Responsibility:** Confidence calculation only
**Exports:**
```typescript
class ConfidenceCalibrator {
  calculate(memory: Memory, metrics: ConfidenceMetrics): number;
  shouldAskUser(memory: Memory, confidence: number): boolean;
  generateValidationPrompt(memory: Memory, confidence: number): string;
  
  private applyEvidenceAdjustments(base: number, metrics: ConfidenceMetrics): number;
  private applyUsageAdjustments(confidence: number, metrics: ConfidenceMetrics): number;
  private applyTemporalDecay(confidence: number, memory: Memory): number;
}
```

#### File: `learning/confidence/metrics.ts`
**Responsibility:** Calculate confidence metrics from storage
**Single Responsibility:** Metrics gathering only
**Exports:**
```typescript
class MetricsCalculator {
  async getMetrics(memoryId: string): Promise<ConfidenceMetrics>;
  
  private async countSupportingEvidence(memoryId: string): Promise<number>;
  private async countContradictingEvidence(memoryId: string): Promise<number>;
  private async getUsageStats(memoryId: string): Promise<UsageStats>;
}
```


### 2.4 Active Learning Submodule

#### File: `learning/active/loop.ts`
**Responsibility:** Orchestrate active learning cycle
**Justification:** Orchestrator - coordinates candidate selection, prompting, feedback processing
**Exports:**
```typescript
class ActiveLearningLoop {
  constructor(
    private storage: IMemoryStorage,
    private candidateSelector: ValidationCandidateSelector,
    private promptGenerator: ValidationPromptGenerator,
    private calibrator: ConfidenceCalibrator
  ) {}
  
  async processFeedback(
    memoryId: string,
    feedback: 'confirm' | 'reject' | 'modify',
    modification?: string
  ): Promise<void>;
  
  async identifyValidationCandidates(): Promise<Memory[]>;
  async getNextValidationPrompt(): Promise<ValidationPrompt | null>;
}
```

#### File: `learning/active/candidate-selector.ts`
**Responsibility:** Select memories needing validation
**Single Responsibility:** Selection logic only
**Exports:**
```typescript
class ValidationCandidateSelector {
  async selectCandidates(options: SelectionOptions): Promise<Memory[]>;
  
  private filterByConfidenceRange(memories: Memory[]): Memory[];
  private filterByImportance(memories: Memory[]): Memory[];
  private filterByAge(memories: Memory[]): Memory[];
  private prioritize(candidates: Memory[]): Memory[];
}
```

#### File: `learning/active/prompt-generator.ts`
**Responsibility:** Generate validation prompts for users
**Single Responsibility:** Prompt generation only
**Exports:**
```typescript
class ValidationPromptGenerator {
  generate(memory: Memory, confidence: number): ValidationPrompt;
  
  private formatMemorySummary(memory: Memory): string;
  private formatConfidenceExplanation(confidence: number): string;
  private formatOptions(): string[];
}
```

### 2.5 Factory Submodule

#### File: `learning/factory/memory-factory.ts`
**Responsibility:** Create memories from analyzed corrections
**Justification:** Factory pattern - delegates to specialized creators
**Exports:**
```typescript
class LearningMemoryFactory {
  constructor(
    private tribalCreator: TribalMemoryCreator,
    private patternCreator: PatternRationaleCreator,
    private smellCreator: CodeSmellCreator
  ) {}
  
  async createFromCorrection(analysis: AnalyzedCorrection): Promise<Memory>;
  
  private selectCreator(category: CorrectionCategory): MemoryCreator;
}
```

#### File: `learning/factory/tribal-creator.ts`
**Responsibility:** Create tribal memories from corrections
**Single Responsibility:** Tribal memory creation only
**Exports:**
```typescript
class TribalMemoryCreator implements MemoryCreator {
  create(analysis: AnalyzedCorrection): TribalMemory;
  
  private inferTopic(analysis: AnalyzedCorrection): string;
  private inferSeverity(analysis: AnalyzedCorrection): Severity;
  private buildSource(analysis: AnalyzedCorrection): TribalSource;
}
```

#### File: `learning/factory/pattern-creator.ts`
**Responsibility:** Create pattern rationale memories from corrections
**Single Responsibility:** Pattern rationale creation only
**Exports:**
```typescript
class PatternRationaleCreator implements MemoryCreator {
  create(analysis: AnalyzedCorrection): PatternRationaleMemory;
  
  private findRelatedPattern(analysis: AnalyzedCorrection): string | null;
  private buildRationale(analysis: AnalyzedCorrection): string;
}
```

#### File: `learning/factory/smell-creator.ts`
**Responsibility:** Create code smell memories from corrections
**Single Responsibility:** Code smell creation only
**Exports:**
```typescript
class CodeSmellCreator implements MemoryCreator {
  create(analysis: AnalyzedCorrection): CodeSmellMemory;
  
  private extractPattern(analysis: AnalyzedCorrection): string;
  private buildExample(analysis: AnalyzedCorrection): { bad: string; good: string };
}
```

### 2.6 Phase 2 Deliverables Checklist

- [ ] `learning/analysis/analyzer.ts` - CorrectionAnalyzer
- [ ] `learning/analysis/categorizer.ts` - CorrectionCategorizer
- [ ] `learning/analysis/principle-extractor.ts` - PrincipleExtractor
- [ ] `learning/analysis/diff-analyzer.ts` - DiffAnalyzer
- [ ] `learning/confidence/calibrator.ts` - ConfidenceCalibrator
- [ ] `learning/confidence/metrics.ts` - MetricsCalculator
- [ ] `learning/confidence/decay-integrator.ts` - Decay integration
- [ ] `learning/active/loop.ts` - ActiveLearningLoop
- [ ] `learning/active/candidate-selector.ts` - ValidationCandidateSelector
- [ ] `learning/active/prompt-generator.ts` - ValidationPromptGenerator
- [ ] `learning/factory/memory-factory.ts` - LearningMemoryFactory
- [ ] `learning/factory/tribal-creator.ts` - TribalMemoryCreator
- [ ] `learning/factory/pattern-creator.ts` - PatternRationaleCreator
- [ ] `learning/factory/smell-creator.ts` - CodeSmellCreator
- [ ] `learning/correction-extractor.ts` - REPLACE with full implementation
- [ ] `learning/outcome-tracker.ts` - ENHANCE with feedback loop
- [ ] All Phase 2 tests passing


---

## Phase 3: Token Efficiency (Weeks 7-8)

### 3.1 Compression Module Structure

```
packages/cortex/src/compression/       # NEW DIRECTORY
├── index.ts                           # Public exports
├── types.ts                           # Re-export compression types
├── compressor/
│   ├── index.ts                       # Compressor exports
│   ├── hierarchical.ts                # HierarchicalCompressorV2
│   ├── level-0.ts                     # Level0Compressor (IDs only)
│   ├── level-1.ts                     # Level1Compressor (one-liners)
│   ├── level-2.ts                     # Level2Compressor (with examples)
│   └── level-3.ts                     # Level3Compressor (full context)
├── budget/
│   ├── index.ts                       # Budget exports
│   ├── manager-v2.ts                  # TokenBudgetManagerV2
│   ├── estimator.ts                   # TokenEstimator
│   └── packer.ts                      # GreedyPacker
└── __tests__/
    ├── compressor.test.ts
    ├── levels.test.ts
    └── budget.test.ts
```

### 3.2 Compressor Submodule

#### File: `compression/compressor/hierarchical.ts`
**Responsibility:** Orchestrate hierarchical compression
**Justification:** Orchestrator - coordinates 4 level compressors
**Exports:**
```typescript
class HierarchicalCompressorV2 {
  constructor(
    private level0: Level0Compressor,
    private level1: Level1Compressor,
    private level2: Level2Compressor,
    private level3: Level3Compressor
  ) {}
  
  compress(memory: Memory, level: CompressionLevel): CompressedMemory;
  compressToFit(memory: Memory, maxTokens: number): CompressedMemory;
  getTokenCount(memory: Memory, level: CompressionLevel): number;
}
```

#### File: `compression/compressor/level-0.ts`
**Responsibility:** Compress to IDs only (~5 tokens)
**Single Responsibility:** Level 0 compression only
**Exports:**
```typescript
class Level0Compressor {
  compress(memory: Memory): Level0Result;
  
  interface Level0Result {
    id: string;
    type: MemoryType;
    importance: Importance;
    tokens: number;  // ~5
  }
}
```

#### File: `compression/compressor/level-1.ts`
**Responsibility:** Compress to one-liners (~50 tokens)
**Single Responsibility:** Level 1 compression only
**Exports:**
```typescript
class Level1Compressor {
  compress(memory: Memory): Level1Result;
  
  private generateOneLiner(memory: Memory): string;
  private selectTags(memory: Memory, maxTags: number): string[];
  
  interface Level1Result extends Level0Result {
    oneLiner: string;
    tags: string[];
    tokens: number;  // ~50
  }
}
```

#### File: `compression/compressor/level-2.ts`
**Responsibility:** Compress with one example (~200 tokens)
**Single Responsibility:** Level 2 compression only
**Exports:**
```typescript
class Level2Compressor {
  compress(memory: Memory): Level2Result;
  
  private extractKnowledge(memory: Memory): string;
  private selectBestExample(memory: Memory): string | null;
  private selectEvidence(memory: Memory, maxItems: number): string[];
  
  interface Level2Result extends Level1Result {
    details: {
      knowledge: string;
      examples: string[];
      evidence: string[];
    };
    tokens: number;  // ~200
  }
}
```

#### File: `compression/compressor/level-3.ts`
**Responsibility:** Full context (unlimited)
**Single Responsibility:** Level 3 compression only
**Exports:**
```typescript
class Level3Compressor {
  compress(memory: Memory): Level3Result;
  
  private extractFullContext(memory: Memory): FullContext;
  
  interface Level3Result extends Level2Result {
    full: {
      completeKnowledge: string;
      allExamples: CodeSnippet[];
      allEvidence: Evidence[];
      relatedMemories: string[];
      causalChain: string[];
    };
    tokens: number;  // Variable
  }
}
```

### 3.3 Budget Submodule

#### File: `compression/budget/manager-v2.ts`
**Responsibility:** Fit memories to token budget with level escalation
**Single Responsibility:** Budget management only
**Exports:**
```typescript
class TokenBudgetManagerV2 {
  constructor(
    private compressor: HierarchicalCompressorV2,
    private estimator: TokenEstimator,
    private packer: GreedyPacker
  ) {}
  
  fitToBudget(
    candidates: ScoredMemory[],
    budget: number,
    options: BudgetOptions
  ): CompressedMemory[];
  
  interface BudgetOptions {
    preferNew: boolean;
    minLevel: CompressionLevel;
    maxLevel: CompressionLevel;
    sessionContext?: SessionContext;
  }
}
```

#### File: `compression/budget/estimator.ts`
**Responsibility:** Estimate token counts
**Single Responsibility:** Token estimation only
**Exports:**
```typescript
class TokenEstimator {
  estimate(text: string): number;
  estimateObject(obj: object): number;
  estimateMemory(memory: Memory, level: CompressionLevel): number;
  
  private readonly CHARS_PER_TOKEN = 4;
}
```

#### File: `compression/budget/packer.ts`
**Responsibility:** Pack memories into budget using greedy algorithm
**Single Responsibility:** Packing algorithm only
**Exports:**
```typescript
class GreedyPacker {
  pack(
    items: PackableItem[],
    budget: number,
    options: PackOptions
  ): PackResult;
  
  interface PackableItem {
    id: string;
    tokens: number;
    priority: number;
  }
  
  interface PackResult {
    packed: PackableItem[];
    remaining: PackableItem[];
    tokensUsed: number;
  }
}
```


### 3.4 Session Module Structure

```
packages/cortex/src/session/           # NEW DIRECTORY
├── index.ts                           # Public exports
├── types.ts                           # Re-export session types
├── context/
│   ├── index.ts                       # Context exports
│   ├── manager.ts                     # SessionContextManager
│   ├── tracker.ts                     # LoadedMemoryTracker
│   └── deduplicator.ts                # ContextDeduplicator
├── storage/
│   ├── index.ts                       # Storage exports
│   ├── interface.ts                   # ISessionStorage interface
│   └── sqlite.ts                      # SQLite implementation
└── __tests__/
    ├── manager.test.ts
    ├── tracker.test.ts
    └── deduplicator.test.ts
```

#### File: `session/context/manager.ts`
**Responsibility:** Manage session lifecycle
**Single Responsibility:** Session lifecycle only
**Exports:**
```typescript
class SessionContextManager {
  constructor(
    private storage: ISessionStorage,
    private tracker: LoadedMemoryTracker
  ) {}
  
  async startSession(): Promise<SessionContext>;
  async endSession(sessionId: string): Promise<void>;
  async getActiveSession(): Promise<SessionContext | null>;
  async recordMemoryLoaded(sessionId: string, memoryId: string): Promise<void>;
  async getSessionStats(sessionId: string): Promise<SessionStats>;
}
```

#### File: `session/context/tracker.ts`
**Responsibility:** Track what's been loaded in session
**Single Responsibility:** Tracking only
**Exports:**
```typescript
class LoadedMemoryTracker {
  private loadedMemories: Set<string> = new Set();
  private loadedPatterns: Set<string> = new Set();
  private loadedFiles: Set<string> = new Set();
  
  markLoaded(type: 'memory' | 'pattern' | 'file', id: string): void;
  isLoaded(type: 'memory' | 'pattern' | 'file', id: string): boolean;
  getLoaded(type: 'memory' | 'pattern' | 'file'): string[];
  clear(): void;
}
```

#### File: `session/context/deduplicator.ts`
**Responsibility:** Deduplicate context before sending
**Single Responsibility:** Deduplication only
**Exports:**
```typescript
class ContextDeduplicator {
  constructor(private tracker: LoadedMemoryTracker) {}
  
  deduplicate(memories: Memory[]): Memory[];
  deduplicatePatterns(patterns: Pattern[]): Pattern[];
  getNewOnly<T extends { id: string }>(items: T[], type: string): T[];
}
```

### 3.5 Phase 3 Deliverables Checklist

- [ ] `compression/compressor/hierarchical.ts` - HierarchicalCompressorV2
- [ ] `compression/compressor/level-0.ts` - Level0Compressor
- [ ] `compression/compressor/level-1.ts` - Level1Compressor
- [ ] `compression/compressor/level-2.ts` - Level2Compressor
- [ ] `compression/compressor/level-3.ts` - Level3Compressor
- [ ] `compression/budget/manager-v2.ts` - TokenBudgetManagerV2
- [ ] `compression/budget/estimator.ts` - TokenEstimator
- [ ] `compression/budget/packer.ts` - GreedyPacker
- [ ] `session/context/manager.ts` - SessionContextManager
- [ ] `session/context/tracker.ts` - LoadedMemoryTracker
- [ ] `session/context/deduplicator.ts` - ContextDeduplicator
- [ ] `session/storage/interface.ts` - ISessionStorage
- [ ] `session/storage/sqlite.ts` - SQLite implementation
- [ ] All Phase 3 tests passing

---

## Phase 4: Predictive Retrieval (Weeks 9-10)

### 4.1 Prediction Module Structure

```
packages/cortex/src/prediction/        # NEW DIRECTORY
├── index.ts                           # Public exports
├── types.ts                           # Re-export prediction types
├── signals/
│   ├── index.ts                       # Signal exports
│   ├── gatherer.ts                    # SignalGatherer
│   ├── file-signals.ts                # FileSignalExtractor
│   ├── temporal-signals.ts            # TemporalSignalExtractor
│   ├── behavioral-signals.ts          # BehavioralSignalExtractor
│   └── git-signals.ts                 # GitSignalExtractor
├── predictor/
│   ├── index.ts                       # Predictor exports
│   ├── engine.ts                      # MemoryPredictor
│   ├── file-predictor.ts              # FileBasedPredictor
│   ├── pattern-predictor.ts           # PatternBasedPredictor
│   ├── temporal-predictor.ts          # TemporalPredictor
│   └── behavioral-predictor.ts        # BehavioralPredictor
├── cache/
│   ├── index.ts                       # Cache exports
│   ├── prediction-cache.ts            # PredictionCache
│   └── preloader.ts                   # EmbeddingPreloader
└── __tests__/
    ├── signals.test.ts
    ├── predictor.test.ts
    └── cache.test.ts
```

### 4.2 Signals Submodule

#### File: `prediction/signals/gatherer.ts`
**Responsibility:** Gather all prediction signals
**Justification:** Orchestrator - coordinates 4 signal extractors
**Exports:**
```typescript
class SignalGatherer {
  constructor(
    private fileSignals: FileSignalExtractor,
    private temporalSignals: TemporalSignalExtractor,
    private behavioralSignals: BehavioralSignalExtractor,
    private gitSignals: GitSignalExtractor
  ) {}
  
  async gather(activeFile: string): Promise<PredictionSignals>;
}
```

#### File: `prediction/signals/file-signals.ts`
**Responsibility:** Extract file-based signals
**Single Responsibility:** File signal extraction only
**Exports:**
```typescript
class FileSignalExtractor {
  extract(activeFile: string, recentFiles: string[]): FileSignals;
  
  private detectPatterns(file: string): string[];
  private extractImports(file: string): string[];
  
  interface FileSignals {
    activeFile: string;
    recentFiles: string[];
    filePatterns: string[];
    fileImports: string[];
  }
}
```

#### File: `prediction/signals/temporal-signals.ts`
**Responsibility:** Extract time-based signals
**Single Responsibility:** Temporal signal extraction only
**Exports:**
```typescript
class TemporalSignalExtractor {
  extract(): TemporalSignals;
  
  private getTimeOfDay(): 'morning' | 'afternoon' | 'evening';
  private getSessionDuration(): number;
  
  interface TemporalSignals {
    timeOfDay: 'morning' | 'afternoon' | 'evening';
    dayOfWeek: string;
    sessionDuration: number;
  }
}
```


### 4.3 Predictor Submodule

#### File: `prediction/predictor/engine.ts`
**Responsibility:** Orchestrate memory prediction
**Justification:** Orchestrator - coordinates 4 prediction strategies
**Exports:**
```typescript
class MemoryPredictor {
  constructor(
    private filePredictor: FileBasedPredictor,
    private patternPredictor: PatternBasedPredictor,
    private temporalPredictor: TemporalPredictor,
    private behavioralPredictor: BehavioralPredictor
  ) {}
  
  async predict(signals: PredictionSignals): Promise<PredictedMemory[]>;
  
  private rankPredictions(predictions: PredictedMemory[]): PredictedMemory[];
  private deduplicatePredictions(predictions: PredictedMemory[]): PredictedMemory[];
}
```

#### File: `prediction/predictor/file-predictor.ts`
**Responsibility:** Predict memories based on file context
**Single Responsibility:** File-based prediction only
**Exports:**
```typescript
class FileBasedPredictor {
  constructor(private storage: IMemoryStorage) {}
  
  async predict(file: string): Promise<PredictedMemory[]>;
  
  private async getLinkedMemories(file: string): Promise<PredictedMemory[]>;
  private async getPatternMemories(file: string): Promise<PredictedMemory[]>;
  private async getSimilarFileMemories(file: string): Promise<PredictedMemory[]>;
}
```

#### File: `prediction/predictor/pattern-predictor.ts`
**Responsibility:** Predict memories based on detected patterns
**Single Responsibility:** Pattern-based prediction only
**Exports:**
```typescript
class PatternBasedPredictor {
  constructor(private storage: IMemoryStorage) {}
  
  async predict(patterns: string[]): Promise<PredictedMemory[]>;
  
  private async getPatternRationales(patternId: string): Promise<Memory[]>;
  private async getRelatedTribal(patternId: string): Promise<Memory[]>;
}
```

#### File: `prediction/predictor/temporal-predictor.ts`
**Responsibility:** Predict memories based on time patterns
**Single Responsibility:** Temporal prediction only
**Exports:**
```typescript
class TemporalPredictor {
  constructor(private storage: IMemoryStorage) {}
  
  async predict(signals: TemporalSignals): Promise<PredictedMemory[]>;
  
  private async getMorningMemories(): Promise<Memory[]>;
  private async getAfternoonMemories(): Promise<Memory[]>;
  private async getEveningMemories(): Promise<Memory[]>;
}
```

#### File: `prediction/predictor/behavioral-predictor.ts`
**Responsibility:** Predict memories based on user behavior
**Single Responsibility:** Behavioral prediction only
**Exports:**
```typescript
class BehavioralPredictor {
  constructor(private storage: IMemoryStorage) {}
  
  async predict(signals: BehavioralSignals): Promise<PredictedMemory[]>;
  
  private async getRecentQueryMemories(queries: string[]): Promise<Memory[]>;
  private async getIntentMemories(intents: Intent[]): Promise<Memory[]>;
}
```

### 4.4 Prediction Cache Submodule

#### File: `prediction/cache/prediction-cache.ts`
**Responsibility:** Cache predictions for fast retrieval
**Single Responsibility:** Prediction caching only
**Exports:**
```typescript
class PredictionCache {
  private cache: Map<string, CachedPrediction> = new Map();
  private ttl = 5 * 60 * 1000;  // 5 minutes
  
  async getForFile(file: string): Promise<PredictedMemory[]>;
  async onFileOpened(file: string): Promise<void>;
  async onQuery(query: string, file: string): Promise<RetrievalResult>;
  
  private predictionsCoverQuery(predictions: PredictedMemory[], query: string): boolean;
}
```

#### File: `prediction/cache/preloader.ts`
**Responsibility:** Preload embeddings for predicted memories
**Single Responsibility:** Embedding preloading only
**Exports:**
```typescript
class EmbeddingPreloader {
  constructor(
    private embeddings: IEmbeddingProvider,
    private cache: EmbeddingCacheManager
  ) {}
  
  async preload(predictions: PredictedMemory[]): Promise<void>;
  
  private async preloadBatch(memoryIds: string[]): Promise<void>;
}
```

### 4.5 Phase 4 Deliverables Checklist

- [ ] `prediction/signals/gatherer.ts` - SignalGatherer
- [ ] `prediction/signals/file-signals.ts` - FileSignalExtractor
- [ ] `prediction/signals/temporal-signals.ts` - TemporalSignalExtractor
- [ ] `prediction/signals/behavioral-signals.ts` - BehavioralSignalExtractor
- [ ] `prediction/signals/git-signals.ts` - GitSignalExtractor
- [ ] `prediction/predictor/engine.ts` - MemoryPredictor
- [ ] `prediction/predictor/file-predictor.ts` - FileBasedPredictor
- [ ] `prediction/predictor/pattern-predictor.ts` - PatternBasedPredictor
- [ ] `prediction/predictor/temporal-predictor.ts` - TemporalPredictor
- [ ] `prediction/predictor/behavioral-predictor.ts` - BehavioralPredictor
- [ ] `prediction/cache/prediction-cache.ts` - PredictionCache
- [ ] `prediction/cache/preloader.ts` - EmbeddingPreloader
- [ ] All Phase 4 tests passing

---

## Phase 5: Code Generation Context (Weeks 11-12)

### 5.1 Generation Module Structure

```
packages/cortex/src/generation/        # NEW DIRECTORY
├── index.ts                           # Public exports
├── types.ts                           # Re-export generation types
├── context/
│   ├── index.ts                       # Context exports
│   ├── builder.ts                     # GenerationContextBuilder
│   ├── pattern-gatherer.ts            # PatternContextGatherer
│   ├── tribal-gatherer.ts             # TribalContextGatherer
│   ├── constraint-gatherer.ts         # ConstraintContextGatherer
│   └── antipattern-gatherer.ts        # AntiPatternGatherer
├── provenance/
│   ├── index.ts                       # Provenance exports
│   ├── tracker.ts                     # ProvenanceTracker
│   ├── comment-generator.ts           # ProvenanceCommentGenerator
│   └── explanation-builder.ts         # ExplanationBuilder
├── validation/
│   ├── index.ts                       # Validation exports
│   ├── validator.ts                   # GeneratedCodeValidator
│   ├── pattern-checker.ts             # PatternComplianceChecker
│   ├── tribal-checker.ts              # TribalComplianceChecker
│   └── antipattern-checker.ts         # AntiPatternChecker
├── feedback/
│   ├── index.ts                       # Feedback exports
│   ├── loop.ts                        # GenerationFeedbackLoop
│   └── outcome-processor.ts           # OutcomeProcessor
└── __tests__/
    ├── builder.test.ts
    ├── provenance.test.ts
    ├── validation.test.ts
    └── feedback.test.ts
```


### 5.2 Context Submodule

#### File: `generation/context/builder.ts`
**Responsibility:** Build complete generation context
**Justification:** Orchestrator - coordinates 4 context gatherers
**Exports:**
```typescript
class GenerationContextBuilder {
  constructor(
    private patternGatherer: PatternContextGatherer,
    private tribalGatherer: TribalContextGatherer,
    private constraintGatherer: ConstraintContextGatherer,
    private antiPatternGatherer: AntiPatternGatherer
  ) {}
  
  async build(
    intent: Intent,
    target: GenerationTarget,
    query: string
  ): Promise<GenerationContext>;
}
```

#### File: `generation/context/pattern-gatherer.ts`
**Responsibility:** Gather pattern context for generation
**Single Responsibility:** Pattern gathering only
**Exports:**
```typescript
class PatternContextGatherer {
  constructor(private storage: IMemoryStorage) {}
  
  async gather(target: GenerationTarget, query: string): Promise<PatternContext[]>;
  
  private async getFilePatterns(file: string): Promise<Memory[]>;
  private async getQueryPatterns(query: string): Promise<Memory[]>;
  private async getPatternExamples(patternId: string): Promise<CodeSnippet[]>;
}
```

#### File: `generation/context/tribal-gatherer.ts`
**Responsibility:** Gather tribal knowledge for generation
**Single Responsibility:** Tribal gathering only
**Exports:**
```typescript
class TribalContextGatherer {
  constructor(private storage: IMemoryStorage) {}
  
  async gather(target: GenerationTarget, query: string): Promise<TribalContext[]>;
  
  private tribalApplies(tribal: TribalMemory, target: GenerationTarget, query: string): boolean;
}
```

#### File: `generation/context/constraint-gatherer.ts`
**Responsibility:** Gather constraints and overrides for generation
**Single Responsibility:** Constraint gathering only
**Exports:**
```typescript
class ConstraintContextGatherer {
  constructor(private storage: IMemoryStorage) {}
  
  async gather(target: GenerationTarget): Promise<ConstraintContext[]>;
  
  private async getApplicableConstraints(file: string): Promise<Constraint[]>;
  private async getOverrides(constraintId: string): Promise<ConstraintOverrideMemory[]>;
}
```

#### File: `generation/context/antipattern-gatherer.ts`
**Responsibility:** Gather anti-patterns to avoid
**Single Responsibility:** Anti-pattern gathering only
**Exports:**
```typescript
class AntiPatternGatherer {
  constructor(private storage: IMemoryStorage) {}
  
  async gather(target: GenerationTarget, query: string): Promise<AntiPatternContext[]>;
  
  private async getCodeSmells(): Promise<CodeSmellMemory[]>;
  private smellApplies(smell: CodeSmellMemory, target: GenerationTarget): boolean;
}
```

### 5.3 Provenance Submodule

#### File: `generation/provenance/tracker.ts`
**Responsibility:** Track provenance during generation
**Single Responsibility:** Provenance tracking only
**Exports:**
```typescript
class ProvenanceTracker {
  private influences: Influence[] = [];
  
  recordInfluence(memoryId: string, type: InfluenceType, description: string): void;
  recordWarning(warning: string): void;
  recordConstraint(constraintId: string): void;
  recordAntiPattern(patternId: string): void;
  
  build(): CodeProvenance;
}
```

#### File: `generation/provenance/comment-generator.ts`
**Responsibility:** Generate provenance comments for code
**Single Responsibility:** Comment generation only
**Exports:**
```typescript
class ProvenanceCommentGenerator {
  generate(provenance: CodeProvenance): string;
  
  private formatInfluences(influences: Influence[]): string[];
  private formatWarnings(warnings: string[]): string[];
  private formatHeader(provenance: CodeProvenance): string;
}
```

#### File: `generation/provenance/explanation-builder.ts`
**Responsibility:** Build human-readable explanations
**Single Responsibility:** Explanation building only
**Exports:**
```typescript
class ExplanationBuilder {
  build(provenance: CodeProvenance): string;
  
  private summarizeInfluences(influences: Influence[]): string;
  private summarizeWarnings(warnings: string[]): string;
  private summarizeConstraints(constraints: string[]): string;
}
```

### 5.4 Validation Submodule

#### File: `generation/validation/validator.ts`
**Responsibility:** Validate generated code against context
**Justification:** Orchestrator - coordinates 3 checkers
**Exports:**
```typescript
class GeneratedCodeValidator {
  constructor(
    private patternChecker: PatternComplianceChecker,
    private tribalChecker: TribalComplianceChecker,
    private antiPatternChecker: AntiPatternChecker
  ) {}
  
  async validate(code: string, context: GenerationContext): Promise<ValidationResult>;
}
```

#### File: `generation/validation/pattern-checker.ts`
**Responsibility:** Check pattern compliance
**Single Responsibility:** Pattern checking only
**Exports:**
```typescript
class PatternComplianceChecker {
  check(code: string, patterns: PatternContext[]): PatternViolation[];
  
  private followsPattern(code: string, pattern: PatternContext): boolean;
}
```

#### File: `generation/validation/tribal-checker.ts`
**Responsibility:** Check tribal knowledge compliance
**Single Responsibility:** Tribal checking only
**Exports:**
```typescript
class TribalComplianceChecker {
  check(code: string, tribal: TribalContext[]): TribalViolation[];
  
  private violatesTribal(code: string, tribal: TribalContext): boolean;
}
```

#### File: `generation/validation/antipattern-checker.ts`
**Responsibility:** Check for anti-pattern matches
**Single Responsibility:** Anti-pattern checking only
**Exports:**
```typescript
class AntiPatternChecker {
  check(code: string, antiPatterns: AntiPatternContext[]): AntiPatternMatch[];
  
  private matchesAntiPattern(code: string, antiPattern: AntiPatternContext): boolean;
}
```

### 5.5 Feedback Submodule

#### File: `generation/feedback/loop.ts`
**Responsibility:** Process generation feedback
**Single Responsibility:** Feedback loop only
**Exports:**
```typescript
class GenerationFeedbackLoop {
  constructor(
    private storage: IMemoryStorage,
    private outcomeProcessor: OutcomeProcessor,
    private learningFactory: LearningMemoryFactory
  ) {}
  
  async trackOutcome(
    generation: GeneratedCode,
    outcome: 'accepted' | 'modified' | 'rejected',
    feedback?: string
  ): Promise<void>;
}
```

#### File: `generation/feedback/outcome-processor.ts`
**Responsibility:** Process generation outcomes
**Single Responsibility:** Outcome processing only
**Exports:**
```typescript
class OutcomeProcessor {
  constructor(private storage: IMemoryStorage) {}
  
  async processAccepted(generation: GeneratedCode): Promise<void>;
  async processModified(generation: GeneratedCode): Promise<void>;
  async processRejected(generation: GeneratedCode, feedback: string): Promise<void>;
  
  private adjustConfidence(memoryId: string, adjustment: number): Promise<void>;
}
```

### 5.6 Phase 5 Deliverables Checklist

- [ ] `generation/context/builder.ts` - GenerationContextBuilder
- [ ] `generation/context/pattern-gatherer.ts` - PatternContextGatherer
- [ ] `generation/context/tribal-gatherer.ts` - TribalContextGatherer
- [ ] `generation/context/constraint-gatherer.ts` - ConstraintContextGatherer
- [ ] `generation/context/antipattern-gatherer.ts` - AntiPatternGatherer
- [ ] `generation/provenance/tracker.ts` - ProvenanceTracker
- [ ] `generation/provenance/comment-generator.ts` - ProvenanceCommentGenerator
- [ ] `generation/provenance/explanation-builder.ts` - ExplanationBuilder
- [ ] `generation/validation/validator.ts` - GeneratedCodeValidator
- [ ] `generation/validation/pattern-checker.ts` - PatternComplianceChecker
- [ ] `generation/validation/tribal-checker.ts` - TribalComplianceChecker
- [ ] `generation/validation/antipattern-checker.ts` - AntiPatternChecker
- [ ] `generation/feedback/loop.ts` - GenerationFeedbackLoop
- [ ] `generation/feedback/outcome-processor.ts` - OutcomeProcessor
- [ ] All Phase 5 tests passing


---

## Phase 6: MCP Tools & Integration (Weeks 13-14)

### 6.1 MCP Tools Enhancement

```
packages/mcp/src/tools/memory/         # ENHANCE EXISTING
├── index.ts                           # MODIFY - Add new tool registrations
├── add.ts                             # ENHANCE - Add causal inference
├── search.ts                          # ENHANCE - Add session deduplication
├── get.ts                             # ENHANCE - Add causal chain option
├── update.ts                          # KEEP - Existing
├── delete.ts                          # KEEP - Existing
├── status.ts                          # ENHANCE - Add health metrics
├── validate.ts                        # ENHANCE - Add healing stats
├── consolidate.ts                     # KEEP - Existing
├── for-context.ts                     # ENHANCE - Add compression levels
├── warnings.ts                        # KEEP - Existing
├── learn.ts                           # REPLACE - Full learning integration
├── suggest.ts                         # KEEP - Existing
├── why.ts                             # REPLACE - Causal narrative generation
├── export.ts                          # KEEP - Existing
├── import.ts                          # KEEP - Existing
├── explain.ts                         # NEW - Causal explanation tool
├── conflicts.ts                       # NEW - Conflict management tool
├── graph.ts                           # NEW - Causal graph queries
├── feedback.ts                        # NEW - Memory feedback tool
├── health.ts                          # NEW - Health report tool
└── predict.ts                         # NEW - Prediction tool
```

### 6.2 New MCP Tools

#### File: `mcp/tools/memory/explain.ts`
**Responsibility:** Provide causal explanations for memories
**Exports:**
```typescript
// drift_memory_explain
{
  name: 'drift_memory_explain',
  description: 'Get causal explanation for a memory',
  parameters: {
    memoryId: string,
    direction?: 'origins' | 'effects' | 'both',
    maxDepth?: number,
  },
  handler: async (params) => {
    const traverser = new CausalGraphTraverser(storage);
    const generator = new NarrativeGenerator();
    
    const chain = await traverser.traceOrigins(params.memoryId, params.maxDepth);
    const narrative = generator.generateNarrative(chain);
    
    return { memory, causalChain: chain, narrative, confidence };
  }
}
```

#### File: `mcp/tools/memory/conflicts.ts`
**Responsibility:** List and resolve memory conflicts
**Exports:**
```typescript
// drift_memory_conflicts
{
  name: 'drift_memory_conflicts',
  description: 'List and resolve memory conflicts',
  parameters: {
    action?: 'list' | 'resolve',
    conflictId?: string,
    resolution?: 'newer_wins' | 'higher_confidence' | 'scope_specific' | 'manual',
    manualWinner?: string,
  },
  handler: async (params) => {
    const detector = new ConflictDetector(storage);
    const resolver = new ConflictResolver(storage);
    
    if (params.action === 'list') {
      return { conflicts: await detector.detectConflicts() };
    } else {
      return { resolved: await resolver.resolve(params.conflictId, params.resolution) };
    }
  }
}
```

#### File: `mcp/tools/memory/graph.ts`
**Responsibility:** Query the causal memory graph
**Exports:**
```typescript
// drift_memory_graph
{
  name: 'drift_memory_graph',
  description: 'Query the causal memory graph',
  parameters: {
    action: 'traverse' | 'path' | 'subgraph',
    startNode?: string,
    endNode?: string,
    relationTypes?: CausalRelation[],
    maxDepth?: number,
  },
  handler: async (params) => {
    const traverser = new CausalGraphTraverser(storage);
    
    switch (params.action) {
      case 'traverse':
        return traverser.traceOrigins(params.startNode, params.maxDepth);
      case 'path':
        return traverser.findPath(params.startNode, params.endNode);
      case 'subgraph':
        return traverser.getSubgraph([params.startNode]);
    }
  }
}
```

#### File: `mcp/tools/memory/feedback.ts`
**Responsibility:** Provide feedback on memories
**Exports:**
```typescript
// drift_memory_feedback
{
  name: 'drift_memory_feedback',
  description: 'Provide feedback on a memory',
  parameters: {
    memoryId: string,
    feedback: 'helpful' | 'not_helpful' | 'wrong' | 'outdated',
    details?: string,
  },
  handler: async (params) => {
    const loop = new ActiveLearningLoop(storage);
    const calibrator = new ConfidenceCalibrator();
    
    const adjustment = calibrator.getFeedbackAdjustment(params.feedback);
    await loop.processFeedback(params.memoryId, params.feedback, params.details);
    
    return { processed: true, confidenceAdjustment: adjustment };
  }
}
```

#### File: `mcp/tools/memory/health.ts`
**Responsibility:** Get comprehensive health report
**Exports:**
```typescript
// drift_memory_health
{
  name: 'drift_memory_health',
  description: 'Get comprehensive health report',
  parameters: {},
  handler: async () => {
    const healthChecker = new HealthChecker(storage);
    
    return {
      overallScore: await healthChecker.calculateScore(),
      metrics: await healthChecker.getMetrics(),
      issues: await healthChecker.getIssues(),
      recommendations: await healthChecker.getRecommendations(),
    };
  }
}
```

#### File: `mcp/tools/memory/predict.ts`
**Responsibility:** Get predicted memories for context
**Exports:**
```typescript
// drift_memory_predict
{
  name: 'drift_memory_predict',
  description: 'Get predicted memories for current context',
  parameters: {
    activeFile: string,
    recentFiles?: string[],
  },
  handler: async (params) => {
    const gatherer = new SignalGatherer();
    const predictor = new MemoryPredictor(storage);
    
    const signals = await gatherer.gather(params.activeFile);
    const predictions = await predictor.predict(signals);
    
    return { predictions, signals };
  }
}
```

### 6.3 Enhanced MCP Tools

#### File: `mcp/tools/memory/why.ts` (REPLACE)
**Responsibility:** Generate causal "why" narratives
**Changes:**
- Add causal chain traversal
- Generate human-readable narratives
- Include confidence scores
- Track sources used

#### File: `mcp/tools/memory/learn.ts` (REPLACE)
**Responsibility:** Learn from corrections with full analysis
**Changes:**
- Use CorrectionAnalyzer for categorization
- Extract principles with PrincipleExtractor
- Create appropriate memory types with LearningMemoryFactory
- Track learning outcomes

#### File: `mcp/tools/memory/add.ts` (ENHANCE)
**Responsibility:** Add memories with causal inference
**Changes:**
- Auto-infer causal relationships
- Link to existing memories
- Validate against conflicts

#### File: `mcp/tools/memory/search.ts` (ENHANCE)
**Responsibility:** Search with session deduplication
**Changes:**
- Integrate SessionContext
- Deduplicate already-loaded memories
- Track tokens sent

#### File: `mcp/tools/memory/for-context.ts` (ENHANCE)
**Responsibility:** Get context with compression levels
**Changes:**
- Support compression level parameter
- Use TokenBudgetManagerV2
- Include session tracking


### 6.4 Orchestrators Module

```
packages/cortex/src/orchestrators/     # NEW DIRECTORY
├── index.ts                           # Public exports
├── cortex-v2.ts                       # Main CortexV2 orchestrator
├── retrieval-orchestrator.ts          # RetrievalOrchestrator
├── learning-orchestrator.ts           # LearningOrchestrator
└── generation-orchestrator.ts         # GenerationOrchestrator
```

#### File: `orchestrators/cortex-v2.ts`
**Responsibility:** Main entry point for Cortex v2
**Justification:** Top-level orchestrator - coordinates all subsystems
**Exports:**
```typescript
class CortexV2 {
  constructor(
    private storage: IMemoryStorage,
    private embeddings: IEmbeddingProvider,
    private causalStorage: ICausalStorage,
    private sessionManager: SessionContextManager
  ) {}
  
  // Retrieval
  async getContext(intent: Intent, focus: string, options?: ContextOptions): Promise<ContextResult>;
  async getWhy(intent: Intent, focus: string): Promise<WhyResult>;
  
  // Learning
  async learn(original: string, feedback: string, correctedCode?: string): Promise<LearnResult>;
  async processFeedback(memoryId: string, feedback: FeedbackType): Promise<void>;
  
  // Generation
  async buildGenerationContext(intent: Intent, target: GenerationTarget): Promise<GenerationContext>;
  async trackGenerationOutcome(generation: GeneratedCode, outcome: Outcome): Promise<void>;
  
  // Prediction
  async predict(activeFile: string): Promise<PredictedMemory[]>;
  
  // Health
  async getHealth(): Promise<HealthReport>;
  async consolidate(options?: ConsolidateOptions): Promise<ConsolidateResult>;
  async validate(options?: ValidateOptions): Promise<ValidateResult>;
}
```

#### File: `orchestrators/retrieval-orchestrator.ts`
**Responsibility:** Orchestrate memory retrieval
**Justification:** Orchestrator - coordinates retrieval, compression, session
**Exports:**
```typescript
class RetrievalOrchestrator {
  constructor(
    private engine: RetrievalEngine,
    private compressor: HierarchicalCompressorV2,
    private budgetManager: TokenBudgetManagerV2,
    private sessionManager: SessionContextManager,
    private predictionCache: PredictionCache
  ) {}
  
  async retrieve(context: RetrievalContext): Promise<RetrievalResult>;
  
  private async gatherCandidates(context: RetrievalContext): Promise<Memory[]>;
  private async scoreAndRank(candidates: Memory[], context: RetrievalContext): Promise<ScoredMemory[]>;
  private async compressAndFit(scored: ScoredMemory[], budget: number): Promise<CompressedMemory[]>;
  private async deduplicateWithSession(memories: CompressedMemory[]): Promise<CompressedMemory[]>;
}
```

#### File: `orchestrators/learning-orchestrator.ts`
**Responsibility:** Orchestrate learning from feedback
**Justification:** Orchestrator - coordinates analysis, calibration, memory creation
**Exports:**
```typescript
class LearningOrchestrator {
  constructor(
    private analyzer: CorrectionAnalyzer,
    private calibrator: ConfidenceCalibrator,
    private factory: LearningMemoryFactory,
    private activeLoop: ActiveLearningLoop,
    private causalInference: CausalInferenceEngine
  ) {}
  
  async learnFromCorrection(original: string, feedback: string, correctedCode?: string): Promise<LearnResult>;
  async processFeedback(memoryId: string, feedback: FeedbackType): Promise<void>;
  async getValidationCandidates(): Promise<Memory[]>;
}
```

#### File: `orchestrators/generation-orchestrator.ts`
**Responsibility:** Orchestrate code generation context
**Justification:** Orchestrator - coordinates context building, validation, feedback
**Exports:**
```typescript
class GenerationOrchestrator {
  constructor(
    private contextBuilder: GenerationContextBuilder,
    private validator: GeneratedCodeValidator,
    private feedbackLoop: GenerationFeedbackLoop,
    private provenanceTracker: ProvenanceTracker
  ) {}
  
  async buildContext(intent: Intent, target: GenerationTarget, query: string): Promise<GenerationContext>;
  async validateGenerated(code: string, context: GenerationContext): Promise<ValidationResult>;
  async trackOutcome(generation: GeneratedCode, outcome: Outcome, feedback?: string): Promise<void>;
}
```

### 6.5 Phase 6 Deliverables Checklist

**New MCP Tools:**
- [ ] `mcp/tools/memory/explain.ts` - drift_memory_explain
- [ ] `mcp/tools/memory/conflicts.ts` - drift_memory_conflicts
- [ ] `mcp/tools/memory/graph.ts` - drift_memory_graph
- [ ] `mcp/tools/memory/feedback.ts` - drift_memory_feedback
- [ ] `mcp/tools/memory/health.ts` - drift_memory_health
- [ ] `mcp/tools/memory/predict.ts` - drift_memory_predict

**Enhanced MCP Tools:**
- [ ] `mcp/tools/memory/why.ts` - REPLACE with causal narratives
- [ ] `mcp/tools/memory/learn.ts` - REPLACE with full learning
- [ ] `mcp/tools/memory/add.ts` - ENHANCE with causal inference
- [ ] `mcp/tools/memory/search.ts` - ENHANCE with session deduplication
- [ ] `mcp/tools/memory/for-context.ts` - ENHANCE with compression levels
- [ ] `mcp/tools/memory/status.ts` - ENHANCE with health metrics
- [ ] `mcp/tools/memory/get.ts` - ENHANCE with causal chain option
- [ ] `mcp/tools/memory/validate.ts` - ENHANCE with healing stats

**Orchestrators:**
- [ ] `orchestrators/cortex-v2.ts` - CortexV2
- [ ] `orchestrators/retrieval-orchestrator.ts` - RetrievalOrchestrator
- [ ] `orchestrators/learning-orchestrator.ts` - LearningOrchestrator
- [ ] `orchestrators/generation-orchestrator.ts` - GenerationOrchestrator

- [ ] All Phase 6 tests passing
- [ ] MCP tool integration tests passing

---

## Phase 7: Testing & Polish (Weeks 15-16)

### 7.1 Test Coverage Requirements

```
packages/cortex/src/__tests__/
├── causal/                            # Phase 1a tests
│   ├── storage.test.ts
│   ├── traverser.test.ts
│   ├── inference.test.ts
│   └── narrative.test.ts
├── learning/                          # Phase 2 tests
│   ├── analyzer.test.ts
│   ├── categorizer.test.ts
│   ├── principle-extractor.test.ts
│   ├── calibrator.test.ts
│   ├── active-loop.test.ts
│   └── factory.test.ts
├── compression/                       # Phase 3 tests
│   ├── compressor.test.ts
│   ├── levels.test.ts
│   └── budget.test.ts
├── session/                           # Phase 3 tests
│   ├── manager.test.ts
│   ├── tracker.test.ts
│   └── deduplicator.test.ts
├── embeddings/                        # Phase 1b tests
│   ├── structural.test.ts
│   ├── semantic.test.ts
│   ├── lexical.test.ts
│   ├── hybrid.test.ts
│   └── cache.test.ts
├── prediction/                        # Phase 4 tests
│   ├── signals.test.ts
│   ├── predictor.test.ts
│   └── cache.test.ts
├── generation/                        # Phase 5 tests
│   ├── builder.test.ts
│   ├── provenance.test.ts
│   ├── validation.test.ts
│   └── feedback.test.ts
├── orchestrators/                     # Phase 6 tests
│   ├── cortex-v2.test.ts
│   ├── retrieval.test.ts
│   ├── learning.test.ts
│   └── generation.test.ts
└── integration/                       # Integration tests
    ├── full-flow.test.ts
    ├── token-efficiency.test.ts
    ├── learning-loop.test.ts
    └── causal-narrative.test.ts
```

### 7.2 Test Coverage Targets

| Module | Unit Tests | Integration Tests | Target Coverage |
|--------|------------|-------------------|-----------------|
| Causal | 30+ | 5+ | 90% |
| Learning | 40+ | 5+ | 85% |
| Compression | 25+ | 3+ | 90% |
| Session | 20+ | 3+ | 85% |
| Embeddings | 35+ | 5+ | 80% |
| Prediction | 25+ | 3+ | 85% |
| Generation | 30+ | 5+ | 85% |
| Orchestrators | 20+ | 10+ | 80% |
| **Total** | **225+** | **39+** | **85%** |


### 7.3 Documentation Requirements

```
drift/wiki/
├── Cortex-V2-Overview.md              # NEW - Overview of v2 features
├── Cortex-Token-Efficiency.md         # NEW - Token efficiency guide
├── Cortex-Causal-Graphs.md            # NEW - Causal graph documentation
├── Cortex-Learning-System.md          # NEW - Learning system guide
├── Cortex-Hybrid-Embeddings.md        # NEW - Embedding architecture
├── Cortex-Predictive-Retrieval.md     # NEW - Prediction system
├── Cortex-Code-Generation.md          # NEW - Generation context
└── MCP-Tools-Reference.md             # UPDATE - Add new tools
```

### 7.4 Phase 7 Deliverables Checklist

**Unit Tests:**
- [ ] All causal module tests (30+)
- [ ] All learning module tests (40+)
- [ ] All compression module tests (25+)
- [ ] All session module tests (20+)
- [ ] All embeddings module tests (35+)
- [ ] All prediction module tests (25+)
- [ ] All generation module tests (30+)
- [ ] All orchestrator tests (20+)

**Integration Tests:**
- [ ] Full flow integration test
- [ ] Token efficiency benchmark test
- [ ] Learning loop integration test
- [ ] Causal narrative integration test
- [ ] MCP tool integration tests

**Documentation:**
- [ ] Cortex-V2-Overview.md
- [ ] Cortex-Token-Efficiency.md
- [ ] Cortex-Causal-Graphs.md
- [ ] Cortex-Learning-System.md
- [ ] Cortex-Hybrid-Embeddings.md
- [ ] Cortex-Predictive-Retrieval.md
- [ ] Cortex-Code-Generation.md
- [ ] MCP-Tools-Reference.md (updated)

**Quality Gates:**
- [ ] All tests passing
- [ ] Coverage >= 85%
- [ ] No critical linting errors
- [ ] Performance benchmarks met
- [ ] Memory usage within limits

---

## Part V: Complete File Inventory

### Summary Statistics

| Category | New Files | Modified Files | Total |
|----------|-----------|----------------|-------|
| Types | 6 | 0 | 6 |
| Causal | 12 | 0 | 12 |
| Learning | 14 | 2 | 16 |
| Compression | 9 | 0 | 9 |
| Session | 6 | 0 | 6 |
| Embeddings | 17 | 2 | 19 |
| Prediction | 12 | 0 | 12 |
| Generation | 14 | 0 | 14 |
| Orchestrators | 4 | 0 | 4 |
| MCP Tools | 6 | 8 | 14 |
| Storage | 4 | 1 | 5 |
| Tests | 40+ | 0 | 40+ |
| Documentation | 7 | 1 | 8 |
| **Total** | **~150** | **~14** | **~165** |

### Complete New File List

```
packages/cortex/src/
├── types/
│   ├── causal.ts                      # NEW
│   ├── compressed-memory.ts           # NEW
│   ├── session-context.ts             # NEW
│   ├── learning.ts                    # NEW
│   ├── prediction.ts                  # NEW
│   └── generation-context.ts          # NEW
├── causal/
│   ├── index.ts                       # NEW
│   ├── types.ts                       # NEW
│   ├── storage/
│   │   ├── index.ts                   # NEW
│   │   ├── interface.ts               # NEW
│   │   └── sqlite.ts                  # NEW
│   ├── traversal/
│   │   ├── index.ts                   # NEW
│   │   ├── traverser.ts               # NEW
│   │   ├── path-finder.ts             # NEW
│   │   └── subgraph.ts                # NEW
│   ├── inference/
│   │   ├── index.ts                   # NEW
│   │   ├── engine.ts                  # NEW
│   │   ├── temporal.ts                # NEW
│   │   ├── semantic.ts                # NEW
│   │   ├── entity.ts                  # NEW
│   │   └── explicit.ts                # NEW
│   └── narrative/
│       ├── index.ts                   # NEW
│       ├── generator.ts               # NEW
│       └── templates.ts               # NEW
├── learning/
│   ├── analysis/
│   │   ├── index.ts                   # NEW
│   │   ├── analyzer.ts                # NEW
│   │   ├── categorizer.ts             # NEW
│   │   ├── principle-extractor.ts     # NEW
│   │   └── diff-analyzer.ts           # NEW
│   ├── confidence/
│   │   ├── index.ts                   # NEW
│   │   ├── calibrator.ts              # NEW
│   │   ├── metrics.ts                 # NEW
│   │   └── decay-integrator.ts        # NEW
│   ├── active/
│   │   ├── index.ts                   # NEW
│   │   ├── loop.ts                    # NEW
│   │   ├── candidate-selector.ts      # NEW
│   │   └── prompt-generator.ts        # NEW
│   └── factory/
│       ├── index.ts                   # NEW
│       ├── memory-factory.ts          # NEW
│       ├── tribal-creator.ts          # NEW
│       ├── pattern-creator.ts         # NEW
│       └── smell-creator.ts           # NEW
├── compression/
│   ├── index.ts                       # NEW
│   ├── types.ts                       # NEW
│   ├── compressor/
│   │   ├── index.ts                   # NEW
│   │   ├── hierarchical.ts            # NEW
│   │   ├── level-0.ts                 # NEW
│   │   ├── level-1.ts                 # NEW
│   │   ├── level-2.ts                 # NEW
│   │   └── level-3.ts                 # NEW
│   └── budget/
│       ├── index.ts                   # NEW
│       ├── manager-v2.ts              # NEW
│       ├── estimator.ts               # NEW
│       └── packer.ts                  # NEW
├── session/
│   ├── index.ts                       # NEW
│   ├── types.ts                       # NEW
│   ├── context/
│   │   ├── index.ts                   # NEW
│   │   ├── manager.ts                 # NEW
│   │   ├── tracker.ts                 # NEW
│   │   └── deduplicator.ts            # NEW
│   └── storage/
│       ├── index.ts                   # NEW
│       ├── interface.ts               # NEW
│       └── sqlite.ts                  # NEW
├── embeddings/
│   ├── structural/
│   │   ├── index.ts                   # NEW
│   │   ├── embedder.ts                # NEW
│   │   ├── ast-analyzer.ts            # NEW
│   │   ├── feature-extractor.ts       # NEW
│   │   └── pattern-classifier.ts      # NEW
│   ├── semantic/
│   │   ├── index.ts                   # NEW
│   │   ├── embedder.ts                # NEW
│   │   ├── codebert.ts                # NEW
│   │   └── model-loader.ts            # NEW
│   ├── lexical/
│   │   ├── index.ts                   # NEW
│   │   ├── embedder.ts                # NEW
│   │   ├── tokenizer.ts               # NEW
│   │   └── tfidf.ts                   # NEW
│   ├── hybrid/
│   │   ├── index.ts                   # NEW
│   │   ├── embedder.ts                # NEW
│   │   ├── fusion.ts                  # NEW
│   │   └── weights.ts                 # NEW
│   └── cache/
│       ├── index.ts                   # NEW
│       ├── manager.ts                 # NEW
│       ├── l1-memory.ts               # NEW
│       ├── l2-sqlite.ts               # NEW
│       └── l3-precomputed.ts          # NEW
├── prediction/
│   ├── index.ts                       # NEW
│   ├── types.ts                       # NEW
│   ├── signals/
│   │   ├── index.ts                   # NEW
│   │   ├── gatherer.ts                # NEW
│   │   ├── file-signals.ts            # NEW
│   │   ├── temporal-signals.ts        # NEW
│   │   ├── behavioral-signals.ts      # NEW
│   │   └── git-signals.ts             # NEW
│   ├── predictor/
│   │   ├── index.ts                   # NEW
│   │   ├── engine.ts                  # NEW
│   │   ├── file-predictor.ts          # NEW
│   │   ├── pattern-predictor.ts       # NEW
│   │   ├── temporal-predictor.ts      # NEW
│   │   └── behavioral-predictor.ts    # NEW
│   └── cache/
│       ├── index.ts                   # NEW
│       ├── prediction-cache.ts        # NEW
│       └── preloader.ts               # NEW
├── generation/
│   ├── index.ts                       # NEW
│   ├── types.ts                       # NEW
│   ├── context/
│   │   ├── index.ts                   # NEW
│   │   ├── builder.ts                 # NEW
│   │   ├── pattern-gatherer.ts        # NEW
│   │   ├── tribal-gatherer.ts         # NEW
│   │   ├── constraint-gatherer.ts     # NEW
│   │   └── antipattern-gatherer.ts    # NEW
│   ├── provenance/
│   │   ├── index.ts                   # NEW
│   │   ├── tracker.ts                 # NEW
│   │   ├── comment-generator.ts       # NEW
│   │   └── explanation-builder.ts     # NEW
│   ├── validation/
│   │   ├── index.ts                   # NEW
│   │   ├── validator.ts               # NEW
│   │   ├── pattern-checker.ts         # NEW
│   │   ├── tribal-checker.ts          # NEW
│   │   └── antipattern-checker.ts     # NEW
│   └── feedback/
│       ├── index.ts                   # NEW
│       ├── loop.ts                    # NEW
│       └── outcome-processor.ts       # NEW
├── orchestrators/
│   ├── index.ts                       # NEW
│   ├── cortex-v2.ts                   # NEW
│   ├── retrieval-orchestrator.ts      # NEW
│   ├── learning-orchestrator.ts       # NEW
│   └── generation-orchestrator.ts     # NEW
└── storage/sqlite/migrations/
    ├── 002_causal_edges.ts            # NEW
    ├── 003_session_context.ts         # NEW
    ├── 004_validation_history.ts      # NEW
    └── 005_usage_history.ts           # NEW

packages/mcp/src/tools/memory/
├── explain.ts                         # NEW
├── conflicts.ts                       # NEW
├── graph.ts                           # NEW
├── feedback.ts                        # NEW
├── health.ts                          # NEW
└── predict.ts                         # NEW
```


---

## Part VI: Success Criteria

### Functional Requirements

| Requirement | Metric | Target |
|-------------|--------|--------|
| Token Reduction | Tokens per context retrieval | 5-15x reduction |
| Causal Tracing | Depth of causal chains | Up to 5 levels |
| Learning Accuracy | Correct categorization rate | >= 80% |
| Prediction Hit Rate | Predictions used in queries | >= 60% |
| Session Deduplication | Duplicate memories avoided | >= 90% |
| Compression Levels | Levels supported | 4 (0-3) |

### Performance Requirements

| Metric | Target | Maximum |
|--------|--------|---------|
| Context retrieval latency | < 100ms | 500ms |
| Causal chain traversal | < 50ms | 200ms |
| Embedding generation | < 200ms | 1000ms |
| Prediction cache hit | < 10ms | 50ms |
| Memory creation | < 50ms | 200ms |

### Quality Requirements

| Metric | Target |
|--------|--------|
| Test coverage | >= 85% |
| Type coverage | 100% |
| Documentation coverage | 100% of public APIs |
| Linting errors | 0 critical |

---

## Part VII: Risk Mitigation

### Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| CodeBERT model size | Large download, slow inference | Lazy loading, caching, fallback to simpler models |
| Causal inference accuracy | Wrong relationships | Confidence thresholds, user validation |
| Session state persistence | Lost on crash | Periodic checkpointing |
| Embedding cache invalidation | Stale embeddings | Hash-based invalidation |

### Schedule Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Phase 4 (embeddings) complexity | Delays | Can ship without hybrid embeddings initially |
| Phase 5 (prediction) accuracy | Low value | Can disable prediction, use reactive retrieval |
| Integration complexity | Delays | Incremental integration, feature flags |

### Dependency Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| onnxruntime-node compatibility | Build failures | Pin versions, test on CI |
| Model availability | Download failures | Bundle fallback model, offline mode |
| SQLite performance | Slow queries | Indexes, query optimization, connection pooling |

---

## Part VIII: Appendix

### A. Glossary

| Term | Definition |
|------|------------|
| Causal Edge | A directed relationship between two memories indicating causation |
| Compression Level | The amount of detail included in a memory (0=minimal, 3=full) |
| Session Context | State tracking what has been sent to the AI in the current session |
| Prediction Signal | Input data used to predict what memories will be needed |
| Provenance | Tracking of what memories influenced generated code |
| Token Budget | Maximum number of tokens allowed for a retrieval operation |

### B. References

- DRIFT-CORTEX-TOKEN-EFFICIENT-MEMORY.md - Main specification
- DRIFT-CORTEX-MEMORY-SYSTEM.md - Original design
- DRIFT-CORTEX-ULTIMATE-MEMORY-ARCHITECTURE.md - Previous iteration (superseded)

### C. Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Jan 2026 | Initial implementation guide |

---

*Document Version: 1.0*
*Last Updated: January 2026*
*Status: Approved for Development*
*Verdict: 🟢 GREEN LIGHT*
