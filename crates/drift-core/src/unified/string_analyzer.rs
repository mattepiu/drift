//! String Literal Analyzer - Regex Fallback
//!
//! Secondary detection method using regex ONLY on string literals
//! extracted from AST. This is NOT applied to raw source code.
//!
//! Analyzes:
//! - SQL queries in strings
//! - Route paths in strings
//! - Sensitive data patterns in config strings
//! - Environment variable references

use regex::RegexSet;

use super::types::{
    DetectedPattern, DetectionMethod, PatternCategory, StringLiteral,
};

/// Regex-based analyzer for string literal content
pub struct StringLiteralAnalyzer {
    /// SQL query patterns
    sql_patterns: RegexSet,
    /// Route path patterns
    route_patterns: RegexSet,
    /// Sensitive data patterns
    sensitive_patterns: RegexSet,
    /// Environment variable patterns
    env_patterns: RegexSet,
    /// Logging patterns
    log_patterns: RegexSet,
}


impl StringLiteralAnalyzer {
    /// Create a new string literal analyzer with pre-compiled regex sets
    pub fn new() -> Result<Self, String> {
        let sql_patterns = RegexSet::new(&[
            r"(?i)SELECT\s+.+\s+FROM\s+\w+",
            r"(?i)INSERT\s+INTO\s+\w+",
            r"(?i)UPDATE\s+\w+\s+SET",
            r"(?i)DELETE\s+FROM\s+\w+",
            r"(?i)CREATE\s+TABLE\s+\w+",
            r"(?i)ALTER\s+TABLE\s+\w+",
            r"(?i)DROP\s+TABLE\s+\w+",
            r"(?i)JOIN\s+\w+\s+ON",
            r"(?i)WHERE\s+\w+\s*[=<>]",
        ]).map_err(|e| format!("Failed to compile SQL patterns: {}", e))?;
        
        let route_patterns = RegexSet::new(&[
            r"^/api/v?\d*/",
            r"^/api/(?:admin|user|account|auth|profile|settings)",
            r"^/(?:dashboard|admin|settings|profile|billing)",
            r"^/auth/(?:login|logout|register|reset|verify)",
            r":\w+", // Path parameters like :id, :userId
            r"\{[^}]+\}", // Path parameters like {id}, {userId}
        ]).map_err(|e| format!("Failed to compile route patterns: {}", e))?;
        
        let sensitive_patterns = RegexSet::new(&[
            r"(?i)password|passwd|pwd",
            r"(?i)secret|private[_-]?key",
            r"(?i)api[_-]?key|apikey",
            r"(?i)access[_-]?token|auth[_-]?token",
            r"(?i)credit[_-]?card|card[_-]?number",
            r"(?i)ssn|social[_-]?security",
            r"(?i)bearer\s+",
            r"(?i)authorization",
        ]).map_err(|e| format!("Failed to compile sensitive patterns: {}", e))?;
        
        let env_patterns = RegexSet::new(&[
            r"(?i)process\.env\.\w+",
            r"(?i)os\.environ\[",
            r"(?i)getenv\(",
            r"(?i)env\(",
            r"(?i)\$\{[A-Z_]+\}",
            r"(?i)%[A-Z_]+%",
        ]).map_err(|e| format!("Failed to compile env patterns: {}", e))?;
        
        let log_patterns = RegexSet::new(&[
            r"(?i)console\.(log|error|warn|info|debug)",
            r"(?i)logger\.(log|error|warn|info|debug)",
            r"(?i)logging\.(log|error|warn|info|debug)",
            r"(?i)log\.(error|warn|info|debug)",
        ]).map_err(|e| format!("Failed to compile log patterns: {}", e))?;
        
        Ok(Self {
            sql_patterns,
            route_patterns,
            sensitive_patterns,
            env_patterns,
            log_patterns,
        })
    }

    
    /// Analyze string literals extracted from AST
    /// 
    /// This is the ONLY place regex is applied - on pre-extracted strings,
    /// NOT on raw source code.
    pub fn analyze(&self, strings: &[StringLiteral], file: &str) -> Vec<DetectedPattern> {
        let mut patterns = Vec::new();
        
        for s in strings {
            // Check for SQL queries
            if self.sql_patterns.is_match(&s.value) {
                patterns.push(self.create_pattern(
                    s,
                    file,
                    PatternCategory::DataAccess,
                    "sql-query",
                    0.9,
                ));
            }
            
            // Check for route paths
            if self.route_patterns.is_match(&s.value) {
                patterns.push(self.create_pattern(
                    s,
                    file,
                    PatternCategory::Api,
                    "route-path",
                    0.85,
                ));
            }
            
            // Check for sensitive data
            if self.sensitive_patterns.is_match(&s.value) {
                patterns.push(self.create_pattern(
                    s,
                    file,
                    PatternCategory::Security,
                    "sensitive-data",
                    0.8,
                ));
            }
            
            // Check for environment variables
            if self.env_patterns.is_match(&s.value) {
                patterns.push(self.create_pattern(
                    s,
                    file,
                    PatternCategory::Config,
                    "env-variable",
                    0.85,
                ));
            }
        }
        
        patterns
    }
    
