# Drift Cortex: Ultimate Memory Architecture

> **"The only AI memory system that understands code as code, not text."**
> 
> **Design Principle: Don't build the database. Build the intelligence.**

---

## Executive Summary

This document presents a revolutionary memory architecture that makes Drift the definitive codebase intelligence platform.

**Critical Design Decision:** We do NOT build custom storage infrastructure. We leverage battle-tested databases (SQLite + sqlite-vss for local, PostgreSQL + pgvector for scale) and focus engineering effort on the memory LOGIC that creates competitive moat.

### What We Build vs What We Use

| Component | Build? | Use Instead |
|-----------|--------|-------------|
| Memory types & business logic | ✅ BUILD | - |
| Retrieval algorithms | ✅ BUILD | - |
| Consolidation engine | ✅ BUILD | - |
| Validation logic | ✅ BUILD | - |
| Decay calculations | ✅ BUILD | - |
| MCP tool interfaces | ✅ BUILD | - |
| Storage layer | ❌ USE | SQLite / PostgreSQL |
| Vector index | ❌ USE | sqlite-vss / pgvector |
| Graph traversal | ❌ USE | SQL recursive CTEs |
| Bitemporal queries | ❌ USE | SQL WHERE clauses |
| AST parsing | ❌ USE | Drift's tree-sitter (already built) |
| Embeddings | ❌ USE | Transformers.js / OpenAI / Ollama |

---

## Part I: Complete Directory Structure

### Package Layout

```
packages/cortex/                           # NEW PACKAGE - Memory System
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
│
├── src/
│   ├── index.ts                          # Public exports
│   │
│   ├── types/                            # Memory type definitions
│   │   ├── index.ts                      # Type exports
│   │   ├── memory.ts                     # Base Memory interface
│   │   ├── core-memory.ts                # CoreMemory type
│   │   ├── tribal-memory.ts              # TribalMemory type
│   │   ├── procedural-memory.ts          # ProceduralMemory type
│   │   ├── semantic-memory.ts            # SemanticMemory type
│   │   ├── episodic-memory.ts            # EpisodicMemory type
│   │   ├── pattern-rationale.ts          # PatternRationaleMemory type
│   │   ├── constraint-override.ts        # ConstraintOverrideMemory type
│   │   ├── decision-context.ts           # DecisionContextMemory type
│   │   ├── code-smell.ts                 # CodeSmellMemory type
│   │   ├── bitemporal.ts                 # Bitemporal time types
│   │   └── citation.ts                   # MemoryCitation type
│   │
│   ├── storage/                          # Storage abstraction layer
│   │   ├── index.ts                      # Storage exports
│   │   ├── interface.ts                  # IMemoryStorage interface
│   │   ├── sqlite/                       # SQLite implementation
│   │   │   ├── index.ts
│   │   │   ├── client.ts                 # SQLite client wrapper
│   │   │   ├── schema.ts                 # Table definitions
│   │   │   ├── migrations.ts             # Schema migrations
│   │   │   ├── queries.ts                # Prepared statements
│   │   │   └── storage.ts                # IMemoryStorage impl
│   │   ├── postgres/                     # PostgreSQL implementation
│   │   │   ├── index.ts
│   │   │   ├── client.ts                 # Postgres client wrapper
│   │   │   ├── schema.ts                 # Table definitions
│   │   │   ├── migrations.ts             # Schema migrations
│   │   │   ├── queries.ts                # Prepared statements
│   │   │   └── storage.ts                # IMemoryStorage impl
│   │   └── factory.ts                    # Storage factory (auto-detect)
│   │
│   ├── embeddings/                       # Embedding providers
│   │   ├── index.ts                      # Embedding exports
│   │   ├── interface.ts                  # IEmbeddingProvider interface
│   │   ├── local.ts                      # Transformers.js (offline)
│   │   ├── openai.ts                     # OpenAI embeddings
│   │   ├── ollama.ts                     # Ollama embeddings
│   │   └── factory.ts                    # Provider factory
│   │
│   ├── retrieval/                        # Retrieval engine
│   │   ├── index.ts                      # Retrieval exports
│   │   ├── engine.ts                     # Main retrieval orchestrator
│   │   ├── scoring.ts                    # Relevance scoring
│   │   ├── weighting.ts                  # Intent-aware weighting
│   │   ├── budget.ts                     # Token budget management
│   │   ├── compression.ts                # Hierarchical compression
│   │   └── ranking.ts                    # Result ranking
│   │
│   ├── consolidation/                    # Sleep-inspired consolidation
│   │   ├── index.ts                      # Consolidation exports
│   │   ├── engine.ts                     # Main consolidation orchestrator
│   │   ├── replay.ts                     # Phase 1: Memory replay
│   │   ├── abstraction.ts                # Phase 2: Pattern extraction
│   │   ├── integration.ts                # Phase 3: Knowledge merge
│   │   ├── pruning.ts                    # Phase 4: Redundancy removal
│   │   ├── strengthening.ts              # Phase 5: Connection boost
│   │   └── scheduler.ts                  # Consolidation scheduling
│   │
│   ├── validation/                       # Self-healing validation
│   │   ├── index.ts                      # Validation exports
│   │   ├── engine.ts                     # Main validation orchestrator
│   │   ├── citation-validator.ts         # Citation hash checking
│   │   ├── temporal-validator.ts         # Time-based staleness
│   │   ├── contradiction-detector.ts     # Conflict detection
│   │   ├── pattern-alignment.ts          # Pattern link validation
│   │   └── healing.ts                    # Auto-healing strategies
│   │
│   ├── decay/                            # Confidence decay
│   │   ├── index.ts                      # Decay exports
│   │   ├── calculator.ts                 # Multi-factor decay calc
│   │   ├── half-lives.ts                 # Type-specific half-lives
│   │   └── boosters.ts                   # Usage/pattern boosters
│   │
│   ├── linking/                          # Auto-linking to Drift
│   │   ├── index.ts                      # Linking exports
│   │   ├── pattern-linker.ts             # Link to patterns
│   │   ├── constraint-linker.ts          # Link to constraints
│   │   ├── decision-linker.ts            # Link to decisions
│   │   ├── file-linker.ts                # Link to files
│   │   └── function-linker.ts            # Link to call graph
│   │
│   ├── learning/                         # Learning from interactions
│   │   ├── index.ts                      # Learning exports
│   │   ├── outcome-tracker.ts            # Track accept/reject
│   │   ├── correction-extractor.ts       # Extract corrections
│   │   ├── fact-extractor.ts             # Extract facts from episodes
│   │   └── preference-learner.ts         # Learn user preferences
│   │
│   ├── privacy/                          # Privacy & security
│   │   ├── index.ts                      # Privacy exports
│   │   ├── sanitizer.ts                  # PII/secret redaction
│   │   ├── patterns.ts                   # Sensitive patterns
│   │   └── validator.ts                  # Pre-store validation
│   │
│   ├── cache/                            # Caching layer
│   │   ├── index.ts                      # Cache exports
│   │   ├── l1-memory.ts                  # In-memory hot cache
│   │   ├── l2-index.ts                   # Index cache
│   │   ├── l3-shard.ts                   # Shard cache
│   │   └── preloader.ts                  # Startup preloading
│   │
│   ├── why/                              # The "Why" synthesizer
│   │   ├── index.ts                      # Why exports
│   │   ├── synthesizer.ts                # Main why orchestrator
│   │   ├── pattern-context.ts            # Pattern rationale gathering
│   │   ├── decision-context.ts           # Decision context gathering
│   │   ├── tribal-context.ts             # Tribal knowledge gathering
│   │   └── warning-aggregator.ts         # Warning synthesis
│   │
│   └── utils/                            # Utilities
│       ├── index.ts                      # Util exports
│       ├── id-generator.ts               # Memory ID generation
│       ├── hash.ts                       # Content hashing
│       ├── tokens.ts                     # Token estimation
│       └── time.ts                       # Time utilities
│
└── tests/                                # Test files
    ├── types/
    ├── storage/
    ├── retrieval/
    ├── consolidation/
    ├── validation/
    └── integration/
```

### MCP Tools Layout

```
packages/mcp/src/tools/memory/            # Memory MCP tools
├── index.ts                              # Tool exports & registration
├── status.ts                             # drift_memory_status
├── add.ts                                # drift_memory_add
├── search.ts                             # drift_memory_search
├── get.ts                                # drift_memory_get
├── update.ts                             # drift_memory_update
├── delete.ts                             # drift_memory_delete
├── validate.ts                           # drift_memory_validate
├── consolidate.ts                        # drift_memory_consolidate
├── for-context.ts                        # drift_memory_for_context
├── warnings.ts                           # drift_memory_warnings
├── learn.ts                              # drift_memory_learn
├── suggest.ts                            # drift_memory_suggest
├── why.ts                                # drift_why
├── export.ts                             # drift_memory_export
└── import.ts                             # drift_memory_import
```

### Data Storage Layout

```
.drift/
├── cortex/                               # Memory system data root
│   ├── config.json                       # Cortex configuration
│   ├── memory.db                         # SQLite database (single file)
│   ├── embeddings/                       # Embedding cache (optional)
│   │   └── model-cache/                  # Transformers.js model cache
│   └── exports/                          # Export files
│       └── *.json                        # Exported memory snapshots
│
├── lake/                                 # Existing Drift data lake
├── patterns/                             # Existing pattern storage
├── constraints/                          # Existing constraint storage
├── decisions/                            # Existing decision storage
└── views/                                # Existing view cache
```


---

## Part II: Storage Layer (SQLite + sqlite-vss)

### Why SQLite as Default

- **Ships with the app** - Zero external dependencies
- **Works offline** - Critical for local-first development
- **Single file** - Easy backup, portable, git-friendly
- **Fast enough** - Handles 100K+ memories easily
- **Battle-tested** - 20+ years of production use

### SQLite Schema

```sql
-- packages/cortex/src/storage/sqlite/schema.ts

-- Core memories table with bitemporal columns
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN (
    'core', 'tribal', 'procedural', 'semantic', 'episodic',
    'pattern_rationale', 'constraint_override', 'decision_context', 'code_smell'
  )),
  
  -- Content (JSON blob)
  content TEXT NOT NULL,
  summary TEXT NOT NULL,
  
  -- Bitemporal tracking
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),  -- When we learned
  valid_from TEXT NOT NULL DEFAULT (datetime('now')),   -- When it became true
  valid_until TEXT,                                      -- When it stopped being true
  
  -- Confidence & decay
  confidence REAL NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  importance TEXT DEFAULT 'normal' CHECK (importance IN ('low', 'normal', 'high', 'critical')),
  
  -- Access tracking
  last_accessed TEXT,
  access_count INTEGER DEFAULT 0,
  
  -- Metadata
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  created_by TEXT,
  tags TEXT,  -- JSON array
  
  -- Archival
  archived INTEGER DEFAULT 0,
  archive_reason TEXT,
  superseded_by TEXT,
  supersedes TEXT
);

-- Vector embeddings (sqlite-vss virtual table)
CREATE VIRTUAL TABLE IF NOT EXISTS memory_embeddings USING vss0(
  embedding(384)  -- 384-dim for all-MiniLM-L6-v2
);

-- Link embeddings to memories
CREATE TABLE IF NOT EXISTS memory_embedding_link (
  memory_id TEXT PRIMARY KEY,
  embedding_rowid INTEGER NOT NULL,
  FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
);

-- Memory-to-memory relationships
CREATE TABLE IF NOT EXISTS memory_relationships (
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relationship TEXT NOT NULL CHECK (relationship IN (
    'supersedes', 'supports', 'contradicts', 'related', 'derived_from'
  )),
  strength REAL DEFAULT 1.0,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (source_id, target_id, relationship),
  FOREIGN KEY (source_id) REFERENCES memories(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES memories(id) ON DELETE CASCADE
);

-- Memory-to-pattern links (from Drift's pattern system)
CREATE TABLE IF NOT EXISTS memory_patterns (
  memory_id TEXT NOT NULL,
  pattern_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (memory_id, pattern_id),
  FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
);

-- Memory-to-constraint links
CREATE TABLE IF NOT EXISTS memory_constraints (
  memory_id TEXT NOT NULL,
  constraint_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (memory_id, constraint_id),
  FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
);

-- Memory-to-file links (with citation info)
CREATE TABLE IF NOT EXISTS memory_files (
  memory_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  line_start INTEGER,
  line_end INTEGER,
  content_hash TEXT,  -- For drift detection
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (memory_id, file_path),
  FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
);

-- Memory-to-function links (from call graph)
CREATE TABLE IF NOT EXISTS memory_functions (
  memory_id TEXT NOT NULL,
  function_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (memory_id, function_id),
  FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
);

-- Consolidation history
CREATE TABLE IF NOT EXISTS consolidation_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  episodes_processed INTEGER DEFAULT 0,
  memories_created INTEGER DEFAULT 0,
  memories_updated INTEGER DEFAULT 0,
  memories_pruned INTEGER DEFAULT 0,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  error TEXT
);

-- Validation history
CREATE TABLE IF NOT EXISTS validation_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  total_validated INTEGER DEFAULT 0,
  valid_count INTEGER DEFAULT 0,
  stale_count INTEGER DEFAULT 0,
  healed_count INTEGER DEFAULT 0,
  flagged_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'running'
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_confidence ON memories(confidence);
CREATE INDEX IF NOT EXISTS idx_memories_valid ON memories(valid_from, valid_until);
CREATE INDEX IF NOT EXISTS idx_memories_archived ON memories(archived);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);
CREATE INDEX IF NOT EXISTS idx_memory_patterns_pattern ON memory_patterns(pattern_id);
CREATE INDEX IF NOT EXISTS idx_memory_files_file ON memory_files(file_path);
CREATE INDEX IF NOT EXISTS idx_memory_functions_function ON memory_functions(function_id);
```

