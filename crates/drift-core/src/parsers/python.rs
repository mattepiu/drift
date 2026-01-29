//! Python parser using native tree-sitter
//!
//! Extracts functions, classes, imports, and call sites from Python code.

use std::time::Instant;
use tree_sitter::{Node, Parser, Query, QueryCursor};

use super::types::*;

/// Python parser
pub struct PythonParser {
    parser: Parser,
    function_query: Query,
    class_query: Query,
    import_query: Query,
    call_query: Query,
}

impl PythonParser {
    /// Create a new Python parser
    pub fn new() -> Result<Self, String> {
        let mut parser = Parser::new();
        let language = tree_sitter_python::LANGUAGE;
        parser.set_language(&language.into())
            .map_err(|e| format!("Failed to set language: {}", e))?;
        
        // Query for functions
        let function_query = Query::new(
            &language.into(),
            r#"
            (function_definition
                name: (identifier) @name
                parameters: (parameters) @params
                return_type: (type)? @return_type
                body: (block) @body
            ) @function
            
            (decorated_definition
                (decorator) @decorator
                definition: (function_definition
                    name: (identifier) @name
                    parameters: (parameters) @params
                )
            ) @decorated_function
            "#,
        ).map_err(|e| format!("Failed to create function query: {}", e))?;
        
        // Query for classes
        let class_query = Query::new(
            &language.into(),
            r#"
            (class_definition
                name: (identifier) @name
                superclasses: (argument_list (identifier) @base)*
            ) @class
            "#,
        ).map_err(|e| format!("Failed to create class query: {}", e))?;
        
        // Query for imports
        let import_query = Query::new(
            &language.into(),
            r#"
            (import_statement
                name: (dotted_name) @module
            ) @import
            
            (import_from_statement
                module_name: (dotted_name) @module
                name: [
                    (dotted_name) @name
                    (aliased_import name: (dotted_name) @name)
                ]*
            ) @from_import
            "#,
        ).map_err(|e| format!("Failed to create import query: {}", e))?;
        
        // Query for function calls
        let call_query = Query::new(
            &language.into(),
            r#"
            (call
                function: [
                    (identifier) @callee
                    (attribute
                        object: (_) @receiver
                        attribute: (identifier) @callee
                    )
                ]
                arguments: (argument_list) @args
            ) @call
            "#,
        ).map_err(|e| format!("Failed to create call query: {}", e))?;
        
        Ok(Self {
            parser,
            function_query,
            class_query,
            import_query,
            call_query,
        })
    }
    
    /// Parse Python source code
    pub fn parse(&mut self, source: &str) -> ParseResult {
        let start = Instant::now();
        
        let tree = match self.parser.parse(source, None) {
            Some(t) => t,
            None => {
                let mut result = ParseResult::new(Language::Python);
                result.errors.push(ParseError {
                    message: "Failed to parse source".to_string(),
                    range: Range::new(0, 0, 0, 0),
                });
                return result;
            }
        };
        
        let root = tree.root_node();
        let source_bytes = source.as_bytes();
        
        let mut result = ParseResult::with_tree(Language::Python, tree.clone());
        
        self.extract_functions(&root, source_bytes, &mut result);
        self.extract_classes(&root, source_bytes, &mut result);
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
            let mut decorators = Vec::new();
            let mut range = Range::new(0, 0, 0, 0);
            let mut is_async = false;
            
            for capture in m.captures {
                let node = capture.node;
                let capture_name = self.function_query.capture_names()[capture.index as usize];
                
                match capture_name {
                    "name" => {
                        name = node.utf8_text(source).unwrap_or("").to_string();
                    }
                    "decorator" => {
                        decorators.push(node.utf8_text(source).unwrap_or("").to_string());
                    }
                    "function" | "decorated_function" => {
                        range = node_range(&node);
                        // Check if async
                        if let Some(first_child) = node.child(0) {
                            if first_child.kind() == "async" {
                                is_async = true;
                            }
                        }
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
                    is_exported: true, // Python functions are "exported" by default
                    is_async,
                    is_generator: false,
                    range,
                    decorators,
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
            let mut bases = Vec::new();
            let mut range = Range::new(0, 0, 0, 0);
            
            for capture in m.captures {
                let node = capture.node;
                let capture_name = self.class_query.capture_names()[capture.index as usize];
                
                match capture_name {
                    "name" => {
                        name = node.utf8_text(source).unwrap_or("").to_string();
                    }
                    "base" => {
                        bases.push(node.utf8_text(source).unwrap_or("").to_string());
                    }
                    "class" => {
                        range = node_range(&node);
                    }
                    _ => {}
                }
            }
            
            if !name.is_empty() {
                result.classes.push(ClassInfo {
                    name,
                    extends: bases.first().cloned(),
                    implements: bases.into_iter().skip(1).collect(),
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
    
    fn extract_imports(&self, root: &Node, source: &[u8], result: &mut ParseResult) {
        let mut cursor = QueryCursor::new();
        let matches = cursor.matches(&self.import_query, *root, source);
        
        for m in matches {
            let mut module = String::new();
            let mut names = Vec::new();
            let mut range = Range::new(0, 0, 0, 0);
            let mut is_from_import = false;
            
            for capture in m.captures {
                let node = capture.node;
                let capture_name = self.import_query.capture_names()[capture.index as usize];
                
                match capture_name {
                    "module" => {
                        module = node.utf8_text(source).unwrap_or("").to_string();
                    }
                    "name" => {
                        names.push(node.utf8_text(source).unwrap_or("").to_string());
                    }
                    "import" => {
                        range = node_range(&node);
                    }
                    "from_import" => {
                        range = node_range(&node);
                        is_from_import = true;
                    }
                    _ => {}
                }
            }
            
            if !module.is_empty() {
                result.imports.push(ImportInfo {
                    source: module,
                    named: if is_from_import { names.clone() } else { Vec::new() },
                    default: if !is_from_import { names.first().cloned() } else { None },
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

impl Default for PythonParser {
    fn default() -> Self {
        Self::new().expect("Failed to create Python parser")
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
        let mut parser = PythonParser::new().unwrap();
        let result = parser.parse("def hello(name: str) -> None:\n    print(name)");
        
        assert_eq!(result.functions.len(), 1);
        assert_eq!(result.functions[0].name, "hello");
    }

    #[test]
    fn test_parse_class() {
        let mut parser = PythonParser::new().unwrap();
        let result = parser.parse("class MyClass(Base):\n    pass");
        
        assert_eq!(result.classes.len(), 1);
        assert_eq!(result.classes[0].name, "MyClass");
    }

    #[test]
    fn test_parse_import() {
        let mut parser = PythonParser::new().unwrap();
        let result = parser.parse("from typing import List, Dict");
        
        assert_eq!(result.imports.len(), 1);
        assert_eq!(result.imports[0].source, "typing");
    }
}