    /// Create a detected pattern from a string literal match
    fn create_pattern(
        &self,
        s: &StringLiteral,
        file: &str,
        category: PatternCategory,
        pattern_type: &str,
        confidence: f32,
    ) -> DetectedPattern {
        DetectedPattern {
            category,
            pattern_type: pattern_type.to_string(),
            subcategory: None,
            file: file.to_string(),
            line: s.line,
            column: s.column,
            end_line: s.line,
            end_column: s.column + s.value.len() as u32,
            matched_text: s.value.clone(),
            confidence,
            detection_method: DetectionMethod::RegexFallback,
            metadata: None,
        }
    }
    
    /// Check if a string contains SQL
    pub fn is_sql(&self, s: &str) -> bool {
        self.sql_patterns.is_match(s)
    }
    
    /// Check if a string is a route path
    pub fn is_route(&self, s: &str) -> bool {
        self.route_patterns.is_match(s)
    }
    
    /// Check if a string contains sensitive data
    pub fn is_sensitive(&self, s: &str) -> bool {
        self.sensitive_patterns.is_match(s)
    }
    
    /// Check if a string references environment variables
    pub fn is_env_reference(&self, s: &str) -> bool {
        self.env_patterns.is_match(s)
    }
}

impl Default for StringLiteralAnalyzer {
    fn default() -> Self {
        Self::new().expect("Failed to create string literal analyzer")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::unified::types::StringContext;
    
    #[test]
    fn test_sql_detection() {
        let analyzer = StringLiteralAnalyzer::new().unwrap();
        
        assert!(analyzer.is_sql("SELECT * FROM users WHERE id = 1"));
        assert!(analyzer.is_sql("INSERT INTO users (name) VALUES ('test')"));
        assert!(analyzer.is_sql("UPDATE users SET name = 'test'"));
        assert!(analyzer.is_sql("DELETE FROM users WHERE id = 1"));
        
        assert!(!analyzer.is_sql("hello world"));
        assert!(!analyzer.is_sql("/api/users"));
    }
    
    #[test]
    fn test_route_detection() {
        let analyzer = StringLiteralAnalyzer::new().unwrap();
        
        assert!(analyzer.is_route("/api/v1/users"));
        assert!(analyzer.is_route("/api/admin/settings"));
        assert!(analyzer.is_route("/dashboard"));
        assert!(analyzer.is_route("/users/:id"));
        assert!(analyzer.is_route("/users/{userId}"));
        
        assert!(!analyzer.is_sql("hello world"));
    }
    
    #[test]
    fn test_sensitive_detection() {
        let analyzer = StringLiteralAnalyzer::new().unwrap();
        
        assert!(analyzer.is_sensitive("password"));
        assert!(analyzer.is_sensitive("api_key"));
        assert!(analyzer.is_sensitive("access_token"));
        assert!(analyzer.is_sensitive("Bearer token"));
        
        assert!(!analyzer.is_sensitive("username"));
    }
    
    #[test]
    fn test_analyze_strings() {
        let analyzer = StringLiteralAnalyzer::new().unwrap();
        
        let strings = vec![
            StringLiteral {
                value: "SELECT * FROM users".to_string(),
                line: 10,
                column: 5,
                context: StringContext::FunctionArgument,
            },
            StringLiteral {
                value: "/api/v1/users/:id".to_string(),
                line: 15,
                column: 10,
                context: StringContext::FunctionArgument,
            },
        ];
        
        let patterns = analyzer.analyze(&strings, "test.ts");
        
        assert_eq!(patterns.len(), 2);
        assert_eq!(patterns[0].category, PatternCategory::DataAccess);
        assert_eq!(patterns[1].category, PatternCategory::Api);
    }
}
