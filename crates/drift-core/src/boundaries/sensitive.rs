//! Sensitive field detector - Detects PII, credentials, financial, health data

use regex::Regex;
use super::types::{SensitiveField, SensitivityType};

/// Pattern with specificity score
struct SensitivePattern {
    pattern: Regex,
    specificity: f32,
}

/// Sensitive field detector
pub struct SensitiveFieldDetector {
    pii_patterns: Vec<SensitivePattern>,
    credential_patterns: Vec<SensitivePattern>,
    financial_patterns: Vec<SensitivePattern>,
    health_patterns: Vec<SensitivePattern>,
    false_positive_patterns: Vec<Regex>,
}

impl SensitiveFieldDetector {
    pub fn new() -> Self {
        Self {
            pii_patterns: vec![
                SensitivePattern { pattern: Regex::new(r"(?i)\bssn\b").unwrap(), specificity: 0.95 },
                SensitivePattern { pattern: Regex::new(r"(?i)\bsocial_security").unwrap(), specificity: 0.95 },
                SensitivePattern { pattern: Regex::new(r"(?i)\bdate_of_birth\b").unwrap(), specificity: 0.9 },
                SensitivePattern { pattern: Regex::new(r"(?i)\bdob\b").unwrap(), specificity: 0.85 },
                SensitivePattern { pattern: Regex::new(r"(?i)\bphone_number\b").unwrap(), specificity: 0.85 },
                SensitivePattern { pattern: Regex::new(r"(?i)\bfull_name\b").unwrap(), specificity: 0.8 },
                SensitivePattern { pattern: Regex::new(r"(?i)\bfirst_name\b").unwrap(), specificity: 0.75 },
                SensitivePattern { pattern: Regex::new(r"(?i)\blast_name\b").unwrap(), specificity: 0.75 },
                SensitivePattern { pattern: Regex::new(r"(?i)\bemail\b").unwrap(), specificity: 0.65 },
                SensitivePattern { pattern: Regex::new(r"(?i)\bphone\b").unwrap(), specificity: 0.6 },
                SensitivePattern { pattern: Regex::new(r"(?i)\baddress\b").unwrap(), specificity: 0.5 },
            ],
            credential_patterns: vec![
                SensitivePattern { pattern: Regex::new(r"(?i)\bpassword_hash\b").unwrap(), specificity: 0.95 },
                SensitivePattern { pattern: Regex::new(r"(?i)\bhashed_password\b").unwrap(), specificity: 0.95 },
                SensitivePattern { pattern: Regex::new(r"(?i)\bapi_key\b").unwrap(), specificity: 0.9 },
                SensitivePattern { pattern: Regex::new(r"(?i)\bprivate_key\b").unwrap(), specificity: 0.9 },
                SensitivePattern { pattern: Regex::new(r"(?i)\bsecret_key\b").unwrap(), specificity: 0.9 },
                SensitivePattern { pattern: Regex::new(r"(?i)\brefresh_token\b").unwrap(), specificity: 0.9 },
                SensitivePattern { pattern: Regex::new(r"(?i)\baccess_token\b").unwrap(), specificity: 0.85 },
                SensitivePattern { pattern: Regex::new(r"(?i)\bauth_token\b").unwrap(), specificity: 0.85 },
                SensitivePattern { pattern: Regex::new(r"(?i)\bpassword\b").unwrap(), specificity: 0.75 },
                SensitivePattern { pattern: Regex::new(r"(?i)\bsalt\b").unwrap(), specificity: 0.7 },
            ],
            financial_patterns: vec![
                SensitivePattern { pattern: Regex::new(r"(?i)\bcredit_card").unwrap(), specificity: 0.95 },
                SensitivePattern { pattern: Regex::new(r"(?i)\bcard_number\b").unwrap(), specificity: 0.9 },
                SensitivePattern { pattern: Regex::new(r"(?i)\bcvv\b").unwrap(), specificity: 0.95 },
                SensitivePattern { pattern: Regex::new(r"(?i)\bbank_account").unwrap(), specificity: 0.9 },
                SensitivePattern { pattern: Regex::new(r"(?i)\brouting_number\b").unwrap(), specificity: 0.9 },
                SensitivePattern { pattern: Regex::new(r"(?i)\bsalary\b").unwrap(), specificity: 0.85 },
                SensitivePattern { pattern: Regex::new(r"(?i)\bincome\b").unwrap(), specificity: 0.8 },
            ],
            health_patterns: vec![
                SensitivePattern { pattern: Regex::new(r"(?i)\bdiagnosis\b").unwrap(), specificity: 0.9 },
                SensitivePattern { pattern: Regex::new(r"(?i)\bprescription\b").unwrap(), specificity: 0.9 },
                SensitivePattern { pattern: Regex::new(r"(?i)\bmedical_record\b").unwrap(), specificity: 0.95 },
                SensitivePattern { pattern: Regex::new(r"(?i)\bhealth_record\b").unwrap(), specificity: 0.95 },
            ],
            false_positive_patterns: vec![
                Regex::new(r"(?i)(?:get|set|is|has|check|validate)(?:Password|Email|Phone)").unwrap(),
                Regex::new(r"(?i)function\s+\w*(?:password|email|phone)\w*\s*\(").unwrap(),
                Regex::new(r"(?i)(?:import|require|from)\s+.*(?:password|email|phone)").unwrap(),
                Regex::new(r"(?i)//.*(?:password|email|phone)").unwrap(),
                Regex::new(r"(?i)(?:mock|fake|test|dummy)(?:Password|Email|Phone)").unwrap(),
                Regex::new(r"(?i)health[_-]?check").unwrap(),
                Regex::new(r"(?i)health[_-]?endpoint").unwrap(),
            ],
        }
    }
    
