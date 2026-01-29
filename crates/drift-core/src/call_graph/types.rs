//! Call graph types
//!
//! Core data structures for call graph building and storage.

use serde::{Deserialize, Serialize};

/// A function entry in the call graph
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionEntry {
    /// Unique ID: "file:name:line"
    pub id: String,
    /// Function name
    pub name: String,
    /// Start line in source
    pub start_line: u32,
    /// End line in source
    pub end_line: u32,
    /// Is this an entry point (exported, route handler, etc.)?
    pub is_entry_point: bool,
    /// Does this function access data?
    pub is_data_accessor: bool,
    /// Calls made by this function
    pub calls: Vec<CallEntry>,
    /// Functions that call this one (populated during index building)
    pub called_by: Vec<String>,
    /// Data access points in this function
    pub data_access: Vec<DataAccessRef>,
}

/// A call site with resolution information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallEntry {
    /// Target function name (as written in code)
    pub target: String,
    /// Resolved function ID (if resolved)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolved_id: Option<String>,
    /// Whether the call was resolved
    pub resolved: bool,
    /// Resolution confidence (0.0-1.0)
    pub confidence: f32,
    /// Line number of the call
    pub line: u32,
}

/// A data access reference
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataAccessRef {
    /// Table/collection name
    pub table: String,
    /// Fields accessed
    pub fields: Vec<String>,
    /// Operation type
    pub operation: DataOperation,
    /// Line number
    pub line: u32,
}

/// Data operation type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DataOperation {
    Read,
    Write,
    Delete,
}


/// A call graph shard - functions in a single file
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallGraphShard {
    /// Source file path (relative to project root)
    pub file: String,
    /// Functions in this file
    pub functions: Vec<FunctionEntry>,
}

/// Result of building the call graph
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildResult {
    /// Total files processed
    pub files_processed: usize,
    /// Total functions extracted
    pub total_functions: usize,
    /// Total call sites found
    pub total_calls: usize,
    /// Resolved call sites
    pub resolved_calls: usize,
    /// Resolution rate (0.0-1.0)
    pub resolution_rate: f32,
    /// Entry points found
    pub entry_points: usize,
    /// Data accessors found
    pub data_accessors: usize,
    /// Files that had errors
    pub errors: Vec<String>,
    /// Duration in milliseconds
    pub duration_ms: u64,
}

/// Call graph index summary
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallGraphIndex {
    /// Schema version
    pub version: String,
    /// When generated
    pub generated_at: String,
    /// Summary statistics
    pub summary: CallGraphSummary,
    /// File entries
    pub files: Vec<FileIndexEntry>,
    /// Top entry points
    pub top_entry_points: Vec<EntryPointSummary>,
    /// Top data accessors
    pub top_data_accessors: Vec<DataAccessorSummary>,
}

/// Call graph summary statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallGraphSummary {
    pub total_files: usize,
    pub total_functions: usize,
    pub total_calls: usize,
    pub resolved_calls: usize,
    pub unresolved_calls: usize,
    pub resolution_rate: f32,
    pub entry_points: usize,
    pub data_accessors: usize,
    pub avg_depth: f32,
}

/// File index entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileIndexEntry {
    pub file: String,
    pub file_hash: String,
    pub function_count: usize,
    pub entry_point_count: usize,
    pub data_accessor_count: usize,
    pub last_updated: String,
}

/// Entry point summary
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntryPointSummary {
    pub id: String,
    pub name: String,
    pub file: String,
    pub line: u32,
    pub reachable_functions: usize,
    pub reachable_tables: usize,
}

/// Data accessor summary
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataAccessorSummary {
    pub id: String,
    pub name: String,
    pub file: String,
    pub line: u32,
    pub tables: Vec<String>,
    pub operations: Vec<String>,
}

/// Resolution index entry (for disk-backed resolution)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolutionEntry {
    pub name: String,
    pub id: String,
    pub file: String,
}
