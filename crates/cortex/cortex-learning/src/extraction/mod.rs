//! Principle extraction: rule-based and LLM-enhanced.

pub mod llm_enhanced;
pub mod rule_based;

pub use llm_enhanced::{LlmExtractor, NoOpExtractor, extract_with_fallback};
pub use rule_based::extract_principle;