### Storage Interface

```typescript
// packages/cortex/src/storage/interface.ts

import type { Memory, MemoryType, MemoryQuery, MemorySummary } from '../types';

export interface IMemoryStorage {
  // Lifecycle
  initialize(): Promise<void>;
  close(): Promise<void>;
  
  // CRUD Operations
  create(memory: Memory): Promise<string>;
  read(id: string): Promise<Memory | null>;
  update(id: string, updates: Partial<Memory>): Promise<void>;
  delete(id: string): Promise<void>;
  
  // Bulk Operations
  bulkCreate(memories: Memory[]): Promise<string[]>;
  bulkUpdate(updates: Array<{ id: string; updates: Partial<Memory> }>): Promise<void>;
  bulkDelete(ids: string[]): Promise<void>;
  
  // Query Operations
  findByType(type: MemoryType, options?: QueryOptions): Promise<Memory[]>;
  findByPattern(patternId: string): Promise<Memory[]>;
  findByConstraint(constraintId: string): Promise<Memory[]>;
  findByFile(filePath: string): Promise<Memory[]>;
  findByFunction(functionId: string): Promise<Memory[]>;
  search(query: MemoryQuery): Promise<Memory[]>;
  
  // Vector Operations
  similaritySearch(embedding: number[], limit: number, threshold?: number): Promise<Memory[]>;
  upsertEmbedding(memoryId: string, embedding: number[]): Promise<void>;
  
  // Bitemporal Operations
  asOf(timestamp: string): IMemoryStorage;  // Transaction time scope
  validAt(timestamp: string): IMemoryStorage;  // Valid time scope
  
  // Relationship Operations
  addRelationship(sourceId: string, targetId: string, type: RelationshipType): Promise<void>;
  removeRelationship(sourceId: string, targetId: string, type: RelationshipType): Promise<void>;
  getRelated(memoryId: string, type?: RelationshipType, depth?: number): Promise<Memory[]>;
  
  // Link Operations
  linkToPattern(memoryId: string, patternId: string): Promise<void>;
  linkToConstraint(memoryId: string, constraintId: string): Promise<void>;
  linkToFile(memoryId: string, filePath: string, citation?: Citation): Promise<void>;
  linkToFunction(memoryId: string, functionId: string): Promise<void>;
  
  // Aggregation
  count(filter?: Partial<MemoryQuery>): Promise<number>;
  countByType(): Promise<Record<MemoryType, number>>;
  getSummaries(filter?: Partial<MemoryQuery>): Promise<MemorySummary[]>;
  
  // Maintenance
  vacuum(): Promise<void>;
  checkpoint(): Promise<void>;
}

export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDir?: 'asc' | 'desc';
  minConfidence?: number;
  includeArchived?: boolean;
}

export interface Citation {
  lineStart?: number;
  lineEnd?: number;
  contentHash?: string;
}

export type RelationshipType = 'supersedes' | 'supports' | 'contradicts' | 'related' | 'derived_from';
```

### SQLite Implementation

```typescript
// packages/cortex/src/storage/sqlite/storage.ts

import Database from 'better-sqlite3';
import * as sqliteVss from 'sqlite-vss';
import type { IMemoryStorage, QueryOptions, Citation, RelationshipType } from '../interface';
import type { Memory, MemoryType, MemoryQuery, MemorySummary } from '../../types';
import { SCHEMA } from './schema';
import { generateId } from '../../utils/id-generator';

export class SQLiteMemoryStorage implements IMemoryStorage {
  private db: Database.Database;
  private scopeFilters: { recordedBefore?: string; validAt?: string } = {};
  
  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }
  
  async initialize(): Promise<void> {
    // Load sqlite-vss extension
    sqliteVss.load(this.db);
    
    // Run schema
    this.db.exec(SCHEMA);
  }
  
  async close(): Promise<void> {
    this.db.close();
  }
  
  async create(memory: Memory): Promise<string> {
    const id = memory.id || generateId();
    
    const stmt = this.db.prepare(`
      INSERT INTO memories (
        id, type, content, summary, recorded_at, valid_from, 
        confidence, importance, created_by, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id,
      memory.type,
      JSON.stringify(memory),
      memory.summary || this.generateSummary(memory),
      memory.transactionTime?.recordedAt || new Date().toISOString(),
      memory.validTime?.validFrom || new Date().toISOString(),
      memory.confidence ?? 1.0,
      memory.importance ?? 'normal',
      memory.createdBy,
      memory.tags ? JSON.stringify(memory.tags) : null
    );
    
    return id;
  }
  
  async read(id: string): Promise<Memory | null> {
    const stmt = this.db.prepare(`
      SELECT content FROM memories 
      WHERE id = ? AND archived = 0
      ${this.buildScopeClause()}
    `);
    
    const row = stmt.get(id) as { content: string } | undefined;
    return row ? JSON.parse(row.content) : null;
  }
  
  async similaritySearch(embedding: number[], limit: number, threshold = 0.7): Promise<Memory[]> {
    const stmt = this.db.prepare(`
      SELECT m.content, mel.embedding_rowid
      FROM memories m
      JOIN memory_embedding_link mel ON m.id = mel.memory_id
      WHERE m.archived = 0
      ${this.buildScopeClause()}
      AND mel.embedding_rowid IN (
        SELECT rowid FROM memory_embeddings
        WHERE vss_search(embedding, vss_search_params(?, ?))
      )
      LIMIT ?
    `);
    
    const rows = stmt.all(JSON.stringify(embedding), limit * 2, limit) as Array<{ content: string }>;
    return rows.map(r => JSON.parse(r.content));
  }
  
  asOf(timestamp: string): IMemoryStorage {
    const scoped = new SQLiteMemoryStorage(this.db.name);
    scoped.db = this.db;
    scoped.scopeFilters = { ...this.scopeFilters, recordedBefore: timestamp };
    return scoped;
  }
  
  validAt(timestamp: string): IMemoryStorage {
    const scoped = new SQLiteMemoryStorage(this.db.name);
    scoped.db = this.db;
    scoped.scopeFilters = { ...this.scopeFilters, validAt: timestamp };
    return scoped;
  }
  
  private buildScopeClause(): string {
    const clauses: string[] = [];
    
    if (this.scopeFilters.recordedBefore) {
      clauses.push(`recorded_at <= '${this.scopeFilters.recordedBefore}'`);
    }
    
    if (this.scopeFilters.validAt) {
      clauses.push(`valid_from <= '${this.scopeFilters.validAt}'`);
      clauses.push(`(valid_until IS NULL OR valid_until > '${this.scopeFilters.validAt}')`);
    }
    
    return clauses.length > 0 ? `AND ${clauses.join(' AND ')}` : '';
  }
  
  private generateSummary(memory: Memory): string {
    switch (memory.type) {
      case 'tribal':
        return `⚠️ ${memory.topic}: ${memory.knowledge?.slice(0, 50)}...`;
      case 'procedural':
        return `📋 ${memory.name}: ${memory.steps?.length || 0} steps`;
      case 'semantic':
        return `💡 ${memory.topic}: ${memory.knowledge?.slice(0, 50)}...`;
      case 'pattern_rationale':
        return `🎯 ${memory.patternName}: ${memory.rationale?.slice(0, 50)}...`;
      case 'constraint_override':
        return `✅ Override: ${memory.constraintName}`;
      case 'code_smell':
        return `🚫 Avoid: ${memory.name}`;
      default:
        return memory.summary || 'Memory';
    }
  }
  
  // ... remaining methods follow same pattern
}
```


---

## Part III: Memory Types (Complete Specification)

### Base Memory Interface

```typescript
// packages/cortex/src/types/memory.ts

export type MemoryType = 
  | 'core'
  | 'tribal'
  | 'procedural'
  | 'semantic'
  | 'episodic'
  | 'pattern_rationale'
  | 'constraint_override'
  | 'decision_context'
  | 'code_smell';

export interface BaseMemory {
  id: string;
  type: MemoryType;
  
  // Bitemporal tracking
  transactionTime: TransactionTime;
  validTime: ValidTime;
  
  // Confidence & importance
  confidence: number;  // 0.0 - 1.0
  importance: 'low' | 'normal' | 'high' | 'critical';
  
  // Access tracking
  lastAccessed?: string;
  accessCount: number;
  
  // Compression levels
  summary: string;  // ~20 tokens
  
  // Linking
  linkedPatterns?: string[];
  linkedConstraints?: string[];
  linkedFiles?: string[];
  linkedFunctions?: string[];
  
  // Metadata
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  tags?: string[];
  
  // Archival
  archived?: boolean;
  archiveReason?: string;
  supersededBy?: string;
  supersedes?: string;
}

export interface TransactionTime {
  recordedAt: string;      // When we learned this
  recordedBy?: string;     // Who/what created it
}

export interface ValidTime {
  validFrom: string;       // When this became true
  validUntil?: string;     // When this stopped being true (null = current)
}
```

### Type 1: Core Memory (Permanent)

```typescript
// packages/cortex/src/types/core-memory.ts

export interface CoreMemory extends BaseMemory {
  type: 'core';
  
  // Project identity
  project: {
    name: string;
    description?: string;
    techStack: string[];
    primaryLanguage: string;
    frameworks: string[];
    repository?: string;
  };
  
  // Team conventions
  conventions: {
    namingConventions?: Record<string, string>;
    fileStructure?: string;
    testingApproach?: string;
    codeReviewProcess?: string;
    branchingStrategy?: string;
  };
  
  // Critical constraints (always enforced)
  criticalConstraints: Array<{
    id: string;
    description: string;
    severity: 'critical';
  }>;
  
  // User preferences
  preferences: {
    verbosity: 'minimal' | 'normal' | 'detailed';
    codeStyle?: Record<string, unknown>;
    focusAreas?: string[];
    avoidTopics?: string[];
  };
}
```

### Type 2: Tribal Memory (Institutional Knowledge)

```typescript
// packages/cortex/src/types/tribal-memory.ts

export interface TribalMemory extends BaseMemory {
  type: 'tribal';
  
  // Topic classification
  topic: string;
  subtopic?: string;
  
  // The knowledge
  knowledge: string;
  context?: string;
  warnings?: string[];
  consequences?: string[];
  
  // Severity
  severity: 'info' | 'warning' | 'critical';
  
  // Provenance
  source: {
    type: 'manual' | 'pr_comment' | 'code_review' | 'incident' | 'documentation' | 'inferred';
    reference?: string;
  };
  
  // Validation
  contributors?: string[];
  lastValidated?: string;
  
  // Auto-linked (from Drift analysis)
  linkedTables?: string[];
  linkedEnvVars?: string[];
}
```

### Type 3: Procedural Memory (How-To)

```typescript
// packages/cortex/src/types/procedural-memory.ts

export interface ProceduralMemory extends BaseMemory {
  type: 'procedural';
  
  // The procedure
  name: string;
  description: string;
  
  // Trigger phrases (for intent matching)
  triggers: string[];
  
  // Steps
  steps: Array<{
    order: number;
    action: string;
    details?: string;
    files?: string[];
    patterns?: string[];
    constraints?: string[];
    example?: string;
  }>;
  
  // Checklist
  checklist?: Array<{
    item: string;
    required: boolean;
    autoCheck?: string;
  }>;
  
  // Learning
  usageCount: number;
  lastUsed?: string;
  successRate?: number;
  
  // Refinement
  corrections?: Array<{
    timestamp: string;
    original: string;
    corrected: string;
    reason?: string;
  }>;
}
```

### Type 4: Semantic Memory (Consolidated Knowledge)

```typescript
// packages/cortex/src/types/semantic-memory.ts

export interface SemanticMemory extends BaseMemory {
  type: 'semantic';
  
  // The knowledge
  topic: string;
  knowledge: string;
  
  // Consolidation source
  consolidatedFrom?: {
    episodicMemoryIds: string[];
    consolidationDate: string;
    consolidationMethod: 'automatic' | 'manual';
  };
  
  // Evidence tracking
  supportingEvidence: number;
  contradictingEvidence: number;
  
  // Last reinforcement
  lastReinforced?: string;
}
```

### Type 5: Episodic Memory (Interactions)

```typescript
// packages/cortex/src/types/episodic-memory.ts

export interface EpisodicMemory extends BaseMemory {
  type: 'episodic';
  
