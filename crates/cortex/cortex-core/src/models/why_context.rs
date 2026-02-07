use serde::{Deserialize, Serialize};

/// Context for answering "why is it this way?" questions.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhyContext {
    pub patterns: Vec<WhyEntry>,
    pub decisions: Vec<WhyEntry>,
    pub tribal: Vec<WhyEntry>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhyEntry {
    pub memory_id: String,
    pub summary: String,
    pub confidence: f64,
}
