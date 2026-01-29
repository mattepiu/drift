//! Error handling analyzer - AST-first approach
//!
//! Uses tree-sitter parsed data to detect error handling patterns.
//! Analyzes try/catch blocks, error boundaries, and unhandled error paths.

use std::time::Instant;

use super::types::*;
use crate::parsers::{ParserManager, ParseResult, FunctionInfo, CallSite, ClassInfo};

/// Error handling analyzer - AST-first
pub struct ErrorHandlingAnalyzer {
    parser: ParserManager,
}

impl ErrorHandlingAnalyzer {
    pub fn new() -> Self {
        Self {
            parser: ParserManager::new(),
        }
    }
    
    /// Analyze error handling in files
    pub fn analyze(&mut self, files: &[String]) -> ErrorHandlingResult {
        let start = Instant::now();
        
        let mut all_boundaries = Vec::new();
        let mut all_gaps = Vec::new();
        let mut all_error_types = Vec::new();
        let mut files_analyzed = 0;
        
        for file in files {
            if let Some(source) = std::fs::read_to_string(file).ok() {
                if let Some(result) = self.parser.parse_file(file, &source) {
                    let boundaries = self.extract_boundaries_from_ast(&result, file, &source);
                    let gaps = self.detect_gaps_from_ast(&result, file, &source);
                    let error_types = self.extract_error_types_from_ast(&result, file);
                    
                    all_boundaries.extend(boundaries);
                    all_gaps.extend(gaps);
                    all_error_types.extend(error_types);
                    files_analyzed += 1;
                }
            }
        }
        
        ErrorHandlingResult {
            boundaries: all_boundaries,
            gaps: all_gaps,
            error_types: all_error_types,
            files_analyzed,
            duration_ms: start.elapsed().as_millis() as u64,
        }
    }
    
    /// Extract error boundaries from AST
    fn extract_boundaries_from_ast(
        &self,
        result: &ParseResult,
        file: &str,
        source: &str,
    ) -> Vec<ErrorBoundary> {
        let mut boundaries = Vec::new();
        let lines: Vec<&str> = source.lines().collect();
        
        // First, scan the entire file for try/catch blocks
        let mut in_try = false;
        let mut try_start = 0u32;
        
        for (i, line) in lines.iter().enumerate() {
            let line_num = i as u32;
            let trimmed = line.trim();
            
            // JavaScript/TypeScript/Java/C# try
            if trimmed.starts_with("try") && (trimmed.contains('{') || trimmed.ends_with("try")) {
                in_try = true;
                try_start = line_num;
            }
            
            // Python try
            if trimmed == "try:" {
                in_try = true;
                try_start = line_num;
            }
            
            // Catch block
            if in_try && (trimmed.starts_with("catch") || trimmed.starts_with("} catch") || trimmed.starts_with("except")) {
                let is_swallowed = self.is_empty_catch(&lines, line_num);
                let logs_error = self.check_logs_error(&lines, line_num);
                let rethrows = self.check_rethrows(&lines, line_num);
                
                boundaries.push(ErrorBoundary {
                    file: file.to_string(),
                    start_line: try_start,
                    end_line: line_num + 5, // Approximate end
                    boundary_type: if trimmed.starts_with("except") {
                        BoundaryType::TryExcept
                    } else {
                        BoundaryType::TryCatch
                    },
                    caught_types: self.extract_caught_types(trimmed),
                    rethrows,
                    logs_error,
                    is_swallowed,
                });
                in_try = false;
            }
        }
        
        // Detect .catch() on promises from AST call sites
        for call in &result.calls {
            if call.callee == "catch" {
                boundaries.push(ErrorBoundary {
                    file: file.to_string(),
                    start_line: call.range.start.line,
                    end_line: call.range.start.line + 3,
                    boundary_type: BoundaryType::PromiseCatch,
                    caught_types: Vec::new(),
                    rethrows: false,
                    logs_error: false,
                    is_swallowed: false,
                });
            }
        }
        
        boundaries
    }
    
    /// Detect error handling gaps from AST
    fn detect_gaps_from_ast(
        &self,
        result: &ParseResult,
        file: &str,
        source: &str,
    ) -> Vec<ErrorGap> {
        let mut gaps = Vec::new();
        let lines: Vec<&str> = source.lines().collect();
        
        for func in &result.functions {
            // Check for async functions without try/catch
            if func.is_async {
                let has_try_catch = self.function_has_try_catch(&lines, func);
                let has_catch_call = result.calls.iter().any(|c| {
                    c.callee == "catch" && 
                    c.range.start.line >= func.range.start.line &&
                    c.range.start.line <= func.range.end.line
                });
                
                if !has_try_catch && !has_catch_call {
                    // Check if function contains await calls
                    let func_source = self.get_function_source(&lines, func);
                    if func_source.contains("await ") {
                        gaps.push(ErrorGap {
                            file: file.to_string(),
                            line: func.range.start.line,
                            function: func.name.clone(),
                            gap_type: GapType::UnhandledAsync,
                            severity: GapSeverity::Medium,
                            description: format!(
                                "Async function '{}' has await calls without error handling",
                                func.name
                            ),
                        });
                    }
                }
            }
        }
        
        // Check for unhandled promise chains from AST calls
        for call in &result.calls {
            // Look for .then() without .catch()
            if call.callee == "then" {
                // Check if there's a .catch() nearby
                let has_catch = result.calls.iter().any(|c| {
                    c.callee == "catch" &&
                    c.range.start.line >= call.range.start.line &&
                    c.range.start.line <= call.range.start.line + 5
                });
                
                if !has_catch {
                    gaps.push(ErrorGap {
                        file: file.to_string(),
                        line: call.range.start.line,
                        function: "unknown".to_string(),
                        gap_type: GapType::UnhandledPromise,
                        severity: GapSeverity::Medium,
                        description: "Promise chain with .then() but no .catch()".to_string(),
                    });
                }
            }
            
            // Rust: .unwrap() without error handling
            if call.callee == "unwrap" || call.callee == "expect" {
                gaps.push(ErrorGap {
                    file: file.to_string(),
                    line: call.range.start.line,
                    function: "unknown".to_string(),
                    gap_type: GapType::UnwrapWithoutCheck,
                    severity: if call.callee == "unwrap" { GapSeverity::High } else { GapSeverity::Medium },
                    description: format!("Use of .{}() can panic on error", call.callee),
                });
            }
        }
        
        gaps
    }
    