  // The episode
  interaction: {
    userQuery: string;
    agentResponse: string;
    outcome: 'accepted' | 'rejected' | 'modified' | 'unknown';
  };
  
  // Context at time
  context: {
    activeFile?: string;
    activeFunction?: string;
    intent?: string;
    focus?: string;
  };
  
  // Extracted facts
  extractedFacts?: Array<{
    fact: string;
    confidence: number;
    type: 'preference' | 'knowledge' | 'correction' | 'warning';
  }>;
  
  // Consolidation status
  consolidationStatus: 'pending' | 'consolidated' | 'pruned';
  consolidatedInto?: string[];
  
  // Session
  sessionId: string;
}
```

### Type 6: Pattern Rationale Memory

```typescript
// packages/cortex/src/types/pattern-rationale.ts

export interface PatternRationaleMemory extends BaseMemory {
  type: 'pattern_rationale';
  
  // Links to Drift's pattern system
  patternId: string;
  patternName: string;
  patternCategory: string;
  
  // User-provided context
  rationale: string;
  businessContext?: string;
  technicalContext?: string;
  alternativesRejected?: string[];
  tradeoffs?: string[];
  
  // Historical context
  introducedBy?: string;
  introducedWhen?: string;
  relatedDecisionId?: string;
  
  // Citations
  citations?: MemoryCitation[];
}
```

### Type 7: Constraint Override Memory

```typescript
// packages/cortex/src/types/constraint-override.ts

export interface ConstraintOverrideMemory extends BaseMemory {
  type: 'constraint_override';
  
  // Links to constraint system
  constraintId: string;
  constraintName: string;
  
  // Override scope
  scope: {
    type: 'file' | 'directory' | 'function' | 'pattern' | 'global';
    target: string;
  };
  
  // Override details
  reason: string;
  approvedBy?: string;
  approvalDate?: string;
  
  // Temporal bounds
  permanent: boolean;
  expiresAt?: string;
  reviewAt?: string;
  
  // Usage tracking
  usageCount: number;
  lastUsed?: string;
}
```

### Type 8: Decision Context Memory

```typescript
// packages/cortex/src/types/decision-context.ts

export interface DecisionContextMemory extends BaseMemory {
  type: 'decision_context';
  
  // Links to mined decision
  decisionId: string;
  decisionSummary: string;
  
  // Human-provided enrichment
  businessContext?: string;
  technicalContext?: string;
  stakeholders?: string[];
  constraints?: string[];
  
  // Revisit triggers
  revisitWhen?: string[];
  
  // Review status
  stillValid: boolean;
  lastReviewed?: string;
  reviewNotes?: string;
}
```

### Type 9: Code Smell Memory

```typescript
// packages/cortex/src/types/code-smell.ts

export interface CodeSmellMemory extends BaseMemory {
  type: 'code_smell';
  
  // The smell
  name: string;
  pattern?: string;  // Regex or description
  description: string;
  severity: 'error' | 'warning' | 'info';
  
  // Why it's bad
  reason: string;
  consequences?: string[];
  
  // The fix
  suggestion: string;
  exampleBad?: string;
  exampleGood?: string;
  
  // History
  occurrences?: Array<{
    file: string;
    line: number;
    timestamp: string;
    resolved: boolean;
    resolvedBy?: string;
  }>;
  
  // Auto-detection
  autoDetect: boolean;
  detectionRule?: string;
}
```

### Memory Citation Type

```typescript
// packages/cortex/src/types/citation.ts

export interface MemoryCitation {
  file: string;
  lineStart: number;
  lineEnd: number;
  snippet?: string;  // Sanitized
  hash: string;      // For drift detection
  validatedAt?: string;
  valid?: boolean;
}
```


---

## Part IV: Embedding Providers

### Embedding Interface

```typescript
// packages/cortex/src/embeddings/interface.ts

export interface IEmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  readonly maxTokens: number;
  
  initialize(): Promise<void>;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  isAvailable(): Promise<boolean>;
}
```

### Local Provider (Transformers.js) - DEFAULT

```typescript
// packages/cortex/src/embeddings/local.ts

import { pipeline, type FeatureExtractionPipeline } from '@xenova/transformers';
import type { IEmbeddingProvider } from './interface';

export class LocalEmbeddingProvider implements IEmbeddingProvider {
  readonly name = 'local';
  readonly dimensions = 384;
  readonly maxTokens = 512;
  
  private extractor: FeatureExtractionPipeline | null = null;
  private modelId = 'Xenova/all-MiniLM-L6-v2';
  
  async initialize(): Promise<void> {
    this.extractor = await pipeline('feature-extraction', this.modelId, {
      quantized: true,  // Smaller, faster
    });
  }
  
  async embed(text: string): Promise<number[]> {
    if (!this.extractor) throw new Error('Provider not initialized');
    
    const output = await this.extractor(text, {
      pooling: 'mean',
      normalize: true,
    });
    
    return Array.from(output.data as Float32Array);
  }
  
  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(t => this.embed(t)));
  }
  
  async isAvailable(): Promise<boolean> {
    return true;  // Always available (ships with package)
  }
}
```

### OpenAI Provider

```typescript
// packages/cortex/src/embeddings/openai.ts

import type { IEmbeddingProvider } from './interface';

export class OpenAIEmbeddingProvider implements IEmbeddingProvider {
  readonly name = 'openai';
  readonly dimensions = 1536;  // text-embedding-3-small
  readonly maxTokens = 8191;
  
  private apiKey: string;
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  
  async initialize(): Promise<void> {
    // Validate API key
    await this.isAvailable();
  }
  
  async embed(text: string): Promise<number[]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.data[0].embedding;
  }
  
  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: texts,
      }),
    });
    
    const data = await response.json();
    return data.data.map((d: { embedding: number[] }) => d.embedding);
  }
  
  async isAvailable(): Promise<boolean> {
    try {
      await this.embed('test');
      return true;
    } catch {
      return false;
    }
  }
}
```

### Ollama Provider

```typescript
// packages/cortex/src/embeddings/ollama.ts

import type { IEmbeddingProvider } from './interface';

export class OllamaEmbeddingProvider implements IEmbeddingProvider {
  readonly name = 'ollama';
  readonly dimensions = 768;  // nomic-embed-text
  readonly maxTokens = 8192;
  
  private baseUrl: string;
  private model: string;
  
  constructor(baseUrl = 'http://localhost:11434', model = 'nomic-embed-text') {
    this.baseUrl = baseUrl;
    this.model = model;
  }
  
  async initialize(): Promise<void> {
    const available = await this.isAvailable();
    if (!available) {
      throw new Error('Ollama not available. Is it running?');
    }
  }
  
  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt: text,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Ollama error: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.embedding;
  }
  
  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(t => this.embed(t)));
  }
  
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }
}
```

### Embedding Factory

```typescript
// packages/cortex/src/embeddings/factory.ts

import type { IEmbeddingProvider } from './interface';
import { LocalEmbeddingProvider } from './local';
import { OpenAIEmbeddingProvider } from './openai';
import { OllamaEmbeddingProvider } from './ollama';

export type EmbeddingProviderType = 'local' | 'openai' | 'ollama';

export interface EmbeddingConfig {
  provider: EmbeddingProviderType;
  openaiApiKey?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
}

export async function createEmbeddingProvider(
  config: EmbeddingConfig
): Promise<IEmbeddingProvider> {
  let provider: IEmbeddingProvider;
  
  switch (config.provider) {
    case 'openai':
      if (!config.openaiApiKey) {
        throw new Error('OpenAI API key required');
      }
      provider = new OpenAIEmbeddingProvider(config.openaiApiKey);
      break;
      
    case 'ollama':
      provider = new OllamaEmbeddingProvider(
        config.ollamaBaseUrl,
        config.ollamaModel
      );
      break;
      
    case 'local':
    default:
      provider = new LocalEmbeddingProvider();
      break;
  }
  
  await provider.initialize();
  return provider;
}

export async function autoDetectProvider(): Promise<IEmbeddingProvider> {
  // Try providers in order of preference
  
  // 1. Check for OpenAI API key in env
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const provider = new OpenAIEmbeddingProvider(openaiKey);
      if (await provider.isAvailable()) {
        await provider.initialize();
        return provider;
      }
    } catch { /* continue */ }
  }
  
  // 2. Check for Ollama
  try {
    const provider = new OllamaEmbeddingProvider();
    if (await provider.isAvailable()) {
      await provider.initialize();
      return provider;
    }
  } catch { /* continue */ }
  
  // 3. Fall back to local
  const provider = new LocalEmbeddingProvider();
  await provider.initialize();
  return provider;
}
```

---

## Part V: Retrieval Engine

### Retrieval Interface

```typescript
// packages/cortex/src/retrieval/engine.ts

import type { Memory, MemoryType } from '../types';
import type { IMemoryStorage } from '../storage/interface';
import type { IEmbeddingProvider } from '../embeddings/interface';
import { RelevanceScorer } from './scoring';
import { IntentWeighter } from './weighting';
import { TokenBudgetManager } from './budget';
import { HierarchicalCompressor } from './compression';
import { ResultRanker } from './ranking';

export type Intent = 
  | 'add_feature'
  | 'fix_bug'
  | 'refactor'
  | 'security_audit'
  | 'understand_code'
  | 'add_test';

export interface RetrievalContext {
  intent: Intent;
  focus: string;
  activeFile?: string;
  activeFunction?: string;
  recentFiles?: string[];
  relevantPatterns?: string[];
  relevantConstraints?: string[];
  callGraphContext?: string[];
  securityContext?: string[];
  maxTokens?: number;
  maxMemories?: number;
}

export interface RetrievalResult {
  memories: CompressedMemory[];
  tokensUsed: number;
  totalCandidates: number;
  retrievalTime: number;
}

export interface CompressedMemory {
  memory: Memory;
  level: 'summary' | 'expanded' | 'full';
  tokens: number;
  relevanceScore: number;
}

export class RetrievalEngine {
  private storage: IMemoryStorage;
  private embeddings: IEmbeddingProvider;
  private scorer: RelevanceScorer;
  private weighter: IntentWeighter;
  private budgetManager: TokenBudgetManager;
  private compressor: HierarchicalCompressor;
  private ranker: ResultRanker;
  
  constructor(
    storage: IMemoryStorage,
    embeddings: IEmbeddingProvider
  ) {
    this.storage = storage;
    this.embeddings = embeddings;
    this.scorer = new RelevanceScorer();
    this.weighter = new IntentWeighter();
    this.budgetManager = new TokenBudgetManager();
    this.compressor = new HierarchicalCompressor();
    this.ranker = new ResultRanker();
  }
  
  async retrieve(context: RetrievalContext): Promise<RetrievalResult> {
    const startTime = Date.now();
    
    // 1. Gather candidates from multiple sources
    const candidates = await this.gatherCandidates(context);
    
    // 2. Score each candidate
    const scored = candidates.map(memory => ({
      memory,
      score: this.scorer.score(memory, context),
    }));
    
    // 3. Apply intent weighting
    const weighted = scored.map(({ memory, score }) => ({
      memory,
      score: score * this.weighter.getWeight(memory.type, context.intent),
    }));
    
    // 4. Rank results
    const ranked = this.ranker.rank(weighted);
    
    // 5. Apply token budget
    const budget = context.maxTokens || 2000;
    const compressed = this.budgetManager.fitToBudget(ranked, budget);
    
    return {
      memories: compressed,
      tokensUsed: compressed.reduce((sum, m) => sum + m.tokens, 0),
      totalCandidates: candidates.length,
      retrievalTime: Date.now() - startTime,
    };
  }
  
  private async gatherCandidates(context: RetrievalContext): Promise<Memory[]> {
    const candidateSets = await Promise.all([
      // Pattern-linked memories
      this.getPatternMemories(context.relevantPatterns || []),
      
      // Constraint-linked memories
      this.getConstraintMemories(context.relevantConstraints || []),
      
      // Topic-based (semantic search)
      this.searchByTopic(context.focus),
      
      // File-based
      this.getFileMemories(context.recentFiles || []),
      
      // Function-based (call graph)
      this.getFunctionMemories(context.callGraphContext || []),
      
      // Security-relevant
      context.securityContext?.length
        ? this.getSecurityMemories(context.securityContext)
        : Promise.resolve([]),
    ]);
    
    // Flatten and deduplicate
    const all = candidateSets.flat();
    const seen = new Set<string>();
    return all.filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }
  
  private async searchByTopic(topic: string): Promise<Memory[]> {
    const embedding = await this.embeddings.embed(topic);
    return this.storage.similaritySearch(embedding, 20);
  }
  
  private async getPatternMemories(patternIds: string[]): Promise<Memory[]> {
    const results = await Promise.all(
      patternIds.map(id => this.storage.findByPattern(id))
    );
    return results.flat();
  }
  
  private async getConstraintMemories(constraintIds: string[]): Promise<Memory[]> {
    const results = await Promise.all(
      constraintIds.map(id => this.storage.findByConstraint(id))
    );
    return results.flat();
  }
  
  private async getFileMemories(files: string[]): Promise<Memory[]> {
    const results = await Promise.all(
      files.map(f => this.storage.findByFile(f))
    );
    return results.flat();
  }
  
