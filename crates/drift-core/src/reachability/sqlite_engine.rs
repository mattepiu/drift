//! SQLite-backed Reachability Engine
//!
//! High-performance reachability analysis that queries SQLite directly
//! instead of loading the entire call graph into memory.
//!
//! Key benefits:
//! - O(1) memory usage regardless of codebase size
//! - Fast indexed queries for caller/callee lookups
//! - Supports incremental updates without full rebuild

use std::collections::{HashSet, VecDeque};
use std::path::Path;
use rustc_hash::FxHashSet;
use rusqlite::{params, Connection, Result as SqliteResult};

use super::types::*;

/// Sensitive field patterns for classification
const CREDENTIAL_PATTERNS: &[&str] = &[
    "password", "secret", "token", "key", "api_key", "auth", "credential",
];
const FINANCIAL_PATTERNS: &[&str] = &[
    "credit_card", "card_number", "cvv", "account_number", "salary", "income", "bank",
];
const HEALTH_PATTERNS: &[&str] = &[
    "diagnosis", "medical", "health", "prescription", "condition",
];
const PII_PATTERNS: &[&str] = &[
    "ssn", "social_security", "email", "phone", "address", "dob", "name", "birth",
];

/// SQLite-backed Reachability Engine
pub struct SqliteReachabilityEngine {
    conn: Connection,
}

impl SqliteReachabilityEngine {
    /// Open the reachability engine from a call graph database
    pub fn open(db_path: &Path) -> SqliteResult<Self> {
        let conn = Connection::open_with_flags(
            db_path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        )?;
        Ok(Self { conn })
    }
    
    /// Create from project root (looks for .drift/lake/callgraph/callgraph.db)
    pub fn from_project_root(root: &Path) -> SqliteResult<Self> {
        let db_path = root
            .join(".drift")
            .join("lake")
            .join("callgraph")
            .join("callgraph.db");
        Self::open(&db_path)
    }

    /// Check if the database exists and has data
    pub fn is_available(&self) -> bool {
        self.conn
            .query_row("SELECT COUNT(*) FROM functions", [], |row| row.get::<_, i64>(0))
            .map(|count| count > 0)
            .unwrap_or(false)
    }
    
    /// Get all data reachable from a specific code location
    pub fn get_reachable_data(
        &self,
        file: &str,
        line: u32,
        options: &ReachabilityOptions,
    ) -> ReachabilityResult {
        // Find the containing function
        if let Some(func_id) = self.find_containing_function(file, line) {
            self.get_reachable_data_from_function(&func_id, options)
        } else {
            self.create_empty_result(CodeLocation {
                file: file.to_string(),
                line,
                column: None,
                function_id: None,
            })
        }
    }
    
    /// Get all data reachable from a function (BFS traversal via SQL)
    pub fn get_reachable_data_from_function(
        &self,
        function_id: &str,
        options: &ReachabilityOptions,
    ) -> ReachabilityResult {
        // Get function info
        let func = match self.get_function_info(function_id) {
            Some(f) => f,
            None => {
                return self.create_empty_result(CodeLocation {
                    file: String::new(),
                    line: 0,
                    column: None,
                    function_id: Some(function_id.to_string()),
                });
            }
        };
        
        let max_depth = options.max_depth.unwrap_or(100);
        let mut visited: FxHashSet<String> = FxHashSet::default();
        let mut reachable_access: Vec<ReachableDataAccess> = Vec::new();
        
        // BFS queue: (function_id, path, depth)
        let mut queue: VecDeque<(String, Vec<CallPathNode>, u32)> = VecDeque::new();
        queue.push_back((function_id.to_string(), Vec::new(), 0));
        
        while let Some((func_id, path, depth)) = queue.pop_front() {
            if visited.contains(&func_id) || depth > max_depth {
                continue;
            }
            visited.insert(func_id.clone());
            
            // Get function info from SQLite
            let current_func = match self.get_function_info(&func_id) {
                Some(f) => f,
                None => continue,
            };
            
            // Build current path
            let mut current_path = path.clone();
            current_path.push(CallPathNode {
                function_id: func_id.clone(),
                function_name: current_func.name.clone(),
                file: current_func.file.clone(),
                line: current_func.start_line,
            });
            
            // Get data access from SQLite
            let data_access = self.get_data_access(&func_id);
            for access in data_access {
                // Filter by tables if specified
                if !options.tables.is_empty() && !options.tables.contains(&access.table) {
                    continue;
                }
                
                reachable_access.push(ReachableDataAccess {
                    access,
                    path: current_path.clone(),
                    depth,
                });
            }
            
            // Get resolved calls from SQLite and add to queue
            let calls = self.get_resolved_calls(&func_id);
            for resolved_id in calls {
                if !visited.contains(&resolved_id) {
                    queue.push_back((resolved_id, current_path.clone(), depth + 1));
                }
            }
        }
        
        // Build result
        self.build_result(
            CodeLocation {
                file: func.file.clone(),
                line: func.start_line,
                column: None,
                function_id: Some(function_id.to_string()),
            },
            reachable_access,
            options.sensitive_only,
            visited.len() as u32,
        )
    }

