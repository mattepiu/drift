//! AST-based environment variable extraction
//!
//! Uses tree-sitter queries and regex patterns to find env var access
//! across all supported languages.

use regex::Regex;
use once_cell::sync::Lazy;
use crate::parsers::{Language, ParseResult};
use super::types::{EnvAccess, EnvSensitivity};
use tree_sitter::{Query, QueryCursor};

/// Patterns for env var access by language
static TS_ENV_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"process\.env\.([A-Z_][A-Z0-9_]*)|process\.env\[['"]([A-Z_][A-Z0-9_]*)['"]\]"#).unwrap()
});

static PY_ENV_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"os\.environ\[['"]([A-Z_][A-Z0-9_]*)['"]\]|os\.getenv\(['"]([A-Z_][A-Z0-9_]*)['"]"#).unwrap()
});

static JAVA_ENV_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"System\.getenv\(['"]([A-Z_][A-Z0-9_]*)['"]\)"#).unwrap()
});

static CSHARP_ENV_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"Environment\.GetEnvironmentVariable\(['"]([A-Z_][A-Z0-9_]*)['"]\)"#).unwrap()
});

static GO_ENV_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"os\.Getenv\(['"]([A-Z_][A-Z0-9_]*)['"]\)|os\.LookupEnv\(['"]([A-Z_][A-Z0-9_]*)['"]\)"#).unwrap()
});

static PHP_ENV_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"getenv\(['"]([A-Z_][A-Z0-9_]*)['"]\)|\$_ENV\[['"]([A-Z_][A-Z0-9_]*)['"]\]"#).unwrap()
});

static RUST_ENV_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"std::env::var\(['"]([A-Z_][A-Z0-9_]*)['"]\)|env::var\(['"]([A-Z_][A-Z0-9_]*)['"]\)"#).unwrap()
});

static CPP_ENV_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"std::getenv\(['"]([A-Z_][A-Z0-9_]*)['"]\)|getenv\(['"]([A-Z_][A-Z0-9_]*)['"]\)"#).unwrap()
});

/// Extracts environment variable accesses from source code
pub struct EnvExtractor;

impl EnvExtractor {
    pub fn new() -> Self {
        Self
    }

    /// Extract env var accesses from source code
    pub fn extract(&self, source: &str, file_path: &str, language: Language) -> Vec<EnvAccess> {
        let regex = match language {
            Language::TypeScript | Language::JavaScript => &*TS_ENV_REGEX,
            Language::Python => &*PY_ENV_REGEX,
            Language::Java => &*JAVA_ENV_REGEX,
            Language::CSharp => &*CSHARP_ENV_REGEX,
            Language::Go => &*GO_ENV_REGEX,
            Language::Php => &*PHP_ENV_REGEX,
            Language::Rust => &*RUST_ENV_REGEX,
            Language::Cpp | Language::C => &*CPP_ENV_REGEX,
        };

        let access_pattern = match language {
            Language::TypeScript | Language::JavaScript => "process.env",
            Language::Python => "os.environ/os.getenv",
            Language::Java => "System.getenv",
            Language::CSharp => "Environment.GetEnvironmentVariable",
            Language::Go => "os.Getenv",
            Language::Php => "getenv/$_ENV",
            Language::Rust => "std::env::var",
            Language::Cpp | Language::C => "std::getenv",
        };

        let mut accesses = Vec::new();

        for (line_num, line) in source.lines().enumerate() {
            for cap in regex.captures_iter(line) {
                // Get the first non-empty capture group
                let name = cap.iter()
                    .skip(1)
                    .flatten()
                    .next()
                    .map(|m| m.as_str().to_string());

                if let Some(name) = name {
                    let (has_default, default_value) = self.extract_default(line, &name, language);
                    let column = line.find(&name).unwrap_or(0) as u32;

                    accesses.push(EnvAccess {
                        name,
                        file: file_path.to_string(),
                        line: (line_num + 1) as u32,
                        column,
                        access_pattern: access_pattern.to_string(),
                        has_default,
                        default_value,
                        language: format!("{:?}", language).to_lowercase(),
                    });
                }
            }
        }

        accesses
    }