  private async getFunctionMemories(functionIds: string[]): Promise<Memory[]> {
    const results = await Promise.all(
      functionIds.map(id => this.storage.findByFunction(id))
    );
    return results.flat();
  }
  
  private async getSecurityMemories(context: string[]): Promise<Memory[]> {
    // Get tribal memories with security-related topics
    const tribal = await this.storage.search({
      types: ['tribal'],
      topics: ['security', 'auth', 'permission', ...context],
    });
    return tribal;
  }
}
```

### Intent Weighting

```typescript
// packages/cortex/src/retrieval/weighting.ts

import type { MemoryType } from '../types';
import type { Intent } from './engine';

export class IntentWeighter {
  private weights: Record<Intent, Record<MemoryType, number>> = {
    add_feature: {
      core: 1.0,
      tribal: 1.0,
      procedural: 1.5,      // How to do things
      semantic: 1.2,        // What patterns exist
      episodic: 0.5,
      pattern_rationale: 1.3,
      constraint_override: 1.0,
      decision_context: 0.8,
      code_smell: 1.2,
    },
    fix_bug: {
      core: 1.0,
      tribal: 1.5,          // Known issues
      procedural: 0.8,
      semantic: 1.2,
      episodic: 1.0,        // Recent context
      pattern_rationale: 1.0,
      constraint_override: 0.8,
      decision_context: 1.0,
      code_smell: 1.5,      // Past mistakes
    },
    refactor: {
      core: 1.0,
      tribal: 1.2,
      procedural: 1.0,
      semantic: 1.3,
      episodic: 0.5,
      pattern_rationale: 1.5,  // Why patterns exist
      constraint_override: 1.2,
      decision_context: 1.5,   // Why decisions were made
      code_smell: 1.3,
    },
    security_audit: {
      core: 1.0,
      tribal: 2.0,          // Security gotchas critical
      procedural: 1.0,
      semantic: 1.5,
      episodic: 0.3,
      pattern_rationale: 1.2,
      constraint_override: 1.5,  // Security overrides
      decision_context: 1.0,
      code_smell: 1.8,
    },
    understand_code: {
      core: 1.0,
      tribal: 1.2,
      procedural: 0.8,
      semantic: 1.5,        // Consolidated knowledge
      episodic: 0.5,
      pattern_rationale: 1.5,
      constraint_override: 0.8,
      decision_context: 1.5,
      code_smell: 1.0,
    },
    add_test: {
      core: 1.0,
      tribal: 1.2,
      procedural: 1.5,      // How to write tests
      semantic: 1.0,
      episodic: 0.5,
      pattern_rationale: 1.0,
      constraint_override: 0.8,
      decision_context: 0.8,
      code_smell: 1.3,
    },
  };
  
  getWeight(memoryType: MemoryType, intent: Intent): number {
    return this.weights[intent]?.[memoryType] ?? 1.0;
  }
}
```

### Token Budget Manager

```typescript
// packages/cortex/src/retrieval/budget.ts

import type { Memory } from '../types';
import type { CompressedMemory } from './engine';
import { HierarchicalCompressor } from './compression';

export class TokenBudgetManager {
  private compressor = new HierarchicalCompressor();
  
  fitToBudget(
    ranked: Array<{ memory: Memory; score: number }>,
    budget: number
  ): CompressedMemory[] {
    const result: CompressedMemory[] = [];
    let usedTokens = 0;
    
    for (const { memory, score } of ranked) {
      const compressed = this.compressor.compress(memory);
      
      // Try summary first
      if (usedTokens + compressed.summaryTokens <= budget) {
        result.push({
          memory,
          level: 'summary',
          tokens: compressed.summaryTokens,
          relevanceScore: score,
        });
        usedTokens += compressed.summaryTokens;
        continue;
      }
      
      // Budget exhausted
      break;
    }
    
    // Expand top memories if budget allows
    const leftover = budget - usedTokens;
    if (leftover > 100 && result.length > 0) {
      // Expand the most relevant memories
      for (let i = 0; i < Math.min(3, result.length); i++) {
        const item = result[i];
        const compressed = this.compressor.compress(item.memory);
        const expandCost = compressed.expandedTokens - item.tokens;
        
        if (expandCost <= leftover) {
          result[i] = {
            ...item,
            level: 'expanded',
            tokens: compressed.expandedTokens,
          };
          usedTokens += expandCost;
        }
      }
    }
    
    return result;
  }
}
```


---

## Part VI: Consolidation Engine (Sleep-Inspired)

### Consolidation Overview

Inspired by neuroscience research on how the brain consolidates memories during sleep. Runs periodically to compress episodic memories into semantic knowledge.

```typescript
// packages/cortex/src/consolidation/engine.ts

import type { IMemoryStorage } from '../storage/interface';
import type { EpisodicMemory, SemanticMemory } from '../types';
import { ReplayPhase } from './replay';
import { AbstractionPhase } from './abstraction';
import { IntegrationPhase } from './integration';
import { PruningPhase } from './pruning';
import { StrengtheningPhase } from './strengthening';

export interface ConsolidationResult {
  episodesProcessed: number;
  memoriesCreated: number;
  memoriesUpdated: number;
  memoriesPruned: number;
  tokensFreed: number;
  duration: number;
}

export interface ConsolidationConfig {
  minEpisodes: number;           // Min episodes before consolidation
  maxEpisodeAge: number;         // Days before episode is eligible
  consolidationThreshold: number; // Min similar episodes to consolidate
  pruneAfterConsolidation: boolean;
}

const DEFAULT_CONFIG: ConsolidationConfig = {
  minEpisodes: 5,
  maxEpisodeAge: 7,
  consolidationThreshold: 3,
  pruneAfterConsolidation: true,
};

export class ConsolidationEngine {
  private storage: IMemoryStorage;
  private config: ConsolidationConfig;
  
  private replayPhase: ReplayPhase;
  private abstractionPhase: AbstractionPhase;
  private integrationPhase: IntegrationPhase;
  private pruningPhase: PruningPhase;
  private strengtheningPhase: StrengtheningPhase;
  
  constructor(storage: IMemoryStorage, config?: Partial<ConsolidationConfig>) {
    this.storage = storage;
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    this.replayPhase = new ReplayPhase(storage);
    this.abstractionPhase = new AbstractionPhase();
    this.integrationPhase = new IntegrationPhase(storage);
    this.pruningPhase = new PruningPhase(storage);
    this.strengtheningPhase = new StrengtheningPhase(storage);
  }
  
  async consolidate(dryRun = false): Promise<ConsolidationResult> {
    const startTime = Date.now();
    
    // PHASE 1: REPLAY - Select episodic memories for consolidation
    const episodes = await this.replayPhase.selectMemories({
      minAge: this.config.maxEpisodeAge,
      status: 'pending',
      limit: 100,
    });
    
    if (episodes.length < this.config.minEpisodes) {
      return {
        episodesProcessed: 0,
        memoriesCreated: 0,
        memoriesUpdated: 0,
        memoriesPruned: 0,
        tokensFreed: 0,
        duration: Date.now() - startTime,
      };
    }
    
    // PHASE 2: ABSTRACTION - Extract patterns from episodes
    const abstractions = await this.abstractionPhase.extract(episodes);
    
    // PHASE 3: INTEGRATION - Merge with existing semantic memory
    const { created, updated } = dryRun
      ? { created: abstractions.length, updated: 0 }
      : await this.integrationPhase.merge(abstractions);
    
    // PHASE 4: PRUNING - Remove redundant episodes
    let pruned = 0;
    let tokensFreed = 0;
    if (this.config.pruneAfterConsolidation && !dryRun) {
      const pruneResult = await this.pruningPhase.prune(episodes, abstractions);
      pruned = pruneResult.pruned;
      tokensFreed = pruneResult.tokensFreed;
    }
    
    // PHASE 5: STRENGTHENING - Boost frequently accessed memories
    if (!dryRun) {
      await this.strengtheningPhase.boost();
    }
    
    return {
      episodesProcessed: episodes.length,
      memoriesCreated: created,
      memoriesUpdated: updated,
      memoriesPruned: pruned,
      tokensFreed,
      duration: Date.now() - startTime,
    };
  }
}
```

### Phase 1: Replay

```typescript
// packages/cortex/src/consolidation/replay.ts

import type { IMemoryStorage } from '../storage/interface';
import type { EpisodicMemory } from '../types';

export interface ReplayCriteria {
  minAge: number;           // Days
  status: 'pending' | 'all';
  limit: number;
}

export class ReplayPhase {
  constructor(private storage: IMemoryStorage) {}
  
  async selectMemories(criteria: ReplayCriteria): Promise<EpisodicMemory[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - criteria.minAge);
    
    const episodes = await this.storage.search({
      types: ['episodic'],
      maxDate: cutoffDate.toISOString(),
      consolidationStatus: criteria.status === 'pending' ? 'pending' : undefined,
      limit: criteria.limit,
      orderBy: 'accessCount',
      orderDir: 'desc',
    });
    
    return episodes as EpisodicMemory[];
  }
}
```

### Phase 2: Abstraction

```typescript
// packages/cortex/src/consolidation/abstraction.ts

import type { EpisodicMemory, SemanticMemory } from '../types';
import { generateId } from '../utils/id-generator';

export interface AbstractedKnowledge {
  topic: string;
  knowledge: string;
  sourceEpisodes: string[];
  confidence: number;
  supportingEvidence: number;
}

export class AbstractionPhase {
  async extract(episodes: EpisodicMemory[]): Promise<AbstractedKnowledge[]> {
    // Group episodes by topic/focus
    const grouped = this.groupByTopic(episodes);
    
    const abstractions: AbstractedKnowledge[] = [];
    
    for (const [topic, topicEpisodes] of Object.entries(grouped)) {
      if (topicEpisodes.length < 2) continue;
      
      // Extract common facts
      const facts = this.extractCommonFacts(topicEpisodes);
      
      for (const fact of facts) {
        abstractions.push({
          topic,
          knowledge: fact.fact,
          sourceEpisodes: topicEpisodes.map(e => e.id),
          confidence: fact.confidence,
          supportingEvidence: fact.count,
        });
      }
    }
    
    return abstractions;
  }
  
  private groupByTopic(episodes: EpisodicMemory[]): Record<string, EpisodicMemory[]> {
    const groups: Record<string, EpisodicMemory[]> = {};
    
    for (const episode of episodes) {
      const topic = episode.context.focus || 'general';
      if (!groups[topic]) groups[topic] = [];
      groups[topic].push(episode);
    }
    
    return groups;
  }
  
  private extractCommonFacts(episodes: EpisodicMemory[]): Array<{
    fact: string;
    confidence: number;
    count: number;
  }> {
    // Collect all extracted facts
    const factCounts = new Map<string, { confidence: number; count: number }>();
    
    for (const episode of episodes) {
      for (const extracted of episode.extractedFacts || []) {
        const key = extracted.fact.toLowerCase().trim();
        const existing = factCounts.get(key);
        
        if (existing) {
          existing.count++;
          existing.confidence = Math.max(existing.confidence, extracted.confidence);
        } else {
          factCounts.set(key, {
            confidence: extracted.confidence,
            count: 1,
          });
        }
      }
    }
    
    // Return facts that appear multiple times
    return Array.from(factCounts.entries())
      .filter(([_, data]) => data.count >= 2)
      .map(([fact, data]) => ({
        fact,
        confidence: data.confidence,
        count: data.count,
      }));
  }
}
```

### Phase 3: Integration

```typescript
// packages/cortex/src/consolidation/integration.ts

import type { IMemoryStorage } from '../storage/interface';
import type { SemanticMemory } from '../types';
import type { AbstractedKnowledge } from './abstraction';
import { generateId } from '../utils/id-generator';

export class IntegrationPhase {
  constructor(private storage: IMemoryStorage) {}
  
