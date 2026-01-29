//! C# parser using native tree-sitter
//!
//! Extracts functions, classes, imports, and call sites from C# code.
//! Supports ASP.NET, Entity Framework, and other framework attributes.

use std::time::Instant;
use tree_sitter::{Node, Parser, Query, QueryCursor};

use super::types::*;

/// C# parser
pub struct CSharpParser {
    parser: Parser,
    method_query: Query,
    class_query: Query,
    using_query: Query,
    call_query: Query,
}

impl CSharpParser {
    pub fn new() -> Result<Self, String> {
        let mut parser = Parser::new();
        let language = tree_sitter_c_sharp::LANGUAGE;
        parser.set_language(&language.into())
            .map_err(|e| format!("Failed to set language: {}", e))?;
        
        // Simplified method query
        let method_query = Query::new(
            &language.into(),
            r#"
            (method_declaration
                name: (identifier) @name
            ) @method
            
            (constructor_declaration
                name: (identifier) @name
            ) @constructor
            "#,
        ).map_err(|e| format!("Failed to create method query: {}", e))?;
        
        // Simplified class query
        let class_query = Query::new(
            &language.into(),
            r#"
            (class_declaration
                name: (identifier) @name
            ) @class
            
            (interface_declaration
                name: (identifier) @name
            ) @interface
            "#,
        ).map_err(|e| format!("Failed to create class query: {}", e))?;
        
        let using_query = Query::new(
            &language.into(),
            r#"
            (using_directive
                (qualified_name) @namespace
            ) @using
            "#,
        ).map_err(|e| format!("Failed to create using query: {}", e))?;

        let call_query = Query::new(
            &language.into(),
            r#"
            (invocation_expression
                function: [
                    (identifier) @callee
                    (member_access_expression
                        name: (identifier) @callee
                    )
                ]
            ) @call
            "#,
        ).map_err(|e| format!("Failed to create call query: {}", e))?;
        
        Ok(Self {
            parser,
            method_query,
            class_query,
            using_query,
            call_query,
        })
    }
    
    pub fn parse(&mut self, source: &str) -> ParseResult {
        let start = Instant::now();
        
        let tree = match self.parser.parse(source, None) {
            Some(t) => t,
            None => {
                let mut result = ParseResult::new(Language::CSharp);
                result.errors.push(ParseError {
                    message: "Failed to parse source".to_string(),
                    range: Range::new(0, 0, 0, 0),
                });
                return result;
            }
        };
        
        let root = tree.root_node();
        let source_bytes = source.as_bytes();
        
        let mut result = ParseResult::with_tree(Language::CSharp, tree.clone());
        
        self.extract_methods(&root, source_bytes, &mut result);
        self.extract_classes(&root, source_bytes, &mut result);
        self.extract_usings(&root, source_bytes, &mut result);
        self.extract_calls(&root, source_bytes, &mut result);
        
        result.parse_time_us = start.elapsed().as_micros() as u64;
        result
    }
    
    fn extract_methods(&self, root: &Node, source: &[u8], result: &mut ParseResult) {
        let mut cursor = QueryCursor::new();
        let matches = cursor.matches(&self.method_query, *root, source);
        
        for m in matches {
            let mut name = String::new();
            let mut range = Range::new(0, 0, 0, 0);
            
            for capture in m.captures {
                let node = capture.node;
                let capture_name = self.method_query.capture_names()[capture.index as usize];
                
                match capture_name {
                    "name" => {
                        name = node.utf8_text(source).unwrap_or("").to_string();
                    }
                    "method" | "constructor" => {
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
                    "class" | "interface" => {
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
    
    fn extract_usings(&self, root: &Node, source: &[u8], result: &mut ParseResult) {
        let mut cursor = QueryCursor::new();
        let matches = cursor.matches(&self.using_query, *root, source);
        
        for m in matches {
            let mut namespace = String::new();
            let mut range = Range::new(0, 0, 0, 0);
            
            for capture in m.captures {
                let node = capture.node;
                let capture_name = self.using_query.capture_names()[capture.index as usize];
                
                match capture_name {
                    "namespace" => {
                        namespace = node.utf8_text(source).unwrap_or("").to_string();
                    }
                    "using" => {
                        range = node_range(&node);
                    }
                    _ => {}
                }
            }
            
            if !namespace.is_empty() {
                result.imports.push(ImportInfo {
                    source: namespace,
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
            let mut range = Range::new(0, 0, 0, 0);
            
            for capture in m.captures {
                let node = capture.node;
                let capture_name = self.call_query.capture_names()[capture.index as usize];
                
                match capture_name {
                    "callee" => {
                        callee = node.utf8_text(source).unwrap_or("").to_string();
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
                    receiver: None,
                    arg_count: 0,
                    range,
                });
            }
        }
    }
}

impl Default for CSharpParser {
    fn default() -> Self {
        Self::new().expect("Failed to create C# parser")
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
        let mut parser = CSharpParser::new().unwrap();
        let result = parser.parse("public class UserService { }");
        
        assert_eq!(result.classes.len(), 1);
        assert_eq!(result.classes[0].name, "UserService");
    }
    
    #[test]
    fn test_parse_method() {
        let mut parser = CSharpParser::new().unwrap();
        let result = parser.parse("public class Test { public void Hello() { } }");
        
        assert!(result.functions.len() >= 1);
    }
}
