//! Universal call graph extractor
//!
//! Extracts functions and calls from any language using the unified ParseResult.

use crate::parsers::{ParseResult, Language};
use super::extractor::{CallGraphExtractor, ExtractionResult, ExtractedFunction, ExtractedCall};

/// Universal extractor that works with any ParseResult
pub struct UniversalExtractor;

impl UniversalExtractor {
    pub fn new() -> Self {
        Self
    }
    
    /// Extract from a ParseResult
    pub fn extract_from_parse_result(&self, result: &ParseResult) -> ExtractionResult {
        let functions: Vec<ExtractedFunction> = result.functions
            .iter()
            .map(|f| ExtractedFunction {
                name: f.name.clone(),
                start_line: f.range.start.line,
                end_line: f.range.end.line,
                is_exported: f.is_exported,
                is_async: f.is_async,
            })
            .collect();
        
        let calls: Vec<ExtractedCall> = result.calls
            .iter()
            .map(|c| ExtractedCall {
                callee_name: c.callee.clone(),
                line: c.range.start.line,
                receiver: c.receiver.clone(),
            })
            .collect();
        
        ExtractionResult { functions, calls }
    }
}

impl Default for UniversalExtractor {
    fn default() -> Self {
        Self::new()
    }
}

impl CallGraphExtractor for UniversalExtractor {
    fn can_handle(&self, file: &str) -> bool {
        // Can handle any file that has a recognized extension
        Language::from_path(file).is_some()
    }
    
    fn extract(&self, parse_result: &ParseResult, _file: &str) -> ExtractionResult {
        self.extract_from_parse_result(parse_result)
    }
    
    fn language(&self) -> Language {
        // This is a universal extractor, but we need to return something
        Language::TypeScript
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parsers::ParserManager;
    
    #[test]
    fn test_extract_typescript() {
        let mut parser = ParserManager::new();
        let source = r#"
            export function hello() {
                console.log("hi");
                world();
            }
            
            function world() {
                return 42;
            }
        "#;
        
        let result = parser.parse(source, Language::TypeScript).unwrap();
        let extractor = UniversalExtractor::new();
        let extraction = extractor.extract_from_parse_result(&result);
        
        assert_eq!(extraction.functions.len(), 2);
        assert!(extraction.calls.len() >= 2); // console.log and world
    }
}