  async merge(abstractions: AbstractedKnowledge[]): Promise<{
    created: number;
    updated: number;
  }> {
    let created = 0;
    let updated = 0;
    
    for (const abstraction of abstractions) {
      // Check for existing semantic memory on same topic
      const existing = await this.findExisting(abstraction.topic, abstraction.knowledge);
      
      if (existing) {
        // Update existing memory
        await this.storage.update(existing.id, {
          confidence: Math.max(existing.confidence, abstraction.confidence),
          supportingEvidence: existing.supportingEvidence + abstraction.supportingEvidence,
          lastReinforced: new Date().toISOString(),
          consolidatedFrom: {
            ...existing.consolidatedFrom,
            episodicMemoryIds: [
              ...(existing.consolidatedFrom?.episodicMemoryIds || []),
              ...abstraction.sourceEpisodes,
            ],
          },
        });
        updated++;
      } else {
        // Create new semantic memory
        const memory: SemanticMemory = {
          id: generateId(),
          type: 'semantic',
          topic: abstraction.topic,
          knowledge: abstraction.knowledge,
          summary: `💡 ${abstraction.topic}: ${abstraction.knowledge.slice(0, 50)}...`,
          confidence: abstraction.confidence,
          importance: 'normal',
          accessCount: 0,
          supportingEvidence: abstraction.supportingEvidence,
          contradictingEvidence: 0,
          consolidatedFrom: {
            episodicMemoryIds: abstraction.sourceEpisodes,
            consolidationDate: new Date().toISOString(),
            consolidationMethod: 'automatic',
          },
          transactionTime: {
            recordedAt: new Date().toISOString(),
            recordedBy: 'consolidation',
          },
          validTime: {
            validFrom: new Date().toISOString(),
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        
        await this.storage.create(memory);
        created++;
      }
    }
    
    return { created, updated };
  }
  
  private async findExisting(topic: string, knowledge: string): Promise<SemanticMemory | null> {
    const candidates = await this.storage.search({
      types: ['semantic'],
      topics: [topic],
      limit: 10,
    });
    
    // Find one with similar knowledge
    for (const candidate of candidates as SemanticMemory[]) {
      if (this.isSimilar(candidate.knowledge, knowledge)) {
        return candidate;
      }
    }
    
    return null;
  }
  
  private isSimilar(a: string, b: string): boolean {
    // Simple similarity check (could use embeddings for better accuracy)
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);
    
    return intersection.size / union.size > 0.5;
  }
}
```

### Phase 4: Pruning

```typescript
// packages/cortex/src/consolidation/pruning.ts

import type { IMemoryStorage } from '../storage/interface';
import type { EpisodicMemory } from '../types';
import type { AbstractedKnowledge } from './abstraction';

export class PruningPhase {
  constructor(private storage: IMemoryStorage) {}
  
  async prune(
    episodes: EpisodicMemory[],
    abstractions: AbstractedKnowledge[]
  ): Promise<{ pruned: number; tokensFreed: number }> {
    // Find episodes that were fully consolidated
    const consolidatedIds = new Set(
      abstractions.flatMap(a => a.sourceEpisodes)
    );
    
    let pruned = 0;
    let tokensFreed = 0;
    
    for (const episode of episodes) {
      if (consolidatedIds.has(episode.id)) {
        // Mark as pruned (don't delete, just update status)
        await this.storage.update(episode.id, {
          consolidationStatus: 'pruned',
          archived: true,
          archiveReason: 'consolidated',
        });
        
        pruned++;
        tokensFreed += this.estimateTokens(episode);
      }
    }
    
    return { pruned, tokensFreed };
  }
  
  private estimateTokens(episode: EpisodicMemory): number {
    const content = JSON.stringify(episode);
    return Math.ceil(content.length / 4);  // Rough estimate
  }
}
```

### Phase 5: Strengthening

```typescript
// packages/cortex/src/consolidation/strengthening.ts

import type { IMemoryStorage } from '../storage/interface';

export class StrengtheningPhase {
  constructor(private storage: IMemoryStorage) {}
  
  async boost(): Promise<void> {
    // Find frequently accessed memories
    const frequentlyAccessed = await this.storage.search({
      minAccessCount: 5,
      orderBy: 'accessCount',
      orderDir: 'desc',
      limit: 50,
    });
    
    // Boost their confidence slightly
    for (const memory of frequentlyAccessed) {
      const boost = Math.min(0.1, memory.accessCount * 0.01);
      const newConfidence = Math.min(1.0, memory.confidence + boost);
      
      if (newConfidence > memory.confidence) {
        await this.storage.update(memory.id, {
          confidence: newConfidence,
        });
      }
    }
  }
}
```

### Consolidation Scheduler

```typescript
// packages/cortex/src/consolidation/scheduler.ts

import type { ConsolidationEngine, ConsolidationResult } from './engine';

export interface SchedulerConfig {
  enabled: boolean;
  intervalHours: number;
  maxMemoryCount: number;  // Trigger if exceeded
}

const DEFAULT_CONFIG: SchedulerConfig = {
  enabled: true,
  intervalHours: 24,
  maxMemoryCount: 1000,
};

export class ConsolidationScheduler {
  private engine: ConsolidationEngine;
  private config: SchedulerConfig;
  private timer: NodeJS.Timeout | null = null;
  private lastRun: Date | null = null;
  
  constructor(engine: ConsolidationEngine, config?: Partial<SchedulerConfig>) {
    this.engine = engine;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  start(): void {
    if (!this.config.enabled) return;
    
    const intervalMs = this.config.intervalHours * 60 * 60 * 1000;
    
    this.timer = setInterval(async () => {
      await this.runIfNeeded();
    }, intervalMs);
    
    // Also run on startup if needed
    this.runIfNeeded();
  }
  
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
  
  async runIfNeeded(): Promise<ConsolidationResult | null> {
    // Check if enough time has passed
    if (this.lastRun) {
      const hoursSinceLastRun = 
        (Date.now() - this.lastRun.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceLastRun < this.config.intervalHours) {
        return null;
      }
    }
    
    this.lastRun = new Date();
    return this.engine.consolidate();
  }
  
  async forceRun(): Promise<ConsolidationResult> {
    this.lastRun = new Date();
    return this.engine.consolidate();
  }
}
```


---

## Part VII: Validation Engine (Self-Healing)

### Validation Overview

Memories about code must stay synchronized with actual code. The validation engine runs continuously to detect and heal drift.

```typescript
// packages/cortex/src/validation/engine.ts

import type { IMemoryStorage } from '../storage/interface';
import type { Memory } from '../types';
import { CitationValidator } from './citation-validator';
import { TemporalValidator } from './temporal-validator';
import { ContradictionDetector } from './contradiction-detector';
import { PatternAlignmentValidator } from './pattern-alignment';
import { HealingEngine } from './healing';

export interface ValidationResult {
  total: number;
  valid: number;
  stale: number;
  healed: number;
  flaggedForReview: number;
  details: ValidationDetail[];
  duration: number;
}

export interface ValidationDetail {
  memoryId: string;
  memoryType: string;
  status: 'valid' | 'stale' | 'healed' | 'flagged';
  issues: ValidationIssue[];
  newConfidence?: number;
}

export interface ValidationIssue {
  dimension: 'citation' | 'temporal' | 'contradiction' | 'pattern';
  severity: 'minor' | 'moderate' | 'severe';
  description: string;
  suggestion?: string;
}

export class ValidationEngine {
  private storage: IMemoryStorage;
  private citationValidator: CitationValidator;
  private temporalValidator: TemporalValidator;
  private contradictionDetector: ContradictionDetector;
  private patternValidator: PatternAlignmentValidator;
  private healingEngine: HealingEngine;
  
  constructor(storage: IMemoryStorage) {
    this.storage = storage;
    this.citationValidator = new CitationValidator();
    this.temporalValidator = new TemporalValidator();
    this.contradictionDetector = new ContradictionDetector(storage);
    this.patternValidator = new PatternAlignmentValidator();
    this.healingEngine = new HealingEngine(storage);
  }
  
  async validate(options: {
    scope: 'all' | 'stale' | 'recent';
    autoHeal: boolean;
  }): Promise<ValidationResult> {
    const startTime = Date.now();
    
    // Get memories to validate
    const memories = await this.getMemoriesToValidate(options.scope);
    
    const details: ValidationDetail[] = [];
    let valid = 0;
    let stale = 0;
    let healed = 0;
    let flagged = 0;
    
    for (const memory of memories) {
      const issues = await this.validateMemory(memory);
      
      if (issues.length === 0) {
        valid++;
        details.push({
          memoryId: memory.id,
          memoryType: memory.type,
          status: 'valid',
          issues: [],
        });
        continue;
      }
      
      // Determine severity
      const maxSeverity = this.getMaxSeverity(issues);
      
      // Try to heal if enabled
      if (options.autoHeal && maxSeverity === 'minor') {
        const healResult = await this.healingEngine.heal(memory, issues);
        if (healResult.success) {
          healed++;
          details.push({
            memoryId: memory.id,
            memoryType: memory.type,
            status: 'healed',
            issues,
            newConfidence: healResult.newConfidence,
          });
          continue;
        }
      }
      
      // Flag for review if severe
      if (maxSeverity === 'severe') {
        flagged++;
        await this.flagForReview(memory, issues);
        details.push({
          memoryId: memory.id,
          memoryType: memory.type,
          status: 'flagged',
          issues,
        });
        continue;
      }
      
      // Mark as stale
      stale++;
      await this.markStale(memory, issues);
      details.push({
        memoryId: memory.id,
        memoryType: memory.type,
        status: 'stale',
        issues,
      });
    }
    
    return {
      total: memories.length,
      valid,
      stale,
      healed,
      flaggedForReview: flagged,
      details,
      duration: Date.now() - startTime,
    };
  }
  
  private async validateMemory(memory: Memory): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];
    
    // Dimension 1: Citation staleness
    const citationIssues = await this.citationValidator.validate(memory);
    issues.push(...citationIssues);
    
    // Dimension 2: Temporal staleness
    const temporalIssues = this.temporalValidator.validate(memory);
    issues.push(...temporalIssues);
    
    // Dimension 3: Contradiction detection
    const contradictions = await this.contradictionDetector.detect(memory);
    issues.push(...contradictions);
    
    // Dimension 4: Pattern alignment
    const patternIssues = await this.patternValidator.validate(memory);
    issues.push(...patternIssues);
    
    return issues;
  }
  
  private async getMemoriesToValidate(scope: string): Promise<Memory[]> {
    switch (scope) {
      case 'stale':
        return this.storage.search({ maxConfidence: 0.7, limit: 100 });
      case 'recent':
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return this.storage.search({ minDate: weekAgo.toISOString(), limit: 100 });
      default:
        return this.storage.search({ limit: 500 });
    }
  }
  
  private getMaxSeverity(issues: ValidationIssue[]): 'minor' | 'moderate' | 'severe' {
    if (issues.some(i => i.severity === 'severe')) return 'severe';
    if (issues.some(i => i.severity === 'moderate')) return 'moderate';
    return 'minor';
  }
  
  private async flagForReview(memory: Memory, issues: ValidationIssue[]): Promise<void> {
    await this.storage.update(memory.id, {
      confidence: Math.min(memory.confidence, 0.3),
      tags: [...(memory.tags || []), 'needs-review'],
    });
  }
  
  private async markStale(memory: Memory, issues: ValidationIssue[]): Promise<void> {
    const decayFactor = issues.some(i => i.severity === 'moderate') ? 0.7 : 0.9;
    await this.storage.update(memory.id, {
      confidence: memory.confidence * decayFactor,
    });
  }
}
```

### Citation Validator

```typescript
// packages/cortex/src/validation/citation-validator.ts

import { readFile } from 'fs/promises';
import { createHash } from 'crypto';
import type { Memory, MemoryCitation } from '../types';
import type { ValidationIssue } from './engine';

export class CitationValidator {
  async validate(memory: Memory): Promise<ValidationIssue[]> {
    const citations = this.getCitations(memory);
    if (citations.length === 0) return [];
    
    const issues: ValidationIssue[] = [];
    let validCount = 0;
    
    for (const citation of citations) {
      try {
        const isValid = await this.validateCitation(citation);
        if (isValid) {
          validCount++;
        } else {
          issues.push({
            dimension: 'citation',
            severity: 'moderate',
            description: `Citation in ${citation.file}:${citation.lineStart} has drifted`,
            suggestion: 'Update citation or verify memory is still accurate',
          });
        }
      } catch (error) {
        issues.push({
          dimension: 'citation',
          severity: 'severe',
          description: `File ${citation.file} not found or unreadable`,
          suggestion: 'File may have been deleted or moved',
        });
      }
    }
    
    // If more than half of citations are invalid, it's severe
    if (validCount < citations.length / 2 && citations.length > 1) {
      issues[0].severity = 'severe';
    }
    
    return issues;
  }
  
  private async validateCitation(citation: MemoryCitation): Promise<boolean> {
    const content = await readFile(citation.file, 'utf-8');
    const lines = content.split('\n');
    
    // Extract section with context
    const start = Math.max(0, citation.lineStart - 3);
    const end = Math.min(lines.length, citation.lineEnd + 3);
    const section = lines.slice(start, end).join('\n');
    
    // Compare hash
    const currentHash = this.hash(section);
    return currentHash === citation.hash;
  }
  
  private hash(content: string): string {
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  }
  
  private getCitations(memory: Memory): MemoryCitation[] {
    // Different memory types store citations differently
    if ('citations' in memory && Array.isArray(memory.citations)) {
      return memory.citations;
    }
    return [];
  }
}
```

### Temporal Validator

```typescript
// packages/cortex/src/validation/temporal-validator.ts

import type { Memory, MemoryType } from '../types';
import type { ValidationIssue } from './engine';

// Half-lives in days for different memory types
const HALF_LIVES: Record<MemoryType, number> = {
  core: Infinity,
  tribal: 365,
  procedural: 180,
  semantic: 90,
  episodic: 7,
  pattern_rationale: 180,
  constraint_override: 90,
  decision_context: 180,
  code_smell: 90,
};

