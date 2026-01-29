//! Scanner types - Core data structures for file scanning

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::Duration;

/// Configuration for the scanner
#[derive(Debug, Clone)]
pub struct ScanConfig {
    /// Root directory to scan
    pub root: PathBuf,
    /// Glob patterns to include (e.g., "**/*.ts")
    pub patterns: Vec<String>,
    /// Additional patterns to ignore (beyond defaults)
    pub extra_ignores: Vec<String>,
    /// Whether to compute file hashes
    pub compute_hashes: bool,
    /// Maximum file size to process (bytes)
    pub max_file_size: u64,
    /// Number of threads (0 = auto)
    pub threads: usize,
}

impl Default for ScanConfig {
    fn default() -> Self {
        Self {
            root: PathBuf::from("."),
            patterns: vec!["**/*".to_string()],
            extra_ignores: vec![],
            compute_hashes: true,
            max_file_size: 10 * 1024 * 1024, // 10MB
            threads: 0,
        }
    }
}

/// Information about a scanned file
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInfo {
    /// Relative path from scan root
    pub path: String,
    /// File size in bytes
    pub size: u64,
    /// xxHash of file contents (if computed)
    pub hash: Option<String>,
    /// Detected language
    pub language: Option<String>,
}

/// Statistics about the scan
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanStats {
    /// Total files found
    pub total_files: usize,
    /// Files by language
    pub by_language: std::collections::HashMap<String, usize>,
    /// Total bytes scanned
    pub total_bytes: u64,
    /// Directories skipped (ignored)
    pub dirs_skipped: usize,
    /// Files skipped (too large, binary, etc.)
    pub files_skipped: usize,
    /// Scan duration
    #[serde(with = "duration_millis")]
    pub duration: Duration,
}

/// Result of a scan operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    /// Root directory that was scanned
    pub root: String,
    /// All files found
    pub files: Vec<FileInfo>,
    /// Scan statistics
    pub stats: ScanStats,
    /// Any errors encountered (non-fatal)
    pub errors: Vec<String>,
}

// Custom serialization for Duration as milliseconds
mod duration_millis {
    use serde::{Deserialize, Deserializer, Serialize, Serializer};
    use std::time::Duration;

    pub fn serialize<S>(duration: &Duration, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        duration.as_millis().serialize(serializer)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Duration, D::Error>
    where
        D: Deserializer<'de>,
    {
        let millis = u64::deserialize(deserializer)?;
        Ok(Duration::from_millis(millis))
    }
}
