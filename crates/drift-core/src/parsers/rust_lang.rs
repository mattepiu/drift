//! Rust parser using native tree-sitter
//!
//! Extracts functions, structs, imports, and call sites from Rust code.
//! Supports Actix, Axum, Rocket, and other framework patterns.

use std::time::Instant;
use tree_sitter::{Node, Parser, Query, QueryCursor};

use super::types::*;

/// Rust parser
pub struct RustParser {
    parser: Parser,
    function_query: Query,
    struct_query: Query,
    use_query: Query,
    call_query: Query,
}

impl RustParser {
    pub fn new() -> Result<Self, String> {
        let mut parser = Parser::new();
        let language = tree_sitter_rust::LANGUAGE;
        parser.set_language(&language.into())
            .map_err(|e| format!("Failed to set language: {}", e))?;
        
        let function_query = Query::new(
            &language.into(),
            r#"
            (function_item
                (visibility_modifier)? @visibility
                name: (identifier) @name
                parameters: (parameters) @params
                return_type: (_)? @return_type
            ) @function
            "#,
        ).map_err(|e| format!("Failed to create function query: {}", e))?;
        
        let struct_query = Query::new(
            &language.into(),
            r#"
            (struct_item
                (visibility_modifier)? @visibility
                name: (type_identifier) @name
            ) @struct
            
            (enum_item
                (visibility_modifier)? @visibility
                name: (type_identifier) @name
            ) @enum
            
            (trait_item
                (visibility_modifier)? @visibility
                name: (type_identifier) @name
            ) @trait
            
            (impl_item
                trait: (type_identifier)? @trait_name
                type: (type_identifier) @impl_type
            ) @impl
            "#,
        ).map_err(|e| format!("Failed to create struct query: {}", e))?;

        let use_query = Query::new(
            &language.into(),
            r#"
            (use_declaration
                argument: (_) @use_path
            ) @use
            "#,
        ).map_err(|e| format!("Failed to create use query: {}", e))?;
        
        let call_query = Query::new(
            &language.into(),
            r#"
            (call_expression
                function: [
                    (identifier) @callee
                    (field_expression
                        value: (_) @receiver
                        field: (field_identifier) @callee
                    )
                    (scoped_identifier
                        path: (_) @receiver
                        name: (identifier) @callee
                    )
                ]
                arguments: (arguments) @args
            ) @call
            "#,
        ).map_err(|e| format!("Failed to create call query: {}", e))?;
        
        Ok(Self {
            parser,
            function_query,
            struct_query,
            use_query,
            call_query,
        })
    }
    
    pub fn parse(&mut self, source: &str) -> ParseResult {
        let start = Instant::now();
        
        let tree = match self.parser.parse(source, None) {
            Some(t) => t,
            None => {
                let mut result = ParseResult::new(Language::Rust);
                result.errors.push(ParseError {
                    message: "Failed to parse source".to_string(),
                    range: Range::new(0, 0, 0, 0),
                });
                return result;
            }
        };
        
        let root = tree.root_node();
        let source_bytes = source.as_bytes();
        
        let mut result = ParseResult::with_tree(Language::Rust, tree.clone());
        
        self.extract_functions(&root, source_bytes, &mut result);
        self.extract_structs(&root, source_bytes, &mut result);
        self.extract_uses(&root, source_bytes, &mut result);
        self.extract_calls(&root, source_bytes, &mut result);
        
        result.parse_time_us = start.elapsed().as_micros() as u64;
        result
    }

    fn extract_functions(&self, root: &Node, source: &[u8], result: &mut ParseResult) {
        let mut cursor = QueryCursor::new();
        let matches = cursor.matches(&self.function_query, *root, source);
        
        for m in matches {
            let mut name = String::new();
            let mut range = Range::new(0, 0, 0, 0);
            let mut is_pub = false;
            let mut is_async = false;
            
            for capture in m.captures {
                let node = capture.node;
                let capture_name = self.function_query.capture_names()[capture.index as usize];
                
                match capture_name {
                    "name" => {
                        name = node.utf8_text(source).unwrap_or("").to_string();
                    }
                    "visibility" => {
                        let vis = node.utf8_text(source).unwrap_or("");
                        is_pub = vis.starts_with("pub");
                    }
                    "function" => {
                        range = node_range(&node);
                        // Check for async keyword
                        let text = node.utf8_text(source).unwrap_or("");
                        is_async = text.contains("async fn");
                    }
                    _ => {}
                }
            }
            
            if !name.is_empty() {
                result.functions.push(FunctionInfo {
                    name,
                    qualified_name: None,
                    parameters: Vec::new(),
                    return_type: None,
                    is_exported: is_pub,
                    is_async,
                    is_generator: false,
                    range,
                    decorators: Vec::new(),
                    doc_comment: None,
                });
            }
        }
    }

