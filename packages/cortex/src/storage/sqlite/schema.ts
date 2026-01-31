/**
 * SQLite Schema Definition
 * 
 * Complete schema for the Drift Cortex memory system including:
 * - Core memories table with bitemporal columns
 * - Vector embeddings (sqlite-vss)
 * - Memory relationships
 * - Links to Drift entities (patterns, constraints, files, functions)
 * - Consolidation and validation history
 */

/**
 * Main schema SQL
 */
export const SCHEMA = `
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
  supersedes TEXT,
  
  -- Validation
  last_validated TEXT
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

-- Embedding link table (links memories to vector embeddings)
CREATE TABLE IF NOT EXISTS memory_embedding_link (
  memory_id TEXT PRIMARY KEY,
  embedding_rowid INTEGER NOT NULL,
  FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_confidence ON memories(confidence);
CREATE INDEX IF NOT EXISTS idx_memories_valid ON memories(valid_from, valid_until);
CREATE INDEX IF NOT EXISTS idx_memories_archived ON memories(archived);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at);
CREATE INDEX IF NOT EXISTS idx_memories_last_accessed ON memories(last_accessed);
CREATE INDEX IF NOT EXISTS idx_memory_patterns_pattern ON memory_patterns(pattern_id);
CREATE INDEX IF NOT EXISTS idx_memory_constraints_constraint ON memory_constraints(constraint_id);
CREATE INDEX IF NOT EXISTS idx_memory_files_file ON memory_files(file_path);
CREATE INDEX IF NOT EXISTS idx_memory_functions_function ON memory_functions(function_id);
CREATE INDEX IF NOT EXISTS idx_memory_relationships_target ON memory_relationships(target_id);
`;

/**
 * Vector table schema (sqlite-vec)
 * Note: This is created separately after loading the extension
 */
export const VECTOR_SCHEMA = `
CREATE VIRTUAL TABLE IF NOT EXISTS memory_embeddings USING vec0(
  embedding float[384]  -- 384-dim for all-MiniLM-L6-v2
);
`;

/**
 * Schema version for migrations
 */
export const SCHEMA_VERSION = 5;
