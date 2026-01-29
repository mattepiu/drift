//! Parallel file walker using ignore + rayon
//!
//! This is the core scanner that walks the filesystem in parallel,
//! respecting ignore patterns and computing file hashes.

use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::Instant;

use globset::{Glob, GlobSet, GlobSetBuilder};
use rayon::prelude::*;
use xxhash_rust::xxh3::xxh3_64;

use super::ignores::IgnorePatterns;
use super::types::{FileInfo, ScanConfig, ScanResult, ScanStats};

/// High-performance file scanner
pub struct Scanner {
    config: ScanConfig,
    ignores: IgnorePatterns,
    include_globs: GlobSet,
}

impl Scanner {
    /// Create a new scanner with the given configuration
    pub fn new(config: ScanConfig) -> Self {
        let ignores = IgnorePatterns::new(&config.root, &config.extra_ignores);
        
        // Build glob set for include patterns
        let mut builder = GlobSetBuilder::new();
        for pattern in &config.patterns {
            if let Ok(glob) = Glob::new(pattern) {
                builder.add(glob);
            }
        }
        let include_globs = builder.build().unwrap_or_else(|_| GlobSetBuilder::new().build().unwrap());
        
        // Configure thread pool if specified
        if config.threads > 0 {
            rayon::ThreadPoolBuilder::new()
                .num_threads(config.threads)
                .build_global()
                .ok();
        }
        
        Self {
            config,
            ignores,
            include_globs,
        }
    }
    
    /// Scan the filesystem and return results
    pub fn scan(&self) -> ScanResult {
        let start = Instant::now();
        
        // Collect all files first (single-threaded walk for correctness)
        let files_to_process = self.collect_files();
        
        // Counters for stats
        let dirs_skipped = AtomicUsize::new(0);
        let files_skipped = AtomicUsize::new(0);
        let errors: Mutex<Vec<String>> = Mutex::new(Vec::new());
        
        // Process files in parallel
        let files: Vec<FileInfo> = files_to_process
            .par_iter()
            .filter_map(|path| {
                match self.process_file(path) {
                    Ok(Some(info)) => Some(info),
                    Ok(None) => {
                        files_skipped.fetch_add(1, Ordering::Relaxed);
                        None
                    }
                    Err(e) => {
                        if let Ok(mut errs) = errors.lock() {
                            errs.push(format!("{}: {}", path.display(), e));
                        }
                        None
                    }
                }
            })
            .collect();
        
        // Compute stats
        let mut by_language: HashMap<String, usize> = HashMap::new();
        let mut total_bytes = 0u64;
        
        for file in &files {
            total_bytes += file.size;
            if let Some(ref lang) = file.language {
                *by_language.entry(lang.clone()).or_insert(0) += 1;
            }
        }
        
        let stats = ScanStats {
            total_files: files.len(),
            by_language,
            total_bytes,
            dirs_skipped: dirs_skipped.load(Ordering::Relaxed),
            files_skipped: files_skipped.load(Ordering::Relaxed),
            duration: start.elapsed(),
        };
        
        ScanResult {
            root: self.config.root.display().to_string(),
            files,
            stats,
            errors: errors.into_inner().unwrap_or_default(),
        }
    }
    
    /// Collect all files to process (respecting ignores)
    fn collect_files(&self) -> Vec<PathBuf> {
        let mut files = Vec::new();
        self.walk_dir(&self.config.root, &mut files);
        files
    }
    
    /// Recursively walk a directory
    fn walk_dir(&self, dir: &Path, files: &mut Vec<PathBuf>) {
        let entries = match fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };
        
        for entry in entries.flatten() {
            let path = entry.path();
            let relative = path.strip_prefix(&self.config.root).unwrap_or(&path);
            
            if path.is_dir() {
                // Check if directory should be ignored
                if !self.ignores.is_ignored(relative, true) {
                    self.walk_dir(&path, files);
                }
            } else if path.is_file() {
                // Check if file should be ignored
                if !self.ignores.is_ignored(relative, false) {
                    // Check if file matches include patterns
                    if self.include_globs.is_empty() || self.include_globs.is_match(relative) {
                        files.push(path);
                    }
                }
            }
        }
    }
    
    /// Process a single file
    fn process_file(&self, path: &Path) -> Result<Option<FileInfo>, std::io::Error> {
        let metadata = fs::metadata(path)?;
        let size = metadata.len();
        
        // Skip files that are too large
        if size > self.config.max_file_size {
            return Ok(None);
        }
        
        let relative = path
            .strip_prefix(&self.config.root)
            .unwrap_or(path)
            .to_string_lossy()
            .to_string();
        
        // Detect language from extension
        let language = detect_language(path);
        
        // Compute hash if requested
        let hash = if self.config.compute_hashes {
            Some(compute_file_hash(path)?)
        } else {
            None
        };
        
        Ok(Some(FileInfo {
            path: relative,
            size,
            hash,
            language,
        }))
    }
}

/// Compute xxHash of a file
fn compute_file_hash(path: &Path) -> Result<String, std::io::Error> {
    let mut file = fs::File::open(path)?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)?;
    let hash = xxh3_64(&buffer);
    Ok(format!("{:016x}", hash))
}

/// Detect language from file extension
fn detect_language(path: &Path) -> Option<String> {
    let ext = path.extension()?.to_str()?;
    
    let lang = match ext.to_lowercase().as_str() {
        // TypeScript/JavaScript
        "ts" | "tsx" | "mts" | "cts" => "typescript",
        "js" | "jsx" | "mjs" | "cjs" => "javascript",
        
        // Python
        "py" | "pyi" | "pyw" => "python",
        
        // Java
        "java" => "java",
        
        // C#
        "cs" => "csharp",
        
        // PHP
        "php" | "phtml" | "php3" | "php4" | "php5" | "phps" => "php",
        
        // Go
        "go" => "go",
        
        // Rust
        "rs" => "rust",
        
        // C/C++
        "c" | "h" => "c",
        "cpp" | "cc" | "cxx" | "hpp" | "hh" | "hxx" => "cpp",
        
        // Ruby
        "rb" | "rake" | "gemspec" => "ruby",
        
        // Swift
        "swift" => "swift",
        
        // Kotlin
        "kt" | "kts" => "kotlin",
        
        // Scala
        "scala" | "sc" => "scala",
        
        // Web
        "html" | "htm" => "html",
        "css" | "scss" | "sass" | "less" => "css",
        "vue" | "svelte" => "vue",
        
        // Config/Data
        "json" | "jsonc" => "json",
        "yaml" | "yml" => "yaml",
        "toml" => "toml",
        "xml" => "xml",
        "md" | "markdown" => "markdown",
        
        // Shell
        "sh" | "bash" | "zsh" => "shell",
        "ps1" | "psm1" => "powershell",
        
        // SQL
        "sql" => "sql",
        
        _ => return None,
    };
    
    Some(lang.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_language() {
        assert_eq!(detect_language(Path::new("file.ts")), Some("typescript".to_string()));
        assert_eq!(detect_language(Path::new("file.py")), Some("python".to_string()));
        assert_eq!(detect_language(Path::new("file.rs")), Some("rust".to_string()));
        assert_eq!(detect_language(Path::new("file.unknown")), None);
    }
}
