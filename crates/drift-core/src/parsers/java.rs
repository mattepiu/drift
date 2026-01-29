//! Java parser using native tree-sitter
//!
//! Extracts functions, classes, imports, and call sites from Java code.
//! Supports Spring, JPA, and other framework annotations.

use std::time::Instant;
use tree_sitter::{Node, Parser, Query, QueryCursor};

use super::types::*;

/// Java parser
pub struct JavaParser {
    parser: Parser,
    method_query: Query,
    class_query: Query,
    import_query: Query,
    call_query: Query,
    annotation_query: Query,
}

impl JavaParser {
    pub fn new() -> Result<Self, String> {
        let mut parser = Parser::new();
        let language = tree_sitter_java::LANGUAGE;
        parser.set_language(&language.into())
            .map_err(|e| format!("Failed to set language: {}", e))?;
        
        let method_query = Query::new(
            &language.into(),
            r#"
            (method_declaration
                (modifiers)? @modifiers
                type: (_) @return_type
                name: (identifier) @name
                parameters: (formal_parameters) @params
            ) @method
            
            (constructor_declaration
                name: (identifier) @name
                parameters: (formal_parameters) @params
            ) @constructor
            "#,
        ).map_err(|e| format!("Failed to create method query: {}", e))?;
        
        let class_query = Query::new(
            &language.into(),
            r#"
            (class_declaration
                (modifiers)? @modifiers
                name: (identifier) @name
                (superclass (type_identifier) @extends)?
                (super_interfaces (type_list (type_identifier) @implements))?
            ) @class
            
            (interface_declaration
                name: (identifier) @name
            ) @interface
            "#,
        ).map_err(|e| format!("Failed to create class query: {}", e))?;
        
        let import_query = Query::new(
            &language.into(),
            r#"
            (import_declaration
                (scoped_identifier) @import
            ) @import_stmt
            "#,
        ).map_err(|e| format!("Failed to create import query: {}", e))?;
        
        let call_query = Query::new(
            &language.into(),
            r#"
            (method_invocation
                object: (_)? @receiver
                name: (identifier) @callee
                arguments: (argument_list) @args
            ) @call
            "#,
        ).map_err(|e| format!("Failed to create call query: {}", e))?;
        
        let annotation_query = Query::new(
            &language.into(),
            r#"
            (marker_annotation
                name: (identifier) @annotation_name
            ) @annotation
            
            (annotation
                name: (identifier) @annotation_name
                arguments: (annotation_argument_list)? @annotation_args
            ) @annotation_with_args
            "#,
        ).map_err(|e| format!("Failed to create annotation query: {}", e))?;
        
        Ok(Self {
            parser,
            method_query,
            class_query,
            import_query,
            call_query,
            annotation_query,
        })
    }
    
    pub fn parse(&mut self, source: &str) -> ParseResult {
        let start = Instant::now();
        
        let tree = match self.parser.parse(source, None) {
            Some(t) => t,
            None => {
                let mut result = ParseResult::new(Language::Java);
                result.errors.push(ParseError {
                    message: "Failed to parse source".to_string(),
                    range: Range::new(0, 0, 0, 0),
                });
                return result;
            }
        };
        
        let root = tree.root_node();
        let source_bytes = source.as_bytes();
        
        let mut result = ParseResult::with_tree(Language::Java, tree.clone());
        
        self.extract_methods(&root, source_bytes, &mut result);
        self.extract_classes(&root, source_bytes, &mut result);
        self.extract_imports(&root, source_bytes, &mut result);
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
            let mut is_public = false;
            let mut is_static = false;
            
            for capture in m.captures {
                let node = capture.node;
                let capture_name = self.method_query.capture_names()[capture.index as usize];
                
                match capture_name {
                    "name" => {
                        name = node.utf8_text(source).unwrap_or("").to_string();
                    }
                    "modifiers" => {
                        let mods = node.utf8_text(source).unwrap_or("");
                        is_public = mods.contains("public");
                        is_static = mods.contains("static");
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
                    is_exported: is_public,
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
            let mut extends = None;
            let mut implements = Vec::new();
            let mut range = Range::new(0, 0, 0, 0);
            let mut is_public = false;
            let mut is_abstract = false;
            
            for capture in m.captures {
                let node = capture.node;
                let capture_name = self.class_query.capture_names()[capture.index as usize];
                
                match capture_name {
                    "name" => {
                        name = node.utf8_text(source).unwrap_or("").to_string();
                    }
                    "extends" => {
                        extends = Some(node.utf8_text(source).unwrap_or("").to_string());
                    }
                    "implements" => {
                        implements.push(node.utf8_text(source).unwrap_or("").to_string());
                    }
                    "modifiers" => {
                        let mods = node.utf8_text(source).unwrap_or("");
                        is_public = mods.contains("public");
                        is_abstract = mods.contains("abstract");
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
                    extends,
                    implements,
                    is_exported: is_public,
                    is_abstract,
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
            let mut import_path = String::new();
            let mut range = Range::new(0, 0, 0, 0);
            
            for capture in m.captures {
                let node = capture.node;
                let capture_name = self.import_query.capture_names()[capture.index as usize];
                
                match capture_name {
                    "import" => {
                        import_path = node.utf8_text(source).unwrap_or("").to_string();
                    }
                    "import_stmt" => {
                        range = node_range(&node);
                    }
                    _ => {}
                }
            }
            
            if !import_path.is_empty() {
                // Extract class name from full path
                let class_name = import_path.rsplit('.').next().unwrap_or(&import_path).to_string();
                result.imports.push(ImportInfo {
                    source: import_path,
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

impl Default for JavaParser {
    fn default() -> Self {
        Self::new().expect("Failed to create Java parser")
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
        let mut parser = JavaParser::new().unwrap();
        let result = parser.parse("public class UserService extends BaseService implements IUserService { }");
        
        assert_eq!(result.classes.len(), 1);
        assert_eq!(result.classes[0].name, "UserService");
        assert_eq!(result.classes[0].extends, Some("BaseService".to_string()));
    }

    #[test]
    fn test_parse_method() {
        let mut parser = JavaParser::new().unwrap();
        let result = parser.parse("public class Test { public void hello(String name) { } }");
        
        assert!(result.functions.len() >= 1);
    }
}