    fn extract_default(&self, line: &str, _var_name: &str, language: Language) -> (bool, Option<String>) {
        // Check for common default patterns
        match language {
            Language::TypeScript | Language::JavaScript => {
                // process.env.X || 'default' or process.env.X ?? 'default'
                if line.contains("||") || line.contains("??") {
                    if let Some(default) = self.extract_string_after_operator(line, &["||", "??"]) {
                        return (true, Some(default));
                    }
                }
            }
            Language::Python => {
                // os.getenv('X', 'default') or os.environ.get('X', 'default')
                if line.contains(",") {
                    if let Some(default) = self.extract_second_arg(line) {
                        return (true, Some(default));
                    }
                }
            }
            Language::Go => {
                // os.LookupEnv returns (value, ok)
                if line.contains("LookupEnv") {
                    return (true, None); // Has fallback handling
                }
            }
            Language::Rust => {
                // env::var("X").unwrap_or("default")
                if line.contains("unwrap_or") || line.contains("unwrap_or_else") {
                    if let Some(default) = self.extract_unwrap_or_default(line) {
                        return (true, Some(default));
                    }
                }
            }
            _ => {}
        }

        (false, None)
    }

    fn extract_string_after_operator(&self, line: &str, operators: &[&str]) -> Option<String> {
        for op in operators {
            if let Some(idx) = line.find(op) {
                let after = &line[idx + op.len()..];
                return self.extract_string_literal(after);
            }
        }
        None
    }

    fn extract_second_arg(&self, line: &str) -> Option<String> {
        // Find content after first comma
        if let Some(idx) = line.find(',') {
            let after = &line[idx + 1..];
            return self.extract_string_literal(after);
        }
        None
    }

    fn extract_unwrap_or_default(&self, line: &str) -> Option<String> {
        if let Some(idx) = line.find("unwrap_or") {
            let after = &line[idx..];
            return self.extract_string_literal(after);
        }
        None
    }

    fn extract_string_literal(&self, text: &str) -> Option<String> {
        let trimmed = text.trim();
        
        // Find quoted string
        for quote in ['"', '\'', '`'] {
            if let Some(start) = trimmed.find(quote) {
                let rest = &trimmed[start + 1..];
                if let Some(end) = rest.find(quote) {
                    return Some(rest[..end].to_string());
                }
            }
        }
        
        None
    }

    /// Classify sensitivity of an env var by name
    pub fn classify_sensitivity(name: &str) -> EnvSensitivity {
        let name_lower = name.to_lowercase();
        
        // Secret patterns
        if name_lower.contains("secret") ||
           name_lower.contains("api_key") ||
           name_lower.contains("apikey") ||
           name_lower.contains("token") ||
           name_lower.contains("private_key") ||
           name_lower.contains("signing_key") ||
           name_lower.contains("encryption_key") ||
           name_lower.contains("jwt_secret") ||
           name_lower.contains("auth_secret") {
            return EnvSensitivity::Secret;
        }
        
        // Credential patterns
        if name_lower.contains("password") ||
           name_lower.contains("passwd") ||
           name_lower.contains("pwd") ||
           name_lower.contains("credential") ||
           name_lower.contains("username") ||
           name_lower.contains("user_name") ||
           name_lower.contains("db_user") ||
           name_lower.contains("database_url") ||
           name_lower.contains("connection_string") ||
           name_lower.contains("redis_url") ||
           name_lower.contains("mongo_uri") {
            return EnvSensitivity::Credential;
        }
        
        // Config patterns
        if name_lower.contains("port") ||
           name_lower.contains("host") ||
           name_lower.contains("url") ||
           name_lower.contains("endpoint") ||
           name_lower.contains("env") ||
           name_lower.contains("mode") ||
           name_lower.contains("debug") ||
           name_lower.contains("log_level") ||
           name_lower.contains("timeout") ||
           name_lower.contains("feature") ||
           name_lower.contains("enable") ||
           name_lower.contains("disable") {
            return EnvSensitivity::Config;
        }
        
        EnvSensitivity::Unknown
    }
}

impl Default for EnvExtractor {
    fn default() -> Self {
        Self::new()
    }
}
