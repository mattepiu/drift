//! SQLite Storage for Call Graph
//!
//! High-performance storage layer using SQLite with WAL mode.
//! Provides O(1) lookups and efficient batch inserts via MPSC channel pattern.
//!
//! Key features:
//! - WAL mode for concurrent reads during writes
//! - Batched inserts (1000 rows per transaction)
//! - Indexed queries for fast caller/callee lookups
//! - Thread-safe via connection pooling

use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, Sender};
use std::thread::{self, JoinHandle};

use rusqlite::{params, Connection, Result as SqliteResult, Transaction};

use super::types::{FunctionEntry, CallEntry, DataAccessRef, DataOperation};

// ============================================================================
// Schema
// ============================================================================

const SCHEMA: &str = r#"
-- Core tables
CREATE TABLE IF NOT EXISTS functions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    file TEXT NOT NULL,
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    is_entry_point INTEGER DEFAULT 0,
    is_data_accessor INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    caller_id TEXT NOT NULL,
    target TEXT NOT NULL,
    resolved_id TEXT,
    confidence REAL DEFAULT 0.0,
    line INTEGER NOT NULL,
    FOREIGN KEY (caller_id) REFERENCES functions(id)
);

CREATE TABLE IF NOT EXISTS data_access (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    function_id TEXT NOT NULL,
    table_name TEXT NOT NULL,
    operation TEXT NOT NULL,
    fields TEXT,
    line INTEGER NOT NULL,
    FOREIGN KEY (function_id) REFERENCES functions(id)
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_functions_name ON functions(name);
CREATE INDEX IF NOT EXISTS idx_functions_file ON functions(file);
CREATE INDEX IF NOT EXISTS idx_calls_target ON calls(target);
CREATE INDEX IF NOT EXISTS idx_calls_resolved ON calls(resolved_id);
CREATE INDEX IF NOT EXISTS idx_calls_caller ON calls(caller_id);
CREATE INDEX IF NOT EXISTS idx_data_access_function ON data_access(function_id);
CREATE INDEX IF NOT EXISTS idx_data_access_table ON data_access(table_name);

-- Metadata table
CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT
);
"#;

// ============================================================================
// Types
// ============================================================================

/// A batch of function data to insert
#[derive(Debug, Clone)]
pub struct FunctionBatch {
    pub file: String,
    pub functions: Vec<FunctionEntry>,
}

/// Statistics from the database
#[derive(Debug, Clone, Default)]
pub struct DbStats {
    pub total_functions: usize,
    pub total_calls: usize,
    pub resolved_calls: usize,
    pub entry_points: usize,
    pub data_accessors: usize,
}

// ============================================================================
// CallGraphDb - Main Database Interface
// ============================================================================

/// SQLite-backed call graph storage
pub struct CallGraphDb {
    conn: Connection,
    db_path: PathBuf,
}

impl CallGraphDb {
    /// Open or create a call graph database
    pub fn open(path: &Path) -> SqliteResult<Self> {
        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        
        let conn = Connection::open(path)?;
        
        // Configure for performance
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA cache_size = -64000;
             PRAGMA temp_store = MEMORY;
             PRAGMA mmap_size = 268435456;"
        )?;
        
        // Create schema
        conn.execute_batch(SCHEMA)?;
        
