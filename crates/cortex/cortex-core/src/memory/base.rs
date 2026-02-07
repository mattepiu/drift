use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use super::confidence::Confidence;
use super::importance::Importance;
use super::links::{ConstraintLink, FileLink, FunctionLink, PatternLink};
use super::types::MemoryType;

/// Typed content wrapper — each memory type has its own content struct.
/// Serialized as a tagged enum so the type is preserved in JSON.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", content = "data")]
#[serde(rename_all = "snake_case")]
pub enum TypedContent {
    // Domain-agnostic
    Core(super::types::CoreContent),
    Tribal(super::types::TribalContent),
    Procedural(super::types::ProceduralContent),
    Semantic(super::types::SemanticContent),
    Episodic(super::types::EpisodicContent),
    Decision(super::types::DecisionContent),
    Insight(super::types::InsightContent),
    Reference(super::types::ReferenceContent),
    Preference(super::types::PreferenceContent),
    // Code-specific
    PatternRationale(super::types::PatternRationaleContent),
    ConstraintOverride(super::types::ConstraintOverrideContent),
    DecisionContext(super::types::DecisionContextContent),
    CodeSmell(super::types::CodeSmellContent),
    // Universal V2
    AgentSpawn(super::types::AgentSpawnContent),
    Entity(super::types::EntityContent),
    Goal(super::types::GoalContent),
    Feedback(super::types::FeedbackContent),
    Workflow(super::types::WorkflowContent),
    Conversation(super::types::ConversationContent),
    Incident(super::types::IncidentContent),
    Meeting(super::types::MeetingContent),
    Skill(super::types::SkillContent),
    Environment(super::types::EnvironmentContent),
}

/// The universal memory struct. Every memory in the system is a BaseMemory.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BaseMemory {
    /// UUID v4 identifier.
    pub id: String,
    /// The type of this memory.
    pub memory_type: MemoryType,
    /// Typed content — per-type struct, NOT a JSON blob.
    pub content: TypedContent,
    /// ~20 token summary for Level 1 compression.
    pub summary: String,
    /// When we learned this (bitemporal: transaction time).
    pub transaction_time: DateTime<Utc>,
    /// When this was/is true (bitemporal: valid time).
    pub valid_time: DateTime<Utc>,
    /// Optional expiry.
    pub valid_until: Option<DateTime<Utc>>,
    /// Confidence score, decays over time.
    pub confidence: Confidence,
    /// Importance level.
    pub importance: Importance,
    /// Last time this memory was accessed.
    pub last_accessed: DateTime<Utc>,
    /// Number of times accessed.
    pub access_count: u64,
    /// Linked code patterns.
    pub linked_patterns: Vec<PatternLink>,
    /// Linked constraints.
    pub linked_constraints: Vec<ConstraintLink>,
    /// Linked files with citation info.
    pub linked_files: Vec<FileLink>,
    /// Linked functions.
    pub linked_functions: Vec<FunctionLink>,
    /// Free-form tags.
    pub tags: Vec<String>,
    /// Whether this memory has been archived.
    pub archived: bool,
    /// ID of the memory that supersedes this one.
    pub superseded_by: Option<String>,
    /// ID of the memory this one supersedes.
    pub supersedes: Option<String>,
    /// blake3 hash of content for dedup and embedding cache.
    pub content_hash: String,
}

impl BaseMemory {
    /// Compute the blake3 content hash from the serialized content.
    pub fn compute_content_hash(content: &TypedContent) -> String {
        let serialized = serde_json::to_string(content).unwrap_or_default();
        blake3::hash(serialized.as_bytes()).to_hex().to_string()
    }
}

impl PartialEq for BaseMemory {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
    }
}
