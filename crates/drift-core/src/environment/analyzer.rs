//! Main environment variable analyzer
//!
//! Orchestrates env var extraction, aggregation, and classification.

use std::collections::HashMap;
use std::time::Instant;
use rayon::prelude::*;

use crate::parsers::{ParserManager, Language};
use super::types::*;
use super::extractor::EnvExtractor;

/// Main analyzer for environment variables
pub struct EnvironmentAnalyzer {
    extractor: EnvExtractor,
}

impl EnvironmentAnalyzer {
    pub fn new() -> Self {
        Self {
            extractor: EnvExtractor::new(),
        }
    }

    /// Analyze files for environment variable usage
    pub fn analyze(&self, files: &[String]) -> EnvironmentResult {
        let start = Instant::now();
        let parser = ParserManager::new();

        // Process files in parallel
        let all_accesses: Vec<EnvAccess> = files
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

                self.extractor.extract(&source, file_path, language.unwrap())
            })
            .collect();

        // Aggregate by variable name
        let variables = self.aggregate_variables(&all_accesses);
        
        // Filter required and secrets
        let required: Vec<EnvVariable> = variables.iter()
            .filter(|v| v.is_required)
            .cloned()
            .collect();
        
        let secrets: Vec<EnvVariable> = variables.iter()
            .filter(|v| v.sensitivity == EnvSensitivity::Secret)
            .cloned()
            .collect();

        // Build statistics
        let stats = self.build_stats(&all_accesses, &variables, files.len(), start.elapsed().as_millis() as u64);

        EnvironmentResult {
            accesses: all_accesses,
            variables,
            required,
            secrets,
            stats,
        }
    }

    fn aggregate_variables(&self, accesses: &[EnvAccess]) -> Vec<EnvVariable> {
        let mut by_name: HashMap<String, Vec<&EnvAccess>> = HashMap::new();
        
        for access in accesses {
            by_name.entry(access.name.clone()).or_default().push(access);
        }
        
        by_name.into_iter().map(|(name, group)| {
            let sensitivity = EnvExtractor::classify_sensitivity(&name);
            
            let locations: Vec<EnvAccessLocation> = group.iter().map(|a| EnvAccessLocation {
                file: a.file.clone(),
                line: a.line,
                has_default: a.has_default,
            }).collect();
            
            let is_required = !group.iter().any(|a| a.has_default);
            
            let default_values: Vec<String> = group.iter()
                .filter_map(|a| a.default_value.clone())
                .collect();
            
            EnvVariable {
                name,
                sensitivity,
                accesses: locations,
                is_required,
                default_values,
                access_count: group.len(),
            }
        }).collect()
    }

    fn build_stats(
        &self,
        accesses: &[EnvAccess],
        variables: &[EnvVariable],
        files_count: usize,
        duration_ms: u64,
    ) -> EnvironmentStats {
        let mut by_language: HashMap<String, usize> = HashMap::new();
        
        for access in accesses {
            *by_language.entry(access.language.clone()).or_default() += 1;
        }
        
        let secrets_count = variables.iter()
            .filter(|v| v.sensitivity == EnvSensitivity::Secret)
            .count();
        
        let credentials_count = variables.iter()
            .filter(|v| v.sensitivity == EnvSensitivity::Credential)
            .count();
        
        let config_count = variables.iter()
            .filter(|v| v.sensitivity == EnvSensitivity::Config)
            .count();
        
        let required_count = variables.iter()
            .filter(|v| v.is_required)
            .count();

        EnvironmentStats {
            total_accesses: accesses.len(),
            unique_variables: variables.len(),
            required_count,
            secrets_count,
            credentials_count,
            config_count,
            by_language,
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

impl Default for EnvironmentAnalyzer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_analyzer_creation() {
        let analyzer = EnvironmentAnalyzer::new();
        assert!(true);
    }

    #[test]
    fn test_sensitivity_classification() {
        assert_eq!(EnvExtractor::classify_sensitivity("API_KEY"), EnvSensitivity::Secret);
        assert_eq!(EnvExtractor::classify_sensitivity("DATABASE_URL"), EnvSensitivity::Credential);
        assert_eq!(EnvExtractor::classify_sensitivity("PORT"), EnvSensitivity::Config);
        assert_eq!(EnvExtractor::classify_sensitivity("RANDOM_VAR"), EnvSensitivity::Unknown);
    }
}
