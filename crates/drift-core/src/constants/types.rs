//! Types for constants analysis
//!
//! Defines structures for extracted constants, their categories,
//! and analysis results.

use serde::{Deserialize, Serialize};

/// Category of a constant
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ConstantCategory {
    /// Configuration values (timeouts, limits, thresholds)
    Config,
    /// API-related (endpoints, versions, headers)
    Api,
    /// Status codes and states
    Status,
    /// Error codes and messages
    Error,
    /// Feature flags
    FeatureFlag,
    /// Numeric limits (max, min, size)
    Limit,
    /// Regular expressions
    Regex,
    /// File paths and URLs
    Path,
    /// Environment variable names
    Env,
    /// Security-related (but not secrets)
    Security,
    /// Uncategorized
    Uncategorized,
}

impl Default for ConstantCategory {
    fn default() -> Self {
        Self::Uncategorized
    }
}

/// Sensitivity level for potential secrets
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub enum SecretSeverity {
    /// Informational - might be intentional
    Info,
    /// Low - possibly a secret
    Low,
    /// Medium - likely a secret
    Medium,
    /// High - almost certainly a secret
    High,
    /// Critical - definitely a secret (API keys, passwords)
    Critical,
}

/// Type of constant value
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum ConstantValue {
    /// String literal
    String(String),
    /// Numeric value
    Number(f64),
    /// Boolean value
    Boolean(bool),
    /// Array/list of values
    Array(Vec<ConstantValue>),
    /// Object/map (simplified as string for now)
    Object(String),
    /// Unknown or complex type
    Unknown,
}

/// Information about an extracted constant
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConstantInfo {
    /// Constant name
    pub name: String,
    /// Constant value
    pub value: ConstantValue,
    /// Category
    pub category: ConstantCategory,
    /// File where defined
    pub file: String,
    /// Line number
    pub line: u32,
    /// Column number
    pub column: u32,
    /// Whether it's exported
    pub is_exported: bool,
    /// Language of the source file
    pub language: String,
    /// Declaration type (const, final, static, etc.)
    pub declaration_type: String,
}

/// A potential secret found in code
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecretCandidate {
    /// The constant or variable name
    pub name: String,
    /// The suspicious value (partially masked)
    pub masked_value: String,
    /// Type of secret detected
    pub secret_type: String,
    /// Severity level
    pub severity: SecretSeverity,
    /// File location
    pub file: String,
    /// Line number
    pub line: u32,
    /// Confidence score (0.0 - 1.0)
    pub confidence: f32,
    /// Reason for flagging
    pub reason: String,
}

/// A magic number found in code
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MagicNumber {
    /// The numeric value
    pub value: f64,
    /// File location
    pub file: String,
    /// Line number
    pub line: u32,
    /// Context (surrounding code)
    pub context: String,
    /// Suggested constant name
    pub suggested_name: Option<String>,
}

/// Inconsistent values across files
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InconsistentValue {
    /// The constant name pattern
    pub name_pattern: String,
    /// Different values found
    pub values: Vec<ValueLocation>,
    /// Severity (based on how different the values are)
    pub severity: SecretSeverity,
}

/// A value and its location
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValueLocation {
    /// The value
    pub value: ConstantValue,
    /// File location
    pub file: String,
    /// Line number
    pub line: u32,
}

/// Result of constants analysis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConstantsResult {
    /// All extracted constants
    pub constants: Vec<ConstantInfo>,
    /// Potential secrets
    pub secrets: Vec<SecretCandidate>,
    /// Magic numbers
    pub magic_numbers: Vec<MagicNumber>,
    /// Inconsistent values
    pub inconsistencies: Vec<InconsistentValue>,
    /// Dead constants (defined but never used)
    pub dead_constants: Vec<ConstantInfo>,
    /// Statistics
    pub stats: ConstantsStats,
}

/// Statistics about constants analysis
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ConstantsStats {
    /// Total constants found
    pub total_constants: usize,
    /// Constants by category
    pub by_category: std::collections::HashMap<String, usize>,
    /// Constants by language
    pub by_language: std::collections::HashMap<String, usize>,
    /// Number of exported constants
    pub exported_count: usize,
    /// Number of potential secrets
    pub secrets_count: usize,
    /// Number of magic numbers
    pub magic_numbers_count: usize,
    /// Files analyzed
    pub files_analyzed: usize,
    /// Duration in milliseconds
    pub duration_ms: u64,
}
