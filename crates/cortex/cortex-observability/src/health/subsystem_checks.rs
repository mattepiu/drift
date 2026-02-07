//! Per-subsystem health checks: storage, embeddings, causal graph, privacy.
//! Each returns healthy | degraded | unavailable.

use cortex_core::models::{HealthStatus, SubsystemHealth};

use super::reporter::HealthSnapshot;

/// Runs health checks against each subsystem.
pub struct SubsystemChecker;

impl SubsystemChecker {
    /// Run all subsystem checks and return their statuses.
    pub fn check_all(snapshot: &HealthSnapshot) -> Vec<SubsystemHealth> {
        vec![
            Self::check_storage(snapshot),
            Self::check_embeddings(snapshot),
            Self::check_causal(snapshot),
            Self::check_privacy(snapshot),
        ]
    }

    /// Storage: degraded if >80% archived, unhealthy if db_size > 1 GB.
    fn check_storage(snapshot: &HealthSnapshot) -> SubsystemHealth {
        const ONE_GB: u64 = 1_073_741_824;
        let (status, message) = if snapshot.db_size_bytes > ONE_GB {
            (
                HealthStatus::Unhealthy,
                Some("database exceeds 1 GB".into()),
            )
        } else if snapshot.total_memories > 0
            && snapshot.archived_memories * 100 / snapshot.total_memories > 80
        {
            (
                HealthStatus::Degraded,
                Some("over 80% of memories are archived".into()),
            )
        } else {
            (HealthStatus::Healthy, None)
        };
        SubsystemHealth {
            name: "storage".into(),
            status,
            message,
        }
    }

    /// Embeddings: degraded if cache hit rate < 50%, unhealthy if < 10%.
    fn check_embeddings(snapshot: &HealthSnapshot) -> SubsystemHealth {
        let (status, message) = if snapshot.embedding_cache_hit_rate < 0.10 {
            (
                HealthStatus::Unhealthy,
                Some("embedding cache hit rate below 10%".into()),
            )
        } else if snapshot.embedding_cache_hit_rate < 0.50 {
            (
                HealthStatus::Degraded,
                Some("embedding cache hit rate below 50%".into()),
            )
        } else {
            (HealthStatus::Healthy, None)
        };
        SubsystemHealth {
            name: "embeddings".into(),
            status,
            message,
        }
    }

    /// Causal graph: degraded if >10 unresolved contradictions.
    fn check_causal(snapshot: &HealthSnapshot) -> SubsystemHealth {
        let (status, message) = if snapshot.unresolved_contradictions > 10 {
            (
                HealthStatus::Degraded,
                Some(format!(
                    "{} unresolved contradictions",
                    snapshot.unresolved_contradictions
                )),
            )
        } else {
            (HealthStatus::Healthy, None)
        };
        SubsystemHealth {
            name: "causal_graph".into(),
            status,
            message,
        }
    }

    /// Privacy: always healthy in the current implementation (placeholder for PII scan results).
    fn check_privacy(_snapshot: &HealthSnapshot) -> SubsystemHealth {
        SubsystemHealth {
            name: "privacy".into(),
            status: HealthStatus::Healthy,
            message: None,
        }
    }
}
