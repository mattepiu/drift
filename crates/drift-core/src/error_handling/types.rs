//! Error handling analysis types

use serde::{Deserialize, Serialize};

/// An error boundary (try/catch, error handler)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorBoundary {
    /// File containing the boundary
    pub file: String,
    /// Start line
    pub start_line: u32,
    /// End line
    pub end_line: u32,
    /// Type of boundary
    pub boundary_type: BoundaryType,
    /// Caught error types (if specified)
    pub caught_types: Vec<String>,
    /// Whether error is rethrown
    pub rethrows: bool,
    /// Whether error is logged
    pub logs_error: bool,
    /// Whether error is swallowed (empty catch)
    pub is_swallowed: bool,
}

/// Type of error boundary
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BoundaryType {
    TryCatch,
    TryExcept,
    TryFinally,
    ErrorHandler,
    PromiseCatch,
    AsyncAwait,
    ResultMatch,
    PanicHandler,
}

/// An error handling gap (unhandled error path)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorGap {
    /// File with the gap
    pub file: String,
    /// Line number
    pub line: u32,
    /// Function containing the gap
    pub function: String,
    /// Type of gap
    pub gap_type: GapType,
    /// Severity
    pub severity: GapSeverity,
    /// Description
    pub description: String,
}

/// Type of error handling gap
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GapType {
    UnhandledPromise,
    UnhandledAsync,
    MissingCatch,
    SwallowedError,
    UnwrapWithoutCheck,
    UncheckedResult,
    MissingErrorBoundary,
}

/// Gap severity
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GapSeverity {
    Low,
    Medium,
    High,
    Critical,
}

/// Custom error type definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorType {
    /// Error class/type name
    pub name: String,
    /// File where defined
    pub file: String,
    /// Line number
    pub line: u32,
    /// Base class (if extends another error)
    pub extends: Option<String>,
    /// Is exported
    pub is_exported: bool,
}

/// Error handling analysis result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorHandlingResult {
    /// Error boundaries found
    pub boundaries: Vec<ErrorBoundary>,
    /// Error handling gaps
    pub gaps: Vec<ErrorGap>,
    /// Custom error types
    pub error_types: Vec<ErrorType>,
    /// Files analyzed
    pub files_analyzed: usize,
    /// Duration in milliseconds
    pub duration_ms: u64,
}
