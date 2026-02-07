use serde::{Deserialize, Serialize};

/// Comprehensive health report for all subsystems.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthReport {
    pub overall_status: HealthStatus,
    pub subsystems: Vec<SubsystemHealth>,
    pub metrics: HealthMetrics,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HealthStatus {
    Healthy,
    Degraded,
    Unhealthy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubsystemHealth {
    pub name: String,
    pub status: HealthStatus,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthMetrics {
    pub total_memories: usize,
    pub active_memories: usize,
    pub archived_memories: usize,
    pub average_confidence: f64,
    pub db_size_bytes: u64,
    pub embedding_cache_hit_rate: f64,
}