// Validation thresholds in days
const VALIDATION_THRESHOLDS: Record<MemoryType, number> = {
  core: 365,
  tribal: 90,
  procedural: 60,
  semantic: 30,
  episodic: 7,
  pattern_rationale: 60,
  constraint_override: 30,
  decision_context: 90,
  code_smell: 30,
};

export class TemporalValidator {
  validate(memory: Memory): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    
    const daysSinceValidation = this.daysSince(memory.lastValidated || memory.createdAt);
    const daysSinceAccess = this.daysSince(memory.lastAccessed || memory.createdAt);
    
    const validationThreshold = VALIDATION_THRESHOLDS[memory.type] || 30;
    const halfLife = HALF_LIVES[memory.type] || 90;
    
    // Check validation staleness
    if (daysSinceValidation > validationThreshold) {
      issues.push({
        dimension: 'temporal',
        severity: daysSinceValidation > validationThreshold * 2 ? 'moderate' : 'minor',
        description: `Memory not validated in ${daysSinceValidation} days`,
        suggestion: 'Re-validate against current codebase',
      });
    }
    
    // Check dormancy
    if (daysSinceAccess > halfLife) {
      issues.push({
        dimension: 'temporal',
        severity: 'minor',
        description: `Memory not accessed in ${daysSinceAccess} days`,
        suggestion: 'Consider archiving if no longer relevant',
      });
    }
    
    return issues;
  }
  
  private daysSince(dateStr: string): number {
    const date = new Date(dateStr);
    const now = new Date();
    return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  }
}
```

### Contradiction Detector

```typescript
// packages/cortex/src/validation/contradiction-detector.ts

import type { IMemoryStorage } from '../storage/interface';
import type { Memory } from '../types';
import type { ValidationIssue } from './engine';

export class ContradictionDetector {
  constructor(private storage: IMemoryStorage) {}
  
  async detect(memory: Memory): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];
    
    // Find related memories
    const related = await this.findRelated(memory);
    
    for (const other of related) {
      if (other.id === memory.id) continue;
      
      const contradiction = this.checkContradiction(memory, other);
      if (contradiction) {
        // Newer memory with higher confidence wins
        const otherWins = 
          other.confidence > memory.confidence &&
          new Date(other.createdAt) > new Date(memory.createdAt);
        
        if (otherWins) {
          issues.push({
            dimension: 'contradiction',
            severity: 'moderate',
            description: `Contradicted by newer memory: ${other.summary}`,
            suggestion: 'Consider archiving this memory',
          });
        }
      }
    }
    
    return issues;
  }
  
  private async findRelated(memory: Memory): Promise<Memory[]> {
    // Find memories with overlapping topics/patterns
    const queries = [];
    
    if ('topic' in memory) {
      queries.push(this.storage.search({ topics: [memory.topic], limit: 10 }));
    }
    
    if (memory.linkedPatterns?.length) {
      for (const patternId of memory.linkedPatterns.slice(0, 3)) {
        queries.push(this.storage.findByPattern(patternId));
      }
    }
    
    const results = await Promise.all(queries);
    return results.flat();
  }
  
  private checkContradiction(a: Memory, b: Memory): boolean {
    // Simple heuristic: same topic but different content
    if ('topic' in a && 'topic' in b) {
      if (a.topic === b.topic) {
        const aContent = 'knowledge' in a ? a.knowledge : a.summary;
        const bContent = 'knowledge' in b ? b.knowledge : b.summary;
        
        // High topic overlap + low content similarity = contradiction
        const similarity = this.calculateSimilarity(aContent, bContent);
        return similarity < 0.3;
      }
    }
    
    return false;
  }
  
  private calculateSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);
    
    return intersection.size / union.size;
  }
}
```

### Healing Engine

```typescript
// packages/cortex/src/validation/healing.ts

import type { IMemoryStorage } from '../storage/interface';
import type { Memory, MemoryCitation } from '../types';
import type { ValidationIssue } from './engine';
import { readFile } from 'fs/promises';
import { createHash } from 'crypto';

export interface HealResult {
  success: boolean;
  newConfidence?: number;
  actions: string[];
}

export class HealingEngine {
  constructor(private storage: IMemoryStorage) {}
  
  async heal(memory: Memory, issues: ValidationIssue[]): Promise<HealResult> {
    const actions: string[] = [];
    let success = true;
    
    for (const issue of issues) {
      switch (issue.dimension) {
        case 'citation':
          const citationHealed = await this.healCitation(memory);
          if (citationHealed) {
            actions.push('Updated citation hashes');
          } else {
            success = false;
          }
          break;
          
        case 'temporal':
          // Just update last validated timestamp
          await this.storage.update(memory.id, {
            lastValidated: new Date().toISOString(),
          });
          actions.push('Updated validation timestamp');
          break;
          
        default:
          // Can't auto-heal contradictions or pattern issues
          success = false;
      }
    }
    
    if (success) {
      // Slight confidence boost for successful healing
      const newConfidence = Math.min(1.0, memory.confidence + 0.05);
      await this.storage.update(memory.id, { confidence: newConfidence });
      return { success: true, newConfidence, actions };
    }
    
    return { success: false, actions };
  }
  
  private async healCitation(memory: Memory): Promise<boolean> {
    if (!('citations' in memory) || !Array.isArray(memory.citations)) {
      return false;
    }
    
    const updatedCitations: MemoryCitation[] = [];
    
    for (const citation of memory.citations) {
      try {
        const content = await readFile(citation.file, 'utf-8');
        const lines = content.split('\n');
        
        const start = Math.max(0, citation.lineStart - 3);
        const end = Math.min(lines.length, citation.lineEnd + 3);
        const section = lines.slice(start, end).join('\n');
        
        updatedCitations.push({
          ...citation,
          hash: createHash('sha256').update(section).digest('hex').slice(0, 16),
          validatedAt: new Date().toISOString(),
          valid: true,
        });
      } catch {
        // File not found, can't heal
        return false;
      }
    }
    
    await this.storage.update(memory.id, {
      citations: updatedCitations,
    });
    
    return true;
  }
}
```


---

## Part VIII: Decay System

### Multi-Factor Decay Calculator

```typescript
// packages/cortex/src/decay/calculator.ts

import type { Memory, MemoryType } from '../types';
import { HALF_LIVES } from './half-lives';
import { calculateUsageBoost, calculatePatternBoost, calculateImportanceAnchor } from './boosters';

export interface DecayFactors {
  temporalDecay: number;
  citationDecay: number;
  usageBoost: number;
  importanceAnchor: number;
  patternBoost: number;
  finalConfidence: number;
}

export class DecayCalculator {
  calculate(memory: Memory): DecayFactors {
    // Base temporal decay (exponential)
    const daysSinceAccess = this.daysSince(memory.lastAccessed || memory.createdAt);
    const halfLife = HALF_LIVES[memory.type] || 90;
    const temporalDecay = Math.exp(-daysSinceAccess / halfLife);
    
    // Citation validity decay
    const citationDecay = this.calculateCitationDecay(memory);
    
    // Usage boost (frequently used memories resist decay)
    const usageBoost = calculateUsageBoost(memory.accessCount);
    
    // Importance anchor (critical memories decay slower)
    const importanceAnchor = calculateImportanceAnchor(memory.importance);
    
    // Pattern alignment boost
    const patternBoost = calculatePatternBoost(memory.linkedPatterns || []);
    
    // Final confidence
    const finalConfidence = Math.min(1.0,
      memory.confidence *
      temporalDecay *
      citationDecay *
      usageBoost *
      importanceAnchor *
      patternBoost
    );
    
    return {
      temporalDecay,
      citationDecay,
      usageBoost,
      importanceAnchor,
      patternBoost,
      finalConfidence,
    };
  }
  
  private calculateCitationDecay(memory: Memory): number {
    if (!('citations' in memory) || !Array.isArray(memory.citations)) {
      return 1.0;
    }
    
    const citations = memory.citations;
    if (citations.length === 0) return 1.0;
    
    const validCount = citations.filter(c => c.valid !== false).length;
    return validCount / citations.length;
  }
  
  private daysSince(dateStr: string): number {
    const date = new Date(dateStr);
    const now = new Date();
    return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  }
}
```

### Half-Lives Configuration

```typescript
// packages/cortex/src/decay/half-lives.ts

import type { MemoryType } from '../types';

// Half-lives in days for different memory types
export const HALF_LIVES: Record<MemoryType, number> = {
  core: Infinity,           // Never decays
  tribal: 365,              // Institutional knowledge is precious
  procedural: 180,          // How-to knowledge is stable
  semantic: 90,             // Consolidated knowledge persists
  episodic: 7,              // Specific interactions fade quickly
  pattern_rationale: 180,   // Pattern context is stable
  constraint_override: 90,  // Overrides need periodic review
  decision_context: 180,    // Decision context is stable
  code_smell: 90,           // Smell patterns need validation
};

// Minimum confidence before archival
export const MIN_CONFIDENCE: Record<MemoryType, number> = {
  core: 0.0,                // Never archive
  tribal: 0.2,
  procedural: 0.3,
  semantic: 0.3,
  episodic: 0.1,
  pattern_rationale: 0.3,
  constraint_override: 0.2,
  decision_context: 0.3,
  code_smell: 0.2,
};
```

### Boosters

```typescript
// packages/cortex/src/decay/boosters.ts

import type { Importance } from '../types';

/**
 * Usage boost: frequently accessed memories resist decay
 * Formula: 1 + log10(accessCount + 1) * 0.2, capped at 1.5
 */
export function calculateUsageBoost(accessCount: number): number {
  return Math.min(1.5, 1 + Math.log10(accessCount + 1) * 0.2);
}

/**
 * Importance anchor: critical memories decay slower
 */
export function calculateImportanceAnchor(importance: Importance): number {
  switch (importance) {
    case 'critical': return 2.0;
    case 'high': return 1.5;
    case 'normal': return 1.0;
    case 'low': return 0.8;
    default: return 1.0;
  }
}

/**
 * Pattern boost: memories linked to active patterns decay slower
 */
export function calculatePatternBoost(linkedPatterns: string[]): number {
  if (linkedPatterns.length === 0) return 1.0;
  
  // TODO: Check if patterns are still active
  // For now, any linked pattern gives a boost
  return 1.3;
}
```

---

## Part IX: MCP Tools Interface

### Tool Registration

```typescript
// packages/mcp/src/tools/memory/index.ts

import { registerTool } from '../../registry';
import { memoryStatus } from './status';
import { memoryAdd } from './add';
import { memorySearch } from './search';
import { memoryGet } from './get';
import { memoryUpdate } from './update';
import { memoryDelete } from './delete';
import { memoryValidate } from './validate';
import { memoryConsolidate } from './consolidate';
import { memoryForContext } from './for-context';
import { memoryWarnings } from './warnings';
import { memoryLearn } from './learn';
import { memorySuggest } from './suggest';
import { driftWhy } from './why';
import { memoryExport } from './export';
import { memoryImport } from './import';

export function registerMemoryTools(): void {
  registerTool('drift_memory_status', memoryStatus);
  registerTool('drift_memory_add', memoryAdd);
  registerTool('drift_memory_search', memorySearch);
  registerTool('drift_memory_get', memoryGet);
  registerTool('drift_memory_update', memoryUpdate);
  registerTool('drift_memory_delete', memoryDelete);
  registerTool('drift_memory_validate', memoryValidate);
  registerTool('drift_memory_consolidate', memoryConsolidate);
  registerTool('drift_memory_for_context', memoryForContext);
  registerTool('drift_memory_warnings', memoryWarnings);
  registerTool('drift_memory_learn', memoryLearn);
  registerTool('drift_memory_suggest', memorySuggest);
  registerTool('drift_why', driftWhy);
  registerTool('drift_memory_export', memoryExport);
  registerTool('drift_memory_import', memoryImport);
}
```

### drift_memory_status

```typescript
// packages/mcp/src/tools/memory/status.ts

import type { ToolHandler } from '../../types';
import { getCortex } from '@drift/cortex';

export const memoryStatus: ToolHandler = {
  description: 'Get memory system health overview',
  parameters: {},
  
  async execute() {
    const cortex = await getCortex();
    
    const counts = await cortex.storage.countByType();
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    
    const staleCount = await cortex.storage.count({ maxConfidence: 0.5 });
    const pendingConsolidation = await cortex.storage.count({
      types: ['episodic'],
      consolidationStatus: 'pending',
    });
    
    const summaries = await cortex.storage.getSummaries({ limit: 10 });
    
    return {
      counts: {
        total,
        byType: counts,
        byConfidence: {
          high: await cortex.storage.count({ minConfidence: 0.8 }),
          medium: await cortex.storage.count({ minConfidence: 0.5, maxConfidence: 0.8 }),
          low: await cortex.storage.count({ minConfidence: 0.2, maxConfidence: 0.5 }),
          stale: staleCount,
        },
      },
      health: {
        avgConfidence: await cortex.getAverageConfidence(),
        staleCount,
        pendingConsolidation,
        lastConsolidation: await cortex.getLastConsolidationDate(),
        lastValidation: await cortex.getLastValidationDate(),
      },
      recentMemories: summaries,
    };
  },
};
```

### drift_memory_add

```typescript
// packages/mcp/src/tools/memory/add.ts

