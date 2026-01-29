//! TypeScript/JavaScript parser using native tree-sitter
//!
//! Extracts functions, classes, imports, exports, and call sites.

use std::time::Instant;
use tree_sitter::{Node, Parser, Query, QueryCursor};

use super::types::*;

/// TypeScript/JavaScript parser
pub struct TypeScriptParser {
    parser: Parser,
    function_query: Query,
    class_query: Query,
    import_query: Query,
    export_query: Query,
    call_query: Query,
}

impl TypeScriptParser {
    /// Create a new TypeScript parser
    pub fn new() -> Result<Self, String> {
        let mut parser = Parser::new();
        let language = tree_sitter_typescript::LANGUAGE_TYPESCRIPT;
        parser.set_language(&language.into())
            .map_err(|e| format!("Failed to set language: {}", e))?;
        
        // Query for functions (function declarations, arrow functions, methods)
        let function_query = Query::new(
            &language.into(),
            r#"
            (function_declaration
                name: (identifier) @name
                parameters: (formal_parameters) @params
                return_type: (type_annotation)? @return_type
            ) @function
            
            (method_definition
                name: (property_identifier) @name
                parameters: (formal_parameters) @params
                return_type: (type_annotation)? @return_type
            ) @method
            
            (arrow_function
                parameters: [(formal_parameters) (identifier)] @params
                return_type: (type_annotation)? @return_type
            ) @arrow
            "#,
        ).map_err(|e| format!("Failed to create function query: {}", e))?;
        
        // Query for classes
        let class_query = Query::new(
            &language.into(),
            r#"
            (class_declaration
                name: (type_identifier) @name
                (class_heritage
                    (extends_clause (identifier) @extends)?
                    (implements_clause (type_identifier) @implements)*
                )?
            ) @class
            "#,
        ).map_err(|e| format!("Failed to create class query: {}", e))?;
        
        // Query for imports
        let import_query = Query::new(
            &language.into(),
            r#"
            (import_statement
                (import_clause
                    (identifier)? @default
                    (named_imports (import_specifier (identifier) @named)*)?
                    (namespace_import (identifier) @namespace)?
                )?
                source: (string) @source
            ) @import
            "#,
        ).map_err(|e| format!("Failed to create import query: {}", e))?;
        
        // Query for exports
        let export_query = Query::new(
            &language.into(),
            r#"
            (export_statement
                (export_clause (export_specifier name: (identifier) @name)*)? 
                source: (string)? @source
                declaration: [
                    (function_declaration name: (identifier) @decl_name)
                    (class_declaration name: (type_identifier) @decl_name)
                    (lexical_declaration (variable_declarator name: (identifier) @decl_name))
                ]?
            ) @export
            "#,
        ).map_err(|e| format!("Failed to create export query: {}", e))?;
        
        // Query for function calls
        let call_query = Query::new(
            &language.into(),
            r#"
            (call_expression
                function: [
                    (identifier) @callee
                    (member_expression
                        object: (_) @receiver
                        property: (property_identifier) @callee
                    )
                ]
                arguments: (arguments) @args
            ) @call
            "#,
        ).map_err(|e| format!("Failed to create call query: {}", e))?;
        
        Ok(Self {
            parser,
            function_query,
            class_query,
            import_query,
            export_query,
            call_query,
        })
    }
    
