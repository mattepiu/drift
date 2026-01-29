//! AST-based constant extraction for all supported languages
//!
//! Uses tree-sitter queries to extract const/final/static declarations.

use crate::parsers::{Language, ParseResult};
use super::types::{ConstantInfo, ConstantValue, ConstantCategory};
use tree_sitter::{Query, QueryCursor};

/// Extracts constants from parsed source code
pub struct ConstantExtractor {
    // Tree-sitter queries for each language
    ts_query: Option<Query>,
    py_query: Option<Query>,
    java_query: Option<Query>,
    csharp_query: Option<Query>,
    go_query: Option<Query>,
    php_query: Option<Query>,
    rust_query: Option<Query>,
    cpp_query: Option<Query>,
}

impl ConstantExtractor {
    pub fn new() -> Self {
        Self {
            ts_query: Self::create_ts_query(),
            py_query: Self::create_py_query(),
            java_query: Self::create_java_query(),
            csharp_query: Self::create_csharp_query(),
            go_query: Self::create_go_query(),
            php_query: Self::create_php_query(),
            rust_query: Self::create_rust_query(),
            cpp_query: Self::create_cpp_query(),
        }
    }

    /// Extract constants from a parse result
    pub fn extract(&self, result: &ParseResult, file_path: &str, source: &str) -> Vec<ConstantInfo> {
        let tree = match &result.tree {
            Some(t) => t,
            None => return Vec::new(),
        };

        let query = match result.language {
            Language::TypeScript | Language::JavaScript => self.ts_query.as_ref(),
            Language::Python => self.py_query.as_ref(),
            Language::Java => self.java_query.as_ref(),
            Language::CSharp => self.csharp_query.as_ref(),
            Language::Go => self.go_query.as_ref(),
            Language::Php => self.php_query.as_ref(),
            Language::Rust => self.rust_query.as_ref(),
            Language::Cpp | Language::C => self.cpp_query.as_ref(),
        };

        let query = match query {
            Some(q) => q,
            None => return Vec::new(),
        };

        let mut cursor = QueryCursor::new();
        let mut constants = Vec::new();
        let source_bytes = source.as_bytes();

        for match_ in cursor.matches(query, tree.root_node(), source_bytes) {
            if let Some(constant) = self.extract_from_match(&match_, source, file_path, result.language) {
                constants.push(constant);
            }
        }

        constants
    }

    fn extract_from_match(
        &self,
        match_: &tree_sitter::QueryMatch,
        source: &str,
        file_path: &str,
        language: Language,
    ) -> Option<ConstantInfo> {
        let mut name = String::new();
        let mut value = ConstantValue::Unknown;
        let mut line = 0u32;
        let mut column = 0u32;
        let mut is_exported = false;
        let decl_type = "const".to_string();

        for capture in match_.captures {
            let text = capture.node.utf8_text(source.as_bytes()).unwrap_or("");

            match capture.index {
                0 => {
                    name = text.to_string();
                    line = capture.node.start_position().row as u32 + 1;
                    column = capture.node.start_position().column as u32;
                }
                1 => {
                    value = Self::parse_value(text);
                }
                2 => {
                    is_exported = true;
                }
                _ => {}
            }
        }

        if name.is_empty() {
            return None;
        }

        let category = Self::categorize_constant(&name, &value);

        Some(ConstantInfo {
            name,
            value,
            category,
            file: file_path.to_string(),
            line,
            column,
            is_exported,
            language: format!("{:?}", language).to_lowercase(),
            declaration_type: decl_type,
        })
    }

    fn parse_value(text: &str) -> ConstantValue {
        let trimmed = text.trim();
        
        if trimmed == "true" || trimmed == "True" || trimmed == "TRUE" {
            return ConstantValue::Boolean(true);
        }
        if trimmed == "false" || trimmed == "False" || trimmed == "FALSE" {
            return ConstantValue::Boolean(false);
        }
        
        if let Ok(n) = trimmed.parse::<f64>() {
            return ConstantValue::Number(n);
        }
        
        if (trimmed.starts_with('"') && trimmed.ends_with('"')) ||
           (trimmed.starts_with('\'') && trimmed.ends_with('\'')) ||
           (trimmed.starts_with('`') && trimmed.ends_with('`')) {
            let inner = &trimmed[1..trimmed.len()-1];
            return ConstantValue::String(inner.to_string());
        }
        
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            return ConstantValue::Array(Vec::new());
        }
        
        if trimmed.starts_with('{') && trimmed.ends_with('}') {
            return ConstantValue::Object(trimmed.to_string());
        }
        
