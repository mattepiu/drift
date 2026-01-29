//! Secret detection in constants and string literals
//!
//! Uses regex patterns to identify potential secrets like API keys,
//! passwords, tokens, and other sensitive values.

use regex::Regex;
use once_cell::sync::Lazy;
use super::types::{SecretCandidate, SecretSeverity};

/// Patterns for detecting secrets
static SECRET_PATTERNS: Lazy<Vec<SecretPattern>> = Lazy::new(|| vec![
    // API Keys
    SecretPattern::new(
        "AWS Access Key",
        r"(?i)(AKIA[0-9A-Z]{16})",
        SecretSeverity::Critical,
    ),
    SecretPattern::new(
        "AWS Secret Key",
        r#"(?i)aws.{0,20}secret.{0,20}['"][0-9a-zA-Z/+]{40}['"]"#,
        SecretSeverity::Critical,
    ),
    SecretPattern::new(
        "GitHub Token",
        r#"(?i)(ghp_[a-zA-Z0-9]{36}|github.{0,20}token.{0,20}['"][a-zA-Z0-9]{35,40}['"])"#,
        SecretSeverity::Critical,
    ),
    SecretPattern::new(
        "Stripe Key",
        r"(?i)(sk_live_[a-zA-Z0-9]{24,}|rk_live_[a-zA-Z0-9]{24,})",
        SecretSeverity::Critical,
    ),
    SecretPattern::new(
        "Google API Key",
        r"AIza[0-9A-Za-z\-_]{35}",
        SecretSeverity::High,
    ),
    
    // Passwords
    SecretPattern::new(
        "Password Assignment",
        r#"(?i)(password|passwd|pwd)\s*[=:]\s*['"][^'"]{8,}['"]"#,
        SecretSeverity::High,
    ),
    SecretPattern::new(
        "Hardcoded Password",
        r#"(?i)(password|passwd|pwd)\s*[=:]\s*['"][^'"]+['"]"#,
        SecretSeverity::Medium,
    ),
    
    // Tokens
    SecretPattern::new(
        "JWT Token",
        r"eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*",
        SecretSeverity::High,
    ),
    SecretPattern::new(
        "Bearer Token",
        r#"(?i)bearer\s+[a-zA-Z0-9_\-\.]+['"]?"#,
        SecretSeverity::Medium,
    ),
    
    // Private Keys
    SecretPattern::new(
        "RSA Private Key",
        r"-----BEGIN RSA PRIVATE KEY-----",
        SecretSeverity::Critical,
    ),
    SecretPattern::new(
        "SSH Private Key",
        r"-----BEGIN OPENSSH PRIVATE KEY-----",
        SecretSeverity::Critical,
    ),
    SecretPattern::new(
        "PGP Private Key",
        r"-----BEGIN PGP PRIVATE KEY BLOCK-----",
        SecretSeverity::Critical,
    ),
    
    // Database
    SecretPattern::new(
        "Database Connection String",
        r#"(?i)(mongodb|postgres|mysql|redis)://[^'"\s]+"#,
        SecretSeverity::High,
    ),
    SecretPattern::new(
        "Database Password",
        r#"(?i)db.{0,10}(password|passwd|pwd)\s*[=:]\s*['"][^'"]+['"]"#,
        SecretSeverity::High,
    ),
    
    // Generic secrets
    SecretPattern::new(
        "Secret Assignment",
        r#"(?i)(secret|api_key|apikey|auth_token|access_token)\s*[=:]\s*['"][^'"]{16,}['"]"#,
        SecretSeverity::Medium,
    ),
    SecretPattern::new(
        "Generic API Key",
        r#"(?i)(api[_-]?key|apikey)\s*[=:]\s*['"][a-zA-Z0-9]{20,}['"]"#,
        SecretSeverity::Medium,
    ),
    
    // Slack
    SecretPattern::new(
        "Slack Token",
        r"xox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*",
        SecretSeverity::High,
    ),
    SecretPattern::new(
        "Slack Webhook",
        r"https://hooks\.slack\.com/services/T[a-zA-Z0-9_]+/B[a-zA-Z0-9_]+/[a-zA-Z0-9_]+",
        SecretSeverity::Medium,
    ),
    
    // SendGrid
    SecretPattern::new(
        "SendGrid API Key",
        r"SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}",
        SecretSeverity::High,
    ),
    
    // Twilio
    SecretPattern::new(
        "Twilio API Key",
        r"SK[a-f0-9]{32}",
        SecretSeverity::High,
    ),
]);