    /// Detect sensitive fields in source code
    pub fn detect(&self, source: &str, file: &str) -> Vec<SensitiveField> {
        let mut fields = Vec::new();
        let lines: Vec<&str> = source.lines().collect();
        
        for (i, line) in lines.iter().enumerate() {
            let line_num = (i + 1) as u32;
            let trimmed = line.trim();
            
            // Skip comments
            if trimmed.starts_with("//") || trimmed.starts_with("#") || 
               trimmed.starts_with("*") || trimmed.starts_with("/*") {
                continue;
            }
            
            // Check for false positives
            let is_false_positive = self.false_positive_patterns.iter()
                .any(|p| p.is_match(line));
            
            // Check each category
            self.check_patterns(line, file, line_num, &self.pii_patterns, 
                SensitivityType::Pii, is_false_positive, &mut fields);
            self.check_patterns(line, file, line_num, &self.credential_patterns,
                SensitivityType::Credentials, is_false_positive, &mut fields);
            self.check_patterns(line, file, line_num, &self.financial_patterns,
                SensitivityType::Financial, is_false_positive, &mut fields);
            self.check_patterns(line, file, line_num, &self.health_patterns,
                SensitivityType::Health, is_false_positive, &mut fields);
        }
        
        fields
    }
    
    fn check_patterns(
        &self,
        line: &str,
        file: &str,
        line_num: u32,
        patterns: &[SensitivePattern],
        sensitivity_type: SensitivityType,
        is_false_positive: bool,
        fields: &mut Vec<SensitiveField>,
    ) {
        for sp in patterns {
            if let Some(m) = sp.pattern.find(line) {
                let mut confidence = sp.specificity;
                
                // Reduce confidence for false positives
                if is_false_positive {
                    confidence = (confidence - 0.4).max(0.1);
                }
                
                // Skip low confidence
                if confidence < 0.5 {
                    continue;
                }
                
                fields.push(SensitiveField {
                    field: m.as_str().to_string(),
                    table: None,
                    sensitivity_type,
                    file: file.to_string(),
                    line: line_num,
                    confidence,
                });
                break; // One match per type per line
            }
        }
    }
}

impl Default for SensitiveFieldDetector {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_detect_pii() {
        let detector = SensitiveFieldDetector::new();
        let source = r#"
            const user = {
                email: 'test@example.com',
                phone_number: '555-1234',
                ssn: '123-45-6789'
            };
        "#;
        
        let fields = detector.detect(source, "test.ts");
        assert!(fields.len() >= 2);
        assert!(fields.iter().any(|f| f.field.contains("ssn")));
    }
    
    #[test]
    fn test_detect_credentials() {
        let detector = SensitiveFieldDetector::new();
        let source = r#"
            const config = {
                password_hash: 'abc123',
                api_key: 'sk-xxx'
            };
        "#;
        
        let fields = detector.detect(source, "test.ts");
        assert!(fields.len() >= 2);
    }
    
    #[test]
    fn test_skip_false_positives() {
        let detector = SensitiveFieldDetector::new();
        let source = r#"
            function validatePassword(password) {
                // Check password strength
                return password.length > 8;
            }
        "#;
        
        let fields = detector.detect(source, "test.ts");
        // Should have reduced confidence for false positives
        // The function name pattern should reduce confidence
        assert!(fields.is_empty() || fields.iter().all(|f| f.confidence < 0.8));
    }
}
