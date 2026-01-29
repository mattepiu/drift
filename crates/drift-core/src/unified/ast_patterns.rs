//! AST-Based Pattern Detection
//!
//! Primary detection method using tree-sitter queries for semantic patterns.
//! This is the core of Drift's "AST-first" architecture.
//!
//! Detects:
//! - Decorators/annotations (@auth, @route, @Injectable)
//! - Function signatures (async, export, public)
//! - Import/export patterns
//! - Class hierarchies
//! - Method calls and receivers

use std::collections::HashMap;
use tree_sitter::{Query, QueryCursor, Tree, Node};

use super::types::{
    DetectedPattern, DetectionMethod, Language, PatternCategory,
    StringLiteral, StringContext,
};

/// Pre-compiled AST queries for pattern detection
pub struct CompiledQuery {
    /// The tree-sitter query
    pub query: Query,
    /// Pattern type identifier
    pub pattern_type: String,
    /// Pattern category
    pub category: PatternCategory,
    /// Confidence score for matches
    pub confidence: f32,
}

/// AST-based pattern detector for all 9 languages
pub struct AstPatternDetector {
    /// Pre-compiled queries per language
    ts_queries: Vec<CompiledQuery>,
    js_queries: Vec<CompiledQuery>,
    py_queries: Vec<CompiledQuery>,
    java_queries: Vec<CompiledQuery>,
    csharp_queries: Vec<CompiledQuery>,
    php_queries: Vec<CompiledQuery>,
    go_queries: Vec<CompiledQuery>,
    rust_queries: Vec<CompiledQuery>,
    cpp_queries: Vec<CompiledQuery>,
}


impl AstPatternDetector {
    /// Create a new AST pattern detector with pre-compiled queries
    pub fn new() -> Result<Self, String> {
        Ok(Self {
            ts_queries: Self::build_typescript_queries()?,
            js_queries: Self::build_javascript_queries()?,
            py_queries: Self::build_python_queries()?,
            java_queries: Self::build_java_queries()?,
            csharp_queries: Self::build_csharp_queries()?,
            php_queries: Self::build_php_queries()?,
            go_queries: Self::build_go_queries()?,
            rust_queries: Self::build_rust_queries()?,
            cpp_queries: Self::build_cpp_queries()?,
        })
    }
    
    /// Get queries for a specific language
    fn get_queries(&self, language: Language) -> &[CompiledQuery] {
        match language {
            Language::TypeScript => &self.ts_queries,
            Language::JavaScript => &self.js_queries,
            Language::Python => &self.py_queries,
            Language::Java => &self.java_queries,
            Language::CSharp => &self.csharp_queries,
            Language::Php => &self.php_queries,
            Language::Go => &self.go_queries,
            Language::Rust => &self.rust_queries,
            Language::Cpp => &self.cpp_queries,
        }
    }
    
    /// Detect patterns from AST (primary detection method)
    pub fn detect(
        &self,
        tree: &Tree,
        source: &[u8],
        language: Language,
        file: &str,
    ) -> Vec<DetectedPattern> {
        let mut patterns = Vec::new();
        let mut cursor = QueryCursor::new();
        let root = tree.root_node();
        
        for compiled in self.get_queries(language) {
            let matches = cursor.matches(&compiled.query, root, source);
            
            for m in matches {
                if let Some(pattern) = self.extract_pattern(&m, &compiled, source, file) {
                    patterns.push(pattern);
                }
            }
        }
        
        patterns
    }

    
    /// Extract string literals from AST for regex fallback analysis
    pub fn extract_strings(
        &self,
        tree: &Tree,
        source: &[u8],
        language: Language,
    ) -> Vec<StringLiteral> {
        let mut strings = Vec::new();
        self.walk_for_strings(tree.root_node(), source, &mut strings, language);
        strings
    }
    