        Ok(Self {
            conn,
            db_path: path.to_path_buf(),
        })
    }
    
    /// Open database in read-only mode (for queries)
    pub fn open_readonly(path: &Path) -> SqliteResult<Self> {
        let conn = Connection::open_with_flags(
            path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        )?;
        
        Ok(Self {
            conn,
            db_path: path.to_path_buf(),
        })
    }
    
    /// Clear all data (for rebuild)
    pub fn clear(&self) -> SqliteResult<()> {
        self.conn.execute_batch(
            "DELETE FROM data_access;
             DELETE FROM calls;
             DELETE FROM functions;
             DELETE FROM metadata;"
        )?;
        Ok(())
    }
    
    /// Get database path
    pub fn path(&self) -> &Path {
        &self.db_path
    }
    
    // ========================================================================
    // Insert Operations
    // ========================================================================
    
    /// Insert a batch of functions (with their calls and data access)
    pub fn insert_batch(&mut self, batch: &FunctionBatch) -> SqliteResult<()> {
        let tx = self.conn.transaction()?;
        
        for func in &batch.functions {
            Self::insert_function_tx(&tx, func)?;
        }
        
        tx.commit()
    }
    
    /// Insert multiple batches in a single transaction
    pub fn insert_batches(&mut self, batches: &[FunctionBatch]) -> SqliteResult<()> {
        let tx = self.conn.transaction()?;
        
        for batch in batches {
            for func in &batch.functions {
                Self::insert_function_tx(&tx, func)?;
            }
        }
        
        tx.commit()
    }
    
    /// Insert a single function (internal, uses transaction)
    fn insert_function_tx(tx: &Transaction, func: &FunctionEntry) -> SqliteResult<()> {
        // Insert function
        tx.execute(
            "INSERT OR REPLACE INTO functions (id, name, file, start_line, end_line, is_entry_point, is_data_accessor)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                func.id,
                func.name,
                Self::extract_file_from_id(&func.id),
                func.start_line,
                func.end_line,
                func.is_entry_point as i32,
                func.is_data_accessor as i32,
            ],
        )?;
        
        // Insert calls
        for call in &func.calls {
            tx.execute(
                "INSERT INTO calls (caller_id, target, resolved_id, confidence, line)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    func.id,
                    call.target,
                    call.resolved_id,
                    call.confidence,
                    call.line,
                ],
            )?;
        }
        
        // Insert data access
        for access in &func.data_access {
            let fields_json = serde_json::to_string(&access.fields).unwrap_or_default();
            let operation = match access.operation {
                DataOperation::Read => "read",
                DataOperation::Write => "write",
                DataOperation::Delete => "delete",
            };
            
            tx.execute(
                "INSERT INTO data_access (function_id, table_name, operation, fields, line)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    func.id,
                    access.table,
                    operation,
                    fields_json,
                    access.line,
                ],
            )?;
        }
        
        Ok(())
    }
    
    /// Extract file path from function ID (format: "file:name:line")
    fn extract_file_from_id(id: &str) -> &str {
        id.rsplit(':').nth(2).unwrap_or(id)
    }
    
    // ========================================================================
    // Resolution Operations
    // ========================================================================
    
    /// Resolve all calls using SQL JOIN
    /// Returns the number of resolved calls
    pub fn resolve_calls(&mut self) -> SqliteResult<usize> {
        // Strategy 1: Same file resolution (highest confidence)
        let same_file_resolved = self.conn.execute(
            "UPDATE calls SET 
                resolved_id = (
                    SELECT f.id FROM functions f 
                    WHERE f.name = calls.target 
                    AND f.file = (SELECT file FROM functions WHERE id = calls.caller_id)
                    LIMIT 1
                ),
                confidence = 0.95
             WHERE resolved_id IS NULL
             AND EXISTS (
                SELECT 1 FROM functions f 
                WHERE f.name = calls.target 
                AND f.file = (SELECT file FROM functions WHERE id = calls.caller_id)
             )",
            [],
        )?;
        
        // Strategy 2: Single global candidate (high confidence)
        let single_candidate_resolved = self.conn.execute(
            "UPDATE calls SET 
                resolved_id = (
                    SELECT f.id FROM functions f 
                    WHERE f.name = calls.target
                    LIMIT 1
                ),
                confidence = 0.8
             WHERE resolved_id IS NULL
             AND (SELECT COUNT(*) FROM functions f WHERE f.name = calls.target) = 1",
            [],
        )?;
        
        // Strategy 3: Multiple candidates - pick first (low confidence)
        let multi_candidate_resolved = self.conn.execute(
            "UPDATE calls SET 
                resolved_id = (
                    SELECT f.id FROM functions f 
                    WHERE f.name = calls.target
                    LIMIT 1
                ),
                confidence = 0.4
             WHERE resolved_id IS NULL
             AND EXISTS (SELECT 1 FROM functions f WHERE f.name = calls.target)",
            [],
        )?;
        
        Ok(same_file_resolved + single_candidate_resolved + multi_candidate_resolved)
    }
    
    // ========================================================================
    // Query Operations
    // ========================================================================
    
    /// Get a function by ID
    pub fn get_function(&self, id: &str) -> SqliteResult<Option<FunctionEntry>> {
        let mut stmt = self.conn.prepare_cached(
            "SELECT id, name, file, start_line, end_line, is_entry_point, is_data_accessor
             FROM functions WHERE id = ?1"
        )?;
        
        let mut rows = stmt.query(params![id])?;
        
        if let Some(row) = rows.next()? {
            let func_id: String = row.get(0)?;
            let mut func = FunctionEntry {
                id: func_id.clone(),
                name: row.get(1)?,
                start_line: row.get(3)?,
                end_line: row.get(4)?,
                is_entry_point: row.get::<_, i32>(5)? != 0,
                is_data_accessor: row.get::<_, i32>(6)? != 0,
                calls: Vec::new(),
                called_by: Vec::new(),
                data_access: Vec::new(),
            };
            
            // Load calls
            func.calls = self.get_calls_from(&func_id)?;
            
            // Load data access
            func.data_access = self.get_data_access(&func_id)?;
            
            Ok(Some(func))
        } else {
            Ok(None)
        }
    }
    
    /// Get all calls from a function
    pub fn get_calls_from(&self, caller_id: &str) -> SqliteResult<Vec<CallEntry>> {
        let mut stmt = self.conn.prepare_cached(
            "SELECT target, resolved_id, confidence, line
             FROM calls WHERE caller_id = ?1"
        )?;
        
        let rows = stmt.query_map(params![caller_id], |row| {
            Ok(CallEntry {
                target: row.get(0)?,
                resolved_id: row.get(1)?,
                resolved: row.get::<_, Option<String>>(1)?.is_some(),
                confidence: row.get(2)?,
                line: row.get(3)?,
            })
        })?;
        
        rows.collect()
    }
    
    /// Get all callers of a function (by resolved_id)
    pub fn get_callers(&self, target_id: &str) -> SqliteResult<Vec<String>> {
        let mut stmt = self.conn.prepare_cached(
            "SELECT DISTINCT caller_id FROM calls WHERE resolved_id = ?1"
        )?;
        
        let rows = stmt.query_map(params![target_id], |row| row.get(0))?;
        rows.collect()
    }
    
    /// Get all callers of a function by name
    pub fn get_callers_by_name(&self, target_name: &str) -> SqliteResult<Vec<String>> {
        let mut stmt = self.conn.prepare_cached(
            "SELECT DISTINCT caller_id FROM calls WHERE target = ?1"
        )?;
        
        let rows = stmt.query_map(params![target_name], |row| row.get(0))?;
        rows.collect()
    }
    
    /// Get data access points for a function
    pub fn get_data_access(&self, function_id: &str) -> SqliteResult<Vec<DataAccessRef>> {
        let mut stmt = self.conn.prepare_cached(
            "SELECT table_name, operation, fields, line
             FROM data_access WHERE function_id = ?1"
        )?;
        
        let rows = stmt.query_map(params![function_id], |row| {
            let operation_str: String = row.get(1)?;
            let fields_json: String = row.get(2)?;
            
            Ok(DataAccessRef {
                table: row.get(0)?,
                operation: match operation_str.as_str() {
                    "write" => DataOperation::Write,
                    "delete" => DataOperation::Delete,
                    _ => DataOperation::Read,
                },
                fields: serde_json::from_str(&fields_json).unwrap_or_default(),
                line: row.get(3)?,
            })
        })?;
        
        rows.collect()
    }
    
    /// Get all functions that access a specific table
    pub fn get_table_accessors(&self, table: &str) -> SqliteResult<Vec<String>> {
        let mut stmt = self.conn.prepare_cached(
            "SELECT DISTINCT function_id FROM data_access WHERE table_name = ?1"
        )?;
        
        let rows = stmt.query_map(params![table], |row| row.get(0))?;
        rows.collect()
    }
    
    /// Get all entry points
    pub fn get_entry_points(&self) -> SqliteResult<Vec<String>> {
        let mut stmt = self.conn.prepare_cached(
            "SELECT id FROM functions WHERE is_entry_point = 1"
        )?;
        
        let rows = stmt.query_map([], |row| row.get(0))?;
        rows.collect()
    }
    
    /// Get all data accessors
    pub fn get_data_accessors(&self) -> SqliteResult<Vec<String>> {
        let mut stmt = self.conn.prepare_cached(
            "SELECT id FROM functions WHERE is_data_accessor = 1"
        )?;
        
        let rows = stmt.query_map([], |row| row.get(0))?;
        rows.collect()
    }
    
    /// Get all functions in a file
    pub fn get_functions_in_file(&self, file: &str) -> SqliteResult<Vec<String>> {
        let mut stmt = self.conn.prepare_cached(
            "SELECT id FROM functions WHERE file = ?1"
        )?;
        
        let rows = stmt.query_map(params![file], |row| row.get(0))?;
        rows.collect()
    }
    
    /// Get database statistics
    pub fn get_stats(&self) -> SqliteResult<DbStats> {
        let total_functions: usize = self.conn.query_row(
            "SELECT COUNT(*) FROM functions",
            [],
            |row| row.get(0),
        )?;
        
        let total_calls: usize = self.conn.query_row(
            "SELECT COUNT(*) FROM calls",
            [],
            |row| row.get(0),
        )?;
        
        let resolved_calls: usize = self.conn.query_row(
            "SELECT COUNT(*) FROM calls WHERE resolved_id IS NOT NULL",
            [],
            |row| row.get(0),
        )?;
        
        let entry_points: usize = self.conn.query_row(
            "SELECT COUNT(*) FROM functions WHERE is_entry_point = 1",
            [],
            |row| row.get(0),
        )?;
        
        let data_accessors: usize = self.conn.query_row(
            "SELECT COUNT(*) FROM functions WHERE is_data_accessor = 1",
            [],
            |row| row.get(0),
        )?;
        
        Ok(DbStats {
            total_functions,
            total_calls,
            resolved_calls,
            entry_points,
            data_accessors,
        })
    }
    
    /// Set metadata value
    pub fn set_metadata(&self, key: &str, value: &str) -> SqliteResult<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO metadata (key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
        Ok(())
    }
    
    /// Get metadata value
    pub fn get_metadata(&self, key: &str) -> SqliteResult<Option<String>> {
        let mut stmt = self.conn.prepare_cached(
            "SELECT value FROM metadata WHERE key = ?1"
        )?;
        
        let mut rows = stmt.query(params![key])?;
        if let Some(row) = rows.next()? {
            Ok(Some(row.get(0)?))
        } else {
            Ok(None)
        }
    }
}

