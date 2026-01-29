//! Main wrapper analyzer
//!
//! Orchestrates wrapper detection and clustering across a codebase.

use std::collections::HashMap;
use std::time::Instant;
use rayon::prelude::*;

use crate::parsers::{ParserManager, Language};
use super::types::*;
use super::detector::WrapperDetector;
use super::clusterer::WrapperClusterer;

/// Main analyzer for wrapper detection
pub struct WrappersAnalyzer {
    detector: WrapperDetector,
    clusterer: WrapperClusterer,
}

impl WrappersAnalyzer {
    pub fn new() -> Self {
        Self {
            detector: WrapperDetector::new(),
            clusterer: WrapperClusterer::new(),
        }
    }

    /// Analyze files for wrapper patterns
    pub fn analyze(&self, files: &[String]) -> WrappersResult {
        let start = Instant::now();

        // Process files in parallel
        let all_wrappers: Vec<WrapperInfo> = files
            .par_iter()
            .flat_map(|file_path| {
                let source = match std::fs::read_to_string(file_path) {
                    Ok(s) => s,
                    Err(_) => return Vec::new(),
                };

                let language = Self::detect_language(file_path);
                if language.is_none() {
                    return Vec::new();
                }

                // Parse the file
                thread_local! {
                    static PARSER: std::cell::RefCell<ParserManager> = 
                        std::cell::RefCell::new(ParserManager::new());
                }

                PARSER.with(|parser| {
                    let mut parser = parser.borrow_mut();
                    if let Some(result) = parser.parse_file(file_path, &source) {
                        self.detector.detect(&result, file_path, &source)
                    } else {
                        Vec::new()
                    }
                })
            })
            .collect();

        // Count usages across all files
        let wrappers_with_usage = self.count_usages(all_wrappers, files);

        // Cluster similar wrappers
        let clusters = self.clusterer.cluster(&wrappers_with_usage);

        // Build statistics
        let stats = self.build_stats(&wrappers_with_usage, &clusters, files.len(), start.elapsed().as_millis() as u64);

        WrappersResult {
            wrappers: wrappers_with_usage,
            clusters,
            stats,
        }
    }

    fn count_usages(&self, mut wrappers: Vec<WrapperInfo>, files: &[String]) -> Vec<WrapperInfo> {
        // Build a set of wrapper names for quick lookup
        let wrapper_names: std::collections::HashSet<String> = wrappers.iter()
            .map(|w| w.name.clone())
            .collect();

        // Count usages across all files
        let usage_counts: HashMap<String, usize> = files
            .par_iter()
            .map(|file_path| {
                let source = match std::fs::read_to_string(file_path) {
                    Ok(s) => s,
                    Err(_) => return HashMap::new(),
                };

                thread_local! {
                    static PARSER: std::cell::RefCell<ParserManager> = 
                        std::cell::RefCell::new(ParserManager::new());
                }

                PARSER.with(|parser| {
                    let mut parser = parser.borrow_mut();
                    let mut counts: HashMap<String, usize> = HashMap::new();
                    
                    if let Some(result) = parser.parse_file(file_path, &source) {
                        for call in &result.calls {
                            if wrapper_names.contains(&call.callee) {
                                *counts.entry(call.callee.clone()).or_default() += 1;
                            }
                        }
                    }
                    
                    counts
                })
            })
            .reduce(HashMap::new, |mut acc, counts| {
                for (name, count) in counts {
                    *acc.entry(name).or_default() += count;
                }
                acc
            });

        // Update wrapper usage counts
        for wrapper in &mut wrappers {
            if let Some(&count) = usage_counts.get(&wrapper.name) {
                wrapper.usage_count = count;
            }
        }

        wrappers
    }

    fn build_stats(
        &self,
        wrappers: &[WrapperInfo],
        clusters: &[WrapperCluster],
        files_count: usize,
        duration_ms: u64,
    ) -> WrappersStats {
        let mut by_category: HashMap<String, usize> = HashMap::new();
        
        for wrapper in wrappers {
            let category_name = format!("{:?}", wrapper.category);
            *by_category.entry(category_name).or_default() += 1;
        }

        // Count primitives
        let mut primitive_counts: HashMap<String, usize> = HashMap::new();
        for wrapper in wrappers {
            for wrapped in &wrapper.wraps {
                *primitive_counts.entry(wrapped.clone()).or_default() += 1;
            }
        }

        // Sort by count
        let mut top_primitives: Vec<(String, usize)> = primitive_counts.into_iter().collect();
        top_primitives.sort_by(|a, b| b.1.cmp(&a.1));
        top_primitives.truncate(10);

        WrappersStats {
            total_wrappers: wrappers.len(),
            cluster_count: clusters.len(),
            by_category,
            top_primitives,
            files_analyzed: files_count,
            duration_ms,
        }
    }

    fn detect_language(file_path: &str) -> Option<Language> {
        let ext = file_path.rsplit('.').next()?;
        match ext {
            "ts" | "tsx" => Some(Language::TypeScript),
            "js" | "jsx" | "mjs" | "cjs" => Some(Language::JavaScript),
            "py" => Some(Language::Python),
            "java" => Some(Language::Java),
            "cs" => Some(Language::CSharp),
            "go" => Some(Language::Go),
            "php" => Some(Language::Php),
            "rs" => Some(Language::Rust),
            "cpp" | "cc" | "cxx" | "hpp" | "h" => Some(Language::Cpp),
            _ => None,
        }
    }
}

impl Default for WrappersAnalyzer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_analyzer_creation() {
        let analyzer = WrappersAnalyzer::new();
        assert!(true);
    }
}
