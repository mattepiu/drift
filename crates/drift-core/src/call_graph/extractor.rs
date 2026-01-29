//! Call graph extractor trait
//!
//! Defines the interface for extracting functions and calls from source code.

use crate::parsers::{ParseResult, Language};
use super::types::{FunctionEntry, CallEntry, DataAccessRef};

/// Extraction result from a single file
#[derive(Debug, Clone)]
pub struct ExtractionResult {
    /// Functions found in the file
    pub functions: Vec<ExtractedFunction>,
    /// Call sites found in the file
    pub calls: Vec<ExtractedCall>,
}

/// An extracted function
#[derive(Debug, Clone)]
pub struct ExtractedFunction {
    pub name: String,
    pub start_line: u32,
    pub end_line: u32,
    pub is_exported: bool,
    pub is_async: bool,
}

/// An extracted call site
#[derive(Debug, Clone)]
pub struct ExtractedCall {
    pub callee_name: String,
    pub line: u32,
    pub receiver: Option<String>,
}

/// Trait for language-specific call graph extraction
pub trait CallGraphExtractor: Send + Sync {
    /// Check if this extractor can handle the given file
    fn can_handle(&self, file: &str) -> bool;
    
    /// Extract functions and calls from parsed source
    fn extract(&self, parse_result: &ParseResult, file: &str) -> ExtractionResult;
    
    /// Get the language this extractor handles
    fn language(&self) -> Language;
}

/// Convert extraction result to function entries
pub fn to_function_entries(
    file: &str,
    extraction: &ExtractionResult,
    data_access: &[DataAccessRef],
) -> Vec<FunctionEntry> {
    let mut entries = Vec::new();
    
    for func in &extraction.functions {
        let fn_id = format!("{}:{}:{}", file, func.name, func.start_line);
        
        // Find calls within this function's range
        let fn_calls: Vec<CallEntry> = extraction.calls
            .iter()
            .filter(|c| c.line >= func.start_line && c.line <= func.end_line)
            .map(|c| CallEntry {
                target: c.callee_name.clone(),
                resolved_id: None,
                resolved: false,
                confidence: 0.0,
                line: c.line,
            })
            .collect();
        
        // Find data access within this function's range
        let fn_data_access: Vec<DataAccessRef> = data_access
            .iter()
            .filter(|da| da.line >= func.start_line && da.line <= func.end_line)
            .cloned()
            .collect();
        
        entries.push(FunctionEntry {
            id: fn_id,
            name: func.name.clone(),
            start_line: func.start_line,
            end_line: func.end_line,
            is_entry_point: func.is_exported,
            is_data_accessor: !fn_data_access.is_empty(),
            calls: fn_calls,
            called_by: Vec::new(),
            data_access: fn_data_access,
        });
    }
    
    entries
}
