//! Parser manager - Unified interface for all language parsers

use std::collections::HashMap;

use super::types::*;
use super::typescript::TypeScriptParser;
use super::python::PythonParser;
use super::java::JavaParser;
use super::csharp::CSharpParser;
use super::php::PhpParser;
use super::go::GoParser;
use super::rust_lang::RustParser;
use super::cpp::CppParser;

/// Manages parsers for all supported languages
pub struct ParserManager {
    typescript_parser: Option<TypeScriptParser>,
    python_parser: Option<PythonParser>,
    java_parser: Option<JavaParser>,
    csharp_parser: Option<CSharpParser>,
    php_parser: Option<PhpParser>,
    go_parser: Option<GoParser>,
    rust_parser: Option<RustParser>,
    cpp_parser: Option<CppParser>,
}

impl ParserManager {
    /// Create a new parser manager with all available parsers
    pub fn new() -> Self {
        Self {
            typescript_parser: TypeScriptParser::new().ok(),
            python_parser: PythonParser::new().ok(),
            java_parser: JavaParser::new().ok(),
            csharp_parser: CSharpParser::new().ok(),
            php_parser: PhpParser::new().ok(),
            go_parser: GoParser::new().ok(),
            rust_parser: RustParser::new().ok(),
            cpp_parser: CppParser::new().ok(),
        }
    }
    
    /// Check if a language is supported
    pub fn supports(&self, language: Language) -> bool {
        match language {
            Language::TypeScript | Language::JavaScript => self.typescript_parser.is_some(),
            Language::Python => self.python_parser.is_some(),
            Language::Java => self.java_parser.is_some(),
            Language::CSharp => self.csharp_parser.is_some(),
            Language::Php => self.php_parser.is_some(),
            Language::Go => self.go_parser.is_some(),
            Language::Rust => self.rust_parser.is_some(),
            Language::Cpp => self.cpp_parser.is_some(),
            _ => false,
        }
    }

    /// Get supported languages
    pub fn supported_languages(&self) -> Vec<Language> {
        let mut langs = Vec::new();
        if self.typescript_parser.is_some() {
            langs.push(Language::TypeScript);
            langs.push(Language::JavaScript);
        }
        if self.python_parser.is_some() {
            langs.push(Language::Python);
        }
        if self.java_parser.is_some() {
            langs.push(Language::Java);
        }
        if self.csharp_parser.is_some() {
            langs.push(Language::CSharp);
        }
        if self.php_parser.is_some() {
            langs.push(Language::Php);
        }
        if self.go_parser.is_some() {
            langs.push(Language::Go);
        }
        if self.rust_parser.is_some() {
            langs.push(Language::Rust);
        }
        if self.cpp_parser.is_some() {
            langs.push(Language::Cpp);
        }
        langs
    }
    
    /// Parse a file by path
    pub fn parse_file(&mut self, path: &str, source: &str) -> Option<ParseResult> {
        let language = Language::from_path(path)?;
        self.parse(source, language)
    }
    
    /// Parse source code with explicit language
    pub fn parse(&mut self, source: &str, language: Language) -> Option<ParseResult> {
        match language {
            Language::TypeScript => {
                self.typescript_parser.as_mut().map(|p| p.parse(source, true))
            }
            Language::JavaScript => {
                self.typescript_parser.as_mut().map(|p| p.parse(source, false))
            }
            Language::Python => {
                self.python_parser.as_mut().map(|p| p.parse(source))
            }
            Language::Java => {
                self.java_parser.as_mut().map(|p| p.parse(source))
            }
            Language::CSharp => {
                self.csharp_parser.as_mut().map(|p| p.parse(source))
            }
            Language::Php => {
                self.php_parser.as_mut().map(|p| p.parse(source))
            }
            Language::Go => {
                self.go_parser.as_mut().map(|p| p.parse(source))
            }
            Language::Rust => {
                self.rust_parser.as_mut().map(|p| p.parse(source))
            }
            Language::Cpp => {
                self.cpp_parser.as_mut().map(|p| p.parse(source))
            }
            _ => None,
        }
    }

    /// Parse multiple files in batch
    pub fn parse_batch(&mut self, files: &[(String, String)]) -> HashMap<String, ParseResult> {
        let mut results = HashMap::new();
        
        for (path, source) in files {
            if let Some(result) = self.parse_file(path, source) {
                results.insert(path.clone(), result);
            }
        }
        
        results
    }
}

impl Default for ParserManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_typescript_file() {
        let mut manager = ParserManager::new();
        let result = manager.parse_file(
            "test.ts",
            "export function hello(): void { }"
        );
        
        assert!(result.is_some());
        let result = result.unwrap();
        assert_eq!(result.language, Language::TypeScript);
        assert_eq!(result.functions.len(), 1);
    }

    #[test]
    fn test_parse_python_file() {
        let mut manager = ParserManager::new();
        let result = manager.parse_file(
            "test.py",
            "def hello():\n    pass"
        );
        
        assert!(result.is_some());
        let result = result.unwrap();
        assert_eq!(result.language, Language::Python);
        assert_eq!(result.functions.len(), 1);
    }

    #[test]
    fn test_parse_java_file() {
        let mut manager = ParserManager::new();
        let result = manager.parse_file(
            "Test.java",
            "public class Test { public void hello() { } }"
        );
        
        assert!(result.is_some());
        let result = result.unwrap();
        assert_eq!(result.language, Language::Java);
    }

    #[test]
    fn test_parse_csharp_file() {
        let mut manager = ParserManager::new();
        let result = manager.parse_file(
            "Test.cs",
            "public class Test { public void Hello() { } }"
        );
        
        assert!(result.is_some());
        let result = result.unwrap();
        assert_eq!(result.language, Language::CSharp);
    }

    #[test]
    fn test_parse_go_file() {
        let mut manager = ParserManager::new();
        let result = manager.parse_file(
            "main.go",
            "package main\n\nfunc Hello() { }"
        );
        
        assert!(result.is_some());
        let result = result.unwrap();
        assert_eq!(result.language, Language::Go);
    }

    #[test]
    fn test_parse_rust_file() {
        let mut manager = ParserManager::new();
        let result = manager.parse_file(
            "main.rs",
            "pub fn hello() { }"
        );
        
        assert!(result.is_some());
        let result = result.unwrap();
        assert_eq!(result.language, Language::Rust);
    }

    #[test]
    fn test_parse_cpp_file() {
        let mut manager = ParserManager::new();
        let result = manager.parse_file(
            "main.cpp",
            "int main() { return 0; }"
        );
        
        assert!(result.is_some());
        let result = result.unwrap();
        assert_eq!(result.language, Language::Cpp);
    }

    #[test]
    fn test_parse_php_file() {
        let mut manager = ParserManager::new();
        let result = manager.parse_file(
            "test.php",
            "<?php function hello() { }"
        );
        
        assert!(result.is_some());
        let result = result.unwrap();
        assert_eq!(result.language, Language::Php);
    }

    #[test]
    fn test_supported_languages() {
        let manager = ParserManager::new();
        let langs = manager.supported_languages();
        
        // Should support all 9 languages (TS, JS, Python, Java, C#, PHP, Go, Rust, C++)
        assert!(langs.len() >= 9);
    }

    #[test]
    fn test_unsupported_language() {
        let mut manager = ParserManager::new();
        let result = manager.parse_file("test.rb", "def hello; end");
        
        assert!(result.is_none());
    }
}