    /// Walk AST to find string literals
    fn walk_for_strings(
        &self,
        node: Node,
        source: &[u8],
        strings: &mut Vec<StringLiteral>,
        language: Language,
    ) {
        let kind = node.kind();
        
        // Check if this is a string literal node
        let is_string = match language {
            Language::TypeScript | Language::JavaScript => {
                kind == "string" || kind == "template_string"
            }
            Language::Python => {
                kind == "string" || kind == "concatenated_string"
            }
            Language::Java | Language::CSharp => {
                kind == "string_literal"
            }
            Language::Php => {
                kind == "string" || kind == "encapsed_string"
            }
            Language::Go => {
                kind == "interpreted_string_literal" || kind == "raw_string_literal"
            }
            Language::Rust => {
                kind == "string_literal" || kind == "raw_string_literal"
            }
            Language::Cpp => {
                kind == "string_literal" || kind == "raw_string_literal"
            }
        };
        
        if is_string {
            if let Ok(text) = node.utf8_text(source) {
                // Remove quotes
                let value = text
                    .trim_start_matches(|c| c == '"' || c == '\'' || c == '`')
                    .trim_end_matches(|c| c == '"' || c == '\'' || c == '`')
                    .to_string();
                
                if !value.is_empty() && value.len() > 3 {
                    let context = self.determine_string_context(&node);
                    strings.push(StringLiteral {
                        value,
                        line: node.start_position().row as u32 + 1,
                        column: node.start_position().column as u32 + 1,
                        context,
                    });
                }
            }
        }
        
        // Recurse into children
        let mut cursor = node.walk();
        if cursor.goto_first_child() {
            loop {
                self.walk_for_strings(cursor.node(), source, strings, language);
                if !cursor.goto_next_sibling() {
                    break;
                }
            }
        }
    }

    
    /// Determine the context of a string literal
    fn determine_string_context(&self, node: &Node) -> StringContext {
        if let Some(parent) = node.parent() {
            match parent.kind() {
                "arguments" | "argument_list" | "call_expression" => {
                    StringContext::FunctionArgument
                }
                "variable_declarator" | "assignment_expression" | "assignment" => {
                    StringContext::VariableAssignment
                }
                "pair" | "property" | "key_value_pair" => {
                    StringContext::ObjectProperty
                }
                "decorator" | "annotation" | "attribute" => {
                    StringContext::Decorator
                }
                "return_statement" => {
                    StringContext::ReturnValue
                }
                "array" | "list" | "array_expression" => {
                    StringContext::ArrayElement
                }
                _ => StringContext::Unknown,
            }
        } else {
            StringContext::Unknown
        }
    }
    
    /// Extract a pattern from a query match
    fn extract_pattern(
        &self,
        m: &tree_sitter::QueryMatch,
        compiled: &CompiledQuery,
        source: &[u8],
        file: &str,
    ) -> Option<DetectedPattern> {
        // Get the main capture (usually the first one)
        let capture = m.captures.first()?;
        let node = capture.node;
        let text = node.utf8_text(source).ok()?;
        
        Some(DetectedPattern {
            category: compiled.category,
            pattern_type: compiled.pattern_type.clone(),
            subcategory: None,
            file: file.to_string(),
            line: node.start_position().row as u32 + 1,
            column: node.start_position().column as u32 + 1,
            end_line: node.end_position().row as u32 + 1,
            end_column: node.end_position().column as u32 + 1,
            matched_text: text.to_string(),
            confidence: compiled.confidence,
            detection_method: DetectionMethod::AstQuery,
            metadata: None,
        })
    }

    
    // =========================================================================
    // TypeScript/JavaScript Queries
    // =========================================================================
    
