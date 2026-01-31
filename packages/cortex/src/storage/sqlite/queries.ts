/**
 * SQLite Prepared Statements
 * 
 * Pre-defined SQL queries for common operations.
 */

/**
 * Insert a new memory
 */
export const INSERT_MEMORY = `
  INSERT INTO memories (
    id, type, content, summary, recorded_at, valid_from, 
    confidence, importance, created_by, tags, created_at, updated_at, access_count
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

/**
 * Get a memory by ID
 */
export const GET_MEMORY = `
  SELECT id, content FROM memories 
  WHERE id = ? AND archived = 0
`;

/**
 * Get a memory by ID with bitemporal scope
 */
export const GET_MEMORY_SCOPED = `
  SELECT id, content FROM memories 
  WHERE id = ? AND archived = 0
`;

/**
 * Update a memory
 */
export const UPDATE_MEMORY = `
  UPDATE memories 
  SET content = ?, summary = ?, confidence = ?, importance = ?, 
      tags = ?, updated_at = ?, last_validated = ?
  WHERE id = ?
`;

/**
 * Delete a memory (soft delete)
 */
export const SOFT_DELETE_MEMORY = `
  UPDATE memories 
  SET archived = 1, archive_reason = 'deleted', updated_at = ?
  WHERE id = ?
`;

/**
 * Hard delete a memory
 */
export const HARD_DELETE_MEMORY = `
  DELETE FROM memories WHERE id = ?
`;

/**
 * Find memories by type
 */
export const FIND_BY_TYPE = `
  SELECT id, content FROM memories 
  WHERE type = ? AND archived = 0
  ORDER BY created_at DESC
  LIMIT ? OFFSET ?
`;

/**
 * Find memories by pattern
 */
export const FIND_BY_PATTERN = `
  SELECT m.id, m.content FROM memories m
  JOIN memory_patterns mp ON m.id = mp.memory_id
  WHERE mp.pattern_id = ? AND m.archived = 0
`;

/**
 * Find memories by constraint
 */
export const FIND_BY_CONSTRAINT = `
  SELECT m.id, m.content FROM memories m
  JOIN memory_constraints mc ON m.id = mc.memory_id
  WHERE mc.constraint_id = ? AND m.archived = 0
`;

/**
 * Find memories by file
 */
export const FIND_BY_FILE = `
  SELECT m.id, m.content FROM memories m
  JOIN memory_files mf ON m.id = mf.memory_id
  WHERE mf.file_path = ? AND m.archived = 0
`;

/**
 * Find memories by function
 */
export const FIND_BY_FUNCTION = `
  SELECT m.id, m.content FROM memories m
  JOIN memory_functions mfn ON m.id = mfn.memory_id
  WHERE mfn.function_id = ? AND m.archived = 0
`;

/**
 * Count memories by type
 */
export const COUNT_BY_TYPE = `
  SELECT type, COUNT(*) as count FROM memories 
  WHERE archived = 0
  GROUP BY type
`;

/**
 * Count total memories
 */
export const COUNT_TOTAL = `
  SELECT COUNT(*) as count FROM memories WHERE archived = 0
`;

/**
 * Get memory summaries
 */
export const GET_SUMMARIES = `
  SELECT id, type, summary, confidence, importance, created_at, last_accessed, access_count
  FROM memories
  WHERE archived = 0
  ORDER BY created_at DESC
  LIMIT ? OFFSET ?
`;

/**
 * Update access tracking
 */
export const UPDATE_ACCESS = `
  UPDATE memories 
  SET last_accessed = ?, access_count = access_count + 1
  WHERE id = ?
`;

/**
 * Link memory to pattern
 */
export const LINK_PATTERN = `
  INSERT OR IGNORE INTO memory_patterns (memory_id, pattern_id) VALUES (?, ?)
`;

/**
 * Link memory to constraint
 */
export const LINK_CONSTRAINT = `
  INSERT OR IGNORE INTO memory_constraints (memory_id, constraint_id) VALUES (?, ?)
`;

/**
 * Link memory to file
 */
export const LINK_FILE = `
  INSERT OR REPLACE INTO memory_files (memory_id, file_path, line_start, line_end, content_hash) 
  VALUES (?, ?, ?, ?, ?)
`;

/**
 * Link memory to function
 */
export const LINK_FUNCTION = `
  INSERT OR IGNORE INTO memory_functions (memory_id, function_id) VALUES (?, ?)
`;

/**
 * Add relationship
 */
export const ADD_RELATIONSHIP = `
  INSERT OR REPLACE INTO memory_relationships (source_id, target_id, relationship, strength) 
  VALUES (?, ?, ?, ?)
`;

/**
 * Remove relationship
 */
export const REMOVE_RELATIONSHIP = `
  DELETE FROM memory_relationships 
  WHERE source_id = ? AND target_id = ? AND relationship = ?
`;

/**
 * Get related memories
 */
export const GET_RELATED = `
  SELECT m.id, m.content FROM memories m
  JOIN memory_relationships mr ON m.id = mr.target_id
  WHERE mr.source_id = ? AND m.archived = 0
`;

/**
 * Get related memories by type
 */
export const GET_RELATED_BY_TYPE = `
  SELECT m.id, m.content FROM memories m
  JOIN memory_relationships mr ON m.id = mr.target_id
  WHERE mr.source_id = ? AND mr.relationship = ? AND m.archived = 0
`;

/**
 * Insert embedding link
 */
export const INSERT_EMBEDDING_LINK = `
  INSERT OR REPLACE INTO memory_embedding_link (memory_id, embedding_rowid) VALUES (?, ?)
`;

/**
 * Get embedding rowid for memory
 */
export const GET_EMBEDDING_ROWID = `
  SELECT embedding_rowid FROM memory_embedding_link WHERE memory_id = ?
`;
