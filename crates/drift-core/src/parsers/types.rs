//! Parser types - Core data structures for AST parsing

use serde::{Deserialize, Serialize};

/// Supported languages
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    TypeScript,
    JavaScript,
    Python,
    Java,
    CSharp,
    Php,
    Go,
    Rust,
    Cpp,
    C,
}

impl Language {
    /// Get language from file extension
    pub fn from_extension(ext: &str) -> Option<Self> {
        match ext.to_lowercase().as_str() {
            "ts" | "tsx" | "mts" | "cts" => Some(Language::TypeScript),
            "js" | "jsx" | "mjs" | "cjs" => Some(Language::JavaScript),
            "py" | "pyi" => Some(Language::Python),
            "java" => Some(Language::Java),
            "cs" => Some(Language::CSharp),
            "php" => Some(Language::Php),
            "go" => Some(Language::Go),
            "rs" => Some(Language::Rust),
            "cpp" | "cc" | "cxx" | "hpp" | "hh" | "hxx" => Some(Language::Cpp),
            "c" | "h" => Some(Language::C),
            _ => None,
        }
    }
    
    /// Get language from file path
    pub fn from_path(path: &str) -> Option<Self> {
        let ext = path.rsplit('.').next()?;
        Self::from_extension(ext)
    }
}

/// Position in source code
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Position {
    pub line: u32,
    pub column: u32,
}

/// Range in source code
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Range {
    pub start: Position,
    pub end: Position,
}

impl Range {
    pub fn new(start_line: u32, start_col: u32, end_line: u32, end_col: u32) -> Self {
        Self {
            start: Position { line: start_line, column: start_col },
            end: Position { line: end_line, column: end_col },
        }
    }
}

/// A function/method extracted from source code
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionInfo {
    /// Function name
    pub name: String,
    /// Full qualified name (e.g., "ClassName.methodName")
    pub qualified_name: Option<String>,
    /// Parameters
    pub parameters: Vec<ParameterInfo>,
    /// Return type (if available)
    pub return_type: Option<String>,
    /// Is this function exported/public?
    pub is_exported: bool,
    /// Is this an async function?
    pub is_async: bool,
    /// Is this a generator?
    pub is_generator: bool,
    /// Source location
    pub range: Range,
    /// Decorators/attributes
    pub decorators: Vec<String>,
    /// Documentation comment
    pub doc_comment: Option<String>,
}

/// Parameter information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParameterInfo {
    pub name: String,
    pub type_annotation: Option<String>,
    pub default_value: Option<String>,
    pub is_rest: bool,
}

/// A class extracted from source code
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClassInfo {
    pub name: String,
    pub extends: Option<String>,
    pub implements: Vec<String>,
    pub is_exported: bool,
    pub is_abstract: bool,
    pub methods: Vec<FunctionInfo>,
    pub properties: Vec<PropertyInfo>,
    pub range: Range,
    pub decorators: Vec<String>,
}

/// Property information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PropertyInfo {
    pub name: String,
    pub type_annotation: Option<String>,
    pub is_static: bool,
    pub is_readonly: bool,
    pub visibility: Visibility,
}

/// Visibility modifier
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Visibility {
    Public,
    Private,
    Protected,
}

/// Import statement
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportInfo {
    /// Module being imported from
    pub source: String,
    /// Named imports (e.g., { foo, bar })
    pub named: Vec<String>,
    /// Default import name
    pub default: Option<String>,
    /// Namespace import (e.g., * as ns)
    pub namespace: Option<String>,
    /// Is this a type-only import?
    pub is_type_only: bool,
    pub range: Range,
}

/// Export statement
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportInfo {
    /// Exported name
    pub name: String,
    /// Original name (if renamed)
    pub original_name: Option<String>,
    /// Is this a re-export from another module?
    pub from_source: Option<String>,
    /// Is this a type-only export?
    pub is_type_only: bool,
    /// Is this a default export?
    pub is_default: bool,
    pub range: Range,
}

/// Call site in source code
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallSite {
    /// Name of the function being called
    pub callee: String,
    /// Receiver object (e.g., "this", "obj" in obj.method())
    pub receiver: Option<String>,
    /// Number of arguments
    pub arg_count: usize,
    /// Location of the call
    pub range: Range,
}

/// Result of parsing a file
pub struct ParseResult {
    /// Language detected
    pub language: Language,
    /// The parsed AST tree (for AST queries)
    pub tree: Option<tree_sitter::Tree>,
    /// Functions found
    pub functions: Vec<FunctionInfo>,
    /// Classes found
    pub classes: Vec<ClassInfo>,
    /// Imports found
    pub imports: Vec<ImportInfo>,
    /// Exports found
    pub exports: Vec<ExportInfo>,
    /// Call sites found
    pub calls: Vec<CallSite>,
    /// Parse errors (non-fatal)
    pub errors: Vec<ParseError>,
    /// Parse duration in microseconds
    pub parse_time_us: u64,
}

/// Serializable version of ParseResult (without tree)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseResultSerialized {
    pub language: Language,
    pub functions: Vec<FunctionInfo>,
    pub classes: Vec<ClassInfo>,
    pub imports: Vec<ImportInfo>,
    pub exports: Vec<ExportInfo>,
    pub calls: Vec<CallSite>,
    pub errors: Vec<ParseError>,
    pub parse_time_us: u64,
}

impl From<ParseResult> for ParseResultSerialized {
    fn from(r: ParseResult) -> Self {
        Self {
            language: r.language,
            functions: r.functions,
            classes: r.classes,
            imports: r.imports,
            exports: r.exports,
            calls: r.calls,
            errors: r.errors,
            parse_time_us: r.parse_time_us,
        }
    }
}

/// Parse error
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseError {
    pub message: String,
    pub range: Range,
}

impl ParseResult {
    pub fn new(language: Language) -> Self {
        Self {
            language,
            tree: None,
            functions: Vec::new(),
            classes: Vec::new(),
            imports: Vec::new(),
            exports: Vec::new(),
            calls: Vec::new(),
            errors: Vec::new(),
            parse_time_us: 0,
        }
    }
    
    /// Create with a tree
    pub fn with_tree(language: Language, tree: tree_sitter::Tree) -> Self {
        Self {
            language,
            tree: Some(tree),
            functions: Vec::new(),
            classes: Vec::new(),
            imports: Vec::new(),
            exports: Vec::new(),
            calls: Vec::new(),
            errors: Vec::new(),
            parse_time_us: 0,
        }
    }
}