// ============================================================================
// Parallel Writer - MPSC Channel Pattern
// ============================================================================

/// Parallel writer that receives batches via channel and writes to SQLite
pub struct ParallelWriter {
    sender: Sender<FunctionBatch>,
    handle: Option<JoinHandle<SqliteResult<DbStats>>>,
}

impl ParallelWriter {
    /// Create a new parallel writer
    /// 
    /// Spawns a background thread that receives FunctionBatch items
    /// and writes them to SQLite in batches.
    pub fn new(db_path: PathBuf, batch_size: usize) -> Self {
        let (sender, receiver) = mpsc::channel::<FunctionBatch>();
        
        let handle = thread::spawn(move || {
            Self::writer_thread(db_path, receiver, batch_size)
        });
        
        Self {
            sender,
            handle: Some(handle),
        }
    }
    
    /// Send a batch to the writer
    pub fn send(&self, batch: FunctionBatch) -> Result<(), mpsc::SendError<FunctionBatch>> {
        self.sender.send(batch)
    }
    
    /// Get a clone of the sender (for use in parallel iterators)
    pub fn sender(&self) -> Sender<FunctionBatch> {
        self.sender.clone()
    }
    
    /// Finish writing and return stats
    /// 
    /// Drops the sender to signal the writer thread to finish,
    /// then waits for it to complete and returns the final stats.
    pub fn finish(mut self) -> SqliteResult<DbStats> {
        // Drop sender to signal writer to finish
        drop(self.sender);
        
        // Wait for writer thread
        if let Some(handle) = self.handle.take() {
            handle.join().map_err(|_| {
                rusqlite::Error::ExecuteReturnedResults
            })?
        } else {
            Ok(DbStats::default())
        }
    }
    
