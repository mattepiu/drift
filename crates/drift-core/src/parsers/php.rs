//! PHP parser using native tree-sitter
//!
//! Extracts functions, classes, imports, and call sites from PHP code.
//! Supports Laravel, Symfony, and other framework patterns.

use std::time::Instant;
use tree_sitter::{Node, Parser, Query, QueryCursor};

use super::types::*;

/// PHP parser
pub struct PhpParser {
    parser: Parser,
    function_query: Query,
    class_query: Query,
    use_query: Query,
    call_query: Query,
}

impl PhpParser {
    pub fn new() -> Result<Self, String> {
        let mut parser = Parser::new();
        let language = tree_sitter_php::LANGUAGE_PHP;
        parser.set_language(&language.into())
            .map_err(|e| format!("Failed to set language: {}", e))?;
        
        // Simplified function query
        let function_query = Query::new(
            &language.into(),
            r#"
            (function_definition
                name: (name) @name
            ) @function
            
            (method_declaration
                name: (name) @name
            ) @method
            "#,
        ).map_err(|e| format!("Failed to create function query: {}", e))?;
        
        // Simplified class query
        let class_query = Query::new(
            &language.into(),
            r#"
            (class_declaration
                name: (name) @name
            ) @class
            
            (interface_declaration
                name: (name) @name
            ) @interface
            
            (trait_declaration
                name: (name) @name
            ) @trait
            "#,
        ).map_err(|e| format!("Failed to create class query: {}", e))?;
        
        // Simplified use query
        let use_query = Query::new(
            &language.into(),
            r#"
            (namespace_use_declaration
                (namespace_use_clause
                    (qualified_name) @namespace
                )
            ) @use
            "#,
        ).map_err(|e| format!("Failed to create use query: {}", e))?;

        // Simplified call query
        let call_query = Query::new(
            &language.into(),
            r#"
            (function_call_expression
                function: [
                    (name) @callee
                    (qualified_name) @callee
                ]
            ) @call
            
            (member_call_expression
                name: (name) @callee
            ) @method_call
            "#,
        ).map_err(|e| format!("Failed to create call query: {}", e))?;
        
        Ok(Self {
            parser,
            function_query,
            class_query,
            use_query,
            call_query,
        })
    }
    
    pub fn parse(&mut self, source: &str) -> ParseResult {
        let start = Instant::now();
        
        let tree = match self.parser.parse(source, None) {
            Some(t) => t,
            None => {
                let mut result = ParseResult::new(Language::Php);
                result.errors.push(ParseError {
                    message: "Failed to parse source".to_string(),
                    range: Range::new(0, 0, 0, 0),
                });
                return result;
            }
        };
        
        let root = tree.root_node();
        let source_bytes = source.as_bytes();
        
        let mut result = ParseResult::with_tree(Language::Php, tree.clone());
        
        self.extract_functions(&root, source_bytes, &mut result);
        self.extract_classes(&root, source_bytes, &mut result);
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
            
            for capture in m.captures {
                let node = capture.node;
                let capture_name = self.function_query.capture_names()[capture.index as usize];
                
                match capture_name {
                    "name" => {
                        name = node.utf8_text(source).unwrap_or("").to_string();
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
                    is_exported: true,
                    is_async: false,
                    is_generator: false,
                    range,
                    decorators: Vec::new(),
                    doc_comment: None,
                });
            }
        }
    }

    fn extract_classes(&self, root: &Node, source: &[u8], result: &mut ParseResult) {
        let mut cursor = QueryCursor::new();
        let matches = cursor.matches(&self.class_query, *root, source);
        
        for m in matches {
            let mut name = String::new();
            let mut range = Range::new(0, 0, 0, 0);
            
            for capture in m.captures {
                let node = capture.node;
                let capture_name = self.class_query.capture_names()[capture.index as usize];
                
                match capture_name {
                    "name" => {
                        name = node.utf8_text(source).unwrap_or("").to_string();
                    }
                    "class" | "interface" | "trait" => {
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
                    is_exported: true,
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
            let mut namespace = String::new();
            let mut range = Range::new(0, 0, 0, 0);
            
            for capture in m.captures {
                let node = capture.node;
                let capture_name = self.use_query.capture_names()[capture.index as usize];
                
                match capture_name {
                    "namespace" => {
                        namespace = node.utf8_text(source).unwrap_or("").to_string();
                    }
                    "use" => {
                        range = node_range(&node);
                    }
                    _ => {}
                }
            }
            
            if !namespace.is_empty() {
                let class_name = namespace.rsplit('\\').next().unwrap_or(&namespace).to_string();
                result.imports.push(ImportInfo {
                    source: namespace,
                    named: vec![class_name],
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
            let mut range = Range::new(0, 0, 0, 0);
            
            for capture in m.captures {
                let node = capture.node;
                let capture_name = self.call_query.capture_names()[capture.index as usize];
                
                match capture_name {
                    "callee" => {
                        callee = node.utf8_text(source).unwrap_or("").to_string();
                    }
                    "call" | "method_call" => {
                        range = node_range(&node);
                    }
                    _ => {}
                }
            }
            
            if !callee.is_empty() {
                result.calls.push(CallSite {
                    callee,
                    receiver: None,
                    arg_count: 0,
                    range,
                });
            }
        }
    }
}

impl Default for PhpParser {
    fn default() -> Self {
        Self::new().expect("Failed to create PHP parser")
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
    fn test_parse_class() {
        let mut parser = PhpParser::new().unwrap();
        let result = parser.parse("<?php class UserController { }");
        
        assert_eq!(result.classes.len(), 1);
        assert_eq!(result.classes[0].name, "UserController");
    }

    #[test]
    fn test_parse_function() {
        let mut parser = PhpParser::new().unwrap();
        let result = parser.parse("<?php function hello() { }");
        
        assert_eq!(result.functions.len(), 1);
        assert_eq!(result.functions[0].name, "hello");
    }
}
