//! C++ parser using native tree-sitter
//!
//! Extracts functions, classes, includes, and call sites from C++ code.
//! Supports Boost, Qt, and other framework patterns.

use std::time::Instant;
use tree_sitter::{Node, Parser, Query, QueryCursor};

use super::types::*;

/// C++ parser
pub struct CppParser {
    parser: Parser,
    function_query: Query,
    class_query: Query,
    include_query: Query,
    call_query: Query,
}

impl CppParser {
    pub fn new() -> Result<Self, String> {
        let mut parser = Parser::new();
        let language = tree_sitter_cpp::LANGUAGE;
        parser.set_language(&language.into())
            .map_err(|e| format!("Failed to set language: {}", e))?;
        
        let function_query = Query::new(
            &language.into(),
            r#"
            (function_definition
                declarator: (function_declarator
                    declarator: (identifier) @name
                    parameters: (parameter_list) @params
                )
                type: (_)? @return_type
            ) @function
            
            (function_definition
                declarator: (function_declarator
                    declarator: (qualified_identifier
                        name: (identifier) @name
                    )
                    parameters: (parameter_list) @params
                )
            ) @method
            "#,
        ).map_err(|e| format!("Failed to create function query: {}", e))?;
        
        let class_query = Query::new(
            &language.into(),
            r#"
            (class_specifier
                name: (type_identifier) @name
                (base_class_clause (type_identifier) @base)*
            ) @class
            
            (struct_specifier
                name: (type_identifier) @name
            ) @struct
            "#,
        ).map_err(|e| format!("Failed to create class query: {}", e))?;

        let include_query = Query::new(
            &language.into(),
            r#"
            (preproc_include
                path: [
                    (string_literal) @path
                    (system_lib_string) @system_path
                ]
            ) @include
            "#,
        ).map_err(|e| format!("Failed to create include query: {}", e))?;
        
        let call_query = Query::new(
            &language.into(),
            r#"
            (call_expression
                function: [
                    (identifier) @callee
                    (field_expression
                        argument: (_) @receiver
                        field: (field_identifier) @callee
                    )
                    (qualified_identifier
                        scope: (_) @receiver
                        name: (identifier) @callee
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
            include_query,
            call_query,
        })
    }
    
    pub fn parse(&mut self, source: &str) -> ParseResult {
        let start = Instant::now();
        
        let tree = match self.parser.parse(source, None) {
            Some(t) => t,
            None => {
                let mut result = ParseResult::new(Language::Cpp);
                result.errors.push(ParseError {
                    message: "Failed to parse source".to_string(),
                    range: Range::new(0, 0, 0, 0),
                });
                return result;
            }
        };
        
        let root = tree.root_node();
        let source_bytes = source.as_bytes();
        
        let mut result = ParseResult::with_tree(Language::Cpp, tree.clone());
        
        self.extract_functions(&root, source_bytes, &mut result);
        self.extract_classes(&root, source_bytes, &mut result);
        self.extract_includes(&root, source_bytes, &mut result);
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
                    is_exported: true, // C++ doesn't have export in same sense
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
                    "class" | "struct" => {
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

    fn extract_includes(&self, root: &Node, source: &[u8], result: &mut ParseResult) {
        let mut cursor = QueryCursor::new();
        let matches = cursor.matches(&self.include_query, *root, source);
        
        for m in matches {
            let mut path = String::new();
            let mut range = Range::new(0, 0, 0, 0);
            
            for capture in m.captures {
                let node = capture.node;
                let capture_name = self.include_query.capture_names()[capture.index as usize];
                
                match capture_name {
                    "path" | "system_path" => {
                        // Remove quotes or angle brackets
                        let text = node.utf8_text(source).unwrap_or("");
                        path = text.trim_matches(|c| c == '"' || c == '<' || c == '>').to_string();
                    }
                    "include" => {
                        range = node_range(&node);
                    }
                    _ => {}
                }
            }
            
            if !path.is_empty() {
                result.imports.push(ImportInfo {
                    source: path,
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

impl Default for CppParser {
    fn default() -> Self {
        Self::new().expect("Failed to create C++ parser")
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
        let mut parser = CppParser::new().unwrap();
        let result = parser.parse("int main() { return 0; }");
        
        assert_eq!(result.functions.len(), 1);
        assert_eq!(result.functions[0].name, "main");
    }

    #[test]
    fn test_parse_class() {
        let mut parser = CppParser::new().unwrap();
        let result = parser.parse("class User : public Base { };");
        
        assert_eq!(result.classes.len(), 1);
        assert_eq!(result.classes[0].name, "User");
    }
}