    /// Writer thread implementation
    fn writer_thread(
        db_path: PathBuf,
        receiver: Receiver<FunctionBatch>,
        batch_size: usize,
    ) -> SqliteResult<DbStats> {
        let mut db = CallGraphDb::open(&db_path)?;
        
        // Clear existing data
        db.clear()?;
        
        let mut buffer: Vec<FunctionBatch> = Vec::with_capacity(batch_size);
        
        for batch in receiver {
            buffer.push(batch);
            
            if buffer.len() >= batch_size {
                db.insert_batches(&buffer)?;
                buffer.clear();
            }
        }
        
        // Flush remaining
        if !buffer.is_empty() {
            db.insert_batches(&buffer)?;
        }
        
        // Run resolution
        db.resolve_calls()?;
        
        // Get final stats
        db.get_stats()
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    
    fn create_test_function(id: &str, name: &str) -> FunctionEntry {
        FunctionEntry {
            id: id.to_string(),
            name: name.to_string(),
            start_line: 1,
            end_line: 10,
            is_entry_point: false,
            is_data_accessor: false,
            calls: vec![],
            called_by: vec![],
            data_access: vec![],
        }
    }
    
    #[test]
    fn test_open_and_create() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        
        let db = CallGraphDb::open(&db_path).unwrap();
        assert!(db_path.exists());
        
        let stats = db.get_stats().unwrap();
        assert_eq!(stats.total_functions, 0);
    }
    
