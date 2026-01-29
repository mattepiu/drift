//! Parsers module - Native tree-sitter parsing for multiple languages
//!
//! This module provides high-performance AST parsing using native tree-sitter.
//! No WASM overhead - grammars are linked at compile time.
//!
//! Supported languages:
//! - TypeScript/JavaScript
//! - Python
//! - Java
//! - C#
//! - PHP
//! - Go
//! - Rust
//! - C++

mod types;
mod manager;
mod typescript;
mod python;
mod java;
mod csharp;
mod php;
mod go;
mod rust_lang;
mod cpp;

pub use types::*;
pub use manager::ParserManager;
pub use typescript::TypeScriptParser;
pub use python::PythonParser;
pub use java::JavaParser;
pub use csharp::CSharpParser;
pub use php::PhpParser;
pub use go::GoParser;
pub use rust_lang::RustParser;
pub use cpp::CppParser;
