//! Boundaries module - Data access and sensitive field detection
//!
//! AST-first approach: Uses tree-sitter parsed data from ParserManager.
//! Regex is only used as fallback for:
//! - SQL strings embedded in code
//! - Sensitive field names in string literals

mod types;
mod detector;
mod sensitive;

pub use types::*;
pub use detector::DataAccessDetector;
pub use sensitive::SensitiveFieldDetector;

use std::path::Path;
use std::fs;
use std::time::Instant;

use crate::parsers::ParserManager;

/// Boundary scanner - AST-first with regex fallbacks
pub struct BoundaryScanner {
    parser: ParserManager,
    access_detector: DataAccessDetector,
    sensitive_detector: SensitiveFieldDetector,
}

impl BoundaryScanner {
    pub fn new() -> Self {
        Self {
            parser: ParserManager::new(),
            access_detector: DataAccessDetector::new(),
            sensitive_detector: SensitiveFieldDetector::new(),
        }
    }
    
    /// Scan a single file using AST-first approach
    pub fn scan_file(&mut self, path: &Path) -> Option<FileBoundaryResult> {
        let source = fs::read_to_string(path).ok()?;
        let file_str = path.to_string_lossy().to_string();
        
        // Try AST parsing first
        let mut access_points = if let Some(result) = self.parser.parse_file(&file_str, &source) {
            // Primary: detect from AST call sites
            self.access_detector.detect_from_ast(&result, &file_str)
        } else {
            Vec::new()
        };
        
        // Fallback: detect SQL in raw source (for embedded SQL strings)
        let sql_access = self.access_detector.detect_sql_in_source(&source, &file_str);
        access_points.extend(sql_access);
        
        // Sensitive fields (regex-based - field names are in strings/identifiers)
        let sensitive_fields = self.sensitive_detector.detect(&source, &file_str);
        
        Some(FileBoundaryResult {
            file: file_str,
            access_points,
            sensitive_fields,
        })
    }
    
    /// Scan multiple files
    pub fn scan_files(&mut self, files: &[String]) -> BoundaryScanResult {
        let start = Instant::now();
        let mut all_access = Vec::new();
        let mut all_sensitive = Vec::new();
        let mut files_scanned = 0;
        
        for file in files {
            let path = Path::new(file);
            if let Some(result) = self.scan_file(path) {
                all_access.extend(result.access_points);
                all_sensitive.extend(result.sensitive_fields);
                files_scanned += 1;
            }
        }
        
        BoundaryScanResult {
            access_points: all_access,
            sensitive_fields: all_sensitive,
            models: Vec::new(),
            files_scanned,
            duration_ms: start.elapsed().as_millis() as u64,
        }
    }
}

impl Default for BoundaryScanner {
    fn default() -> Self {
        Self::new()
    }
}

/// Result for a single file
#[derive(Debug, Clone)]
pub struct FileBoundaryResult {
    pub file: String,
    pub access_points: Vec<DataAccessPoint>,
    pub sensitive_fields: Vec<SensitiveField>,
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_boundary_scanner() {
        let mut scanner = BoundaryScanner::new();
        
        // Test SQL detection fallback
        let source = "SELECT * FROM users WHERE id = 1";
        let access = scanner.access_detector.detect_sql_in_source(source, "test.ts");
        assert!(!access.is_empty());
    }
}