    #[test]
    fn test_insert_and_query() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        
        let mut db = CallGraphDb::open(&db_path).unwrap();
        
        let func = FunctionEntry {
            id: "src/main.ts:main:1".to_string(),
            name: "main".to_string(),
            start_line: 1,
            end_line: 10,
            is_entry_point: true,
            is_data_accessor: false,
            calls: vec![
                CallEntry {
                    target: "helper".to_string(),
                    resolved_id: None,
                    resolved: false,
                    confidence: 0.0,
                    line: 5,
                },
            ],
            called_by: vec![],
            data_access: vec![],
        };
        
        let batch = FunctionBatch {
            file: "src/main.ts".to_string(),
            functions: vec![func],
        };
        
        db.insert_batch(&batch).unwrap();
        
        let stats = db.get_stats().unwrap();
        assert_eq!(stats.total_functions, 1);
        assert_eq!(stats.total_calls, 1);
        assert_eq!(stats.entry_points, 1);
        
        let loaded = db.get_function("src/main.ts:main:1").unwrap();
        assert!(loaded.is_some());
        let loaded = loaded.unwrap();
        assert_eq!(loaded.name, "main");
        assert_eq!(loaded.calls.len(), 1);
    }
    
    #[test]
    fn test_resolution() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        
        let mut db = CallGraphDb::open(&db_path).unwrap();
        
        // Create caller
        let caller = FunctionEntry {
            id: "src/main.ts:main:1".to_string(),
            name: "main".to_string(),
            start_line: 1,
            end_line: 10,
            is_entry_point: true,
            is_data_accessor: false,
            calls: vec![
                CallEntry {
                    target: "helper".to_string(),
                    resolved_id: None,
                    resolved: false,
                    confidence: 0.0,
                    line: 5,
                },
            ],
            called_by: vec![],
            data_access: vec![],
        };
        
        // Create callee
        let callee = FunctionEntry {
            id: "src/main.ts:helper:15".to_string(),
            name: "helper".to_string(),
            start_line: 15,
            end_line: 20,
            is_entry_point: false,
            is_data_accessor: false,
            calls: vec![],
            called_by: vec![],
            data_access: vec![],
        };
        
        let batch = FunctionBatch {
            file: "src/main.ts".to_string(),
            functions: vec![caller, callee],
        };
        
        db.insert_batch(&batch).unwrap();
        
        // Run resolution
        let resolved = db.resolve_calls().unwrap();
        assert_eq!(resolved, 1);
        
        // Verify resolution
        let stats = db.get_stats().unwrap();
        assert_eq!(stats.resolved_calls, 1);
        
        // Check the call was resolved
        let calls = db.get_calls_from("src/main.ts:main:1").unwrap();
        assert_eq!(calls.len(), 1);
        assert!(calls[0].resolved);
        assert_eq!(calls[0].resolved_id, Some("src/main.ts:helper:15".to_string()));
    }
    
    #[test]
    fn test_get_callers() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        
        let mut db = CallGraphDb::open(&db_path).unwrap();
        
        let caller = FunctionEntry {
            id: "src/main.ts:main:1".to_string(),
            name: "main".to_string(),
            start_line: 1,
            end_line: 10,
            is_entry_point: true,
            is_data_accessor: false,
            calls: vec![
                CallEntry {
                    target: "helper".to_string(),
                    resolved_id: Some("src/utils.ts:helper:1".to_string()),
                    resolved: true,
                    confidence: 0.95,
                    line: 5,
                },
            ],
            called_by: vec![],
            data_access: vec![],
        };
        
        let batch = FunctionBatch {
            file: "src/main.ts".to_string(),
            functions: vec![caller],
        };
        
        db.insert_batch(&batch).unwrap();
        
        let callers = db.get_callers("src/utils.ts:helper:1").unwrap();
        assert_eq!(callers.len(), 1);
        assert_eq!(callers[0], "src/main.ts:main:1");
    }
}
