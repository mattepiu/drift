//! Aggregate health report generation.

use cortex_core::errors::CortexResult;
use cortex_core::models::{HealthMetrics, HealthReport, HealthStatus, SubsystemHealth};

use super::recommendations::Recommendation;
use super::subsystem_checks::SubsystemChecker;

/// Snapshot of subsystem data used to build a health report.
#[derive(Debug, Clone, Default)]
pub struct HealthSnapshot {
    pub total_memories: usize,
    pub active_memories: usize,
    pub archived_memories: usize,
    pub average_confidence: f64,
    pub db_size_bytes: u64,
    pub embedding_cache_hit_rate: f64,
    pub stale_count: usize,
    pub contradiction_count: usize,
    pub unresolved_contradictions: usize,
    pub consolidation_count: usize,
    pub memories_needing_validation: usize,
}

/// Builds a [`HealthReport`] from a snapshot and subsystem checks.
pub struct HealthReporter;

impl HealthReporter {
    /// Generate a full health report from the given snapshot.
    pub fn build(snapshot: &HealthSnapshot) -> CortexResult<HealthReport> {
        let subsystems = SubsystemChecker::check_all(snapshot);
        let overall_status = Self::derive_overall(&subsystems);

        Ok(HealthReport {
            overall_status,
            subsystems,
            metrics: HealthMetrics {
                total_memories: snapshot.total_memories,
                active_memories: snapshot.active_memories,
                archived_memories: snapshot.archived_memories,
                average_confidence: snapshot.average_confidence,
                db_size_bytes: snapshot.db_size_bytes,
                embedding_cache_hit_rate: snapshot.embedding_cache_hit_rate,
            },
        })
    }

    /// Generate recommendations alongside the report.
    pub fn recommendations(snapshot: &HealthSnapshot) -> Vec<Recommendation> {
        super::recommendations::generate(snapshot)
    }

    /// Derive overall status: unhealthy if any subsystem is unhealthy,
    /// degraded if any is degraded, otherwise healthy.
    fn derive_overall(subsystems: &[SubsystemHealth]) -> HealthStatus {
        let mut worst = HealthStatus::Healthy;
        for s in subsystems {
            match s.status {
                HealthStatus::Unhealthy => return HealthStatus::Unhealthy,
                HealthStatus::Degraded => worst = HealthStatus::Degraded,
                HealthStatus::Healthy => {}
            }
        }
        worst
    }
}
