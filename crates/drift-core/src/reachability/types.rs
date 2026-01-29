//! Reachability types

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Code location
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeLocation {
    pub file: String,
    pub line: u32,
    pub column: Option<u32>,
    pub function_id: Option<String>,
}

/// A node in a call path
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallPathNode {
    pub function_id: String,
    pub function_name: String,
    pub file: String,
    pub line: u32,
}

/// Data access point
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataAccessPoint {
    pub table: String,
    pub operation: DataOperation,
    pub fields: Vec<String>,
    pub file: String,
    pub line: u32,
    pub confidence: f32,
    pub framework: Option<String>,
}

/// Data operation type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DataOperation {
    Read,
    Write,
    Delete,
}

/// Sensitivity type for fields
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SensitivityType {
    Pii,
    Credentials,
    Financial,
    Health,
    Unknown,
}

/// Sensitive field information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SensitiveField {
    pub field: String,
    pub table: Option<String>,
    pub sensitivity_type: SensitivityType,
    pub file: String,
    pub line: u32,
    pub confidence: f32,
}

/// A reachable data access with path
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReachableDataAccess {
    pub access: DataAccessPoint,
    pub path: Vec<CallPathNode>,
    pub depth: u32,
}

/// Sensitive field access info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SensitiveFieldAccess {
    pub field: SensitiveField,
    pub paths: Vec<Vec<CallPathNode>>,
    pub access_count: u32,
}

/// Reachability query options
#[derive(Debug, Clone, Default)]
pub struct ReachabilityOptions {
    /// Maximum depth to traverse
    pub max_depth: Option<u32>,
    /// Only include paths to sensitive data
    pub sensitive_only: bool,
    /// Filter by table names
    pub tables: Vec<String>,
    /// Include unresolved calls in traversal
    pub include_unresolved: bool,
}

/// Result of reachability analysis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReachabilityResult {
    pub origin: CodeLocation,
    pub reachable_access: Vec<ReachableDataAccess>,
    pub tables: Vec<String>,
    pub sensitive_fields: Vec<SensitiveFieldAccess>,
    pub max_depth: u32,
    pub functions_traversed: u32,
}

/// Inverse reachability options
#[derive(Debug, Clone)]
pub struct InverseReachabilityOptions {
    pub table: String,
    pub field: Option<String>,
    pub max_depth: Option<u32>,
}

/// Inverse access path
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InverseAccessPath {
    pub entry_point: String,
    pub path: Vec<CallPathNode>,
    pub access_point: DataAccessPoint,
}

/// Result of inverse reachability query
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InverseReachabilityResult {
    pub target: InverseTarget,
    pub access_paths: Vec<InverseAccessPath>,
    pub entry_points: Vec<String>,
    pub total_accessors: u32,
}

/// Target for inverse query
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InverseTarget {
    pub table: String,
    pub field: Option<String>,
}

/// Function node in the call graph
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionNode {
    pub id: String,
    pub name: String,
    pub qualified_name: String,
    pub file: String,
    pub start_line: u32,
    pub end_line: u32,
    pub calls: Vec<CallSite>,
    pub data_access: Vec<DataAccessPoint>,
    pub is_entry_point: bool,
}

/// Call site
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallSite {
    pub callee_name: String,
    pub resolved: bool,
    pub resolved_candidates: Vec<String>,
    pub line: u32,
}

/// Call graph for reachability analysis
#[derive(Debug, Clone, Default)]
pub struct CallGraph {
    pub functions: HashMap<String, FunctionNode>,
    pub entry_points: Vec<String>,
    pub data_accessors: Vec<String>,
}
