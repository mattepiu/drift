use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// A degradation event when a subsystem falls back to a lower-quality mode.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DegradationEvent {
    pub component: String,
    pub failure: String,
    pub fallback_used: String,
    pub timestamp: DateTime<Utc>,
}
