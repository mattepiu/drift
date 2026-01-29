//! Enterprise-grade ignore patterns for large codebases
//!
//! Ported from packages/core/src/scanner/default-ignores.ts
//! These patterns prevent OOM on large codebases by excluding:
//! - Build artifacts and dependencies
//! - Generated code
//! - Binary files
//! - IDE/editor files

use ignore::gitignore::{Gitignore, GitignoreBuilder};
use std::path::Path;

/// Default directories to always ignore
pub const DEFAULT_IGNORE_DIRS: &[&str] = &[
    // Package managers
    "node_modules",
    ".pnpm",
    ".yarn",
    ".npm",
    "bower_components",
    "jspm_packages",
    // Python
    "__pycache__",
    ".venv",
    "venv",
    "env",
    ".env",
    "virtualenv",
    ".virtualenv",
    "site-packages",
    ".eggs",
    "*.egg-info",
    // Java/JVM
    "target",
    ".gradle",
    ".m2",
    "build",
    "out",
    // .NET
    "bin",
    "obj",
    "packages",
    ".nuget",
    // PHP
    "vendor",
    // Go
    "pkg",
    // Rust
    // "target" already listed
    // Ruby
    ".bundle",
    // Version control
    ".git",
    ".svn",
    ".hg",
    ".bzr",
    // IDE/Editor
    ".idea",
    ".vscode",
    ".vs",
    ".eclipse",
    ".settings",
    ".project",
    ".classpath",
    "*.xcodeproj",
    "*.xcworkspace",
    // Build outputs
    "dist",
    "build",
    "out",
    "output",
    "_build",
    ".build",
    "release",
    "debug",
    // Coverage/Testing
    "coverage",
    ".nyc_output",
    ".coverage",
    "htmlcov",
    "__snapshots__",
    // Caches
    ".cache",
    ".parcel-cache",
    ".next",
    ".nuxt",
    ".turbo",
    ".vercel",
    ".netlify",
    ".serverless",
    // Logs
    "logs",
    "*.log",
    // Temp
    "tmp",
    "temp",
    ".tmp",
    ".temp",
    // Documentation builds
    "_site",
    ".docusaurus",
    ".vuepress",
    "docs/_build",
    // Drift's own data
    ".drift",
];

/// File extensions to ignore (binary/generated)
pub const DEFAULT_IGNORE_EXTENSIONS: &[&str] = &[
    // Compiled
    "*.pyc",
    "*.pyo",
    "*.class",
    "*.o",
    "*.obj",
    "*.exe",
    "*.dll",
    "*.so",
    "*.dylib",
    "*.a",
    "*.lib",
    // Archives
    "*.zip",
    "*.tar",
    "*.gz",
    "*.bz2",
    "*.xz",
    "*.7z",
    "*.rar",
    "*.jar",
    "*.war",
    "*.ear",
    // Images
    "*.png",
    "*.jpg",
    "*.jpeg",
    "*.gif",
    "*.ico",
    "*.svg",
    "*.webp",
    "*.bmp",
    "*.tiff",
    // Fonts
    "*.woff",
    "*.woff2",
    "*.ttf",
    "*.otf",
    "*.eot",
    // Media
    "*.mp3",
    "*.mp4",
    "*.wav",
    "*.avi",
    "*.mov",
    "*.webm",
    // Documents
    "*.pdf",
    "*.doc",
    "*.docx",
    "*.xls",
    "*.xlsx",
    "*.ppt",
    "*.pptx",
    // Database
    "*.db",
    "*.sqlite",
    "*.sqlite3",
    // Lock files (large, not useful for analysis)
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "Cargo.lock",
    "poetry.lock",
    "Gemfile.lock",
    "composer.lock",
    // Source maps
    "*.map",
    "*.js.map",
    "*.css.map",
    // Minified
    "*.min.js",
    "*.min.css",
    // Generated
    "*.generated.*",
    "*.g.cs",
    "*.designer.cs",
];

/// Patterns for the ignore crate
pub struct IgnorePatterns {
    gitignore: Gitignore,
}

impl IgnorePatterns {
    /// Create ignore patterns from defaults + custom patterns
    pub fn new(root: &Path, extra_patterns: &[String]) -> Self {
        let mut builder = GitignoreBuilder::new(root);
        
        // Add default directory ignores
        for pattern in DEFAULT_IGNORE_DIRS {
            let _ = builder.add_line(None, pattern);
        }
        
        // Add default extension ignores
        for pattern in DEFAULT_IGNORE_EXTENSIONS {
            let _ = builder.add_line(None, pattern);
        }
        
        // Add custom patterns
        for pattern in extra_patterns {
            let _ = builder.add_line(None, pattern);
        }
        
        // Try to load .driftignore if it exists
        let driftignore = root.join(".driftignore");
        if driftignore.exists() {
            let _ = builder.add(&driftignore);
        }
        
        // Try to load .gitignore if it exists
        let gitignore = root.join(".gitignore");
        if gitignore.exists() {
            let _ = builder.add(&gitignore);
        }
        
        Self {
            gitignore: builder.build().unwrap_or_else(|_| {
                GitignoreBuilder::new(root).build().unwrap()
            }),
        }
    }
    
    /// Check if a path should be ignored
    pub fn is_ignored(&self, path: &Path, is_dir: bool) -> bool {
        self.gitignore.matched(path, is_dir).is_ignore()
    }
}

/// Lazy static default ignores
pub static DEFAULT_IGNORES: std::sync::LazyLock<Vec<String>> = std::sync::LazyLock::new(|| {
    let mut patterns = Vec::new();
    patterns.extend(DEFAULT_IGNORE_DIRS.iter().map(|s| s.to_string()));
    patterns.extend(DEFAULT_IGNORE_EXTENSIONS.iter().map(|s| s.to_string()));
    patterns
});

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_ignore_node_modules() {
        let root = PathBuf::from("/project");
        let patterns = IgnorePatterns::new(&root, &[]);
        
        assert!(patterns.is_ignored(Path::new("node_modules"), true));
        assert!(patterns.is_ignored(Path::new("src/node_modules"), true));
    }

    #[test]
    fn test_ignore_extensions() {
        let root = PathBuf::from("/project");
        let patterns = IgnorePatterns::new(&root, &[]);
        
        assert!(patterns.is_ignored(Path::new("file.pyc"), false));
        assert!(patterns.is_ignored(Path::new("bundle.min.js"), false));
    }

    #[test]
    fn test_allow_source_files() {
        let root = PathBuf::from("/project");
        let patterns = IgnorePatterns::new(&root, &[]);
        
        assert!(!patterns.is_ignored(Path::new("src/main.ts"), false));
        assert!(!patterns.is_ignored(Path::new("lib/utils.py"), false));
    }
}