    fn extract_structs(&self, root: &Node, source: &[u8], result: &mut ParseResult) {
        let mut cursor = QueryCursor::new();
        let matches = cursor.matches(&self.struct_query, *root, source);
        
        for m in matches {
            let mut name = String::new();
            let mut range = Range::new(0, 0, 0, 0);
            let mut is_pub = false;
            
            for capture in m.captures {
                let node = capture.node;
                let capture_name = self.struct_query.capture_names()[capture.index as usize];
                
                match capture_name {
                    "name" | "impl_type" => {
                        name = node.utf8_text(source).unwrap_or("").to_string();
                    }
                    "visibility" => {
                        let vis = node.utf8_text(source).unwrap_or("");
                        is_pub = vis.starts_with("pub");
                    }
                    "struct" | "enum" | "trait" => {
                        range = node_range(&node);
                    }
                    _ => {}
                }
            }
            
            if !name.is_empty() {
                result.classes.push(ClassInfo {
                    name,
                    extends: None,
                    implements: Vec::new(),
                    is_exported: is_pub,
                    is_abstract: false,
                    methods: Vec::new(),
                    properties: Vec::new(),
                    range,
                    decorators: Vec::new(),
                });
            }
        }
    }
    
    fn extract_uses(&self, root: &Node, source: &[u8], result: &mut ParseResult) {
        let mut cursor = QueryCursor::new();
        let matches = cursor.matches(&self.use_query, *root, source);
        
        for m in matches {
            let mut use_path = String::new();
            let mut range = Range::new(0, 0, 0, 0);
            
            for capture in m.captures {
                let node = capture.node;
                let capture_name = self.use_query.capture_names()[capture.index as usize];
                
                match capture_name {
                    "use_path" => {
                        use_path = node.utf8_text(source).unwrap_or("").to_string();
                    }
                    "use" => {
                        range = node_range(&node);
                    }
                    _ => {}
                }
            }
            
            if !use_path.is_empty() {
                result.imports.push(ImportInfo {
                    source: use_path,
                    named: Vec::new(),
                    default: None,
                    namespace: None,
                    is_type_only: false,
                    range,
                });
            }
        }
    }

    fn extract_calls(&self, root: &Node, source: &[u8], result: &mut ParseResult) {
        let mut cursor = QueryCursor::new();
        let matches = cursor.matches(&self.call_query, *root, source);
        
        for m in matches {
            let mut callee = String::new();
            let mut receiver = None;
            let mut arg_count = 0;
            let mut range = Range::new(0, 0, 0, 0);
            
            for capture in m.captures {
                let node = capture.node;
                let capture_name = self.call_query.capture_names()[capture.index as usize];
                
                match capture_name {
                    "callee" => {
                        callee = node.utf8_text(source).unwrap_or("").to_string();
                    }
                    "receiver" => {
                        receiver = Some(node.utf8_text(source).unwrap_or("").to_string());
                    }
                    "args" => {
                        arg_count = node.named_child_count();
                    }
                    "call" => {
                        range = node_range(&node);
                    }
                    _ => {}
                }
            }
            
            if !callee.is_empty() {
                result.calls.push(CallSite {
                    callee,
                    receiver,
                    arg_count,
                    range,
                });
            }
        }
    }
}

impl Default for RustParser {
    fn default() -> Self {
        Self::new().expect("Failed to create Rust parser")
    }
}

fn node_range(node: &Node) -> Range {
    Range {
        start: Position {
            line: node.start_position().row as u32,
            column: node.start_position().column as u32,
        },
        end: Position {
            line: node.end_position().row as u32,
            column: node.end_position().column as u32,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_function() {
        let mut parser = RustParser::new().unwrap();
        let result = parser.parse("pub fn hello(name: &str) -> String { name.to_string() }");
        
        assert_eq!(result.functions.len(), 1);
        assert_eq!(result.functions[0].name, "hello");
        assert!(result.functions[0].is_exported);
    }

    #[test]
    fn test_parse_struct() {
        let mut parser = RustParser::new().unwrap();
        let result = parser.parse("pub struct User { name: String }");
        
        assert_eq!(result.classes.len(), 1);
        assert_eq!(result.classes[0].name, "User");
    }
}