        ConstantValue::String(trimmed.to_string())
    }

    fn categorize_constant(name: &str, _value: &ConstantValue) -> ConstantCategory {
        let name_lower = name.to_lowercase();
        
        if name_lower.contains("timeout") || name_lower.contains("interval") ||
           name_lower.contains("delay") || name_lower.contains("ttl") ||
           name_lower.contains("cache") || name_lower.contains("config") {
            return ConstantCategory::Config;
        }
        
        if name_lower.contains("api") || name_lower.contains("endpoint") ||
           name_lower.contains("url") || name_lower.contains("uri") ||
           name_lower.contains("version") || name_lower.contains("header") {
            return ConstantCategory::Api;
        }
        
        if name_lower.contains("status") || name_lower.contains("state") ||
           name_lower.starts_with("http_") || name_lower.contains("code") {
            return ConstantCategory::Status;
        }
        
        if name_lower.contains("error") || name_lower.contains("err_") ||
           name_lower.starts_with("e_") || name_lower.contains("exception") {
            return ConstantCategory::Error;
        }
        
        if name_lower.contains("feature") || name_lower.contains("flag") ||
           name_lower.contains("enable") || name_lower.contains("disable") ||
           name_lower.starts_with("ff_") || name_lower.starts_with("is_") {
            return ConstantCategory::FeatureFlag;
        }

        if name_lower.contains("max") || name_lower.contains("min") ||
           name_lower.contains("limit") || name_lower.contains("size") ||
           name_lower.contains("count") || name_lower.contains("length") {
            return ConstantCategory::Limit;
        }
        
        if name_lower.contains("regex") || name_lower.contains("pattern") ||
           name_lower.contains("regexp") {
            return ConstantCategory::Regex;
        }
        
        if name_lower.contains("path") || name_lower.contains("dir") ||
           name_lower.contains("file") || name_lower.contains("folder") {
            return ConstantCategory::Path;
        }
        
        if name_lower.contains("env") || name_lower.ends_with("_key") ||
           name_lower.ends_with("_name") {
            return ConstantCategory::Env;
        }
        
        if name_lower.contains("permission") || name_lower.contains("role") ||
           name_lower.contains("scope") || name_lower.contains("auth") {
            return ConstantCategory::Security;
        }
        
        ConstantCategory::Uncategorized
    }


    fn create_ts_query() -> Option<Query> {
        let ts_lang = tree_sitter_typescript::LANGUAGE_TYPESCRIPT;
        Query::new(&ts_lang.into(), r#"
            (lexical_declaration
                (variable_declarator
                    name: (identifier) @name
                    value: (_) @value))
        "#).ok()
    }

    fn create_py_query() -> Option<Query> {
        let py_lang = tree_sitter_python::LANGUAGE;
        Query::new(&py_lang.into(), r#"
            (assignment
                left: (identifier) @name
                right: (_) @value)
        "#).ok()
    }

    fn create_java_query() -> Option<Query> {
        let java_lang = tree_sitter_java::LANGUAGE;
        Query::new(&java_lang.into(), r#"
            (field_declaration
                declarator: (variable_declarator
                    name: (identifier) @name
                    value: (_) @value))
        "#).ok()
    }

    fn create_csharp_query() -> Option<Query> {
        let cs_lang = tree_sitter_c_sharp::LANGUAGE;
        Query::new(&cs_lang.into(), r#"
            (field_declaration
                (variable_declaration
                    (variable_declarator
                        (identifier) @name)))
        "#).ok()
    }

    fn create_go_query() -> Option<Query> {
        let go_lang = tree_sitter_go::LANGUAGE;
        Query::new(&go_lang.into(), r#"
            (const_declaration
                (const_spec
                    name: (identifier) @name))
        "#).ok()
    }

    fn create_php_query() -> Option<Query> {
        let php_lang = tree_sitter_php::LANGUAGE_PHP;
        Query::new(&php_lang.into(), r#"
            (const_declaration
                (const_element
                    name: (name) @name))
        "#).ok()
    }

    fn create_rust_query() -> Option<Query> {
        let rust_lang = tree_sitter_rust::LANGUAGE;
        Query::new(&rust_lang.into(), r#"
            (const_item
                name: (identifier) @name)
        "#).ok()
    }

    fn create_cpp_query() -> Option<Query> {
        let cpp_lang = tree_sitter_cpp::LANGUAGE;
        Query::new(&cpp_lang.into(), r#"
            (declaration
                declarator: (init_declarator
                    declarator: (identifier) @name))
        "#).ok()
    }
}

impl Default for ConstantExtractor {
    fn default() -> Self {
        Self::new()
    }
}
