//! Reachability Engine - High-performance BFS traversal
//!
//! Memory-efficient implementation using:
//! - FxHashSet for fast visited tracking
//! - VecDeque for efficient queue operations
//! - Reference-counted paths to avoid copies

use std::collections::{HashSet, VecDeque};
use rustc_hash::FxHashSet;

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

/// Reachability Analysis Engine
pub struct ReachabilityEngine {
    graph: CallGraph,
}

impl ReachabilityEngine {
    /// Create a new reachability engine
    pub fn new(graph: CallGraph) -> Self {
        Self { graph }
    }
    
    /// Get all data reachable from a specific code location
    pub fn get_reachable_data(
        &self,
        file: &str,
        line: u32,
        options: &ReachabilityOptions,
    ) -> ReachabilityResult {
        // Find the containing function
        if let Some(func) = self.find_containing_function(file, line) {
            self.get_reachable_data_from_function(&func.id.clone(), options)
        } else {
            self.create_empty_result(CodeLocation {
                file: file.to_string(),
                line,
                column: None,
                function_id: None,
            })
        }
    }
    
    /// Get all data reachable from a function
    pub fn get_reachable_data_from_function(
        &self,
        function_id: &str,
        options: &ReachabilityOptions,
    ) -> ReachabilityResult {
        let func = match self.graph.functions.get(function_id) {
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
        
        let max_depth = options.max_depth.unwrap_or(u32::MAX);
        let mut visited: FxHashSet<String> = FxHashSet::default();
        let mut reachable_access: Vec<ReachableDataAccess> = Vec::new();
        
        // BFS queue: (function_id, path, depth)
        let mut queue: VecDeque<(String, Vec<CallPathNode>, u32)> = VecDeque::new();
        
        // Start from the given function
        queue.push_back((function_id.to_string(), Vec::new(), 0));
        
        while let Some((func_id, path, depth)) = queue.pop_front() {
            if visited.contains(&func_id) || depth > max_depth {
                continue;
            }
            visited.insert(func_id.clone());
            
            let current_func = match self.graph.functions.get(&func_id) {
                Some(f) => f,
                None => continue,
            };
            
            // Build current path
            let mut current_path = path.clone();
            current_path.push(CallPathNode {
                function_id: func_id.clone(),
                function_name: current_func.qualified_name.clone(),
                file: current_func.file.clone(),
                line: current_func.start_line,
            });
            
            // Collect data access from this function
            for access in &current_func.data_access {
                // Filter by tables if specified
                if !options.tables.is_empty() && !options.tables.contains(&access.table) {
                    continue;
                }
                
                reachable_access.push(ReachableDataAccess {
                    access: access.clone(),
                    path: current_path.clone(),
                    depth,
                });
            }
            
            // Follow calls to other functions
            for call in &current_func.calls {
                if !call.resolved && !options.include_unresolved {
                    continue;
                }
                
                for candidate_id in &call.resolved_candidates {
                    if !visited.contains(candidate_id) {
                        queue.push_back((
                            candidate_id.clone(),
                            current_path.clone(),
                            depth + 1,
                        ));
                    }
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
    
    /// Get the call path from a location to a specific data access point
    pub fn get_call_path(
        &self,
        file: &str,
        line: u32,
        to_table: &str,
        to_field: Option<&str>,
    ) -> Vec<Vec<CallPathNode>> {
        let options = ReachabilityOptions {
            tables: vec![to_table.to_string()],
            ..Default::default()
        };
        
        let result = self.get_reachable_data(file, line, &options);
        
        result.reachable_access
            .into_iter()
            .filter(|access| {
                to_field.map_or(true, |f| access.access.fields.contains(&f.to_string()))
            })
            .map(|access| access.path)
            .collect()
    }
    
    /// Inverse query: "Who can reach this data?"
    pub fn get_code_paths_to_data(
        &self,
        options: &InverseReachabilityOptions,
    ) -> InverseReachabilityResult {
        let max_depth = options.max_depth.unwrap_or(u32::MAX);
        
        // Find all functions that directly access this table
        let mut direct_accessors: Vec<String> = Vec::new();
        
        for func_id in &self.graph.data_accessors {
            if let Some(func) = self.graph.functions.get(func_id) {
                for access in &func.data_access {
                    if access.table == options.table {
                        if options.field.as_ref().map_or(true, |f| access.fields.contains(f)) {
                            direct_accessors.push(func_id.clone());
                            break;
                        }
                    }
                }
            }
        }
        
        // For each direct accessor, find all paths from entry points
        let mut access_paths: Vec<InverseAccessPath> = Vec::new();
        let mut reaching_entry_points: HashSet<String> = HashSet::new();
        
        for accessor_id in &direct_accessors {
            if let Some(accessor) = self.graph.functions.get(accessor_id) {
                // Find the specific access point
                let access_point = accessor.data_access.iter().find(|a| {
                    a.table == options.table
                        && options.field.as_ref().map_or(true, |f| a.fields.contains(f))
                });
                
                if let Some(access_point) = access_point {
                    // Find paths from entry points to this accessor
                    let paths = self.find_paths_to_function(accessor_id, max_depth);
                    
                    for (entry_point, path) in paths {
                        reaching_entry_points.insert(entry_point.clone());
                        access_paths.push(InverseAccessPath {
                            entry_point,
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
    
    /// Find all paths from entry points to a specific function
    fn find_paths_to_function(
        &self,
        target_id: &str,
        max_depth: u32,
    ) -> Vec<(String, Vec<CallPathNode>)> {
        let mut results: Vec<(String, Vec<CallPathNode>)> = Vec::new();
        
        for entry_point_id in &self.graph.entry_points {
            let paths = self.find_paths_bfs(entry_point_id, target_id, max_depth);
            for path in paths {
                results.push((entry_point_id.clone(), path));
            }
        }
        
        results
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
        
        let from_func = match self.graph.functions.get(from_id) {
            Some(f) => f,
            None => return paths,
        };
        
        queue.push_back((
            from_id.to_string(),
            vec![CallPathNode {
                function_id: from_id.to_string(),
                function_name: from_func.qualified_name.clone(),
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
            
            let current_func = match self.graph.functions.get(&func_id) {
                Some(f) => f,
                None => continue,
            };
            
            // Follow calls
            for call in &current_func.calls {
                if !call.resolved {
                    continue;
                }
                
                for candidate_id in &call.resolved_candidates {
                    if let Some(candidate) = self.graph.functions.get(candidate_id) {
                        let mut new_path = path.clone();
                        new_path.push(CallPathNode {
                            function_id: candidate_id.clone(),
                            function_name: candidate.qualified_name.clone(),
                            file: candidate.file.clone(),
                            line: candidate.start_line,
                        });
                        
                        queue.push_back((candidate_id.clone(), new_path, depth + 1));
                    }
                }
            }
        }
        
        paths
    }
    
    /// Find the function containing a specific line
    fn find_containing_function(&self, file: &str, line: u32) -> Option<&FunctionNode> {
        let mut best: Option<&FunctionNode> = None;
        let mut best_size = u32::MAX;
        
        for func in self.graph.functions.values() {
            if func.file == file && line >= func.start_line && line <= func.end_line {
                let size = func.end_line - func.start_line;
                if size < best_size {
                    best = Some(func);
                    best_size = size;
                }
            }
        }
        
        best
    }
    
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
                let sensitivity = self.classify_sensitivity(field);
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
    fn classify_sensitivity(&self, field: &str) -> SensitivityType {
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

#[cfg(test)]
mod tests {
    use super::*;
    
    fn create_test_graph() -> CallGraph {
        let mut graph = CallGraph::default();
        
        // Create a simple call chain: main -> service -> repository
        graph.functions.insert(
            "main.ts:main:1".to_string(),
            FunctionNode {
                id: "main.ts:main:1".to_string(),
                name: "main".to_string(),
                qualified_name: "main".to_string(),
                file: "main.ts".to_string(),
                start_line: 1,
                end_line: 10,
                calls: vec![CallSite {
                    callee_name: "getUsers".to_string(),
                    resolved: true,
                    resolved_candidates: vec!["service.ts:getUsers:1".to_string()],
                    line: 5,
                }],
                data_access: Vec::new(),
                is_entry_point: true,
            },
        );
        
        graph.functions.insert(
            "service.ts:getUsers:1".to_string(),
            FunctionNode {
                id: "service.ts:getUsers:1".to_string(),
                name: "getUsers".to_string(),
                qualified_name: "UserService.getUsers".to_string(),
                file: "service.ts".to_string(),
                start_line: 1,
                end_line: 10,
                calls: vec![CallSite {
                    callee_name: "findAll".to_string(),
                    resolved: true,
                    resolved_candidates: vec!["repo.ts:findAll:1".to_string()],
                    line: 5,
                }],
                data_access: Vec::new(),
                is_entry_point: false,
            },
        );
        
        graph.functions.insert(
            "repo.ts:findAll:1".to_string(),
            FunctionNode {
                id: "repo.ts:findAll:1".to_string(),
                name: "findAll".to_string(),
                qualified_name: "UserRepository.findAll".to_string(),
                file: "repo.ts".to_string(),
                start_line: 1,
                end_line: 10,
                calls: Vec::new(),
                data_access: vec![DataAccessPoint {
                    table: "users".to_string(),
                    operation: DataOperation::Read,
                    fields: vec!["id".to_string(), "email".to_string(), "password_hash".to_string()],
                    file: "repo.ts".to_string(),
                    line: 5,
                    confidence: 0.9,
                    framework: Some("prisma".to_string()),
                }],
                is_entry_point: false,
            },
        );
        
        graph.entry_points = vec!["main.ts:main:1".to_string()];
        graph.data_accessors = vec!["repo.ts:findAll:1".to_string()];
        
        graph
    }
    
    #[test]
    fn test_reachability_from_function() {
        let graph = create_test_graph();
        let engine = ReachabilityEngine::new(graph);
        
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
    fn test_sensitive_field_detection() {
        let graph = create_test_graph();
        let engine = ReachabilityEngine::new(graph);
        
        let result = engine.get_reachable_data_from_function(
            "main.ts:main:1",
            &ReachabilityOptions::default(),
        );
        
        // Should detect both email (PII) and password_hash (Credentials) as sensitive
        assert!(!result.sensitive_fields.is_empty());
        
        // Find the password_hash field specifically
        let password_field = result.sensitive_fields.iter()
            .find(|s| s.field.field == "password_hash");
        assert!(password_field.is_some(), "Should detect password_hash as sensitive");
        assert_eq!(password_field.unwrap().field.sensitivity_type, SensitivityType::Credentials);
        
        // Find the email field specifically
        let email_field = result.sensitive_fields.iter()
            .find(|s| s.field.field == "email");
        assert!(email_field.is_some(), "Should detect email as sensitive");
        assert_eq!(email_field.unwrap().field.sensitivity_type, SensitivityType::Pii);
    }
    
    #[test]
    fn test_inverse_reachability() {
        let graph = create_test_graph();
        let engine = ReachabilityEngine::new(graph);
        
        let result = engine.get_code_paths_to_data(&InverseReachabilityOptions {
            table: "users".to_string(),
            field: None,
            max_depth: None,
        });
        
        assert_eq!(result.total_accessors, 1);
        assert!(!result.entry_points.is_empty());
    }
}
