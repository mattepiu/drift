//! Go parser using native tree-sitter
//!
//! Extracts functions, structs, imports, and call sites from Go code.
//! Supports Gin, Echo, and other framework patterns.

use std::time::Instant;
use tree_sitter::{Node, Parser, Query, QueryCursor};

use super::types::*;

/// Go parser
pub struct GoParser {
    parser: Parser,
    function_query: Query,
    struct_query: Query,
    import_query: Query,
    call_query: Query,
}

impl GoParser {
    pub fn new() -> Result<Self, String> {
        let mut parser = Parser::new();
        let language = tree_sitter_go::LANGUAGE;
        parser.set_language(&language.into())
            .map_err(|e| format!("Failed to set language: {}", e))?;
        
        let function_query = Query::new(
            &language.into(),
            r#"
            (function_declaration
                name: (identifier) @name
                parameters: (parameter_list) @params
                result: (_)? @return_type
            ) @function
            
            (method_declaration
                receiver: (parameter_list) @receiver
                name: (field_identifier) @name
                parameters: (parameter_list) @params
                result: (_)? @return_type
            ) @method
            "#,
        ).map_err(|e| format!("Failed to create function query: {}", e))?;
        
        let struct_query = Query::new(
            &language.into(),
            r#"
            (type_declaration
                (type_spec
                    name: (type_identifier) @name
                    type: (struct_type) @struct_body
                )
            ) @struct
            
            (type_declaration
                (type_spec
                    name: (type_identifier) @name
                    type: (interface_type) @interface_body
                )
            ) @interface
            "#,
        ).map_err(|e| format!("Failed to create struct query: {}", e))?;
        
        let import_query = Query::new(
            &language.into(),
            r#"
            (import_declaration
                (import_spec
                    name: (package_identifier)? @alias
                    path: (interpreted_string_literal) @path
                )
            ) @import
            
            (import_declaration
                (import_spec_list
                    (import_spec
                        name: (package_identifier)? @alias
                        path: (interpreted_string_literal) @path
                    )
                )
            ) @import_list
            "#,
        ).map_err(|e| format!("Failed to create import query: {}", e))?;
        
        let call_query = Query::new(
            &language.into(),
            r#"
            (call_expression
                function: [
                    (identifier) @callee
                    (selector_expression
                        operand: (_) @receiver
                        field: (field_identifier) @callee
                    )
                ]
                arguments: (argument_list) @args
            ) @call
            "#,
        ).map_err(|e| format!("Failed to create call query: {}", e))?;
        
        Ok(Self {
            parser,
            function_query,
            struct_query,
            import_query,
            call_query,
        })
    }
    
    pub fn parse(&mut self, source: &str) -> ParseResult {
        let start = Instant::now();
        
        let tree = match self.parser.parse(source, None) {
            Some(t) => t,
            None => {
                let mut result = ParseResult::new(Language::Go);
                result.errors.push(ParseError {
                    message: "Failed to parse source".to_string(),
                    range: Range::new(0, 0, 0, 0),
                });
                return result;
            }
        };
        
        let root = tree.root_node();
        let source_bytes = source.as_bytes();
        
        let mut result = ParseResult::with_tree(Language::Go, tree.clone());
        
        self.extract_functions(&root, source_bytes, &mut result);
        self.extract_structs(&root, source_bytes, &mut result);
        self.extract_imports(&root, source_bytes, &mut result);
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
            let mut is_exported = false;
            
            for capture in m.captures {
                let node = capture.node;
                let capture_name = self.function_query.capture_names()[capture.index as usize];
                
                match capture_name {
                    "name" => {
                        name = node.utf8_text(source).unwrap_or("").to_string();
                        // Go exports start with uppercase
                        is_exported = name.chars().next().map(|c| c.is_uppercase()).unwrap_or(false);
                    }
                    "function" | "method" => {
                        range = node_range(&node);
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
                    is_exported,
                    is_async: false, // Go uses goroutines, not async
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
            let mut is_exported = false;
            
            for capture in m.captures {
                let node = capture.node;
                let capture_name = self.struct_query.capture_names()[capture.index as usize];
                
                match capture_name {
                    "name" => {
                        name = node.utf8_text(source).unwrap_or("").to_string();
                        is_exported = name.chars().next().map(|c| c.is_uppercase()).unwrap_or(false);
                    }
                    "struct" | "interface" => {
                        range = node_range(&node);
                    }
                    _ => {}
                }
            }
            
            if !name.is_empty() {
                result.classes.push(ClassInfo {
                    name,
                    extends: None,
                    implements: Vec::new(), // Go uses implicit interfaces
                    is_exported,
                    is_abstract: false,
                    methods: Vec::new(),
                    properties: Vec::new(),
                    range,
                    decorators: Vec::new(),
                });
            }
        }
    }
    
    fn extract_imports(&self, root: &Node, source: &[u8], result: &mut ParseResult) {
        let mut cursor = QueryCursor::new();
        let matches = cursor.matches(&self.import_query, *root, source);
        
        for m in matches {
            let mut path = String::new();
            let mut alias = None;
            let mut range = Range::new(0, 0, 0, 0);
            
            for capture in m.captures {
                let node = capture.node;
                let capture_name = self.import_query.capture_names()[capture.index as usize];
                
                match capture_name {
                    "path" => {
                        // Remove quotes
                        let text = node.utf8_text(source).unwrap_or("");
                        path = text.trim_matches('"').to_string();
                    }
                    "alias" => {
                        alias = Some(node.utf8_text(source).unwrap_or("").to_string());
                    }
                    "import" | "import_list" => {
                        range = node_range(&node);
                    }
                    _ => {}
                }
            }
            
            if !path.is_empty() {
                // Extract package name from path
                let pkg_name = path.rsplit('/').next().unwrap_or(&path).to_string();
                result.imports.push(ImportInfo {
                    source: path,
                    named: vec![alias.unwrap_or(pkg_name)],
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

impl Default for GoParser {
    fn default() -> Self {
        Self::new().expect("Failed to create Go parser")
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
        let mut parser = GoParser::new().unwrap();
        let result = parser.parse("package main\n\nfunc Hello(name string) string { return name }");
        
        assert_eq!(result.functions.len(), 1);
        assert_eq!(result.functions[0].name, "Hello");
        assert!(result.functions[0].is_exported);
    }

    #[test]
    fn test_parse_struct() {
        let mut parser = GoParser::new().unwrap();
        let result = parser.parse("package main\n\ntype User struct { Name string }");
        
        assert_eq!(result.classes.len(), 1);
        assert_eq!(result.classes[0].name, "User");
    }
}