import type { ToolHandler } from '../../types';
import { getCortex } from '@drift/cortex';
import type { MemoryType } from '@drift/cortex/types';

export const memoryAdd: ToolHandler = {
  description: 'Add a new memory to the system',
  parameters: {
    type: {
      type: 'string',
      enum: ['tribal', 'procedural', 'semantic', 'pattern_rationale', 'constraint_override', 'decision_context', 'code_smell'],
      description: 'Type of memory to create',
      required: true,
    },
    content: {
      type: 'object',
      description: 'Memory content (varies by type)',
      required: true,
    },
    linkedPatterns: {
      type: 'array',
      items: { type: 'string' },
      description: 'Pattern IDs to link to',
    },
    linkedFiles: {
      type: 'array',
      items: { type: 'string' },
      description: 'File paths to link to',
    },
    importance: {
      type: 'string',
      enum: ['low', 'normal', 'high', 'critical'],
      default: 'normal',
    },
  },
  
  async execute(params) {
    const cortex = await getCortex();
    
    const memory = {
      type: params.type as MemoryType,
      ...params.content,
      linkedPatterns: params.linkedPatterns,
      linkedFiles: params.linkedFiles,
      importance: params.importance || 'normal',
      confidence: 1.0,
    };
    
    const id = await cortex.storage.create(memory);
    
    // Generate embedding for semantic search
    if (memory.summary || memory.knowledge || memory.topic) {
      const text = memory.summary || memory.knowledge || memory.topic;
      const embedding = await cortex.embeddings.embed(text);
      await cortex.storage.upsertEmbedding(id, embedding);
    }
    
    // Auto-link to patterns/files
    if (params.linkedPatterns) {
      for (const patternId of params.linkedPatterns) {
        await cortex.storage.linkToPattern(id, patternId);
      }
    }
    
    if (params.linkedFiles) {
      for (const file of params.linkedFiles) {
        await cortex.storage.linkToFile(id, file);
      }
    }
    
    return {
      id,
      created: true,
      linkedTo: [
        ...(params.linkedPatterns || []),
        ...(params.linkedFiles || []),
      ],
    };
  },
};
```

### drift_memory_for_context (Primary Interface)

```typescript
// packages/mcp/src/tools/memory/for-context.ts

import type { ToolHandler } from '../../types';
import { getCortex } from '@drift/cortex';
import type { Intent } from '@drift/cortex/retrieval';

export const memoryForContext: ToolHandler = {
  description: 'Get memories relevant to current context (integrates with drift_context)',
  parameters: {
    intent: {
      type: 'string',
      enum: ['add_feature', 'fix_bug', 'refactor', 'security_audit', 'understand_code', 'add_test'],
      required: true,
    },
    focus: {
      type: 'string',
      description: 'What you are working on (e.g., "authentication", "payment processing")',
      required: true,
    },
    activeFile: {
      type: 'string',
      description: 'Currently active file path',
    },
    relevantPatterns: {
      type: 'array',
      items: { type: 'string' },
      description: 'Pattern IDs from drift_context',
    },
    maxTokens: {
      type: 'number',
      default: 2000,
    },
  },
  
  async execute(params) {
    const cortex = await getCortex();
    
    const result = await cortex.retrieval.retrieve({
      intent: params.intent as Intent,
      focus: params.focus,
      activeFile: params.activeFile,
      relevantPatterns: params.relevantPatterns,
      maxTokens: params.maxTokens || 2000,
    });
    
    // Organize by type
    const byType = {
      core: result.memories.filter(m => m.memory.type === 'core'),
      tribal: result.memories.filter(m => m.memory.type === 'tribal'),
      procedural: result.memories.filter(m => m.memory.type === 'procedural'),
      semantic: result.memories.filter(m => m.memory.type === 'semantic'),
      patternRationales: result.memories.filter(m => m.memory.type === 'pattern_rationale'),
      constraintOverrides: result.memories.filter(m => m.memory.type === 'constraint_override'),
      codeSmells: result.memories.filter(m => m.memory.type === 'code_smell'),
    };
    
    // Extract warnings
    const warnings = byType.tribal
      .filter(m => m.memory.severity === 'critical' || m.memory.severity === 'warning')
      .map(m => ({
        type: 'tribal',
        severity: m.memory.severity,
        message: m.memory.summary,
      }));
    
    return {
      ...byType,
      warnings,
      tokensUsed: result.tokensUsed,
      memoriesIncluded: result.memories.length,
      memoriesOmitted: result.totalCandidates - result.memories.length,
      retrievalTime: result.retrievalTime,
    };
  },
};
```

### drift_why (Killer Feature)

```typescript
// packages/mcp/src/tools/memory/why.ts

import type { ToolHandler } from '../../types';
import { getCortex } from '@drift/cortex';
import { getPatterns, getConstraints, getDecisions } from '@drift/core';

export const driftWhy: ToolHandler = {
  description: 'Get complete "why" context for any task - patterns, decisions, tribal knowledge, warnings',
  parameters: {
    intent: {
      type: 'string',
      enum: ['add_feature', 'fix_bug', 'refactor', 'security_audit', 'understand_code', 'add_test'],
      required: true,
    },
    focus: {
      type: 'string',
      description: 'What you are working on',
      required: true,
    },
    includePatterns: { type: 'boolean', default: true },
    includeConstraints: { type: 'boolean', default: true },
    includeMemories: { type: 'boolean', default: true },
    includeDecisions: { type: 'boolean', default: true },
    includeWarnings: { type: 'boolean', default: true },
    verbosity: {
      type: 'string',
      enum: ['summary', 'detailed', 'comprehensive'],
      default: 'detailed',
    },
    maxTokens: { type: 'number', default: 3000 },
  },
  
  async execute(params) {
    const cortex = await getCortex();
    const results: any = {};
    
    // Get patterns with rationales
    if (params.includePatterns) {
      const patterns = await getPatterns({ focus: params.focus });
      const rationales = await cortex.storage.search({
        types: ['pattern_rationale'],
        patterns: patterns.map(p => p.id),
      });
      
      results.patterns = patterns.map(p => ({
        id: p.id,
        name: p.name,
        compliance: p.compliance,
        rationale: rationales.find(r => r.patternId === p.id)?.rationale,
        examples: p.examples?.slice(0, 2),
      }));
    }
    
    // Get constraints with overrides
    if (params.includeConstraints) {
      const constraints = await getConstraints({ focus: params.focus });
      const overrides = await cortex.storage.search({
        types: ['constraint_override'],
        constraints: constraints.map(c => c.id),
      });
      
      results.constraints = constraints.map(c => ({
        id: c.id,
        description: c.description,
        overrides: overrides.filter(o => o.constraintId === c.id),
      }));
    }
    
    // Get memories
    if (params.includeMemories) {
      const memories = await cortex.retrieval.retrieve({
        intent: params.intent,
        focus: params.focus,
        maxTokens: params.maxTokens / 2,
      });
      
      results.tribalKnowledge = memories.memories
        .filter(m => m.memory.type === 'tribal')
        .map(m => ({
          topic: m.memory.topic,
          knowledge: m.memory.knowledge,
          severity: m.memory.severity,
          confidence: m.memory.confidence,
        }));
      
      results.procedures = memories.memories
        .filter(m => m.memory.type === 'procedural')
        .map(m => ({
          name: m.memory.name,
          steps: m.memory.steps?.map(s => s.action),
          checklist: m.memory.checklist?.map(c => c.item),
        }));
    }
    
    // Get decisions
    if (params.includeDecisions) {
      const decisions = await getDecisions({ focus: params.focus });
      const contexts = await cortex.storage.search({
        types: ['decision_context'],
        decisions: decisions.map(d => d.id),
      });
      
      results.decisions = decisions.map(d => ({
        id: d.id,
        summary: d.summary,
        date: d.date,
        context: contexts.find(c => c.decisionId === d.id)?.businessContext,
        stillValid: contexts.find(c => c.decisionId === d.id)?.stillValid ?? true,
      }));
    }
    
    // Synthesize warnings
    if (params.includeWarnings) {
      results.warnings = [
        ...(results.tribalKnowledge || [])
          .filter(t => t.severity === 'critical' || t.severity === 'warning')
          .map(t => ({
            type: 'tribal',
            message: t.knowledge,
            severity: t.severity,
            source: t.topic,
          })),
        ...(results.constraints || [])
          .filter(c => c.overrides?.length > 0)
          .map(c => ({
            type: 'constraint',
            message: `Constraint "${c.description}" has active overrides`,
            severity: 'info',
            source: c.id,
          })),
      ];
    }
    
    // Generate summary
    results.summary = this.generateSummary(results, params.verbosity);
    
    return results;
  },
  
  generateSummary(results: any, verbosity: string): string {
    const parts: string[] = [];
    
    if (results.patterns?.length) {
      parts.push(`${results.patterns.length} relevant patterns`);
    }
    if (results.constraints?.length) {
      parts.push(`${results.constraints.length} constraints to follow`);
    }
    if (results.tribalKnowledge?.length) {
      parts.push(`${results.tribalKnowledge.length} tribal knowledge items`);
    }
    if (results.warnings?.length) {
      parts.push(`${results.warnings.length} warnings`);
    }
    
    return `Context includes: ${parts.join(', ')}`;
  },
};
```


---

## Part X: Integration with Drift's Analysis Engine

### Complete Integration Matrix

Drift Cortex integrates with ALL existing Drift capabilities:

| Drift Component | Integration Point | Memory Benefit |
|-----------------|-------------------|----------------|
| **Pattern Detection** (400+ detectors) | PatternRationaleMemory | WHY patterns exist |
| **Call Graph Analysis** | Function linking | Memory follows code relationships |
| **Constraint System** | ConstraintOverrideMemory | Approved exceptions |
| **Decision Mining** | DecisionContextMemory | Human context for ADRs |
| **Security Boundaries** | TribalMemory (security) | Security gotchas |
| **Test Topology** | ProceduralMemory | How to write tests |
| **Coupling Analysis** | SemanticMemory | Architecture knowledge |
| **Error Handling** | CodeSmellMemory | Error patterns to avoid |
| **Environment Analysis** | TribalMemory | Env var warnings |
| **Constants Analysis** | CodeSmellMemory | Magic number warnings |

### Auto-Linking Engine

```typescript
// packages/cortex/src/linking/auto-linker.ts

import type { IMemoryStorage } from '../storage/interface';
import type { Memory } from '../types';
import { PatternLinker } from './pattern-linker';
import { ConstraintLinker } from './constraint-linker';
import { DecisionLinker } from './decision-linker';
import { FileLinker } from './file-linker';
import { FunctionLinker } from './function-linker';

export class AutoLinker {
  private patternLinker: PatternLinker;
  private constraintLinker: ConstraintLinker;
  private decisionLinker: DecisionLinker;
  private fileLinker: FileLinker;
  private functionLinker: FunctionLinker;
  
  constructor(private storage: IMemoryStorage) {
    this.patternLinker = new PatternLinker(storage);
    this.constraintLinker = new ConstraintLinker(storage);
    this.decisionLinker = new DecisionLinker(storage);
    this.fileLinker = new FileLinker(storage);
    this.functionLinker = new FunctionLinker(storage);
  }
  
  /**
   * Called when Drift detects a pattern
   */
  async onPatternDetected(pattern: DetectedPattern): Promise<void> {
    // Find memories that reference this pattern
    const memories = await this.storage.findByPattern(pattern.id);
    
    // Attach memory context to pattern
    pattern.memoryContext = {
      hasRationale: memories.some(m => m.type === 'pattern_rationale'),
      tribalKnowledge: memories.filter(m => m.type === 'tribal'),
      warnings: memories.filter(m => 
        m.type === 'tribal' && 
        (m.severity === 'critical' || m.severity === 'warning')
      ),
    };
  }
  
  /**
   * Called when Drift detects a constraint
   */
  async onConstraintDetected(constraint: DetectedConstraint): Promise<void> {
    const overrides = await this.storage.search({
      types: ['constraint_override'],
      constraints: [constraint.id],
    });
    
    constraint.overrideContext = {
      hasOverrides: overrides.length > 0,
      activeOverrides: overrides.filter(o => 
        !o.expiresAt || new Date(o.expiresAt) > new Date()
      ),
      expiredOverrides: overrides.filter(o => 
        o.expiresAt && new Date(o.expiresAt) <= new Date()
      ),
    };
  }
  
  /**
   * Called when Drift mines a decision
   */
  async onDecisionMined(decision: MinedDecision): Promise<void> {
    const contexts = await this.storage.search({
      types: ['decision_context'],
      decisions: [decision.id],
    });
    
    decision.humanContext = contexts.length > 0 ? contexts[0] : null;
  }
  
  /**
   * Called when a file is analyzed
   */
  async onFileAnalyzed(file: string, analysis: FileAnalysis): Promise<void> {
    const memories = await this.storage.findByFile(file);
    
    analysis.memoryContext = {
      tribalKnowledge: memories.filter(m => m.type === 'tribal'),
      codeSmells: memories.filter(m => m.type === 'code_smell'),
      procedures: memories.filter(m => m.type === 'procedural'),
    };
  }
}
```

### Enhanced drift_context Integration

```typescript
// packages/mcp/src/tools/orchestration/context.ts (MODIFIED)

