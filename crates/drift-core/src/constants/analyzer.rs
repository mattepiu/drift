//! Main constants analyzer
//!
//! Orchestrates constant extraction, secret detection, magic number finding,
//! and inconsistency detection.

use std::collections::HashMap;
use std::time::Instant;
use rayon::prelude::*;

use crate::parsers::ParserManager;
use super::types::*;
use super::extractor::ConstantExtractor;
use super::secrets::SecretDetector;

/// Main analyzer for constants
pub struct ConstantsAnalyzer {
    extractor: ConstantExtractor,
    secret_detector: SecretDetector,
}

impl ConstantsAnalyzer {
    pub fn new() -> Self {
        Self {
            extractor: ConstantExtractor::new(),
            secret_detector: SecretDetector::new(),
        }
    }

    /// Analyze files for constants
    pub fn analyze(&self, files: &[String]) -> ConstantsResult {
        let start = Instant::now();

        // Process files in parallel
        let file_results: Vec<FileAnalysis> = files
            .par_iter()
            .filter_map(|file_path| {
                let source = std::fs::read_to_string(file_path).ok()?;
                
                // Use thread-local parser
                thread_local! {
                    static PARSER: std::cell::RefCell<ParserManager> = 
                        std::cell::RefCell::new(ParserManager::new());
                    static EXTRACTOR: ConstantExtractor = ConstantExtractor::new();
                    static SECRET_DETECTOR: SecretDetector = SecretDetector::new();
                }
                
                PARSER.with(|parser| {
                    let mut parser = parser.borrow_mut();
                    let result = parser.parse_file(file_path, &source)?;
                    
                    let constants = EXTRACTOR.with(|ext| ext.extract(&result, file_path, &source));
                    let secrets = SECRET_DETECTOR.with(|det| det.detect(&source, file_path));
                    let magic_numbers = Self::find_magic_numbers(&source, file_path);
                    
                    Some(FileAnalysis {
                        constants,
                        secrets,
                        magic_numbers,
                    })
                })
            })
            .collect();

        // Aggregate results
        let mut all_constants = Vec::new();
        let mut all_secrets = Vec::new();
        let mut all_magic_numbers = Vec::new();

        for analysis in file_results {
            all_constants.extend(analysis.constants);
            all_secrets.extend(analysis.secrets);
            all_magic_numbers.extend(analysis.magic_numbers);
        }

        // Find inconsistencies
        let inconsistencies = Self::find_inconsistencies(&all_constants);

        // Find dead constants (simplified - would need usage analysis)
        let dead_constants = Vec::new();

        // Build statistics
        let stats = Self::build_stats(&all_constants, &all_secrets, &all_magic_numbers, files.len(), start.elapsed().as_millis() as u64);

        ConstantsResult {
            constants: all_constants,
            secrets: all_secrets,
            magic_numbers: all_magic_numbers,
            inconsistencies,
            dead_constants,
            stats,
        }
    }

    fn find_magic_numbers(source: &str, file_path: &str) -> Vec<MagicNumber> {
        use regex::Regex;
        use once_cell::sync::Lazy;

        static MAGIC_REGEX: Lazy<Regex> = Lazy::new(|| {
            Regex::new(r"\b(\d{2,})\b").unwrap()
        });

        // Common non-magic numbers to ignore
        const COMMON_NUMBERS: &[i64] = &[
            0, 1, 2, 10, 100, 1000, 
            60, 24, 365, // Time
            1024, 2048, 4096, // Powers of 2
            200, 201, 204, 301, 302, 400, 401, 403, 404, 500, 502, 503, // HTTP
        ];

        let mut magic_numbers = Vec::new();

        for (line_num, line) in source.lines().enumerate() {
            let trimmed = line.trim();
            
            // Skip comments and strings
            if trimmed.starts_with("//") || trimmed.starts_with("#") ||
               trimmed.starts_with("*") || trimmed.contains("\"") {
                continue;
            }

            for cap in MAGIC_REGEX.captures_iter(line) {
                if let Some(m) = cap.get(1) {
                    let num_str: &str = m.as_str();
                    if let Ok(num) = num_str.parse::<i64>() {
                        // Skip common numbers
                        if COMMON_NUMBERS.contains(&num) {
                            continue;
                        }

                        // Skip if it looks like a year
                        if (1900..=2100).contains(&num) {
                            continue;
                        }

                        magic_numbers.push(MagicNumber {
                            value: num as f64,
                            file: file_path.to_string(),
                            line: (line_num + 1) as u32,
                            context: trimmed.to_string(),
                            suggested_name: Self::suggest_constant_name(num, trimmed),
                        });
                    }
                }
            }
        }

        magic_numbers
    }