    fn build_typescript_queries() -> Result<Vec<CompiledQuery>, String> {
        let lang = tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into();
        let mut queries = Vec::new();
        
        // Auth: Decorator patterns
        if let Ok(q) = Query::new(&lang, r#"
            (decorator
                (call_expression
                    function: (identifier) @name
                    (#match? @name "^(Auth|RequireAuth|Authenticated|Protected|Guard)$")
                )
            ) @decorator
        "#) {
            queries.push(CompiledQuery {
                query: q,
                pattern_type: "auth-decorator".to_string(),
                category: PatternCategory::Auth,
                confidence: 0.95,
            });
        }
        
        // Auth: Middleware usage
        if let Ok(q) = Query::new(&lang, r#"
            (call_expression
                function: (member_expression
                    property: (property_identifier) @method
                    (#eq? @method "use")
                )
                arguments: (arguments
                    (identifier) @middleware
                    (#match? @middleware "(?i)auth|protect|guard|verify|session")
                )
            ) @call
        "#) {
            queries.push(CompiledQuery {
                query: q,
                pattern_type: "middleware-usage".to_string(),
                category: PatternCategory::Auth,
                confidence: 0.9,
            });
        }
        
        // API: Route definitions
        if let Ok(q) = Query::new(&lang, r#"
            (call_expression
                function: (member_expression
                    property: (property_identifier) @method
                    (#match? @method "^(get|post|put|patch|delete|all)$")
                )
                arguments: (arguments
                    (string) @route
                )
            ) @call
        "#) {
            queries.push(CompiledQuery {
                query: q,
                pattern_type: "express-route".to_string(),
                category: PatternCategory::Api,
                confidence: 0.9,
            });
        }
        
        // Errors: Try-catch blocks
        if let Ok(q) = Query::new(&lang, r#"
            (try_statement
                body: (statement_block) @try_body
                handler: (catch_clause
                    parameter: (identifier)? @error_param
                    body: (statement_block) @catch_body
                )?
            ) @try_catch
        "#) {
            queries.push(CompiledQuery {
                query: q,
                pattern_type: "try-catch".to_string(),
                category: PatternCategory::Errors,
                confidence: 0.95,
            });
        }
        
        Ok(queries)
    }

    
    fn build_javascript_queries() -> Result<Vec<CompiledQuery>, String> {
        // JavaScript uses same queries as TypeScript (subset)
        let lang = tree_sitter_javascript::LANGUAGE.into();
        let mut queries = Vec::new();
        
        // API: Route definitions
        if let Ok(q) = Query::new(&lang, r#"
            (call_expression
                function: (member_expression
                    property: (property_identifier) @method
                    (#match? @method "^(get|post|put|patch|delete|all)$")
                )
                arguments: (arguments
                    (string) @route
                )
            ) @call
        "#) {
            queries.push(CompiledQuery {
                query: q,
                pattern_type: "express-route".to_string(),
                category: PatternCategory::Api,
                confidence: 0.9,
            });
        }
        
        // Errors: Try-catch blocks
        if let Ok(q) = Query::new(&lang, r#"
            (try_statement
                body: (statement_block) @try_body
                handler: (catch_clause
                    parameter: (identifier)? @error_param
                    body: (statement_block) @catch_body
                )?
            ) @try_catch
        "#) {
            queries.push(CompiledQuery {
                query: q,
                pattern_type: "try-catch".to_string(),
                category: PatternCategory::Errors,
                confidence: 0.95,
            });
        }
        
        Ok(queries)
    }
    
    // =========================================================================
    // Python Queries
    // =========================================================================
    
    fn build_python_queries() -> Result<Vec<CompiledQuery>, String> {
        let lang = tree_sitter_python::LANGUAGE.into();
        let mut queries = Vec::new();
        
        // Auth: FastAPI Depends
        if let Ok(q) = Query::new(&lang, r#"
            (call
                function: (identifier) @func
                (#eq? @func "Depends")
                arguments: (argument_list
                    (identifier) @dependency
                )
            ) @call
        "#) {
            queries.push(CompiledQuery {
                query: q,
                pattern_type: "fastapi-depends".to_string(),
                category: PatternCategory::Auth,
                confidence: 0.9,
            });
        }
        
        // Auth: Decorators
        if let Ok(q) = Query::new(&lang, r#"
            (decorator
                (identifier) @name
                (#match? @name "^(login_required|requires_auth|authenticated|permission_required)$")
            ) @decorator
        "#) {
            queries.push(CompiledQuery {
                query: q,
                pattern_type: "auth-decorator".to_string(),
                category: PatternCategory::Auth,
                confidence: 0.95,
            });
        }
        
        // API: FastAPI route decorators
        if let Ok(q) = Query::new(&lang, r#"
            (decorator
                (call
                    function: (attribute
                        attribute: (identifier) @method
                        (#match? @method "^(get|post|put|patch|delete)$")
                    )
                    arguments: (argument_list
                        (string) @route
                    )
                )
            ) @decorator
        "#) {
            queries.push(CompiledQuery {
                query: q,
                pattern_type: "fastapi-route".to_string(),
                category: PatternCategory::Api,
                confidence: 0.9,
            });
        }
        
        // Errors: Try-except blocks
        if let Ok(q) = Query::new(&lang, r#"
            (try_statement
                body: (block) @try_body
                (except_clause
                    (identifier)? @exception_type
                    (as_pattern (identifier) @error_var)?
                    body: (block) @except_body
                )?
            ) @try_except
        "#) {
            queries.push(CompiledQuery {
                query: q,
                pattern_type: "try-except".to_string(),
                category: PatternCategory::Errors,
                confidence: 0.95,
            });
        }
        
        Ok(queries)
    }

    
    // =========================================================================
    // Java Queries
    // =========================================================================
    
    fn build_java_queries() -> Result<Vec<CompiledQuery>, String> {
        let lang = tree_sitter_java::LANGUAGE.into();
        let mut queries = Vec::new();
        
        // Auth: Spring Security annotations
        if let Ok(q) = Query::new(&lang, r#"
            (annotation
                name: (identifier) @name
                (#match? @name "^(PreAuthorize|Secured|RolesAllowed|PermitAll|DenyAll)$")
            ) @annotation
        "#) {
            queries.push(CompiledQuery {
                query: q,
                pattern_type: "spring-security".to_string(),
                category: PatternCategory::Auth,
                confidence: 0.95,
            });
        }
        
        // API: Spring RequestMapping
        if let Ok(q) = Query::new(&lang, r#"
            (annotation
                name: (identifier) @name
                (#match? @name "^(RequestMapping|GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping)$")
            ) @annotation
        "#) {
            queries.push(CompiledQuery {
                query: q,
                pattern_type: "spring-route".to_string(),
                category: PatternCategory::Api,
                confidence: 0.95,
            });
        }
        
        // DataAccess: JPA annotations
        if let Ok(q) = Query::new(&lang, r#"
            (annotation
                name: (identifier) @name
                (#match? @name "^(Entity|Table|Repository|Query)$")
            ) @annotation
        "#) {
            queries.push(CompiledQuery {
                query: q,
                pattern_type: "jpa-entity".to_string(),
                category: PatternCategory::DataAccess,
                confidence: 0.95,
            });
        }
        
        // Errors: Try-catch blocks
        if let Ok(q) = Query::new(&lang, r#"
            (try_statement
                body: (block) @try_body
                (catch_clause
                    (catch_formal_parameter
                        type: (_) @exception_type
                        name: (identifier) @error_var
                    )
                    body: (block) @catch_body
                )*
            ) @try_catch
        "#) {
            queries.push(CompiledQuery {
                query: q,
                pattern_type: "try-catch".to_string(),
                category: PatternCategory::Errors,
                confidence: 0.95,
            });
        }
        
        Ok(queries)
    }
    
    // =========================================================================
    // C# Queries
    // =========================================================================
    
    fn build_csharp_queries() -> Result<Vec<CompiledQuery>, String> {
        let lang = tree_sitter_c_sharp::LANGUAGE.into();
        let mut queries = Vec::new();
        
        // Auth: Authorize attribute
        if let Ok(q) = Query::new(&lang, r#"
            (attribute
                name: (identifier) @name
                (#match? @name "^(Authorize|AllowAnonymous)$")
            ) @attribute
        "#) {
            queries.push(CompiledQuery {
                query: q,
                pattern_type: "authorize-attribute".to_string(),
                category: PatternCategory::Auth,
                confidence: 0.95,
            });
        }
        
        // API: ASP.NET route attributes
        if let Ok(q) = Query::new(&lang, r#"
            (attribute
                name: (identifier) @name
                (#match? @name "^(HttpGet|HttpPost|HttpPut|HttpDelete|HttpPatch|Route)$")
            ) @attribute
        "#) {
            queries.push(CompiledQuery {
                query: q,
                pattern_type: "aspnet-route".to_string(),
                category: PatternCategory::Api,
                confidence: 0.95,
            });
        }
        
        // DataAccess: Entity Framework
        if let Ok(q) = Query::new(&lang, r#"
            (attribute
                name: (identifier) @name
                (#match? @name "^(Table|Key|Column|ForeignKey|DbContext)$")
            ) @attribute
        "#) {
            queries.push(CompiledQuery {
                query: q,
                pattern_type: "ef-entity".to_string(),
                category: PatternCategory::DataAccess,
                confidence: 0.95,
            });
        }
        
        Ok(queries)
    }

    
    // =========================================================================
    // PHP Queries
    // =========================================================================
    
    fn build_php_queries() -> Result<Vec<CompiledQuery>, String> {
        let lang = tree_sitter_php::LANGUAGE_PHP.into();
        let mut queries = Vec::new();
        
        // Auth: Laravel middleware
        if let Ok(q) = Query::new(&lang, r#"
            (method_call_expression
                name: (name) @method
                (#eq? @method "middleware")
                arguments: (arguments
                    (string) @middleware_name
                )
            ) @call
        "#) {
            queries.push(CompiledQuery {
                query: q,
                pattern_type: "laravel-middleware".to_string(),
                category: PatternCategory::Auth,
                confidence: 0.9,
            });
        }
        
        // API: Laravel route definitions
        if let Ok(q) = Query::new(&lang, r#"
            (scoped_call_expression
                scope: (name) @class
                (#eq? @class "Route")
                name: (name) @method
                (#match? @method "^(get|post|put|patch|delete|any)$")
            ) @call
        "#) {
            queries.push(CompiledQuery {
                query: q,
                pattern_type: "laravel-route".to_string(),
                category: PatternCategory::Api,
                confidence: 0.9,
            });
        }
        
        // DataAccess: Eloquent models
        if let Ok(q) = Query::new(&lang, r#"
            (class_declaration
                name: (name) @class_name
                (base_clause
                    (name) @parent
                    (#eq? @parent "Model")
                )
            ) @class
        "#) {
            queries.push(CompiledQuery {
                query: q,
                pattern_type: "eloquent-model".to_string(),
                category: PatternCategory::DataAccess,
                confidence: 0.9,
            });
        }
        
        Ok(queries)
    }
    
    // =========================================================================
    // Go Queries
    // =========================================================================
    
    fn build_go_queries() -> Result<Vec<CompiledQuery>, String> {
        let lang = tree_sitter_go::LANGUAGE.into();
        let mut queries = Vec::new();
        
        // API: HTTP handler functions
        if let Ok(q) = Query::new(&lang, r#"
            (call_expression
                function: (selector_expression
                    operand: (identifier) @receiver
                    field: (field_identifier) @method
                    (#match? @method "^(HandleFunc|Handle|Get|Post|Put|Delete|Patch)$")
                )
            ) @call
        "#) {
            queries.push(CompiledQuery {
                query: q,
                pattern_type: "http-handler".to_string(),
                category: PatternCategory::Api,
                confidence: 0.9,
            });
        }
        
        // Errors: Error handling patterns
        if let Ok(q) = Query::new(&lang, r#"
            (if_statement
                condition: (binary_expression
                    left: (identifier) @err
                    (#eq? @err "err")
                    operator: "!="
                    right: (nil)
                )
            ) @error_check
        "#) {
            queries.push(CompiledQuery {
                query: q,
                pattern_type: "error-check".to_string(),
                category: PatternCategory::Errors,
                confidence: 0.9,
            });
        }
        
        Ok(queries)
    }

    
    // =========================================================================
    // Rust Queries
    // =========================================================================
    
    fn build_rust_queries() -> Result<Vec<CompiledQuery>, String> {
        let lang = tree_sitter_rust::LANGUAGE.into();
        let mut queries = Vec::new();
        
        // API: Actix/Axum route attributes
        if let Ok(q) = Query::new(&lang, r#"
            (attribute_item
                (attribute
                    (identifier) @name
                    (#match? @name "^(get|post|put|delete|patch|route)$")
                )
            ) @attribute
        "#) {
            queries.push(CompiledQuery {
                query: q,
                pattern_type: "actix-route".to_string(),
                category: PatternCategory::Api,
                confidence: 0.9,
            });
        }
        
        // Errors: Result handling
        if let Ok(q) = Query::new(&lang, r#"
            (match_expression
                value: (try_expression) @try_expr
            ) @match
        "#) {
            queries.push(CompiledQuery {
                query: q,
                pattern_type: "result-match".to_string(),
                category: PatternCategory::Errors,
                confidence: 0.85,
            });
        }
        
        // DataAccess: Diesel/SQLx derives
        if let Ok(q) = Query::new(&lang, r#"
            (attribute_item
                (attribute
                    (identifier) @name
                    (#match? @name "^(derive)$")
                    arguments: (token_tree) @derives
                )
            ) @attribute
        "#) {
            queries.push(CompiledQuery {
                query: q,
                pattern_type: "derive-attribute".to_string(),
                category: PatternCategory::DataAccess,
                confidence: 0.8,
            });
        }
        
        Ok(queries)
    }
    
    // =========================================================================
    // C++ Queries
    // =========================================================================
    
    fn build_cpp_queries() -> Result<Vec<CompiledQuery>, String> {
        let lang = tree_sitter_cpp::LANGUAGE.into();
        let mut queries = Vec::new();
        
        // Errors: Try-catch blocks
        if let Ok(q) = Query::new(&lang, r#"
            (try_statement
                body: (compound_statement) @try_body
                (catch_clause
                    parameters: (parameter_list
                        (parameter_declaration
                            type: (_) @exception_type
                        )
                    )?
                    body: (compound_statement) @catch_body
                )*
            ) @try_catch
        "#) {
            queries.push(CompiledQuery {
                query: q,
                pattern_type: "try-catch".to_string(),
                category: PatternCategory::Errors,
                confidence: 0.95,
            });
        }
        
        // API: REST SDK patterns (Crow, Pistache, etc.)
        if let Ok(q) = Query::new(&lang, r#"
            (call_expression
                function: (qualified_identifier) @func
                (#match? @func "CROW_ROUTE|route")
            ) @call
        "#) {
            queries.push(CompiledQuery {
                query: q,
                pattern_type: "cpp-route".to_string(),
                category: PatternCategory::Api,
                confidence: 0.85,
            });
        }
        
        Ok(queries)
    }
}

impl Default for AstPatternDetector {
    fn default() -> Self {
        Self::new().expect("Failed to create AST pattern detector")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_detector_creation() {
        let detector = AstPatternDetector::new();
        assert!(detector.is_ok());
    }
}
