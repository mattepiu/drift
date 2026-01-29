//! Types for environment variable analysis
//!
//! Defines structures for extracted env var access patterns,
//! sensitivity classification, and analysis results.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Sensitivity level of an environment variable
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum EnvSensitivity {
    /// Secrets (API keys, tokens, passwords)
    Secret,
    /// Credentials (usernames, connection strings)
    Credential,
    /// Configuration (ports, hosts, feature flags)
    Config,
    /// Unknown sensitivity
    Unknown,
}

impl Default for EnvSensitivity {
    fn default() -> Self {
        Self::Unknown
    }
}

/// An access to an environment variable
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvAccess {
    /// Variable name
    pub name: String,
    /// File where accessed
    pub file: String,
    /// Line number
    pub line: u32,
    /// Column number
    pub column: u32,
    /// Access pattern used (e.g., "process.env", "os.getenv")
    pub access_pattern: String,
    /// Whether it has a default value
    pub has_default: bool,
    /// The default value if present
    pub default_value: Option<String>,
    /// Language of the source file
    pub language: String,
}

/// Aggregated information about an environment variable
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvVariable {
    /// Variable name
    pub name: String,
    /// Sensitivity classification
    pub sensitivity: EnvSensitivity,
    /// All access locations
    pub accesses: Vec<EnvAccessLocation>,
    /// Whether it's required (no default anywhere)
    pub is_required: bool,
    /// Default values found (may differ across files)
    pub default_values: Vec<String>,
    /// Total access count
    pub access_count: usize,
}

/// Location of an env var access
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvAccessLocation {
    /// File path
    pub file: String,
    /// Line number
    pub line: u32,
    /// Has default at this location
    pub has_default: bool,
}

/// Result of environment variable analysis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvironmentResult {
    /// All env var accesses found
    pub accesses: Vec<EnvAccess>,
    /// Aggregated variables
    pub variables: Vec<EnvVariable>,
    /// Required variables (no defaults)
    pub required: Vec<EnvVariable>,
    /// Secret variables
    pub secrets: Vec<EnvVariable>,
    /// Statistics
    pub stats: EnvironmentStats,
}

/// Statistics about environment analysis
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EnvironmentStats {
    /// Total accesses found
    pub total_accesses: usize,
    /// Unique variables
    pub unique_variables: usize,
    /// Required variables count
    pub required_count: usize,
    /// Secret variables count
    pub secrets_count: usize,
    /// Credential variables count
    pub credentials_count: usize,
    /// Config variables count
    pub config_count: usize,
    /// Accesses by language
    pub by_language: HashMap<String, usize>,
    /// Files analyzed
    pub files_analyzed: usize,
    /// Duration in milliseconds
    pub duration_ms: u64,
}