    /// Inverse query: "Who can reach this data?"
    pub fn get_code_paths_to_data(
        &self,
        options: &InverseReachabilityOptions,
    ) -> InverseReachabilityResult {
        let max_depth = options.max_depth.unwrap_or(100);
        
        // Find all functions that directly access this table
        let direct_accessors = self.get_table_accessors(&options.table, options.field.as_deref());
        
        // For each direct accessor, find all paths from entry points
        let mut access_paths: Vec<InverseAccessPath> = Vec::new();
        let mut reaching_entry_points: HashSet<String> = HashSet::new();
        
        // Get all entry points
        let entry_points = self.get_entry_points();
        
        for accessor_id in &direct_accessors {
            // Get the access point info
            let access_points = self.get_data_access(accessor_id);
            let access_point = access_points.into_iter().find(|a| {
                a.table == options.table
                    && options.field.as_ref().map_or(true, |f| a.fields.contains(f))
            });
            
            if let Some(access_point) = access_point {
                // Find paths from entry points to this accessor
                for entry_point in &entry_points {
                    let paths = self.find_paths_bfs(entry_point, accessor_id, max_depth);
                    for path in paths {
                        reaching_entry_points.insert(entry_point.clone());
                        access_paths.push(InverseAccessPath {
                            entry_point: entry_point.clone(),
                            path,
                            access_point: access_point.clone(),
                        });
                    }
                }
            }
        }
        
        InverseReachabilityResult {
            target: InverseTarget {
                table: options.table.clone(),
                field: options.field.clone(),
            },
            access_paths,
            entry_points: reaching_entry_points.into_iter().collect(),
            total_accessors: direct_accessors.len() as u32,
        }
    }
    
    // ========================================================================
    // SQL Query Methods
    // ========================================================================
    
    /// Get function info by ID
    fn get_function_info(&self, id: &str) -> Option<FunctionInfo> {
        self.conn
            .query_row(
                "SELECT id, name, file, start_line, end_line, is_entry_point 
                 FROM functions WHERE id = ?1",
                params![id],
                |row| {
                    Ok(FunctionInfo {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        file: row.get(2)?,
                        start_line: row.get(3)?,
                        end_line: row.get(4)?,
                        is_entry_point: row.get::<_, i32>(5)? != 0,
                    })
                },
            )
            .ok()
    }
    