import { getCortex } from '@drift/cortex';

// Add to existing drift_context implementation
async function enhanceWithMemory(context: ContextResponse): Promise<EnhancedContextResponse> {
  const cortex = await getCortex();
  
  // Get memory-enriched context
  const memoryResult = await cortex.retrieval.retrieve({
    intent: context.intent,
    focus: context.focus,
    relevantPatterns: context.patterns.map(p => p.id),
    maxTokens: 1500,
  });
  
  // Organize memories
  const memory = {
    core: await cortex.getCoreMemory(),
    tribal: memoryResult.memories
      .filter(m => m.memory.type === 'tribal')
      .map(m => ({
        topic: m.memory.topic,
        knowledge: m.memory.knowledge,
        severity: m.memory.severity,
      })),
    procedural: memoryResult.memories
      .filter(m => m.memory.type === 'procedural')
      .map(m => ({
        name: m.memory.name,
        summary: m.memory.summary,
        steps: m.memory.steps?.length || 0,
      })),
    patternRationales: memoryResult.memories
      .filter(m => m.memory.type === 'pattern_rationale')
      .map(m => ({
        pattern: m.memory.patternName,
        rationale: m.memory.rationale,
      })),
    constraintOverrides: memoryResult.memories
      .filter(m => m.memory.type === 'constraint_override')
      .map(m => ({
        constraint: m.memory.constraintName,
        reason: m.memory.reason,
        expiresAt: m.memory.expiresAt,
      })),
    codeSmells: memoryResult.memories
      .filter(m => m.memory.type === 'code_smell')
      .map(m => ({
        name: m.memory.name,
        description: m.memory.description,
      })),
  };
  
  // Extract warnings
  const memoryWarnings = memory.tribal
    .filter(t => t.severity === 'critical' || t.severity === 'warning')
    .map(t => ({
      type: 'tribal',
      message: t.knowledge,
      severity: t.severity,
      source: t.topic,
    }));
  
  return {
    ...context,
    memory,
    memoryWarnings,
    memoryTokensUsed: memoryResult.tokensUsed,
  };
}
```

---

## Part XI: Supported Subsystems (100% Coverage)

### Languages (10)

All 10 supported languages integrate with memory:

| Language | Memory Integration |
|----------|-------------------|
| TypeScript | Full - patterns, call graph, types |
| JavaScript | Full - patterns, call graph |
| Python | Full - patterns, decorators, docstrings |
| Java | Full - annotations, Spring patterns |
| C# | Full - attributes, ASP.NET patterns |
| PHP | Full - Laravel patterns, Eloquent |
| Go | Full - struct tags, interfaces |
| Rust | Full - attributes, traits |
| C | Basic - function signatures |
| C++ | Basic - classes, templates |

### Frameworks (21)

All 21 web frameworks have memory-aware pattern detection:

| Framework | Memory Features |
|-----------|-----------------|
| **TypeScript/JS** | |
| Next.js | Route patterns, SSR/SSG decisions |
| Express | Middleware patterns, route conventions |
| Fastify | Plugin patterns, schema conventions |
| NestJS | Decorator patterns, module structure |
| **Java** | |
| Spring Boot | Annotation patterns, bean conventions |
| **C#** | |
| ASP.NET Core | Attribute patterns, DI conventions |
| **PHP** | |
| Laravel | Eloquent patterns, facade conventions |
| **Python** | |
| FastAPI | Decorator patterns, Pydantic conventions |
| **Go** | |
| Gin, Echo, Fiber, Chi, net/http | Handler patterns, middleware conventions |
| **Rust** | |
| Actix, Axum, Rocket, Warp | Attribute patterns, extractor conventions |
| **C++** | |
| Crow, Boost.Beast, Qt | Route patterns, handler conventions |

### ORMs (16)

All 16 ORMs have memory-aware data access patterns:

| ORM | Memory Features |
|-----|-----------------|
| Supabase | RLS patterns, query conventions |
| Prisma | Schema patterns, query conventions |
| TypeORM | Entity patterns, repository conventions |
| Sequelize | Model patterns, association conventions |
| Drizzle | Schema patterns, query conventions |
| Knex | Query builder patterns |
| Mongoose | Schema patterns, middleware conventions |
| Django ORM | Model patterns, manager conventions |
| SQLAlchemy | Session patterns, query conventions |
| Entity Framework | DbContext patterns, LINQ conventions |
| Dapper | Query patterns, mapping conventions |
| Spring Data JPA | Repository patterns, query conventions |
| Hibernate | Entity patterns, session conventions |
| Eloquent | Model patterns, relationship conventions |
| Doctrine | Entity patterns, repository conventions |

### Pattern Categories (25)

All 25 pattern categories support memory rationales:

| Category | Detectors | Memory Type |
|----------|-----------|-------------|
| API | 7 | PatternRationale, Tribal |
| Auth | 6 | PatternRationale, Tribal, Procedural |
| Security | 7 | Tribal (critical), CodeSmell |
| Errors | 7 | PatternRationale, CodeSmell |
| Logging | 7 | PatternRationale, Procedural |
| Testing | 7 | Procedural, PatternRationale |
| Data Access | 7 | PatternRationale, Tribal |
| Config | 6 | Tribal, PatternRationale |
| Types | 7 | PatternRationale |
| Structural | 8 | PatternRationale, Tribal |
| Components | 8 | PatternRationale, Procedural |
| Styling | 8 | PatternRationale |
| Accessibility | 6 | Tribal, CodeSmell |
| Documentation | 5 | Procedural |
| Performance | 6 | Tribal, CodeSmell |
| + Framework-specific | 36+ | All types |

### Analysis Engines (12)

All 12 analysis engines integrate with memory:

| Engine | Memory Integration |
|--------|-------------------|
| Pattern Detection | PatternRationaleMemory for WHY |
| Call Graph | Function linking for relationships |
| Security Boundary | TribalMemory for security gotchas |
| Test Topology | ProceduralMemory for test patterns |
| Module Coupling | SemanticMemory for architecture |
| Error Handling | CodeSmellMemory for anti-patterns |
| Constraint | ConstraintOverrideMemory for exceptions |
| Decision Mining | DecisionContextMemory for human context |
| DNA Analysis | SemanticMemory for styling patterns |
| Wrapper Detection | PatternRationaleMemory for abstractions |
| Environment | TribalMemory for env var warnings |
| Constants | CodeSmellMemory for magic numbers |

### MCP Tools (50+)

All 50+ MCP tools can leverage memory context:

| Tool Category | Memory Enhancement |
|---------------|-------------------|
| Orchestration (2) | Memory-enriched context |
| Discovery (4) | Memory health in status |
| Surgical (12) | Cached signatures, caller graphs |
| Exploration (5) | Pattern rationales, security tribal |
| Detail (8) | Impact history, examples with rationales |
| Analysis (15+) | Audit history, quality gate trends |
| Generation (3) | Validation with memory warnings |
| **NEW Memory (15)** | Full memory system |

---

## Part XII: Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)

**Goal:** Core storage and types

```
packages/cortex/
├── src/
│   ├── types/           ✅ All 9 memory types
│   ├── storage/
│   │   ├── interface.ts ✅ IMemoryStorage
│   │   └── sqlite/      ✅ SQLite implementation
│   └── utils/           ✅ ID generation, hashing
```

**Deliverables:**
- [ ] All memory type definitions
- [ ] SQLite storage with schema
- [ ] Basic CRUD operations
- [ ] `drift_memory_add`, `drift_memory_get`, `drift_memory_status`

### Phase 2: Embeddings & Search (Weeks 3-4)

**Goal:** Vector search capability

```
packages/cortex/
├── src/
│   ├── embeddings/      ✅ All 3 providers
│   └── storage/sqlite/  ✅ sqlite-vss integration
```

**Deliverables:**
- [ ] Local embedding provider (Transformers.js)
- [ ] OpenAI/Ollama providers
- [ ] Vector similarity search
- [ ] `drift_memory_search`

### Phase 3: Retrieval Engine (Weeks 5-6)

**Goal:** Intent-aware retrieval

```
packages/cortex/
├── src/
│   └── retrieval/       ✅ Full retrieval engine
```

**Deliverables:**
- [ ] Relevance scoring
- [ ] Intent weighting
- [ ] Token budget management
- [ ] Hierarchical compression
- [ ] `drift_memory_for_context`

### Phase 4: Consolidation (Weeks 7-8)

**Goal:** Sleep-inspired consolidation

```
packages/cortex/
├── src/
│   └── consolidation/   ✅ All 5 phases
```

**Deliverables:**
- [ ] Replay phase
- [ ] Abstraction phase
- [ ] Integration phase
- [ ] Pruning phase
- [ ] Strengthening phase
- [ ] `drift_memory_consolidate`

### Phase 5: Validation (Weeks 9-10)

**Goal:** Self-healing validation

```
packages/cortex/
├── src/
│   ├── validation/      ✅ All validators
│   └── decay/           ✅ Decay calculator
```

**Deliverables:**
- [ ] Citation validator
- [ ] Temporal validator
- [ ] Contradiction detector
- [ ] Healing engine
- [ ] Decay calculator
- [ ] `drift_memory_validate`

### Phase 6: Integration (Weeks 11-12)

**Goal:** Full Drift integration

```
packages/cortex/
├── src/
│   ├── linking/         ✅ Auto-linkers
│   ├── learning/        ✅ Outcome tracking
│   └── why/             ✅ Why synthesizer
```

**Deliverables:**
- [ ] Auto-linking to patterns/constraints/decisions
- [ ] Enhanced drift_context
- [ ] Learning from outcomes
- [ ] `drift_why` (killer feature)
- [ ] `drift_memory_learn`

### Phase 7: Polish (Weeks 13-14)

**Goal:** Production readiness

**Deliverables:**
- [ ] CLI commands
- [ ] Dashboard integration
- [ ] Documentation
- [ ] Tests (unit, integration)
- [ ] Performance optimization

---

## Part XIII: Success Metrics

### Adoption Metrics
- Memories created per project
- Memory coverage (patterns with rationale / total)
- Memory usage in context retrieval
- `drift_why` usage frequency

### Quality Metrics
- Average memory confidence
- Validation success rate
- Consolidation efficiency (episodes → semantic)
- Staleness detection accuracy

### Performance Metrics
- Retrieval latency (p50 < 100ms, p99 < 500ms)
- Token efficiency (25+ memories in 2000 tokens)
- Storage efficiency (< 1MB per 1000 memories)
- Embedding generation (< 50ms local)

### Impact Metrics
- Reduction in repeated context explanations
- Code generation acceptance rate improvement
- User satisfaction with "why" explanations
- Time saved per coding session

---

## Part XIV: Competitive Moat Summary

### What We Build (Our Moat)

| Component | Time to Build | Competitor Effort |
|-----------|---------------|-------------------|
| Memory type system | 2 weeks | 2 weeks |
| Retrieval engine | 4 weeks | 4 weeks |
| Consolidation engine | 4 weeks | 4 weeks |
| Validation engine | 4 weeks | 4 weeks |
| Drift integration | 4 weeks | **2+ years** (need all of Drift) |
| **Total** | **14 weeks** | **2+ years** |

### What We DON'T Build (Leverage Existing)

| Component | We Use | Competitor Would Build |
|-----------|--------|------------------------|
| Storage | SQLite | Custom DB (6 months) |
| Vector index | sqlite-vss | Custom index (3 months) |
| Graph queries | SQL CTEs | Custom graph DB (4 months) |
| Embeddings | Transformers.js | Custom model (2 months) |
| AST parsing | Drift's tree-sitter | Custom parsers (6 months) |

### The Unassailable Advantage

To replicate Drift Cortex, a competitor needs:

1. **Drift's Analysis Engine** (2+ years)
   - 400+ pattern detectors
   - Call graph analysis
   - Security boundary tracking
   - Constraint system
   - Decision mining
   - Test topology
   - 10 language parsers
   - 21 framework detectors
   - 16 ORM detectors

2. **Memory System** (14 weeks)
   - But useless without #1

**Result:** 2+ years head start, growing daily as tribal knowledge accumulates.

---

## Conclusion

Drift Cortex transforms AI code assistance from "here's code that might work" to "here's code that fits YOUR codebase, and here's WHY."

**Key Design Decisions:**
1. ✅ Use SQLite + sqlite-vss (don't build custom DB)
2. ✅ Use Transformers.js for embeddings (don't build custom model)
3. ✅ Use SQL for graph queries (don't build custom graph DB)
4. ✅ Use Drift's tree-sitter (don't build custom parsers)
5. ✅ Focus engineering on memory LOGIC (the actual moat)

**The Result:**
- Ship in 14 weeks instead of 2+ years
- Leverage battle-tested infrastructure
- Focus on what creates competitive advantage
- Build the intelligence, not the plumbing

---

*"Drift Cortex: The memory system that makes AI agents truly understand your code."*