    fn suggest_constant_name(value: i64, context: &str) -> Option<String> {
        let ctx_lower = context.to_lowercase();
        
        // Time-related
        if ctx_lower.contains("timeout") || ctx_lower.contains("delay") {
            return Some(format!("TIMEOUT_MS_{}", value));
        }
        if ctx_lower.contains("interval") {
            return Some(format!("INTERVAL_MS_{}", value));
        }
        
        // Size-related
        if ctx_lower.contains("size") || ctx_lower.contains("length") {
            return Some(format!("MAX_SIZE_{}", value));
        }
        if ctx_lower.contains("limit") {
            return Some(format!("LIMIT_{}", value));
        }
        
        // Count-related
        if ctx_lower.contains("count") || ctx_lower.contains("max") {
            return Some(format!("MAX_COUNT_{}", value));
        }
        if ctx_lower.contains("retry") {
            return Some(format!("MAX_RETRIES_{}", value));
        }
        
        // Port
        if ctx_lower.contains("port") {
            return Some(format!("PORT_{}", value));
        }
        
        None
    }

    fn find_inconsistencies(constants: &[ConstantInfo]) -> Vec<InconsistentValue> {
        let mut by_name: HashMap<String, Vec<&ConstantInfo>> = HashMap::new();
        
        // Group by normalized name
        for constant in constants {
            let normalized = constant.name.to_lowercase();
            by_name.entry(normalized).or_default().push(constant);
        }
        
        let mut inconsistencies = Vec::new();
        
        for (name, group) in by_name {
            if group.len() < 2 {
                continue;
            }
            
            // Check if values differ
            let first_value = &group[0].value;
            let has_different = group.iter().skip(1).any(|c| &c.value != first_value);
            
            if has_different {
                let values: Vec<ValueLocation> = group.iter().map(|c| ValueLocation {
                    value: c.value.clone(),
                    file: c.file.clone(),
                    line: c.line,
                }).collect();
                
                inconsistencies.push(InconsistentValue {
                    name_pattern: name,
                    values,
                    severity: SecretSeverity::Medium,
                });
            }
        }
        
        inconsistencies
    }

    fn build_stats(
        constants: &[ConstantInfo],
        secrets: &[SecretCandidate],
        magic_numbers: &[MagicNumber],
        files_count: usize,
        duration_ms: u64,
    ) -> ConstantsStats {
        let mut by_category: HashMap<String, usize> = HashMap::new();
        let mut by_language: HashMap<String, usize> = HashMap::new();
        let mut exported_count = 0;

        for constant in constants {
            *by_category.entry(format!("{:?}", constant.category)).or_default() += 1;
            *by_language.entry(constant.language.clone()).or_default() += 1;
            if constant.is_exported {
                exported_count += 1;
            }
        }

        ConstantsStats {
            total_constants: constants.len(),
            by_category,
            by_language,
            exported_count,
            secrets_count: secrets.len(),
            magic_numbers_count: magic_numbers.len(),
            files_analyzed: files_count,
            duration_ms,
        }
    }
}

impl Default for ConstantsAnalyzer {
    fn default() -> Self {
        Self::new()
    }
}

struct FileAnalysis {
    constants: Vec<ConstantInfo>,
    secrets: Vec<SecretCandidate>,
    magic_numbers: Vec<MagicNumber>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_analyzer_creation() {
        let analyzer = ConstantsAnalyzer::new();
        assert!(true); // Just verify it creates without panic
    }
}
