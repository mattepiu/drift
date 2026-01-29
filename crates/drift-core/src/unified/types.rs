//! Unified Analyzer Types
//!
//! Core types for the AST-first unified analyzer.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Supported languages (all 9)
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
}

impl Language {
    pub fn all() -> &'static [Language] {
        &[
            Language::TypeScript,
            Language::JavaScript,
            Language::Python,
            Language::Java,
            Language::CSharp,
            Language::Php,
            Language::Go,
            Language::Rust,
            Language::Cpp,
        ]
    }
    
    pub fn from_extension(ext: &str) -> Option<Language> {
        match ext {
            "ts" | "tsx" | "mts" | "cts" => Some(Language::TypeScript),
            "js" | "jsx" | "mjs" | "cjs" => Some(Language::JavaScript),
            "py" | "pyi" => Some(Language::Python),
            "java" => Some(Language::Java),
            "cs" => Some(Language::CSharp),
            "php" => Some(Language::Php),
            "go" => Some(Language::Go),
            "rs" => Some(Language::Rust),
            "cpp" | "cc" | "cxx" | "c++" | "hpp" | "h" => Some(Language::Cpp),
            _ => None,
        }
    }
}

/// Pattern categories matching the TypeScript detector categories
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PatternCategory {
    Api,
    Auth,
    Components,
    Config,
    DataAccess,
    Documentation,
    Errors,
    Logging,
    Performance,
    Security,
    Structural,
    Styling,
    Testing,
    Types,
    Validation,
}

impl PatternCategory {
    pub fn all() -> &'static [PatternCategory] {
        &[
            PatternCategory::Api,
            PatternCategory::Auth,
            PatternCategory::Components,
            PatternCategory::Config,
            PatternCategory::DataAccess,
            PatternCategory::Documentation,
            PatternCategory::Errors,
            PatternCategory::Logging,
            PatternCategory::Performance,
            PatternCategory::Security,
            PatternCategory::Structural,
            PatternCategory::Styling,
            PatternCategory::Testing,
            PatternCategory::Types,
            PatternCategory::Validation,
        ]
    }
}

/// How the pattern was detected
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DetectionMethod {
    /// Primary: AST query using tree-sitter
    AstQuery,
    /// Secondary: Regex on string literals only
    RegexFallback,
    /// Structural analysis (file/directory patterns)
    Structural,
}

/// A detected pattern
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedPattern {
    /// Pattern category
    pub category: PatternCategory,
    /// Specific pattern type (e.g., "auth-decorator", "sql-query")
    pub pattern_type: String,
    /// Subcategory for grouping
    pub subcategory: Option<String>,
    /// File where pattern was found
    pub file: String,
    /// Line number (1-indexed)
    pub line: u32,
    /// Column number (1-indexed)
    pub column: u32,
    /// End line
    pub end_line: u32,
    /// End column
    pub end_column: u32,
    /// The matched text/code
    pub matched_text: String,
    /// Detection confidence (0.0 - 1.0)
    pub confidence: f32,
    /// How the pattern was detected
    pub detection_method: DetectionMethod,
    /// Additional metadata
    pub metadata: Option<HashMap<String, serde_json::Value>>,
}

impl Default for DetectedPattern {
    fn default() -> Self {
        Self {
            category: PatternCategory::Structural,
            pattern_type: String::new(),
            subcategory: None,
            file: String::new(),
            line: 0,
            column: 0,
            end_line: 0,
            end_column: 0,
            matched_text: String::new(),
            confidence: 0.0,
            detection_method: DetectionMethod::AstQuery,
            metadata: None,
        }
    }
}

/// A pattern violation (outlier from established patterns)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Violation {
    /// Unique ID
    pub id: String,
    /// Related pattern ID
    pub pattern_id: String,
    /// Severity level
    pub severity: ViolationSeverity,
    /// File location
    pub file: String,
    /// Line number
    pub line: u32,
    /// Column number
    pub column: u32,
    /// Human-readable message
    pub message: String,
    /// What was expected
    pub expected: String,
    /// What was found
    pub actual: String,
    /// Suggested fix
    pub suggested_fix: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ViolationSeverity {
    Error,
    Warning,
    Info,
    Hint,
}

/// Patterns detected in a single file
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilePatterns {
    pub file: String,
    pub language: Language,
    pub patterns: Vec<DetectedPattern>,
    pub violations: Vec<Violation>,
    pub parse_time_us: u64,
    pub detect_time_us: u64,
}

/// Unified analysis options
#[derive(Debug, Clone, Default)]
pub struct UnifiedOptions {
    /// File patterns to include (glob)
    pub patterns: Vec<String>,
    /// Pattern categories to detect (empty = all)
    pub categories: Vec<PatternCategory>,
    /// Maximum resolution depth for call graph
    pub max_resolution_depth: u32,
    /// Enable parallel processing
    pub parallel: bool,
    /// Number of threads (0 = auto)
    pub threads: usize,
    /// Include violations in output
    pub include_violations: bool,
}

/// Resolution statistics
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ResolutionStats {
    pub total_calls: u64,
    pub resolved_calls: u64,
    pub resolution_rate: f32,
    pub same_file_resolutions: u64,
    pub cross_file_resolutions: u64,
    pub unresolved_calls: u64,
}

/// Call graph summary
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CallGraphSummary {
    pub total_functions: u64,
    pub entry_points: u64,
    pub data_accessors: u64,
    pub max_call_depth: u32,
}

/// Analysis performance metrics
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AnalysisMetrics {
    pub files_processed: u64,
    pub total_lines: u64,
    pub parse_time_ms: u64,
    pub detect_time_ms: u64,
    pub resolve_time_ms: u64,
    pub total_time_ms: u64,
}

/// Unified analysis result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnifiedResult {
    /// Detected patterns by file
    pub file_patterns: Vec<FilePatterns>,
    /// Resolution statistics
    pub resolution: ResolutionStats,
    /// Call graph summary
    pub call_graph: CallGraphSummary,
    /// Performance metrics
    pub metrics: AnalysisMetrics,
    /// Total patterns found
    pub total_patterns: u64,
    /// Total violations found
    pub total_violations: u64,
}

/// String literal extracted from AST for regex analysis
#[derive(Debug, Clone)]
pub struct StringLiteral {
    /// The string value (without quotes)
    pub value: String,
    /// Line number
    pub line: u32,
    /// Column number
    pub column: u32,
    /// Context where the string appears
    pub context: StringContext,
}

/// Context of where a string literal appears in code
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StringContext {
    /// Argument to a function call
    FunctionArgument,
    /// Right side of variable assignment
    VariableAssignment,
    /// Property value in object/dict
    ObjectProperty,
    /// Inside a decorator/annotation
    Decorator,
    /// Return statement
    ReturnValue,
    /// Array/list element
    ArrayElement,
    /// Unknown context
    Unknown,
}