    /// Extract custom error types from AST classes
    fn extract_error_types_from_ast(
        &self,
        result: &ParseResult,
        file: &str,
    ) -> Vec<ErrorType> {
        let mut error_types = Vec::new();
        
        for class in &result.classes {
            // Check if class extends Error or Exception
            let is_error_type = class.extends.as_ref().map_or(false, |ext| {
                ext.contains("Error") || ext.contains("Exception") || ext.contains("Throwable")
            }) || class.name.ends_with("Error") || class.name.ends_with("Exception");
            
            if is_error_type {
                error_types.push(ErrorType {
                    name: class.name.clone(),
                    file: file.to_string(),
                    line: class.range.start.line,
                    extends: class.extends.clone(),
                    is_exported: class.is_exported,
                });
            }
        }
        
        error_types
    }
    
    // Helper methods
    
    fn get_lines_in_range<'a>(&self, lines: &'a [&str], start: u32, end: u32) -> Vec<&'a str> {
        let start_idx = (start as usize).saturating_sub(1);
        let end_idx = (end as usize).min(lines.len());
        lines[start_idx..end_idx].to_vec()
    }
    
    fn get_function_source(&self, lines: &[&str], func: &FunctionInfo) -> String {
        self.get_lines_in_range(lines, func.range.start.line, func.range.end.line)
            .join("\n")
    }
    
    fn function_has_try_catch(&self, lines: &[&str], func: &FunctionInfo) -> bool {
        let func_source = self.get_function_source(lines, func);
        func_source.contains("try") && (func_source.contains("catch") || func_source.contains("except"))
    }
    
    fn is_empty_catch(&self, lines: &[&str], catch_line: u32) -> bool {
        // Check if catch block is empty or just has a comment
        let idx = (catch_line as usize).saturating_sub(1);
        if idx + 2 < lines.len() {
            let next_lines = &lines[idx..idx.saturating_add(3).min(lines.len())];
            let content: String = next_lines.join(" ");
            // Empty if just braces or pass statement
            content.contains("{ }") || content.contains("{}") || 
            content.contains("pass") || content.trim().ends_with("{ }")
        } else {
            false
        }
    }
    
    fn check_logs_error(&self, lines: &[&str], catch_line: u32) -> bool {
        let idx = (catch_line as usize).saturating_sub(1);
        let end_idx = (idx + 10).min(lines.len());
        let content: String = lines[idx..end_idx].join(" ");
        content.contains("console.error") || content.contains("console.log") ||
        content.contains("logger.error") || content.contains("logging.error") ||
        content.contains("log.error") || content.contains("print(")
    }
    
    fn check_rethrows(&self, lines: &[&str], catch_line: u32) -> bool {
        let idx = (catch_line as usize).saturating_sub(1);
        let end_idx = (idx + 10).min(lines.len());
        let content: String = lines[idx..end_idx].join(" ");
        content.contains("throw ") || content.contains("raise ") || content.contains("rethrow")
    }
    
    fn extract_caught_types(&self, catch_line: &str) -> Vec<String> {
        let mut types = Vec::new();
        
        // JavaScript/TypeScript: catch (e: Error)
        if let Some(start) = catch_line.find(':') {
            if let Some(end) = catch_line.find(')') {
                if start < end {
                    let type_str = &catch_line[start + 1..end];
                    types.push(type_str.trim().to_string());
                }
            }
        }
        
        // Python: except ValueError as e
        if catch_line.contains("except ") {
            let parts: Vec<&str> = catch_line.split_whitespace().collect();
            if parts.len() >= 2 && parts[0] == "except" {
                let type_part = parts[1].trim_end_matches(':');
                if type_part != "Exception" && !type_part.is_empty() {
                    types.push(type_part.to_string());
                }
            }
        }
        
        // Java/C#: catch (IOException e)
        if let Some(start) = catch_line.find('(') {
            if let Some(end) = catch_line.find(')') {
                let inner = &catch_line[start + 1..end];
                let parts: Vec<&str> = inner.split_whitespace().collect();
                if !parts.is_empty() {
                    types.push(parts[0].to_string());
                }
            }
        }
        
        types
    }
}

impl Default for ErrorHandlingAnalyzer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_analyzer_creation() {
        let analyzer = ErrorHandlingAnalyzer::new();
        assert!(true); // Just verify it creates
    }
    
    #[test]
    fn test_extract_caught_types() {
        let analyzer = ErrorHandlingAnalyzer::new();
        
        let types = analyzer.extract_caught_types("catch (e: Error) {");
        assert!(types.contains(&"Error".to_string()));
        
        let types = analyzer.extract_caught_types("except ValueError as e:");
        assert!(types.contains(&"ValueError".to_string()));
        
        let types = analyzer.extract_caught_types("catch (IOException e) {");
        assert!(types.contains(&"IOException".to_string()));
    }
}
