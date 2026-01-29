//! Unified Analyzer - Single-Pass Pattern Detection + Resolution
//!
//! Combines AST-first pattern detection with call resolution in one pass.
//! No redundant file reads, no intermediate files.

use std::path::Path;
use std::sync::{Arc, RwLock};
use std::time::Instant;
use rayon::prelude::*;

use crate::scanner::{Scanner, ScanConfig};
use crate::parsers::{ParserManager, Language as ParserLanguage};

use super::types::*;
use super::ast_patterns::AstPatternDetector;
use super::string_analyzer::StringLiteralAnalyzer;
use super::index::ResolutionIndex;

/// Unified analyzer combining pattern detection and call resolution
pub struct UnifiedAnalyzer {
    /// AST-based pattern detector (primary)
    ast_detector: AstPatternDetector,
    /// String literal analyzer (regex fallback)
    string_analyzer: StringLiteralAnalyzer,
    /// Parser manager for function extraction
    parser_manager: ParserManager,
}


impl UnifiedAnalyzer {
    /// Create a new unified analyzer
    pub fn new() -> Result<Self, String> {
        Ok(Self {
            ast_detector: AstPatternDetector::new()?,
            string_analyzer: StringLiteralAnalyzer::new()?,
            parser_manager: ParserManager::new(),
        })
    }
    
    /// Analyze a codebase with unified pattern detection and resolution
    pub fn analyze(&mut self, root: &Path, options: UnifiedOptions) -> UnifiedResult {
        let start = Instant::now();
        
        // Phase 1: Scan files
        let scan_config = ScanConfig {
            root: root.to_path_buf(),
            patterns: if options.patterns.is_empty() {
                vec!["**/*".to_string()]
            } else {
                options.patterns.clone()
            },
            ..Default::default()
        };
        
        let scanner = Scanner::new(scan_config);
        let scan_result = scanner.scan();
        
        // Phase 2: Parallel analysis
        let index = Arc::new(RwLock::new(ResolutionIndex::new()));
        let file_patterns: Vec<FilePatterns> = if options.parallel {
            self.analyze_parallel(&scan_result.files, root, &options, &index)
        } else {
            self.analyze_sequential(&scan_result.files, root, &options, &index)
        };
        
        // Phase 3: Compute statistics
        let total_time_ms = start.elapsed().as_millis() as u64;
        let total_patterns: u64 = file_patterns.iter()
            .map(|fp| fp.patterns.len() as u64)
            .sum();
        let total_violations: u64 = file_patterns.iter()
            .map(|fp| fp.violations.len() as u64)
            .sum();
        let total_lines: u64 = file_patterns.iter()
            .map(|fp| fp.patterns.iter().map(|p| p.end_line as u64).max().unwrap_or(0))
            .sum();
        
        let idx = index.read().unwrap();
        let idx_stats = idx.stats();
        
        UnifiedResult {
            file_patterns,
            resolution: ResolutionStats {
                total_calls: 0, // TODO: track during analysis
                resolved_calls: 0,
                resolution_rate: 0.0,
                same_file_resolutions: 0,
                cross_file_resolutions: 0,
                unresolved_calls: 0,
            },
            call_graph: CallGraphSummary {
                total_functions: idx_stats.total_functions as u64,
                entry_points: idx_stats.exported_functions as u64,
                data_accessors: 0,
                max_call_depth: 0,
            },
            metrics: AnalysisMetrics {
                files_processed: scan_result.files.len() as u64,
                total_lines,
                parse_time_ms: 0, // TODO: aggregate
                detect_time_ms: 0,
                resolve_time_ms: 0,
                total_time_ms,
            },
            total_patterns,
            total_violations,
        }
    }

    
    /// Analyze files in parallel using rayon
    fn analyze_parallel(
        &self,
        files: &[crate::scanner::FileInfo],
        root: &Path,
        options: &UnifiedOptions,
        index: &Arc<RwLock<ResolutionIndex>>,
    ) -> Vec<FilePatterns> {
        files.par_iter()
            .filter_map(|file| {
                let file_path = root.join(&file.path);
                self.analyze_file(&file_path, root, options, index)
            })
            .collect()
    }
    
    /// Analyze files sequentially
    fn analyze_sequential(
        &self,
        files: &[crate::scanner::FileInfo],
        root: &Path,
        options: &UnifiedOptions,
        index: &Arc<RwLock<ResolutionIndex>>,
    ) -> Vec<FilePatterns> {
        files.iter()
            .filter_map(|file| {
                let file_path = root.join(&file.path);
                self.analyze_file(&file_path, root, options, index)
            })
            .collect()
    }
    
    /// Analyze a single file
    fn analyze_file(
        &self,
        file_path: &Path,
        root: &Path,
        options: &UnifiedOptions,
        index: &Arc<RwLock<ResolutionIndex>>,
    ) -> Option<FilePatterns> {
        let parse_start = Instant::now();
        
        // Determine language from extension
        let ext = file_path.extension()?.to_str()?;
        let language = Language::from_extension(ext)?;
        let parser_language = ParserLanguage::from_extension(ext)?;
        
        // Read file content
        let content = std::fs::read_to_string(file_path).ok()?;
        let relative_path = file_path.strip_prefix(root)
            .unwrap_or(file_path)
            .to_string_lossy()
            .to_string();
        
        // Parse with tree-sitter via ParserManager
        // Note: We need mutable access, but we're in a parallel context
        // For now, create a fresh parser per file (can optimize later with thread-local)
        let mut parser_manager = ParserManager::new();
        let parse_result = parser_manager.parse(&content, parser_language)?;
        let parse_time_us = parse_start.elapsed().as_micros() as u64;
        
        // Get the tree for AST queries
        let tree = parse_result.tree.as_ref()?;
        let source = content.as_bytes();
        
        let detect_start = Instant::now();
        
        // Phase 1: AST-based pattern detection (primary)
        let mut patterns = self.ast_detector.detect(tree, source, language, &relative_path);
        
        // Phase 2: Extract string literals for regex fallback
        let strings = self.ast_detector.extract_strings(tree, source, language);
        
        // Phase 3: Regex analysis on extracted strings only
        let string_patterns = self.string_analyzer.analyze(&strings, &relative_path);
        patterns.extend(string_patterns);
        
        // Filter by requested categories
        if !options.categories.is_empty() {
            patterns.retain(|p| options.categories.contains(&p.category));
        }
        
        let detect_time_us = detect_start.elapsed().as_micros() as u64;
        
        // Phase 4: Index functions for resolution
        for func in &parse_result.functions {
            let mut idx = index.write().unwrap();
            idx.insert(
                &func.name,
                func.qualified_name.as_deref(),
                &relative_path,
                func.range.start.line,
                func.is_exported,
                func.is_async,
            );
        }
        
        Some(FilePatterns {
            file: relative_path,
            language,
            patterns,
            violations: Vec::new(), // TODO: violation detection
            parse_time_us,
            detect_time_us,
        })
    }
}

impl Default for UnifiedAnalyzer {
    fn default() -> Self {
        Self::new().expect("Failed to create unified analyzer")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    
    #[test]
    fn test_analyzer_creation() {
        let analyzer = UnifiedAnalyzer::new();
        assert!(analyzer.is_ok());
    }
}