    /// Parse TypeScript/JavaScript source code
    pub fn parse(&mut self, source: &str, is_typescript: bool) -> ParseResult {
        let start = Instant::now();
        
        // Parse the source
        let tree = match self.parser.parse(source, None) {
            Some(t) => t,
            None => {
                let mut result = ParseResult::new(
                    if is_typescript { Language::TypeScript } else { Language::JavaScript }
                );
                result.errors.push(ParseError {
                    message: "Failed to parse source".to_string(),
                    range: Range::new(0, 0, 0, 0),
                });
                return result;
            }
        };
        
        let root = tree.root_node();
        let source_bytes = source.as_bytes();
        
        // Create result with tree
        let mut result = ParseResult::with_tree(
            if is_typescript { Language::TypeScript } else { Language::JavaScript },
            tree.clone(),
        );
        
        // Extract functions
        self.extract_functions(&root, source_bytes, &mut result);
        
        // Extract classes
        self.extract_classes(&root, source_bytes, &mut result);
        
        // Extract imports
        self.extract_imports(&root, source_bytes, &mut result);
        
        // Extract exports
        self.extract_exports(&root, source_bytes, &mut result);
        
        // Extract calls
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
            let mut is_async = false;
            
            for capture in m.captures {
                let node = capture.node;
                let capture_name = self.function_query.capture_names()[capture.index as usize];
                
                match capture_name {
                    "name" => {
                        name = node.utf8_text(source).unwrap_or("").to_string();
                    }
                    "function" | "method" | "arrow" => {
                        range = node_range(&node);
                        // Check for async keyword
                        let text = node.utf8_text(source).unwrap_or("");
                        is_async = text.trim_start().starts_with("async ");
                    }
                    _ => {}
                }
            }
            
            if !name.is_empty() {
                result.functions.push(FunctionInfo {
                    name,
                    qualified_name: None,
                    parameters: Vec::new(), // TODO: extract params
                    return_type: None,
                    is_exported: false, // Will be updated by export analysis
                    is_async,
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
                    "class" => {
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
                    is_exported: false,
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
        // Extract ES6 imports
        let mut cursor = QueryCursor::new();
        let matches = cursor.matches(&self.import_query, *root, source);
        
        for m in matches {
            let mut import_source = String::new();
            let mut named = Vec::new();
            let mut default = None;
            let mut namespace = None;
            let mut range = Range::new(0, 0, 0, 0);
            
            for capture in m.captures {
                let node = capture.node;
                let capture_name = self.import_query.capture_names()[capture.index as usize];
                
                match capture_name {
                    "source" => {
                        // Remove quotes from string
                        let text = node.utf8_text(source).unwrap_or("");
                        import_source = text.trim_matches(|c| c == '"' || c == '\'').to_string();
                    }
                    "named" => {
                        named.push(node.utf8_text(source).unwrap_or("").to_string());
                    }
                    "default" => {
                        default = Some(node.utf8_text(source).unwrap_or("").to_string());
                    }
                    "namespace" => {
                        namespace = Some(node.utf8_text(source).unwrap_or("").to_string());
                    }
                    "import" => {
                        range = node_range(&node);
                    }
                    _ => {}
                }
            }
            
            if !import_source.is_empty() {
                result.imports.push(ImportInfo {
                    source: import_source,
                    named,
                    default,
                    namespace,
                    is_type_only: false, // TODO: detect type imports
                    range,
                });
            }
        }
        
        // Extract CommonJS require() calls
        self.extract_require_imports(root, source, result);
    }
    
    /// Extract CommonJS require() imports
    fn extract_require_imports(&self, root: &Node, source: &[u8], result: &mut ParseResult) {
        // Walk the tree looking for require() calls
        let mut cursor = root.walk();
        let mut stack = vec![*root];
        
        while let Some(node) = stack.pop() {
            // Look for variable declarations with require()
            if node.kind() == "variable_declarator" || node.kind() == "lexical_declaration" || node.kind() == "variable_declaration" {
                let text = node.utf8_text(source).unwrap_or("");
                
                // Check for require() pattern
                if let Some(require_start) = text.find("require(") {
                    // Extract the module path
                    let after_require = &text[require_start + 8..];
                    if let Some(quote_start) = after_require.find(|c| c == '"' || c == '\'') {
                        let quote_char = after_require.chars().nth(quote_start).unwrap();
                        let path_start = quote_start + 1;
                        if let Some(quote_end) = after_require[path_start..].find(quote_char) {
                            let module_path = &after_require[path_start..path_start + quote_end];
                            
                            // Extract variable name(s)
                            let mut named = Vec::new();
                            let mut default = None;
                            
                            // Check for destructuring: const { foo, bar } = require('...')
                            if let Some(brace_start) = text.find('{') {
                                if let Some(brace_end) = text.find('}') {
                                    let destructured = &text[brace_start + 1..brace_end];
                                    for name in destructured.split(',') {
                                        let name = name.trim();
                                        if !name.is_empty() {
                                            named.push(name.to_string());
                                        }
                                    }
                                }
                            } else {
                                // Simple: const foo = require('...')
                                if let Some(eq_pos) = text.find('=') {
                                    let before_eq = text[..eq_pos].trim();
                                    // Remove const/let/var
                                    let var_name = before_eq
                                        .trim_start_matches("const ")
                                        .trim_start_matches("let ")
                                        .trim_start_matches("var ")
                                        .trim();
                                    if !var_name.is_empty() {
                                        default = Some(var_name.to_string());
                                    }
                                }
                            }
                            
                            result.imports.push(ImportInfo {
                                source: module_path.to_string(),
                                named,
                                default,
                                namespace: None,
                                is_type_only: false,
                                range: node_range(&node),
                            });
                        }
                    }
                }
            }
            
            // Add children to stack
            cursor.reset(node);
            if cursor.goto_first_child() {
                loop {
                    stack.push(cursor.node());
                    if !cursor.goto_next_sibling() {
                        break;
                    }
                }
            }
        }
    }
    
    fn extract_exports(&self, root: &Node, source: &[u8], result: &mut ParseResult) {
        let mut cursor = QueryCursor::new();
        let matches = cursor.matches(&self.export_query, *root, source);
        
        for m in matches {
            let mut names = Vec::new();
            let mut from_source = None;
            let mut range = Range::new(0, 0, 0, 0);
            
            for capture in m.captures {
                let node = capture.node;
                let capture_name = self.export_query.capture_names()[capture.index as usize];
                
                match capture_name {
                    "name" | "decl_name" => {
                        names.push(node.utf8_text(source).unwrap_or("").to_string());
                    }
                    "source" => {
                        let text = node.utf8_text(source).unwrap_or("");
                        from_source = Some(text.trim_matches(|c| c == '"' || c == '\'').to_string());
                    }
                    "export" => {
                        range = node_range(&node);
                    }
                    _ => {}
                }
            }
            
            for name in names {
                if !name.is_empty() {
                    result.exports.push(ExportInfo {
                        name: name.clone(),
                        original_name: None,
                        from_source: from_source.clone(),
                        is_type_only: false,
                        is_default: false,
                        range,
                    });
                }
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

impl Default for TypeScriptParser {
    fn default() -> Self {
        Self::new().expect("Failed to create TypeScript parser")
    }
}

/// Convert tree-sitter node to Range
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
        let mut parser = TypeScriptParser::new().unwrap();
        let result = parser.parse("function hello(name: string): void { console.log(name); }", true);
        
        assert_eq!(result.functions.len(), 1);
        assert_eq!(result.functions[0].name, "hello");
    }

    #[test]
    fn test_parse_class() {
        let mut parser = TypeScriptParser::new().unwrap();
        let result = parser.parse("class MyClass extends Base { }", true);
        
        assert_eq!(result.classes.len(), 1);
        assert_eq!(result.classes[0].name, "MyClass");
        assert_eq!(result.classes[0].extends, Some("Base".to_string()));
    }

    #[test]
    fn test_parse_import() {
        let mut parser = TypeScriptParser::new().unwrap();
        let result = parser.parse("import { foo, bar } from './module';", true);
        
        assert_eq!(result.imports.len(), 1);
        assert_eq!(result.imports[0].source, "./module");
        assert!(result.imports[0].named.contains(&"foo".to_string()));
    }

    #[test]
    fn test_parse_calls() {
        let mut parser = TypeScriptParser::new().unwrap();
        let result = parser.parse("console.log('hello'); fetch('/api');", true);
        
        assert!(result.calls.len() >= 2);
    }
}