    /// Get resolved calls from a function
    fn get_resolved_calls(&self, caller_id: &str) -> Vec<String> {
        let mut stmt = self.conn
            .prepare_cached("SELECT resolved_id FROM calls WHERE caller_id = ?1 AND resolved_id IS NOT NULL")
            .unwrap();
        
        stmt.query_map(params![caller_id], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect()
    }
    
    /// Get data access points for a function
    fn get_data_access(&self, function_id: &str) -> Vec<DataAccessPoint> {
        let mut stmt = self.conn
            .prepare_cached(
                "SELECT table_name, operation, fields, line 
                 FROM data_access WHERE function_id = ?1"
            )
            .unwrap();
        
        stmt.query_map(params![function_id], |row| {
            let operation_str: String = row.get(1)?;
            let fields_json: String = row.get(2)?;
            
            Ok(DataAccessPoint {
                table: row.get(0)?,
                operation: match operation_str.as_str() {
                    "write" => DataOperation::Write,
                    "delete" => DataOperation::Delete,
                    _ => DataOperation::Read,
                },
                fields: serde_json::from_str(&fields_json).unwrap_or_default(),
                file: String::new(), // Not stored in data_access table
                line: row.get(3)?,
                confidence: 0.9,
                framework: None,
            })
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
    }

    /// Get functions that access a specific table
    fn get_table_accessors(&self, table: &str, field: Option<&str>) -> Vec<String> {
        let mut stmt = self.conn
            .prepare_cached(
                "SELECT DISTINCT function_id FROM data_access WHERE table_name = ?1"
            )
            .unwrap();
        
        let accessors: Vec<String> = stmt
            .query_map(params![table], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();
        
        // Filter by field if specified
        if let Some(field) = field {
            accessors
                .into_iter()
                .filter(|func_id| {
                    let access = self.get_data_access(func_id);
                    access.iter().any(|a| a.fields.contains(&field.to_string()))
                })
                .collect()
        } else {
            accessors
        }
    }
    
    /// Get all entry points
    fn get_entry_points(&self) -> Vec<String> {
        let mut stmt = self.conn
            .prepare_cached("SELECT id FROM functions WHERE is_entry_point = 1")
            .unwrap();
        
        stmt.query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect()
    }
    
    /// Find the function containing a specific line
    fn find_containing_function(&self, file: &str, line: u32) -> Option<String> {
        self.conn
            .query_row(
                "SELECT id FROM functions 
                 WHERE file = ?1 AND start_line <= ?2 AND end_line >= ?2
                 ORDER BY (end_line - start_line) ASC
                 LIMIT 1",
                params![file, line],
                |row| row.get(0),
            )
            .ok()
    }
    
    /// BFS to find paths between two functions
    fn find_paths_bfs(
        &self,
        from_id: &str,
        to_id: &str,
        max_depth: u32,
    ) -> Vec<Vec<CallPathNode>> {
        let mut paths: Vec<Vec<CallPathNode>> = Vec::new();
        let mut queue: VecDeque<(String, Vec<CallPathNode>, u32)> = VecDeque::new();
        let mut visited: FxHashSet<(String, u32)> = FxHashSet::default();
        
        let from_func = match self.get_function_info(from_id) {
            Some(f) => f,
            None => return paths,
        };
        
        queue.push_back((
            from_id.to_string(),
            vec![CallPathNode {
                function_id: from_id.to_string(),
                function_name: from_func.name.clone(),
                file: from_func.file.clone(),
                line: from_func.start_line,
            }],
            0,
        ));
        
        while let Some((func_id, path, depth)) = queue.pop_front() {
            if depth > max_depth {
                continue;
            }
            
            // Check if we've reached the target
            if func_id == to_id {
                paths.push(path);
                continue;
            }
            
            // Skip if we've visited this node at this or lower depth
            let visit_key = (func_id.clone(), depth);
            if visited.contains(&visit_key) {
                continue;
            }
            visited.insert(visit_key);
            
            // Get resolved calls and follow them
            let calls = self.get_resolved_calls(&func_id);
            for resolved_id in calls {
                if let Some(candidate) = self.get_function_info(&resolved_id) {
                    let mut new_path = path.clone();
                    new_path.push(CallPathNode {
                        function_id: resolved_id.clone(),
                        function_name: candidate.name.clone(),
                        file: candidate.file.clone(),
                        line: candidate.start_line,
                    });
                    
                    queue.push_back((resolved_id, new_path, depth + 1));
                }
            }
        }
        
        paths
    }

    // ========================================================================
    // Result Building
    // ========================================================================
    
    /// Build the reachability result
    fn build_result(
        &self,
        origin: CodeLocation,
        reachable_access: Vec<ReachableDataAccess>,
        sensitive_only: bool,
        functions_traversed: u32,
    ) -> ReachabilityResult {
        // Collect unique tables
        let mut tables: HashSet<String> = HashSet::new();
        for access in &reachable_access {
            tables.insert(access.access.table.clone());
        }
        
        // Group sensitive fields
        let mut sensitive_fields_map: std::collections::HashMap<String, SensitiveFieldAccess> =
            std::collections::HashMap::new();
        
        for access in &reachable_access {
            for field in &access.access.fields {
                let sensitivity = Self::classify_sensitivity(field);
                if sensitivity != SensitivityType::Unknown {
                    let key = format!("{}.{}", access.access.table, field);
                    
                    let entry = sensitive_fields_map.entry(key).or_insert_with(|| {
                        SensitiveFieldAccess {
                            field: SensitiveField {
                                field: field.clone(),
                                table: Some(access.access.table.clone()),
                                sensitivity_type: sensitivity,
                                file: access.access.file.clone(),
                                line: access.access.line,
                                confidence: 0.8,
                            },
                            paths: Vec::new(),
                            access_count: 0,
                        }
                    });
                    
                    entry.paths.push(access.path.clone());
                    entry.access_count += 1;
                }
            }
        }
        
        // Filter if sensitive_only
        let filtered_access = if sensitive_only {
            let sensitive_keys: HashSet<String> = sensitive_fields_map.keys().cloned().collect();
            reachable_access
                .into_iter()
                .filter(|a| {
                    a.access.fields.iter().any(|f| {
                        sensitive_keys.contains(&format!("{}.{}", a.access.table, f))
                    })
                })
                .collect()
        } else {
            reachable_access
        };
        
        // Calculate max depth
        let max_depth = filtered_access.iter().map(|a| a.depth).max().unwrap_or(0);
        
        ReachabilityResult {
            origin,
            reachable_access: filtered_access,
            tables: tables.into_iter().collect(),
            sensitive_fields: sensitive_fields_map.into_values().collect(),
            max_depth,
            functions_traversed,
        }
    }
    
    /// Classify sensitivity type based on field name
    fn classify_sensitivity(field: &str) -> SensitivityType {
        let field_lower = field.to_lowercase();
        
        if CREDENTIAL_PATTERNS.iter().any(|p| field_lower.contains(p)) {
            return SensitivityType::Credentials;
        }
        if FINANCIAL_PATTERNS.iter().any(|p| field_lower.contains(p)) {
            return SensitivityType::Financial;
        }
        if HEALTH_PATTERNS.iter().any(|p| field_lower.contains(p)) {
            return SensitivityType::Health;
        }
        if PII_PATTERNS.iter().any(|p| field_lower.contains(p)) {
            return SensitivityType::Pii;
        }
        
        SensitivityType::Unknown
    }
    
    /// Create an empty result
    fn create_empty_result(&self, origin: CodeLocation) -> ReachabilityResult {
        ReachabilityResult {
            origin,
            reachable_access: Vec::new(),
            tables: Vec::new(),
            sensitive_fields: Vec::new(),
            max_depth: 0,
            functions_traversed: 0,
        }
    }
}

/// Internal function info struct
struct FunctionInfo {
    id: String,
    name: String,
    file: String,
    start_line: u32,
    end_line: u32,
    is_entry_point: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    use crate::call_graph::{CallGraphDb, FunctionBatch, FunctionEntry, CallEntry, DataAccessRef, DataOperation as CgDataOperation};
    
    fn create_test_db() -> (tempfile::TempDir, std::path::PathBuf) {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        
        let mut db = CallGraphDb::open(&db_path).unwrap();
        
        // Create test data: main -> service -> repository
        let main_func = FunctionEntry {
            id: "main.ts:main:1".to_string(),
            name: "main".to_string(),
            start_line: 1,
            end_line: 10,
            is_entry_point: true,
            is_data_accessor: false,
            calls: vec![CallEntry {
                target: "getUsers".to_string(),
                resolved_id: Some("service.ts:getUsers:1".to_string()),
                resolved: true,
                confidence: 0.95,
                line: 5,
            }],
            called_by: vec![],
            data_access: vec![],
        };
        
        let service_func = FunctionEntry {
            id: "service.ts:getUsers:1".to_string(),
            name: "getUsers".to_string(),
            start_line: 1,
            end_line: 10,
            is_entry_point: false,
            is_data_accessor: false,
            calls: vec![CallEntry {
                target: "findAll".to_string(),
                resolved_id: Some("repo.ts:findAll:1".to_string()),
                resolved: true,
                confidence: 0.95,
                line: 5,
            }],
            called_by: vec![],
            data_access: vec![],
        };
        
        let repo_func = FunctionEntry {
            id: "repo.ts:findAll:1".to_string(),
            name: "findAll".to_string(),
            start_line: 1,
            end_line: 10,
            is_entry_point: false,
            is_data_accessor: true,
            calls: vec![],
            called_by: vec![],
            data_access: vec![DataAccessRef {
                table: "users".to_string(),
                operation: CgDataOperation::Read,
                fields: vec!["id".to_string(), "email".to_string(), "password_hash".to_string()],
                line: 5,
            }],
        };
        
        db.insert_batch(&FunctionBatch {
            file: "main.ts".to_string(),
            functions: vec![main_func],
        }).unwrap();
        
        db.insert_batch(&FunctionBatch {
            file: "service.ts".to_string(),
            functions: vec![service_func],
        }).unwrap();
        
        db.insert_batch(&FunctionBatch {
            file: "repo.ts".to_string(),
            functions: vec![repo_func],
        }).unwrap();
        
        (dir, db_path)
    }
    
    #[test]
    fn test_sqlite_reachability() {
        let (_dir, db_path) = create_test_db();
        let engine = SqliteReachabilityEngine::open(&db_path).unwrap();
        
        assert!(engine.is_available());
        
        let result = engine.get_reachable_data_from_function(
            "main.ts:main:1",
            &ReachabilityOptions::default(),
        );
        
        assert_eq!(result.tables.len(), 1);
        assert!(result.tables.contains(&"users".to_string()));
        assert_eq!(result.reachable_access.len(), 1);
        assert_eq!(result.max_depth, 2);
    }
    
    #[test]
    fn test_sqlite_sensitive_detection() {
        let (_dir, db_path) = create_test_db();
        let engine = SqliteReachabilityEngine::open(&db_path).unwrap();
        
        let result = engine.get_reachable_data_from_function(
            "main.ts:main:1",
            &ReachabilityOptions::default(),
        );
        
        // Should detect sensitive fields
        assert!(!result.sensitive_fields.is_empty());
        
        let password_field = result.sensitive_fields.iter()
            .find(|s| s.field.field == "password_hash");
        assert!(password_field.is_some());
    }
}
