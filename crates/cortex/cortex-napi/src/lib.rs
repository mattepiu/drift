//! # cortex-napi
//!
//! NAPI bindings for TypeScript interop.
//! Owns `CortexRuntime` singleton with all engines, background task scheduler (tokio), and graceful shutdown.
//!
//! ## Architecture
//!
//! - `runtime.rs` — Global `CortexRuntime` singleton owning all engines
//! - `bindings/` — 12 domain-specific NAPI binding modules (33 exported functions)
//! - `conversions/` — Rust ↔ JS type conversions via serde_json

pub mod bindings;
pub mod conversions;
pub mod runtime;
