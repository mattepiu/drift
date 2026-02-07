//! Correction analysis: diff analysis, categorization, and category mapping.

pub mod categorizer;
pub mod category_mapping;
pub mod diff_analyzer;

pub use categorizer::{CorrectionCategory, categorize};
pub use category_mapping::{CategoryMapping, map_category};
pub use diff_analyzer::{DiffAnalysis, analyze_diff};