struct SecretPattern {
    name: &'static str,
    regex: Regex,
    severity: SecretSeverity,
}

impl SecretPattern {
    fn new(name: &'static str, pattern: &str, severity: SecretSeverity) -> Self {
        Self {
            name,
            regex: Regex::new(pattern).expect("Invalid regex pattern"),
            severity,
        }
    }
}

/// Detects potential secrets in source code
pub struct SecretDetector;

impl SecretDetector {
    pub fn new() -> Self {
        Self
    }

    /// Scan source code for potential secrets
    pub fn detect(&self, source: &str, file_path: &str) -> Vec<SecretCandidate> {
        let mut candidates = Vec::new();

        for (line_num, line) in source.lines().enumerate() {
            // Skip comments (basic check)
            let trimmed = line.trim();
            if trimmed.starts_with("//") || trimmed.starts_with("#") || 
               trimmed.starts_with("*") || trimmed.starts_with("/*") {
                continue;
            }

            for pattern in SECRET_PATTERNS.iter() {
                if let Some(mat) = pattern.regex.find(line) {
                    let matched_text: &str = mat.as_str();
                    
                    // Skip if it looks like a placeholder or example
                    if Self::is_placeholder(matched_text) {
                        continue;
                    }

                    candidates.push(SecretCandidate {
                        name: Self::extract_name(line, mat.start()),
                        masked_value: Self::mask_value(matched_text),
                        secret_type: pattern.name.to_string(),
                        severity: pattern.severity,
                        file: file_path.to_string(),
                        line: (line_num + 1) as u32,
                        confidence: Self::calculate_confidence(matched_text, pattern.severity),
                        reason: format!("Matches {} pattern", pattern.name),
                    });
                }
            }
        }

        candidates
    }

    fn is_placeholder(value: &str) -> bool {
        let lower = value.to_lowercase();
        lower.contains("example") ||
        lower.contains("placeholder") ||
        lower.contains("your_") ||
        lower.contains("xxx") ||
        lower.contains("todo") ||
        lower.contains("changeme") ||
        lower.contains("replace") ||
        lower == "password" ||
        lower == "secret" ||
        value.chars().all(|c| c == 'x' || c == 'X' || c == '*')
    }

    fn extract_name(line: &str, match_start: usize) -> String {
        // Try to find variable name before the match
        let before = &line[..match_start];
        let parts: Vec<&str> = before.split(|c: char| !c.is_alphanumeric() && c != '_')
            .filter(|s| !s.is_empty())
            .collect();
        
        parts.last().map(|s| s.to_string()).unwrap_or_else(|| "unknown".to_string())
    }

    fn mask_value(value: &str) -> String {
        if value.len() <= 8 {
            return "*".repeat(value.len());
        }
        
        let visible = 4.min(value.len() / 4);
        let start = &value[..visible];
        let end = &value[value.len() - visible..];
        format!("{}...{}", start, end)
    }

    fn calculate_confidence(value: &str, severity: SecretSeverity) -> f32 {
        let base: f32 = match severity {
            SecretSeverity::Critical => 0.9,
            SecretSeverity::High => 0.8,
            SecretSeverity::Medium => 0.6,
            SecretSeverity::Low => 0.4,
            SecretSeverity::Info => 0.2,
        };

        // Adjust based on value characteristics
        let mut confidence: f32 = base;
        
        // High entropy suggests real secret
        if Self::has_high_entropy(value) {
            confidence += 0.05;
        }
        
        // Length suggests real secret
        if value.len() > 30 {
            confidence += 0.05;
        }

        confidence.min(1.0)
    }

    fn has_high_entropy(value: &str) -> bool {
        // Simple entropy check - mix of character types
        let has_upper = value.chars().any(|c| c.is_uppercase());
        let has_lower = value.chars().any(|c| c.is_lowercase());
        let has_digit = value.chars().any(|c| c.is_ascii_digit());
        let has_special = value.chars().any(|c| !c.is_alphanumeric());
        
        [has_upper, has_lower, has_digit, has_special].iter().filter(|&&b| b).count() >= 3
    }
}

impl Default for SecretDetector {
    fn default() -> Self {
        Self::new()
    }
}
